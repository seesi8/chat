// functions/index.js

const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldPath } = require("firebase-admin/firestore");
initializeApp();

const { onRequest, onCall } = require("firebase-functions/v2/https");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const logger = require("firebase-functions/logger");
const db = getFirestore();
// HTTP function: addmessage
exports.addOPK = onCall(async (req, context) => {
    try {
        // Read from query string or JSON body
        const key =
            req.data?.key ?? null;
        const index =
            req.data?.index ?? null;
        const uid =
            req.data?.uid ?? null;


        // Basic validation
        if (!key) {
            return ({ error: "Missing 'key' (use ?key= or JSON body)" });
        }
        if (!index) {
            return ({ error: "Missing 'index' (use ?index= or JSON body)" });
        }
        if (!uid) {
            return ({ error: "Missing 'uid' (use ?uid= or JSON body)" });
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

        return ({
            result: `Message stored at users/${uid}/OPK/${index}.`,
        });
    } catch (e) {
        console.error("addmessage ERROR", e);
        return ({ error: e.toString() });
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
