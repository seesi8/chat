const { setup, teardown } = require('./helpers');
const { assertFails, assertSucceeds } = require('@firebase/testing');

describe('testing users rules', () => {
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
        users = db.collection('/users');
        await expect(await assertFails(users.get()));
    });

    test('succeed reading threads when signed in', async () => {


        db = await setup({ uid: "foo" });
        users = db.collection("/users");
        await expect(await assertSucceeds(users.get()));
    });


    //Writing
    test('fail in setting users when not all feilds', async () => {

        const userData = {
            displayName: "test",
            username: "username",
            profileIMG: "storageUrl",
            email: "email",
            creationDate: new Date(),
            lastActive: new Date(),
            // missing feild friends: []
        };

        const usernameData = {
            uid: "test"
        };

        db = await setup({ uid: "test" });

        var batch = db.batch();
        batch.set(db.doc("/users/test"), userData);
        batch.set(db.doc("/usernames/username"), usernameData);

        await expect(await assertFails(batch.commit()));
    });

    test('fail in setting when is not user', async () => {
        const userData = {
            displayName: "hi",
            username: "username",
            profileIMG: "storageUrl",
            email: "email",
            creationDate: new Date(),
            lastActive: new Date(),
            friends: []
        };

        const usernameData = {
            uid: "hi"
        };

        db = await setup({ uid: "test" });

        var batch = db.batch();
        batch.set(db.doc("/users/hi"), userData);
        batch.set(db.doc("/usernames/username"), usernameData);

        await expect(await assertFails(batch.commit()));
    });

    test('fail in setting when invalid date', async () => {
        const today = new Date();
        const tomorrow = new Date(today);
        const userData = {
            displayName: "test",
            username: "username",
            profileIMG: "storageUrl",
            email: "email",
            creationDate: new Date(tomorrow.setDate(tomorrow.getDate() + 1)),
            lastActive: new Date(tomorrow.setDate(tomorrow.getDate() + 1)),
            friends: []
        };

        const usernameData = {
            uid: "test"
        };

        db = await setup({ uid: "test" });

        var batch = db.batch();
        batch.set(db.doc("/users/test"), userData);
        batch.set(db.doc("/usernames/username"), usernameData);

        await expect(await assertFails(batch.commit()));
    });

    test('fail in setting users when username doc is not created', async () => {

        const userData = {
            displayName: "test",
            username: "username",
            profileIMG: "storageUrl",
            email: "email",
            creationDate: new Date(),
            lastActive: new Date(),
            friends: []
        };

        db = await setup({ uid: "test" });

        var batch = db.batch();
        batch.set(db.doc("/users/test"), userData);

        await expect(await assertFails(batch.commit()));
    });

    test('fail in setting users when username is not valid', async () => {

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

        //first set of data is there to create a username that is no longer allowed
        var demoData = db.batch();
        demoData.set(db.doc("/users/test"), userData);
        demoData.set(db.doc("/usernames/username"), usernameData);
        demoData.commit();

        //second set to check if it will stop that
        var demoData = db.batch();
        demoData.set(db.doc("/users/test"), userData);
        demoData.set(db.doc("/usernames/username"), usernameData);

        await expect(await assertFails(demoData.commit()));
    });

    //Acts wrierd in vs code plugin but normal in terminal
    test('succeed in setting users when all requirements are matched', async () => {

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



    //updating

    test('fail in updating when invalid date', async () => {

        //set doc first
        const firstUserData = {
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
        batch.set(db.doc("/users/test"), firstUserData);
        batch.set(db.doc("/usernames/username"), usernameData);

        await batch.commit();

        //now update it
        const today = new Date();
        const tomorrow = new Date(today);

        const userData = {
            displayName: "test",
            username: "username",
            profileIMG: "storageUrl",
            email: "email",
            creationDate: new Date(tomorrow.setDate(tomorrow.getDate() + 1)),
            lastActive: new Date(tomorrow.setDate(tomorrow.getDate() + 1)),
            friends: []
        };

        const usersdoc = db.doc("/users/test");

        await expect(await assertFails(usersdoc.update(userData)));
    });

    test('succeed in updating users when all requirements are matched', async () => {
        //first set doc
        const firstUserData = {
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
        batch.set(db.doc("/users/test"), firstUserData);
        batch.set(db.doc("/usernames/username"), usernameData);

        await batch.commit();

        //now set it
        const userData = {
            displayName: "test",
            username: "username",
            profileIMG: "storageUrl",
            email: "email",
            creationDate: new Date(),
            lastActive: new Date(),
            friends: []
        };



        const usersdoc = db.doc("/users/test");

        await expect(await assertSucceeds(usersdoc.update(userData)));
    });
});
