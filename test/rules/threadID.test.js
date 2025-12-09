const { setup, teardown } = require('./helpers');
const { assertFails, assertSucceeds } = require('@firebase/testing');
const { setDoc, doc } = require('firebase/firestore');

describe('testing threadId rules', () => {
    let db;
    let messages;
    let threadsId;

    beforeAll(async () => {
        //empty
    });

    afterEach(async () => {
        await teardown();
    });


    //Reading
    test('allow reading threadID', async () => {
        // Custom Matchers
        db = await setup();
        threadsId = db.collection('/threadsId');
        await expect(await assertSucceeds(threadsId.get()));
    });


    //Writing
    test('fail to set threadId when not in members', async () => {

        const data = {
            members: ["hi"],
            id: "doc"
        };
        const threadData = {
            members: ["test"],
            groupName: "test",
            createdAt: new Date(),
            latestMessage: new Date()
        };

        db = await setup({ uid: "test" });
        var batch = db.batch();
        //matchMembers && matchUID
        batch.set(db.doc("/threads/doc"), threadData);
        batch.set(db.doc("/threadsId/doc"), data);
        await expect(await assertFails(batch.commit()));
    });

    test('succeed to set threadId when correct info', async () => {
        const data = {
            members: ["test"],
            id: "doc"
        };
        const threadData = {
            members: ["test"],
            groupName: "test",
            createdAt: new Date(),
            latestMessage: new Date()
        };

        db = await setup({ uid: "test" });
        var batch = db.batch();
        //matchMembers && matchUID
        batch.set(db.doc("/threads/doc"), threadData);
        batch.set(db.doc("/threadsId/doc"), data);
        await expect(await assertSucceeds(batch.commit()));
    });

    test('fail to set threadId when they dont have feilds', async () => {

        const data = {
            members: ["test"],
            // missing feild:" id: "doc"
        };
        const threadData = {
            members: ["test"],
            groupName: "test",
            createdAt: new Date(),
            latestMessage: new Date()
        };

        db = await setup({ uid: "test" });
        var batch = db.batch();
        //matchMembers && matchUID
        batch.set(db.doc("/threads/doc"), threadData);
        batch.set(db.doc("/threadsId/doc"), data);
        await expect(await assertFails(batch.commit()));
    });

    test('fail to set threadId when id dont match', async () => {

        const data = {
            members: ["test"],
            id: "hi"
        };
        const threadData = {
            members: ["test"],
            groupName: "test",
            createdAt: new Date(),
            latestMessage: new Date()
        };

        db = await setup({ uid: "test" });
        var batch = db.batch();
        //matchMembers && matchUID
        batch.set(db.doc("/threads/doc"), threadData);
        batch.set(db.doc("/threadsId/doc"), data);
        await expect(await assertFails(batch.commit()));
    });

    test('fail to set threadId when thread is not created', async () => {
        const data = {
            members: ["test"],
            id: "threadNotCreated"
        };

        db = await setup({ uid: "test" });
        var batch = db.batch();
        //matchMembers && matchUID
        batch.set(db.doc("/threadsId/threadNotCreated"), data);
        await expect(await assertFails(batch.commit()));
    });


    //updating
    //Updating is not nessisary to be allowed but is becasue it presents no security risks as it has the same rules as writing

});
