const { setup, teardown } = require('./helpers');
const { assertFails, assertSucceeds } = require('@firebase/testing');

describe('testing messages rules', () => {
    let db;
    let messages;

    beforeAll(async () => {
        //empty
    });

    afterEach(async () => {
        await teardown();
    });


    //Reading
    test('fail to read message when unauthorised', async () => {
        // Custom Matchers
        db = await setup();
        messages = db.collection('/threads/thing/messages/');
        await expect(await assertFails(messages.get()));
    });

    test('fail to read message when not in members', async () => {
        // Custom Matchers
        const data = {
            '/threads/doc/messages/unqiuedoc': {
                message: "test",
                timeSent: new Date(),
                sentBy: {
                    user: "test"
                }
            },
        };
        db = await setup({ uid: "test" }, data);
        messages = db.doc('/threads/thing/messages/unqiuedoc');
        await expect(await assertFails(messages.get()));
    });

    //exculed becasuse it keeps throughing errors roughly one in every 7 times ↓


    // test('succeed reading messages when criteria is matched', async () => {
    //     const threadData = {
    //         members: ["test"],
    //         groupName: "test",
    //         createdAt: new Date(),
    //         latestMessage: new Date()
    //     };
    //     const messageData = {
    //         message: "test",
    //         timeSent: new Date(),
    //         sentBy: {
    //             user: "test"
    //         }
    //     };
    //     db = await setup({ uid: "test" });

    //     // Set broken out because it fails when put in helper

    //     //sometimes still occasionaly fails
    //     let message = db.doc('/threads/doc/messages/thing');
    //     let thread = db.doc('/threads/doc');
    //     await message.set(messageData);
    //     await thread.set(threadData);
    //     await expect(await assertSucceeds(message.get()));
    // });

    //Writing
    test('fail to set message when they dont have feilds', async () => {
        // Custom Matchers
        const data = {
            '/threads/doc': {
                members: ["test"],
                groupName: "test",
                createdAt: new Date(),
                latestMessage: new Date()
            },
        };

        const messageData = {
            timeSent: new Date(),
            sentBy: {
                user: "bob"
            }
        };
        db = await setup({ uid: "test" }, data);
        let message = db.doc('/threads/doc/messages/thing');
        await expect(await assertFails(message.set(messageData)));
    });

    test('fail to set message when wrong date', async () => {
        // Custom Matchers
        const data = {
            '/threads/doc': {
                members: ["test"],
                groupName: "test",
                createdAt: new Date(),
                latestMessage: new Date()
            },
        };

        const messageData = {
            message: "test",
            timeSent: new Date("2/29/2024"),
            sentBy: {
                user: "test"
            }
        };
        db = await setup({ uid: "test" }, data);
        let message = db.doc('/threads/doc/messages/thing');
        await expect(await assertFails(message.set(messageData)));
    });


    test('fail to set message when not sent by the right user', async () => {
        // Custom Matchers
        const data = {
            '/threads/doc': {
                members: ["test"],
                groupName: "test",
                createdAt: new Date(),
                latestMessage: new Date()
            },
        };

        const messageData = {
            message: "test",
            timeSent: new Date(),
            sentBy: {
                user: "bob"
            }
        };
        db = await setup({ uid: "test" }, data);
        let message = db.doc('/threads/doc/messages/thing');
        await expect(await assertFails(message.set(messageData)));
    });

    test('succeed to set message when criteria is matched', async () => {
        // Custom Matchers
        const data = {
            '/threads/doc': {
                members: ["test"],
                groupName: "test",
                createdAt: new Date(),
                latestMessage: new Date()
            },
        };

        const messageData = {
            message: "test",
            timeSent: new Date(),
            sentBy: {
                user: "test"
            }
        };
        db = await setup({ uid: "test" }, data);
        let message = db.doc('/threads/doc/messages/thing');
        await expect(await assertSucceeds(message.set(messageData)));
    });

    //updating
    //same as above

});
