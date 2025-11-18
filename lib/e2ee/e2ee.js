const te = new TextEncoder();
const td = new TextDecoder();
export const b64 = (u8) => btoa(String.fromCharCode(...u8));
export const ub64 = (s) =>
  new Uint8Array(
    atob(s)
      .split("")
      .map((c) => c.charCodeAt(0))
  );

export async function generateAndStoreX25519Keypair() {
  const { publicKey, privateKey } = await crypto.subtle.generateKey(
    "X25519",
    true,
    ["deriveBits", "deriveKey"]
  );

  const publicRaw = new Uint8Array(
    await crypto.subtle.exportKey("raw", publicKey)
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

export async function importX25519PublicRaw(rawU8) {
  return crypto.subtle.importKey(
    "raw",
    rawU8,
    { name: "X25519" },
    false,
    [] // public key has no usages for X25519 ECDH
  );
}

export async function encryptKey(privateKey, passphrase) {
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

  const pkcs8 = new Uint8Array(
    await crypto.subtle.exportKey("pkcs8", privateKey)
  );

  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertextBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce, tagLength: 128 },
    aesKey,
    pkcs8
  );

  const ciphertext = b64(new Uint8Array(ciphertextBuf));

  return {
    ciphertext: ciphertext,
    salt: b64(salt),
    nonce: b64(nonce),
    iterations: iterations,
  };
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
    true,
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

export async function encryptSingleKey(
  my_priv,
  to_public,
  salt,
  key,
  version = 1,
  threadId
) {
  const sharedBits = await crypto.subtle.deriveBits(
    { name: "X25519", public: to_public },
    my_priv,
    256
  );
  const sharedU8 = new Uint8Array(sharedBits);
  const info = te.encode(`e2ee:group-key:thread=${threadId}:v=${version}`);
  const hkdfBaseKey = await crypto.subtle.importKey(
    "raw",
    sharedU8,
    "HKDF",
    false,
    ["deriveKey"]
  );

  const sendKey = await crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt, info },
    hkdfBaseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"]
  );

  const iv = crypto.getRandomValues(new Uint8Array(12));

  const aad = te.encode(
    JSON.stringify({
      thread: threadId,
      version,
    })
  );

  const ctBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: aad },
    sendKey,
    te.encode(key)
  );

  return {
    ciphertext: b64(new Uint8Array(ctBuf)),
    nonce: b64(iv),
    salt: b64(salt),
    version: version,
  };
}

export async function decryptSingleKey(
  my_priv,
  from_public,
  salt,
  iv,
  ciphertextB64,
  version,
  threadId
) {
  const sharedBits = await crypto.subtle.deriveBits(
    { name: "X25519", public: from_public },
    my_priv,
    256
  );
  const sharedU8 = new Uint8Array(sharedBits);

  const info = te.encode(`e2ee:group-key:thread=${threadId}:v=${version}`);
  const hkdfBaseKey = await crypto.subtle.importKey(
    "raw",
    sharedU8,
    "HKDF",
    false,
    ["deriveKey"]
  );
  const aesKey = await crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt, info },
    hkdfBaseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );
  const aad = te.encode(
    JSON.stringify({
      thread: threadId,
      version,
    })
  );

  const ct = ub64(ciphertextB64);
  const ptBuf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv, tagLength: 128, additionalData: aad },
    aesKey,
    ct
  );

  return td.decode(ptBuf);
}

export async function encryptKeysForMembers(
  my_priv,
  members,
  key,
  version = 1,
  threadId
) {
  const keys = {};

  for (const member of members) {
    const toPublicKey = await importX25519PublicRaw(ub64(member.publicKey));
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const encryption = await encryptSingleKey(
      my_priv,
      toPublicKey,
      salt,
      key,
      version,
      threadId
    );
    if (keys[version] === undefined) {
      keys[version] = {};
    }
    keys[version][member.uid] = encryption;
  }

  return keys;
}

