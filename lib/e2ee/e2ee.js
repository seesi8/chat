const te = new TextEncoder();
const td = new TextDecoder();
export const b64 = (u8) => btoa(String.fromCharCode(...new Uint8Array(u8)));
export const ub64 = (s) =>
  new Uint8Array(
    atob(s)
      .split("")
      .map((c) => c.charCodeAt(0))
  );

export async function generateAndStoreX25519Keypair(
  storePrivKey = "privateKey",
  storePubKey = "publicKey"
) {
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
    store.put(privateKey, storePrivKey);
    store.put(publicKey, storePubKey);
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

export async function getStoredKey(keyName) {
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

export async function importX25519PublicRaw(rawU8, usages = []) {
  return crypto.subtle.importKey(
    "raw",
    rawU8,
    { name: "X25519" },
    true,
    usages
  );
}

export async function importHKDFKeyRaw(raw, usages = ["deriveBits"]) {
  return await crypto.subtle.importKey("raw", raw, "HKDF", false, usages);
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

//DRDM

export async function generateX25519Keypair() {
  const { publicKey, privateKey } = await crypto.subtle.generateKey(
    "X25519",
    true,
    ["deriveBits", "deriveKey"]
  );

  return { publicKey, privateKey };
}

export function combineKeys(...dh) {
  const totalLen = dh.reduce((sum, p) => sum + p.length, 0);
  const ikm = new Uint8Array(totalLen);

  let offset = 0;
  for (const p of dh) {
    ikm.set(p, offset);
    offset += p.length;
  }

  return ikm;
}

export async function hkdfExpand(combined, salt = undefined) {
  const info = te.encode(`e2ee:drdm`);

  if (salt == undefined) {
    salt = new Uint8Array(16);
  }

  const okm = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info },
    combined,
    96 * 8
  );

  const rootKey = okm.slice(0, 32);
  const chainKey = okm.slice(32, 64);
  const chainKey2 = okm.slice(64, 96);

  return { rootKey, chainKey, chainKey2, salt };
}

export async function exportKey(key) {
  const keyRaw = new Uint8Array(await crypto.subtle.exportKey("raw", key));

  return b64(keyRaw);
}

export async function importHKDFKey(raw) {
  const prk = await crypto.subtle.importKey(
    "raw",
    raw,
    { name: "HKDF" },
    false,
    ["deriveKey", "deriveBits"]
  );

  return prk;
}

export async function encryptMessageDR(
  chainKey,
  n,
  pn,
  publicKey_n,
  message,
  my_uid
) {
  const salt = new Uint8Array(16);
  const info = te.encode(`e2ee:drdm`);

  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info },
    chainKey,
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

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const header = {
    from: my_uid,
    n: n,
    pn: pn,
    publicKey_n: await exportKey(publicKey_n),
  };
  const aadBytes = te.encode(JSON.stringify(header));

  const ctBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: aadBytes },
    mk,
    te.encode(message)
  );

  return {
    ciphertext: b64(new Uint8Array(ctBuf)),
    nonce: b64(iv),
    header: header,
    nextChainKey,
  };
}

export async function decryptMessageDR(chainKey, header, message, nonce) {
  const salt = new Uint8Array(16);
  const info = te.encode(`e2ee:drdm`);

  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info },
    chainKey,
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
    ["decrypt"]
  );

  const iv = ub64(nonce);

  header = {
    from: header["from"],
    n: header["n"],
    pn: header["pn"],
    publicKey_n: header["publicKey_n"],
  };
  const aadBytes = te.encode(JSON.stringify(header));

  const ptBuf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv, additionalData: aadBytes, tagLength: 128 },
    mk,
    ub64(message)
  );

  const plaintext = td.decode(new Uint8Array(ptBuf));

  return {
    plaintext,
    nextChainKey,
  };
}

export async function storeKey(key, storeKey) {
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
    store.put(key, storeKey);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

export async function storeMessage(threadId, key, data) {
  const db = await new Promise((resolve, reject) => {
    // First, check current version and existing stores
    const openReq = indexedDB.open("messages");
    openReq.onsuccess = () => {
      const currentDb = openReq.result;
      const needsUpgrade = !currentDb.objectStoreNames.contains(threadId);
      const newVersion = needsUpgrade
        ? currentDb.version + 1
        : currentDb.version;
      currentDb.close();

      // Reopen with new version if needed
      const req = indexedDB.open("messages", newVersion);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(threadId)) {
          db.createObjectStore(threadId);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    };
    openReq.onerror = () => reject(openReq.error);
  });

  await new Promise((resolve, reject) => {
    const tx = db.transaction(threadId, "readwrite");
    const store = tx.objectStore(threadId);
    store.put(data, key);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

export async function getStoredMessage(threadId, key) {
  const db = await new Promise((resolve, reject) => {
    // First, check current version and existing stores
    const openReq = indexedDB.open("messages");
    openReq.onsuccess = () => {
      const currentDb = openReq.result;
      const needsUpgrade = !currentDb.objectStoreNames.contains(threadId);
      const newVersion = needsUpgrade
        ? currentDb.version + 1
        : currentDb.version;
      currentDb.close();

      // Reopen with new version if needed
      const req = indexedDB.open("messages", newVersion);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(threadId)) {
          db.createObjectStore(threadId);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    };
    openReq.onerror = () => reject(openReq.error);
  });

  return await new Promise((resolve, reject) => {
    const tx = db.transaction(threadId, "readonly");
    const store = tx.objectStore(threadId);
    const getReq = store.get(key);
    getReq.onsuccess = () => resolve(getReq.result);
    getReq.onerror = () => reject(getReq.error);
  });
}

export async function storeMetadata(value, storeKey) {
  const db = await new Promise((resolve, reject) => {
    const req = indexedDB.open("metadata", 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("metadata"))
        db.createObjectStore("metadata");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  await new Promise((resolve, reject) => {
    const tx = db.transaction("metadata", "readwrite");
    const store = tx.objectStore("metadata");
    store.put(value, storeKey);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

function openMetadataDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("metadata", 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("metadata"))
        db.createObjectStore("metadata");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getStoredMetadata(keyName) {
  const db = await openMetadataDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("metadata", "readonly");
    const store = tx.objectStore("metadata");
    const getReq = store.get(keyName);
    getReq.onsuccess = () => resolve(getReq.result || null);
    getReq.onerror = () => reject(getReq.error);
  });
}

export async function runDH(key_a, key_b) {
  const sharedBits = await crypto.subtle.deriveBits(
    { name: "X25519", public: key_b },
    key_a,
    32 * 8
  );

  return sharedBits;
}
