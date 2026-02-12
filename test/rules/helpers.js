const firebase = require('@firebase/testing');
const fs = require('fs');

const PROJECT_ID = 'chat-24ce7';
const RULES_PATH = 'firestore.rules';

async function loadRules() {
  await firebase.loadFirestoreRules({
    projectId: PROJECT_ID,
    rules: fs.readFileSync(RULES_PATH, 'utf8'),
  });
}

async function seedData(data = {}) {
  const entries = Object.entries(data);
  if (entries.length === 0) return;

  const adminApp = firebase.initializeAdminApp({ projectId: PROJECT_ID });
  const adminDb = adminApp.firestore();
  const batch = adminDb.batch();

  for (const [path, value] of entries) {
    batch.set(adminDb.doc(path), value);
  }

  await batch.commit();
  await adminApp.delete();
}

module.exports.setup = async (auth, seed = {}) => {
  await loadRules();
  await seedData(seed);

  const app = firebase.initializeTestApp({
    projectId: PROJECT_ID,
    auth,
  });

  return app.firestore();
};

module.exports.teardown = async () => {
  await firebase.clearFirestoreData({
    projectId: PROJECT_ID,
  });

  await Promise.all(firebase.apps().map((app) => app.delete()));
};
