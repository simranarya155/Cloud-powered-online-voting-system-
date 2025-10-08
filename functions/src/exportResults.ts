import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { Storage } from '@google-cloud/storage';
import { stringify } from 'csv-stringify/sync';
import { getElectionDoc } from './utils';

const db = admin.firestore();
const storage = new Storage();

/**
 * exportResults
 * HTTP endpoint (protect with IAM / check admin claim) exports aggregated results CSV to GCS.
 * Environment variable expected: RESULTS_BUCKET (set in function runtime config)
 */
export const exportResults = functions.https.onRequest(async (req, res) => {
  try {
    // Basic auth: require Firebase Auth ID token in Authorization header
    const authHeader = req.get('Authorization') || '';
    if (!authHeader.startsWith('Bearer ')) return res.status(401).send('Missing auth token');
    const idToken = authHeader.split('Bearer ')[1];
    const decoded = await admin.auth().verifyIdToken(idToken);
    if (!decoded.admin && !decoded.audit) return res.status(403).send('Admin/audit claim required');

    const electionId = (req.query.electionId || req.body.electionId) as string;
    if (!electionId) return res.status(400).send('electionId required');

    const { ref: electionRef } = await getElectionDoc(electionId);

    // aggregate shards
    const shardsSnap = await electionRef.collection('tallyShards').get();
    const map = new Map<string, number>();
    shardsSnap.forEach(doc => {
      const d = doc.data();
      const candidateId = d.candidateId as string;
      const count = (d.count as number) || 0;
      map.set(candidateId, (map.get(candidateId) || 0) + count);
    });

    const rows = Array.from(map.entries()).map(([candidateId, count]) => ({ candidateId, count }));
    const csv = stringify(rows, { header: true });

    const bucketName = process.env.RESULTS_BUCKET;
    if (!bucketName) return res.status(500).send('RESULTS_BUCKET env not configured');

    const fileName = `results_${electionId}_${Date.now()}.csv`;
    await storage.bucket(bucketName).file(fileName).save(csv, { contentType: 'text/csv' });

    return res.status(200).send({ ok: true, file: `gs://${bucketName}/${fileName}` });
  } catch (err: any) {
    console.error('exportResults error', err);
    return res.status(500).send({ error: 'export failed' });
  }
});
