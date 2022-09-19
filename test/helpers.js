const firebase = require('@firebase/testing');
const fs = require('fs');

module.exports.setup = async (auth, data) => {
    const projectId = `chat-24ce7`;
    const app = await firebase.initializeTestApp({
        projectId,
        auth
    });

    const db = app.firestore();

    // Write mock documents before rules
    if (data) {
        for (const key in data) {
            const ref = db.doc(key);
            await ref.set(data[key]);
        }
    }



    // Apply rules
    await firebase.loadFirestoreRules({
        projectId,
        rules: fs.readFileSync('firestore.rules', 'utf8')
    });
    return db;
};

module.exports.teardown = async () => {
    try {
        await firebase.clearFirestoreData({
            projectId: "chat-24ce7"
        });
        await Promise.all(firebase.apps().map(app => app.delete()));
    }
    catch (err) {
        console.log(err);
    }
};