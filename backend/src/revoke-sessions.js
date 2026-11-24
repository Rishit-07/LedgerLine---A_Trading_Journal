/* Sign someone out everywhere: node src/revoke-sessions.js <uid or email>. Use after a suspected account takeover.
   Their next change fails and they must sign in again. Needs the same Firebase settings as the server. */
import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const who = process.argv[2];
if (!who) { console.error('Usage: node src/revoke-sessions.js <uid or email>'); process.exit(2); }
initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID, credential: process.env.FIREBASE_CLIENT_EMAIL ? cert({
  projectId: process.env.FIREBASE_PROJECT_ID, clientEmail: process.env.FIREBASE_CLIENT_EMAIL, privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
}) : applicationDefault() });
const auth = getAuth();
try {
  const user = who.includes('@') ? await auth.getUserByEmail(who) : await auth.getUser(who);
  await auth.revokeRefreshTokens(user.uid);
  console.log('Signed out everywhere: ' + user.uid);
} catch (error) {
  console.error('Could not revoke sessions (' + (error.code ?? 'error') + ').');
  process.exitCode = 1;
}
