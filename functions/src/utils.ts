import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import * as crypto from 'crypto';
import * as admin from 'firebase-admin';

const secretClient = new SecretManagerServiceClient();
const db = admin.firestore();

/**
 * Access secret value from Secret Manager.
 * secretName example: "projects/<project-id>/secrets/<secret-id>/versions/latest"
 */
export async function accessSecret(secretName: string): Promise<string> {
  const [version] = await secretClient.accessSecretVersion({ name: secretName });
  const payload = version.payload?.data?.toString('utf8') || '';
  return payload;
}

/**
 * Compute an irreversible per-election voter hash using HMAC-SHA256
 */
export function computeVoterHash(uid: string, electionId: string, salt: string) {
  return crypto.createHmac('sha256', salt).update(`${uid}|${electionId}`).digest('hex');
}

/**
 * Utility: get election doc
 */
export async function getElectionDoc(electionId: string) {
  const ref = db.collection('elections').doc(electionId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error('Election not found');
  return { ref, data: snap.data()! };
}
