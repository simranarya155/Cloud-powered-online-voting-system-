import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { computeVoterHash, accessSecret, getElectionDoc } from './utils';
import * as crypto from 'crypto';

const db = admin.firestore();

/**
 * issueVoteToken
 * Admin callable: issues a single-use token for a target UID for a given election.
 * token doc: voteTokens/{tokenId} -> { electionId, targetUid, expiresAt, consumed }
 */
export const issueVoteToken = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Sign-in required');
  if (!context.auth.token?.admin) throw new functions.https.HttpsError('permission-denied', 'Admin only');

  const { electionId, targetUid, ttlSeconds } = data;
  if (!electionId || !targetUid) throw new functions.https.HttpsError('invalid-argument', 'Missing electionId or targetUid');

  const tokenId = crypto.randomBytes(32).toString('hex');
  const tokenRef = db.collection('voteTokens').doc(tokenId);
  const expiresAt = admin.firestore.Timestamp.fromDate(new Date(Date.now() + (ttlSeconds ? ttlSeconds * 1000 : 3600 * 1000)));

  await tokenRef.set({
    electionId,
    targetUid,
    consumed: false,
    expiresAt,
    issuedBy: context.auth.uid,
    issuedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  return { tokenId, expiresAt: expiresAt.toDate().toISOString() };
});

/**
 * submitVote
 * Callable by authenticated voter. Requires a valid tokenId and candidateId.
 * Transactionally consumes token, writes anonymized vote and increments a shard.
 */
export const submitVote = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Sign-in required');
  const uid = context.auth.uid;
  const { electionId, tokenId, candidateId } = data;
  if (!electionId || !tokenId || !candidateId) throw new functions.https.HttpsError('invalid-argument', 'Missing parameters');

  const tokenRef = db.collection('voteTokens').doc(tokenId);

  try {
    await db.runTransaction(async tx => {
      const tokenSnap = await tx.get(tokenRef);
      if (!tokenSnap.exists) throw new functions.https.HttpsError('failed-precondition', 'Invalid token');
      const token = tokenSnap.data()!;
      if (token.consumed) throw new functions.https.HttpsError('failed-precondition', 'Token already used');
      if (token.targetUid !== uid) throw new functions.https.HttpsError('permission-denied', 'Token not issued to this user');
      if (token.electionId !== electionId) throw new functions.https.HttpsError('failed-precondition', 'Token-election mismatch');
      if (token.expiresAt && token.expiresAt.toDate() < new Date()) throw new functions.https.HttpsError('failed-precondition', 'Token expired');

      // mark token consumed
      tx.update(tokenRef, { consumed: true, consumedAt: admin.firestore.FieldValue.serverTimestamp(), consumedBy: uid });

      // get election info and salt secret ref
      const electionRef = db.collection('elections').doc(electionId);
      const electionSnap = await tx.get(electionRef);
      if (!electionSnap.exists) throw new functions.https.HttpsError('not-found', 'Election not found');
      const election = electionSnap.data()!;
      // check election window if present
      if (election.startAt && election.endAt) {
        const now = new Date();
        const start = election.startAt.toDate ? election.startAt.toDate() : new Date(election.startAt);
        const end = election.endAt.toDate ? election.endAt.toDate() : new Date(election.endAt);
        if (now < start || now > end) throw new functions.https.HttpsError('failed-precondition', 'Election not active');
      }

      if (!election.saltSecretRef) throw new functions.https.HttpsError('failed-precondition', 'Election salt not configured');

      // access salt from Secret Manager (calls outside transaction)
      const salt = await accessSecret(election.saltSecretRef);

      // compute voter hash
      const voterHash = computeVoterHash(uid, electionId, salt);

      // append-only vote doc
      const voteRef = electionRef.collection('votes').doc();
      tx.set(voteRef, { voterHash, candidateId, createdAt: admin.firestore.FieldValue.serverTimestamp() });

      // handle sharded counter
      const numShards = election.numShards || 10;
      const shardId = Math.floor(Math.random() * numShards).toString();
      const shardRef = electionRef.collection('tallyShards').doc(`${candidateId}_shard_${shardId}`);
      const shardSnap = await tx.get(shardRef);
      if (!shardSnap.exists) {
        tx.set(shardRef, { candidateId, count: 1 });
      } else {
        tx.update(shardRef, { count: admin.firestore.FieldValue.increment(1) });
      }

      // audit log entry
      const auditRef = db.collection('audit_logs').doc();
      tx.set(auditRef, {
        action: 'vote_submitted',
        electionId,
        actorUid: uid, // stored here for audit but not linked to vote documents
        candidateId,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
    });

    return { ok: true };
  } catch (err: any) {
    if (err instanceof functions.https.HttpsError) throw err;
    console.error('submitVote error', err);
    throw new functions.https.HttpsError('internal', 'Unable to submit vote');
  }
});
