import { firestore } from "../firebase";
import {
    collection,
    deleteDoc,
    query,
    updateDoc,
    where,
    writeBatch,
} from "firebase/firestore";
import {
    doc,
    getDoc,
    setDoc,
    getDocs,
    orderBy,
    limit,
} from "firebase/firestore";

const te = new TextEncoder();
const td = new TextDecoder();
const b64 = (u8) => btoa(String.fromCharCode(...u8));
export const ub64 = (s) => new Uint8Array(atob(s).split("").map(c => c.charCodeAt(0)));


export async function generateAndStoreX25519Keypair() {

    const { publicKey, privateKey } = await crypto.subtle.generateKey(
        "X25519",
        true,
        ["deriveBits", "deriveKey"]
    );

    const publicRaw = new Uint8Array(await crypto.subtle.exportKey("raw", publicKey));

    const db = await new Promise((resolve, reject) => {
        const req = indexedDB.open("crypto-keys", 1);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains("keys")) db.createObjectStore("keys");
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });

    await new Promise((resolve, reject) => {
        const tx = db.transaction("keys", "readwrite");
        const store = tx.objectStore("keys");
        store.put(privateKey, "privateKey");
        store.put(publicKey, "publicKey");
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
    });

    return publicRaw;
}


function openKeyDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open("crypto-keys", 1);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains("keys")) db.createObjectStore("keys");
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function getStoredKey(keyName) {
    const db = await openKeyDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction("keys", "readonly");
        const store = tx.objectStore("keys");
        const getReq = store.get(keyName);
        getReq.onsuccess = () => resolve(getReq.result || null);
        getReq.onerror = () => reject(getReq.error);
    });
}

export async function getMyPrivateKey() {
    const k = await getStoredKey("privateKey");
    // if (!k) throw new Error("No privateKey in IndexedDB. Generate keys first.");
    return k;
}


export async function encryptMessage(my_priv, to_public, salt, message, my_uid, to_uid) {
    const sharedBits = await crypto.subtle.deriveBits(
        { name: "X25519", public: to_public },
        my_priv,
        256
    );
    const sharedU8 = new Uint8Array(sharedBits);
    const info = te.encode("e2ee:aes-gcm-256:x25519");
    const hkdfBaseKey = await crypto.subtle.importKey(
        "raw", sharedU8, "HKDF", false, ["deriveKey"]
    );
    const sendKey = await crypto.subtle.deriveKey(
        { name: "HKDF", hash: "SHA-256", salt, info },
        hkdfBaseKey,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt"]
    );

    const iv = crypto.getRandomValues(new Uint8Array(12));

    const aad = { "to": to_uid, "from": my_uid }

    const aadBytes = te.encode(JSON.stringify(aad));

    const ctBuf = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv, additionalData: aadBytes },
        sendKey,
        te.encode(message)
    );

    return {
        ciphertext: b64(new Uint8Array(ctBuf)),
        nonce: b64(iv),
        salt: b64(salt),
        aad: b64(aadBytes)
    };
}

export async function importX25519PublicRaw(rawU8) {
    return crypto.subtle.importKey(
        "raw",
        rawU8,
        { name: "X25519" },
        false,
        [] // public key has no usages for X25519 ECDH
    );
}

export async function decryptMessage(my_priv, from_public, salt, my_uid, from_uid, iv, ciphertextB64) {
    // 1) ECDH
    const sharedBits = await crypto.subtle.deriveBits(
        { name: "X25519", public: from_public },
        my_priv,
        256
    );
    const sharedU8 = new Uint8Array(sharedBits);

    // 2) HKDF -> AES-GCM key
    const info = te.encode("e2ee:aes-gcm-256:x25519");
    const hkdfBaseKey = await crypto.subtle.importKey("raw", sharedU8, "HKDF", false, ["deriveKey"]);
    const aesKey = await crypto.subtle.deriveKey(
        { name: "HKDF", hash: "SHA-256", salt, info },
        hkdfBaseKey,
        { name: "AES-GCM", length: 256 },
        false,
        ["decrypt"]
    );

    // 3) AAD
    const aadBytes = te.encode(JSON.stringify({ to: my_uid, from: from_uid }));

    // 4) Decrypt
    const ct = ub64(ciphertextB64);               // bytes of ciphertext+tag
    const ptBuf = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv, additionalData: aadBytes, tagLength: 128 },
        aesKey,
        ct
    );

    return td.decode(ptBuf); // plaintext string
}

export async function storeAndDownloadKey(privateKey, passphrase, userUid, force = false) {
    const salt = crypto.getRandomValues(new Uint8Array(16));

    const baseKey = await crypto.subtle.importKey(
        "raw",
        te.encode(passphrase),
        "PBKDF2",
        false,
        ["deriveKey"]
    );

    const iterations = 200_000;
    const aesKey = await crypto.subtle.deriveKey(
        {
            name: "PBKDF2",
            salt,
            iterations,
            hash: "SHA-256",
        },
        baseKey,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt"]
    );

    const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", privateKey));

    const nonce = crypto.getRandomValues(new Uint8Array(12));
    const ciphertextBuf = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: nonce, tagLength: 128 },
        aesKey,
        pkcs8
    );

    const ciphertext = b64(new Uint8Array(ciphertextBuf));

    const requestRef = doc(
        firestore,
        "backups",
        userUid
    );

    const backup = await getDoc(requestRef)

    if (backup.exists() && !force) {
        return false
    }
    else {
        setDoc(requestRef, {
            kdf: {
                algo: "PBKDF2",
                salt: b64(salt),
                iterations,
                hash: "SHA-256",
            },
            aead: {
                algo: "AES-GCM",
                nonce: b64(nonce),
                ciphertext, // base64 string
            },
        });
        return true
    }
}


export async function restoreKey(data, salt, passphrase, nonce, force = false) {

    const baseKey = await crypto.subtle.importKey(
        "raw",
        te.encode(passphrase),
        "PBKDF2",
        false,
        ["deriveKey"]
    );

    const iterations = 200_000;
    const ub64Salt = ub64(salt);
    const aesKey = await crypto.subtle.deriveKey(
        {
            name: "PBKDF2",
            salt: ub64Salt,
            iterations: iterations,
            hash: "SHA-256",
        },
        baseKey,
        { name: "AES-GCM", length: 256 },
        false,
        ["decrypt"]
    );

    // const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", privateKey));

    const rawText = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: ub64(nonce), tagLength: 128 },
        aesKey,
        ub64(data)
    );

    const db = await new Promise((resolve, reject) => {
        const req = indexedDB.open("crypto-keys", 1);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains("keys")) db.createObjectStore("keys");
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });

    const privateKey = await crypto.subtle.importKey(
        "pkcs8",
        rawText,
        "X25519",
        false,
        ["deriveBits", "deriveKey"]
    );

    new Promise((resolve, reject) => {
        const tx = db.transaction("keys", "readwrite");
        const store = tx.objectStore("keys");
        store.put(privateKey, "privateKey");
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
    });

}