export async function encryptGroupMessage(sharedKey, message, my_uid) {
  const key = await crypto.subtle.importKey(
    "raw",
    sharedKey,
    { name: "AES-GCM" },
    false,
    ["encrypt"]
  );

  const iv = crypto.getRandomValues(new Uint8Array(12));

  const aad = { from: my_uid };

  const aadBytes = te.encode(JSON.stringify(aad));

  const ctBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: aadBytes },
    key,
    te.encode(message)
  );

  return {
    ciphertext: b64(new Uint8Array(ctBuf)),
    nonce: b64(iv),
    aad: b64(aadBytes),
  };
}
export async function encryptDm(chainKey, message, my_uid, threadId) {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    chainKey,
    "HKDF",
    false,
    ["deriveBits"]
  );

  const info = te.encode(`e2ee:ratchet:thread=${threadId}`);
  const salt = new Uint8Array(16);

  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info },
    baseKey,
    64 * 8
  );

  const all = new Uint8Array(bits);
  const mkBytes = all.slice(0, 32);
  const nextChainKey = all.slice(32, 64);

  const mk = await crypto.subtle.importKey(
    "raw",
    mkBytes,
    { name: "AES-GCM" },
    false,
    ["encrypt"]
  );

  // 2. Encrypt with MK
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const aadObj = { from: my_uid };
  const aadBytes = te.encode(JSON.stringify(aadObj));

  const ctBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: aadBytes },
    mk,
    te.encode(message)
  );

  return {
    ciphertext: b64(new Uint8Array(ctBuf)),
    nonce: b64(iv),
    aad: b64(aadBytes),
    nextChainKey, // caller should store this for next message
  };
}

export async function decryptDmContent(
  chainKey,
  message,
  my_uid,
  threadId,
  iv
) {

  const baseKey = await crypto.subtle.importKey(
    "raw",
    chainKey,
    "HKDF",
    false,
    ["deriveBits"]
  );

  const info = te.encode(`e2ee:ratchet:thread=${threadId}`);
  const salt = new Uint8Array(16);

  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info },
    baseKey,
    64 * 8
  );

  const all = new Uint8Array(bits);
  const mkBytes = all.slice(0, 32);
  const nextChainKey = all.slice(32, 64);

  const mk = await crypto.subtle.importKey(
    "raw",
    mkBytes,
    { name: "AES-GCM" },
    true,
    ["decrypt"]
  );

  // 2. Encrypt with MK
  const aadObj = { from: my_uid };
  const aadBytes = te.encode(JSON.stringify(aadObj));

  const ptBuf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv, additionalData: aadBytes },
    mk,
    ub64(message)
  );


  const plaintext = td.decode(new Uint8Array(ptBuf));

  return {
    plaintext: plaintext,
    nextChainKey, // caller should store this for next message
  };
}

export async function cycleKey(chainKey, threadId) {
  const info = te.encode(`e2ee:ratchet:thread=${threadId}`);
  const salt = new Uint8Array(16);

  const baseKey = await crypto.subtle.importKey(
    "raw",
    chainKey,
    "HKDF",
    false,
    ["deriveBits"]
  );

  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info },
    baseKey,
    64 * 8
  );

  const all = new Uint8Array(bits);
  const nextChainKey = all.slice(32, 64);

  return nextChainKey;
}

export async function decryptGroupMessage(sharedKey, message, from_uid, iv) {
  const key = await crypto.subtle.importKey(
    "raw",
    sharedKey,
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  );

  const aad = { from: from_uid };

  const aadBytes = te.encode(JSON.stringify(aad));
  const ct = ub64(message);

  const ctBuf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv, additionalData: aadBytes, tagLength: 128 },
    key,
    ct
  );

  return td.decode(ctBuf);
}

export async function rotateGroupKey(
  my_priv,
  members,
  key,
  version,
  previousKeys,
  threadId
) {
  const keys = await encryptKeysForMembers(
    my_priv,
    members,
    key,
    version,
    threadId
  );
  const newKeys = { ...previousKeys, ...keys };
  return newKeys;
}
