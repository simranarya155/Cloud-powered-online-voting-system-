import * as admin from 'firebase-admin';
import { issueVoteToken, submitVote } from './votes';
import { exportResults } from './exportResults';

// initialize admin once
if (!admin.apps.length) {
  admin.initializeApp();
}

export { issueVoteToken, submitVote, exportResults };
