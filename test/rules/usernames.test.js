const { setup, teardown } = require('./helpers');
const { assertFails, assertSucceeds } = require('@firebase/testing');

describe('testing usernamse rules', () => {
    let db;
    let usernames;

    beforeAll(async () => {
        //empty
    });

    afterEach(async () => {
        await teardown();
    });


    //Reading


    test('succeed reading usernames', async () => {
        db = await setup({ uid: "foo" });
        usernames = db.collection("/usernames");
        await expect(await assertSucceeds(usernames.get()));
    });


    //Writing

    test('fail in setting usernames when not signed in as right user', async () => {

        const userData = {
            displayName: "test",
            username: "username",
            profileIMG: "storageUrl",
            email: "email",
            creationDate: new Date(),
            lastActive: new Date(),
            friends: []
        };

        const usernameData = {
            uid: "foo"
        };

        db = await setup({ uid: "test" });

        var batch = db.batch();
        batch.set(db.doc("/users/test"), userData);
        batch.set(db.doc("/usernames/username"), usernameData);

        await expect(await assertFails(batch.commit()));
    });

    test('succeed in setting usernames when all requirements are matched', async () => {

        const userData = {
            displayName: "test",
            username: "username",
            profileIMG: "storageUrl",
            email: "email",
            creationDate: new Date(),
            lastActive: new Date(),
            friends: []
        };

        const usernameData = {
            uid: "test"
        };

        db = await setup({ uid: "test" });

        var batch = db.batch();
        batch.set(db.doc("/users/test"), userData);
        batch.set(db.doc("/usernames/username"), usernameData);

        await expect(await assertSucceeds(batch.commit()));
    });
});
