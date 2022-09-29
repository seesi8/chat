const { setup, teardown } = require("./helpers");
const { assertFails, assertSucceeds } = require("@firebase/testing");
const { setDoc, doc } = require("firebase/firestore");

describe("testing threadId rules", () => {
    let db;
    let requests;

    beforeAll(async () => {
        //empty
    });

    afterEach(async () => {
        await teardown();
    });

    //Reading
    test("allow reading requests", async () => {
        // Custom Matchers
        db = await setup({ uid: "test" });
        requests = db.collection("/requests");
        await expect(await assertSucceeds(requests.get()));
    });

    test("fail reading requests when not signed in", async () => {
        // Custom Matchers
        db = await setup();
        requests = db.collection("/requests");
        await expect(await assertFails(requests.get()));
    });

    //Writing
    test("allow writing requests when have feilds", async () => {
        // Custom Matchers
        db = await setup({ uid: "test" });
        requests = db.collection("/requests");
        await expect(
            await assertSucceeds(
                requests.doc("test").set({ to: "john", from: "doe" })
            )
        );
    });

    test("fail reading requests when not signed in", async () => {
        // Custom Matchers
        db = await setup({ uid: "test" });
        requests = db.collection("/requests");
        await expect(await assertFails(requests.doc("test").set({})));
    });
});
