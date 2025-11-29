// functions/index.js

const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldPath } = require("firebase-admin/firestore");
initializeApp();

const { onRequest, onCall } = require("firebase-functions/v2/https");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const logger = require("firebase-functions/logger");
const db = getFirestore();
// HTTP function: addmessage
exports.addmessage = onRequest(async (req, res) => {
    try {
        // Read from query string or JSON body
        const key =
            req.query.key !== undefined ? req.query.key : req.body?.key ?? null;
        const index =
            req.query.index !== undefined ? req.query.index : req.body?.index ?? null;
        const uid =
            req.query.uid !== undefined ? req.query.uid : req.body?.uid ?? null;

        console.log(req.query)

        // Basic validation
        if (!key) {
            res.status(400).json({ error: "Missing 'key' (use ?key= or JSON body)" });
            return;
        }
        if (!index) {
            res
                .status(400)
                .json({ error: "Missing 'index' (use ?index= or JSON body)" });
            return;
        }
        if (!uid) {
            res.status(400).json({ error: "Missing 'uid' (use ?uid= or JSON body)" });
            return;
        }


        const docRef = db
            .collection("users")
            .doc(uid)
            .collection("OPK")
            .doc(`${index}`);

        await docRef.set({
            key, // store the key value
            createdAt: Date.now(),
            index
        });

        res.json({
            result: `Message stored at users/${uid}/OPK/${index}.`,
        });
    } catch (e) {
        console.error("addmessage ERROR", e);
        res.status(500).json({ error: e.toString() });
    }
});

// Firestore trigger: makeuppercase
exports.makeuppercase = onDocumentCreated("messages/{documentId}", async (event) => {
    try {
        const data = event.data.data();
        const original = data.original;

        logger.log("Uppercasing", event.params.documentId, original);

        const uppercase = original.toUpperCase();

        await event.data.ref.set({ uppercase }, { merge: true });

        return;
    } catch (e) {
        logger.error("makeuppercase ERROR", e);
        throw e;
    }
});
exports.getOPK = onCall(async (request) => {
    const uid = request.data?.uid;
    if (!uid) {
        throw new HttpsError("invalid-argument", "Missing uid parameter.");
    }

    const opkRef = db.collection("users").doc(uid).collection("OPK");

    const snap = await opkRef.orderBy(FieldPath.documentId()).limit(1).get();

    if (snap.empty) {
        throw new HttpsError("not-found", "No OPKs available for this user.");
    }

    const doc = snap.docs[0];
    const data = doc.data();

    await doc.ref.delete();

    return {
        id: doc.id,
        ...data
    };
});
