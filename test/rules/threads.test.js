const { setup, teardown } = require('./helpers');
const { assertFails, assertSucceeds } = require('@firebase/testing');
const { setDoc, doc } = require('firebase/firestore');

describe('testing threads rules', () => {
    let db;
    let messages;

    beforeAll(async () => {
        //empty
    });

    afterEach(async () => {
        await teardown();
    });


    //Reading
    test('fail reading threads when not sighned in', async () => {
        // Custom Matchers
        db = await setup();
        threadsId = db.collection('/threads');
        await expect(await assertFails(threadsId.get()));
    });

    test('fail reading threads when not right user', async () => {
        // Custom Matchers

        const threadData = {
            "/threads/foo": {
                members: ["foo"],
                groupName: "test",
                createdAt: new Date(),
                latestMessage: new Date()
            }
        };

        db = await setup({ uid: "foo" }, threadData);
        db = await setup({ uid: "test" });
        threadsDoc = db.doc("/threads/foo");
        await expect(await assertFails(threadsDoc.get()));
    });

    // test('succeed reading threads when right user', async () => {
    //     // Custom Matchers

    //     const threadData = {
    //         "/threads/foo": {
    //             members: ["foo"],
    //             groupName: "test",
    //             createdAt: new Date(),
    //             latestMessage: new Date()
    //         }
    //     };

    //     db = await setup({ uid: "foo" }, threadData);
    //     threadsDoc = db.doc("/threads/foo");
    //     await expect(await assertSucceeds(threadsDoc.get()));
    // });


    //Writing
    test('fail to set thread when not in members', async () => {

        const threadData = {
            members: ["test"],
            groupName: "test",
            createdAt: new Date(),
            latestMessage: new Date()
        };

        db = await setup({ uid: "hi" });
        await expect(await assertFails(db.doc("/threads/doc").set(threadData)));
    });

    test('fail to set thread when date is wrong', async () => {

        const threadData = {
            members: ["test"],
            groupName: "test",
            createdAt: new Date("10/10/2029"),
            latestMessage: new Date("10/10/2029")
        };

        db = await setup({ uid: "test" });
        await expect(await assertFails(db.doc("/threads/doc").set(threadData)));
    });

    test('fail to set thread when not have feilds', async () => {

        const threadData = {
            members: ["test"],
            // missing feild: groupName: "test",
            createdAt: new Date(),
            latestMessage: new Date()
        };

        db = await setup({ uid: "test" });
        await expect(await assertFails(db.doc("/threads/doc").set(threadData)));
    });

    test('succeed to set thread when requirements are satisfied', async () => {

        const threadData = {
            members: ["test"],
            groupName: "test",
            createdAt: new Date(),
            latestMessage: new Date()
        };

        db = await setup({ uid: "test" });
        await expect(await assertSucceeds(db.doc("/threads/doc").set(threadData)));
    });



    //updating
    //Updating is not nessisary to be allowed but is becasue it presents no security risks as it has the same rules as writing

});
