import { x25519 } from '@noble/curves/ed25519';

export const te = new TextEncoder();
export const td = new TextDecoder();

export function b64(u8) {
  if (u8 === undefined || u8 === null) {
    return;
  }
  u8 = new Uint8Array(u8);
  const CHUNK = 0x8000; // 32KB
  let result = '';
  for (let i = 0; i < u8.length; i += CHUNK) {
    result += String.fromCharCode(...u8.subarray(i, i + CHUNK));
  }
  return btoa(result);
}

export const ub64 = (s) => {
  if (s == null) return;
  return new Uint8Array(
    atob(s)
      .split("")
      .map((c) => c.charCodeAt(0))
  );
}


export function base64ToBlob(base64, extras = { type: "image/webp" }) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return new Blob([bytes], extras);
}

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

  await dbOperation("keys", "keys", "readwrite", (store) => {
    store.put(privateKey, storePrivKey);
    store.put(publicKey, storePubKey);
  });

  return publicRaw;
}

export async function generateAndStoreHPKEKeypair(
  storePrivKey = "privateKey",
  storePubKey = "publicKey"
) {
  const { publicKey, privateKey } = await crypto.subtle.generateKey(
    {
      name: "ECDH",
      namedCurve: "P-256",
    },
    true,
    ["deriveKey", "deriveBits"]
  );

  const publicRaw = new Uint8Array(
    await crypto.subtle.exportKey("raw", publicKey)
  );

  await dbOperation("keys", "keys", "readwrite", (store) => {
    store.put(privateKey, storePrivKey);
    store.put(publicKey, storePubKey);
  });

  return publicRaw;
}

export async function generateAndStoreEd25519Keypair(
  storePrivKey = "privateKey",
  storePubKey = "publicKey"
) {
  const { publicKey, privateKey } = await crypto.subtle.generateKey(
    "Ed25519",
    true,
    ["sign", "verify"]
  );

  const publicRaw = new Uint8Array(
    await crypto.subtle.exportKey("raw", publicKey)
  );

  await dbOperation("keys", "keys", "readwrite", (store) => {
    store.put(privateKey, storePrivKey);
    store.put(publicKey, storePubKey);
  });

  return publicRaw;
}

export async function getStoredKey(keyName) {
  const result = await dbOperation("keys", "keys", "readonly", (store) =>
    store.get(keyName)
  );
  return result || null;
}

export async function getMyPrivateKey() {
  const k = await getStoredKey("privateKey");
  return k;
}

export async function importX25519PublicRaw(rawU8, usages = [], type = "raw") {
  if (rawU8 == null || rawU8 == undefined) return;
  return crypto.subtle.importKey(type, rawU8, { name: "X25519" }, true, usages);
}

export async function importEd25519PublicRaw(
  rawU8,
  usages = ["verify"],
  type = "raw"
) {
  return crypto.subtle.importKey(type, rawU8, { name: "Ed25519" }, true, usages);
}

export async function importHKDFKeyRaw(raw, usages = ["deriveBits"], extractable = false) {
  return await crypto.subtle.importKey("raw", raw, "HKDF", extractable, usages);
}

export async function signKey(privateKey, publicKeyRaw) {
  const signature = await crypto.subtle.sign(
    { name: "Ed25519" },
    privateKey,
    publicKeyRaw
  );
  return signature;
}

export async function sign(privateKey, data) {
  const signature = await crypto.subtle.sign(
    { name: "Ed25519" },
    privateKey,
    data
  );
  return signature;
}

export async function checkKeySignature(publicKey, publicKeyRaw, signature) {
  const verified = await crypto.subtle.verify(
    { name: "Ed25519" },
    publicKey,
    signature,
    publicKeyRaw
  );
  return verified;
}

export async function verify(publicKey, bytes, signature) {
  const verified = await crypto.subtle.verify(
    { name: "Ed25519" },
    publicKey,
    signature,
    bytes
  );
  return verified;
}

export async function deriveX25519Keypair(secret, opts = {}) {
  const ikm = await crypto.subtle.importKey("raw", secret, "HKDF", false, ["deriveBits"]);

  const privateKeyRaw = new Uint8Array(
    await crypto.subtle.deriveBits({
      name: "HKDF",
      hash: "SHA-256",
      salt: opts.salt || new Uint8Array(32),
      info: opts.info || new Uint8Array(0)
    }, ikm, 256)
  );

  const publicKeyRaw = x25519.getPublicKey(privateKeyRaw);

  const privateKey = await crypto.subtle.importKey("raw", privateKeyRaw, "X25519", false, [])
  const publicKey = await crypto.subtle.importKey("raw", publicKeyRaw, "X25519", true, [])

  return { privateKey, publicKey };
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

export async function encryptObject(object, passphrase) {
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

  const pkcs8 = te.encode(object);

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

export async function decryptBackup(ciphertext, salt, passphrase, nonce) {
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

  const rawText = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: ub64(nonce), tagLength: 128 },
    aesKey,
    new Uint8Array(ub64(ciphertext))
  );

  return td.decode(new Uint8Array(rawText));
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

export async function importMK(mkBytes) {
  const mk = await crypto.subtle.importKey(
    "raw",
    mkBytes,
    { name: "AES-GCM" },
    false,
    ["encrypt"]
  );
  return mk
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

export async function encryptWithPublicKey(theirPublicKey, encoded) {
  const ephemeralKeyPair = await crypto.subtle.generateKey(
    { name: 'X25519' },
    true,
    ['deriveBits']
  );

  const sharedBits = await crypto.subtle.deriveBits(
    { name: 'X25519', public: theirPublicKey },
    ephemeralKeyPair.privateKey,
    256
  );


  const aesKey = await crypto.subtle.importKey(
    'raw',
    sharedBits,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    encoded
  );

  const ephemeralPublicKey = await crypto.subtle.exportKey(
    'raw',
    ephemeralKeyPair.publicKey
  );

  return {
    ephemeralPublicKey: b64(new Uint8Array(ephemeralPublicKey)),
    iv: b64(iv),
    ciphertext: b64(new Uint8Array(ciphertext))
  };
}

export async function decryptWithPrivateKey(myPrivateKey, payload) {
  const { ephemeralPublicKey, iv, ciphertext } = payload;

  const theirEphemeralPublicKey = await crypto.subtle.importKey(
    'raw',
    ub64(ephemeralPublicKey),
    { name: 'X25519' },
    false,
    []
  );

  const sharedBits = await crypto.subtle.deriveBits(
    { name: 'X25519', public: theirEphemeralPublicKey },
    myPrivateKey,
    256
  );

  const aesKey = await crypto.subtle.importKey(
    'raw',
    sharedBits,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );

  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: ub64(iv) },
    aesKey,
    ub64(ciphertext)
  );

  return new Uint8Array(plaintext);
}


export async function encryptMLS(key, nonce, messageBytes, aad) {
  console.log(nonce)
  const ctBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce, additionalData: te.encode(aad) },
    key,
    messageBytes
  );

  return {
    ciphertext: b64(new Uint8Array(ctBuf)),
  };
}

export async function decryptMLS(key, nonce, messageBytes, aad) {
  console.log(nonce)

  const ctBuf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: nonce, additionalData: te.encode(aad) },
    key,
    messageBytes
  );

  return {
    plaintext: td.decode(ctBuf),
  };
}

export async function decryptDmContent(chainKey, message, my_uid, threadId, iv) {
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
    nextChainKey,
  };
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

// DRDM

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
    5 * 32 * 8
  );

  const rootKey = okm.slice(0, 32);
  const chainKey = okm.slice(32, 64);
  const chainKey2 = okm.slice(64, 96);
  const chainKey3 = okm.slice(96, 128);
  const chainKey4 = okm.slice(128, 160);

  return { rootKey, chainKey, chainKey2, chainKey3, chainKey4, salt };
}

export async function importAesGcmKey(rawKey) {
  const len = rawKey.byteLength;
  if (len !== 16 && len !== 24 && len !== 32) {
    throw new Error(
      `AES key must be 16, 24, or 32 bytes; got ${len} bytes`
    );
  }

  return crypto.subtle.importKey(
    "raw",
    rawKey,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );
}


export async function hkdfExpandWithLabels(input, info, size = 32, salt = new Uint8Array(16)) {
  info = te.encode(info);

  input = await importHKDFKeyRaw(input)

  const okm = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info },
    input,
    size * 8
  );

  return new Uint8Array(okm);
}
export async function hkdfExpandWithSalt(input, info, salt, size = 32) {
  info = te.encode(info);

  const okm = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info },
    input,
    size * 8
  );

  return okm;
}

export function xorBytes(bytes1, bytes2) {
  if (bytes1.length !== bytes2.length) {
    throw new Error("Byte arrays must be of the same length for XOR operation.");
  }

  const result = new Uint8Array(bytes1.length);
  for (let i = 0; i < bytes1.length; i++) {
    // The ^ operator works directly on the integer values of the bytes
    result[i] = bytes1[i] ^ bytes2[i];
  }
  return result;
}

export async function exportKey(key, type = "raw") {
  if (key) {
    const keyRaw = new Uint8Array(await crypto.subtle.exportKey(type, key));
    return b64(keyRaw);
  }
  return null;
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

async function encryptHeader(headerKey, header) {
  const salt = new Uint8Array(16);
  const info = te.encode(`e2ee:headerEncryption`);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info },
    headerKey,
    32 * 8
  );
  const mk = await crypto.subtle.importKey(
    "raw",
    bits,
    { name: "AES-GCM" },
    false,
    ["encrypt"]
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ctBuf = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, mk, te.encode(header));
  return {
    ciphertext: b64(new Uint8Array(ctBuf)),
    nonce: b64(iv),
  };
}

export async function encryptMessageDR(chainKey, messageBytes, headerKey, header) {
  const paddingAmount = header.paddingAmount;
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
    true,
    ["encrypt"]
  );

  const iv = crypto.getRandomValues(new Uint8Array(12));

  const encryptedHeader = await encryptHeader(headerKey, JSON.stringify(header));

  const aadBytes = te.encode(encryptedHeader);

  const paddingBytes = crypto.getRandomValues(new Uint8Array(paddingAmount));

  const merged = new Uint8Array(messageBytes.length + paddingAmount);
  merged.set(messageBytes, 0);
  merged.set(paddingBytes, messageBytes.length);

  const ctBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: aadBytes },
    mk,
    merged
  );

  return {
    ciphertext: b64(new Uint8Array(ctBuf)),
    nonce: b64(iv),
    header: encryptedHeader,
    nextChainKey,
  };
}

export async function importMessageKey(mkBytes) {
  const mk = await crypto.subtle.importKey(
    "raw",
    mkBytes,
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  );
  return mk;
}

export const getStringByteSize = (str) => {
  const bytes = te.encode(str);
  return bytes.length;
};

export async function decryptHeader(headerKey, ciphertext, nonce) {
  const salt = new Uint8Array(16);
  const info = te.encode(`e2ee:headerEncryption`);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info },
    headerKey,
    32 * 8
  );
  const mk = await crypto.subtle.importKey(
    "raw",
    bits,
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  );
  const iv = ub64(nonce);
  const ptBuf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv, tagLength: 128 },
    mk,
    ub64(ciphertext)
  );

  const plaintext = td.decode(new Uint8Array(ptBuf));
  return {
    plaintext,
  };
}

export async function decryptMessageDR(chainKey, message, nonce, aad, header) {
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
    true,
    ["decrypt"]
  );

  const iv = ub64(nonce);

  const aadBytes = te.encode(aad);
  const ptBuf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv, additionalData: aadBytes, tagLength: 128 },
    mk,
    ub64(message)
  );

  const u8 = new Uint8Array(ptBuf);

  const trimmed = u8.subarray(0, u8.length - header.paddingAmount);

  const plaintext = td.decode(trimmed);

  return {
    plaintext,
    nextChainKey,
  };
}

export async function sha256Bytes(msgBytes) {
  const buf = await crypto.subtle.digest("SHA-256", msgBytes);
  return new Uint8Array(buf);
}

function drawUniformFromBytes(bytes, range, count) {
  const out = [];
  const limit = Math.floor(256 / range) * range;
  for (const b of bytes) {
    if (b < limit) out.push(b % range);
    if (out.length === count) break;
  }
  return out;
}

export async function sixNums(value) {
  const enc = new TextEncoder();
  const out = [];
  let counter = 0;

  while (out.length < 6) {
    const digest = await sha256Bytes(enc.encode(`v1|${value}|${counter++}`));
    out.push(...drawUniformFromBytes(digest, 10, 6 - out.length));
  }
  return out;
}

export async function decryptMissedMessageDR(mk, aad, message, nonce) {
  const iv = ub64(nonce);

  const aadBytes = te.encode(aad);

  const ptBuf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv, additionalData: aadBytes, tagLength: 128 },
    mk,
    ub64(message)
  );

  const plaintext = td.decode(new Uint8Array(ptBuf));

  return {
    plaintext,
  };
}

export async function skipMessageDR(chainKey) {
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

  return {
    mkBytes,
    nextChainKey,
  };
}

export async function runDH(key_a, key_b) {
  const sharedBits = await crypto.subtle.deriveBits(
    { name: "X25519", public: key_b },
    key_a,
    32 * 8
  );

  return sharedBits;
}

// ============================================================================
// INDEXEDDB - FIXED IMPLEMENTATION
// ============================================================================

const DB_CONFIG = {
  keys: { version: 1, stores: { keys: { outOfLine: true } } },
  metadata: { version: 1, stores: { metadata: { outOfLine: true } } },
  crypto: { version: 1, stores: { opks: { outOfLine: true } } },
  mk: { version: 1, stores: { mks: { outOfLine: true } } },
  messages: {
    version: 2,
    stores: {
      messageStore: { keyPath: ["threadId", "key"], indexes: ["threadId"] },
    },
  },
  files: {
    version: 2,
    stores: {
      fileStore: { keyPath: ["threadId", "key"], indexes: ["threadId"] },
    },
  },
  headers: {
    version: 2,
    stores: {
      headerStore: { keyPath: ["threadId", "key"], indexes: ["threadId"] },
    },
  },
};

// FIX #1: Use a promise-based singleton to prevent race conditions
let initPromise = null;

async function initDatabases() {
  // Return existing promise if initialization is in progress or complete
  if (initPromise !== null) {
    return initPromise;
  }

  // Create and cache the initialization promise
  initPromise = Promise.all(
    Object.entries(DB_CONFIG).map(([dbName, config]) =>
      initDB(dbName, config.stores, config.version)
    )
  );

  try {
    await initPromise;
  } catch (error) {
    // Reset on failure so retry is possible
    initPromise = null;
    throw error;
  }

  return initPromise;
}

function initDB(dbName, stores, version) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, version);

    req.onupgradeneeded = (event) => {
      const db = req.result;

      for (const [storeName, storeConfig] of Object.entries(stores)) {
        // Delete existing store if it exists (to fix corrupted schema)
        if (db.objectStoreNames.contains(storeName)) {
          db.deleteObjectStore(storeName);
        }

        let store;
        if (storeConfig.outOfLine) {
          // Simple key-value store: store.put(value, key)
          store = db.createObjectStore(storeName);
        } else if (storeConfig.keyPath) {
          // Composite key store: store.put({ threadId, key, data })
          store = db.createObjectStore(storeName, {
            keyPath: storeConfig.keyPath,
          });

          if (storeConfig.indexes) {
            for (const indexName of storeConfig.indexes) {
              store.createIndex(indexName, indexName, { unique: false });
            }
          }
        }
      }
    };

    // FIX #2: Handle blocked event (another connection is open with old version)
    req.onblocked = () => {
      console.warn(
        `Database "${dbName}" upgrade blocked. Close other tabs using this database.`
      );
    };

    req.onsuccess = () => {
      req.result.close();
      resolve();
    };

    req.onerror = () => reject(req.error);
  });
}

async function openDB(dbName) {
  // Ensure all databases are initialized first
  await initDatabases();

  return new Promise((resolve, reject) => {
    const config = DB_CONFIG[dbName];
    if (!config) {
      reject(new Error(`Unknown database: ${dbName}`));
      return;
    }

    const req = indexedDB.open(dbName, config.version);

    // FIX #3: Handle upgrade in openDB (shouldn't happen after init, but safety)
    req.onupgradeneeded = (event) => {
      // This shouldn't happen if initDatabases() ran correctly
      // But handle it gracefully
      const db = req.result;
      const stores = config.stores;

      for (const [storeName, storeConfig] of Object.entries(stores)) {
        if (!db.objectStoreNames.contains(storeName)) {
          let store;
          if (storeConfig.outOfLine) {
            store = db.createObjectStore(storeName);
          } else if (storeConfig.keyPath) {
            store = db.createObjectStore(storeName, {
              keyPath: storeConfig.keyPath,
            });
            if (storeConfig.indexes) {
              for (const indexName of storeConfig.indexes) {
                store.createIndex(indexName, indexName, { unique: false });
              }
            }
          }
        }
      }
    };

    req.onblocked = () => {
      console.warn(`Database "${dbName}" open blocked.`);
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// FIX #4: Completely rewritten dbOperation with proper request handling
async function dbOperation(dbName, storeName, mode, operation) {
  const db = await openDB(dbName);

  return new Promise((resolve, reject) => {
    let tx;
    try {
      tx = db.transaction(storeName, mode);
    } catch (error) {
      db.close();
      reject(error);
      return;
    }

    const store = tx.objectStore(storeName);

    let result;
    let operationError = null;

    try {
      result = operation(store);
    } catch (error) {
      operationError = error;
    }

    // FIX #5: Proper IDBRequest detection using instanceof
    const isRequest = result instanceof IDBRequest;

    if (isRequest) {
      result.onsuccess = () => {
        // Don't resolve here - wait for transaction to complete
      };
      result.onerror = () => {
        operationError = result.error;
      };
    }

    tx.oncomplete = () => {
      db.close();
      if (operationError) {
        reject(operationError);
      } else if (isRequest) {
        resolve(result.result);
      } else {
        resolve(result);
      }
    };

    tx.onerror = () => {
      db.close();
      reject(tx.error || operationError);
    };

    tx.onabort = () => {
      db.close();
      reject(tx.error || new Error("Transaction aborted"));
    };

    // If operation threw synchronously, abort the transaction
    if (operationError && !isRequest) {
      try {
        tx.abort();
      } catch (e) {
        // Transaction may have already completed
      }
    }
  });
}

// FIX #6: Rewritten to use dbOperation pattern consistently
async function dbGetAllWithKeys(dbName, storeName) {
  const db = await openDB(dbName);

  return new Promise((resolve, reject) => {
    let tx;
    try {
      tx = db.transaction(storeName, "readonly");
    } catch (error) {
      db.close();
      reject(error);
      return;
    }

    const store = tx.objectStore(storeName);

    const valuesReq = store.getAll();
    const keysReq = store.getAllKeys();

    let values, keys;
    let requestError = null;

    valuesReq.onsuccess = () => {
      values = valuesReq.result;
    };
    valuesReq.onerror = () => {
      requestError = valuesReq.error;
    };

    keysReq.onsuccess = () => {
      keys = keysReq.result;
    };
    keysReq.onerror = () => {
      requestError = keysReq.error;
    };

    tx.oncomplete = () => {
      db.close();
      if (requestError) {
        reject(requestError);
      } else {
        resolve({ keys, values });
      }
    };

    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };

    tx.onabort = () => {
      db.close();
      reject(tx.error || new Error("Transaction aborted"));
    };
  });
}

// ============================================================================
// KEY STORAGE OPERATIONS
// ============================================================================

export async function storeKey(key, storeKey) {
  await dbOperation("keys", "keys", "readwrite", (store) => {
    store.put(key, storeKey);
  });
}

export async function deleteKey(storeKey) {
  await dbOperation("keys", "keys", "readwrite", (store) => {
    store.delete(storeKey);
  });
}

// ============================================================================
// OPK (One-time Pre-Key) OPERATIONS
// ============================================================================

export async function storeOPK(key, storeKey) {
  await dbOperation("crypto", "opks", "readwrite", (store) => {
    store.put(key, storeKey);
  });
}

export async function getOPK(storeKey) {
  return dbOperation("crypto", "opks", "readonly", (store) =>
    store.get(storeKey)
  );
}

export async function getAllOPKsWithKeys() {
  const { keys, values } = await dbGetAllWithKeys("crypto", "opks");
  return keys.map((key, i) => ({ storeKey: key, opk: values[i] }));
}

// ============================================================================
// MK (Message Key) OPERATIONS
// ============================================================================

export async function storeMK(key, storeKey) {
  await dbOperation("mk", "mks", "readwrite", (store) => {
    store.put(key, storeKey);
  });
}

export async function getMK(storeKey) {
  return dbOperation("mk", "mks", "readonly", (store) => store.get(storeKey));
}

export async function deleteMK(storeKey) {
  await dbOperation("mk", "mks", "readwrite", (store) => {
    store.delete(storeKey);
  });
}

export async function getAllMKsWithKeys() {
  const { keys, values } = await dbGetAllWithKeys("mk", "mks");
  return keys.map((key, i) => ({ storeKey: key, mk: values[i] }));
}

// ============================================================================
// METADATA OPERATIONS
// ============================================================================

export async function storeMetadata(value, storeKey) {
  await dbOperation("metadata", "metadata", "readwrite", (store) => {
    store.put(value, storeKey);
  });
}

export async function getStoredMetadata(keyName) {
  return dbOperation("metadata", "metadata", "readonly", (store) =>
    store.get(keyName)
  );
}

// ============================================================================
// MESSAGE OPERATIONS
// ============================================================================

export async function storeMessage(threadId, key, data) {
  await dbOperation("messages", "messageStore", "readwrite", (store) => {
    store.put({ threadId, key, data });
  });
}

export async function getStoredMessage(threadId, key) {
  const result = await dbOperation(
    "messages",
    "messageStore",
    "readonly",
    (store) => store.get([threadId, key])
  );

  return result?.data;
}

// FIX #7: Use getAll with index for consistency (matches getStoredFiles pattern)
export async function getStoredMessages(threadId) {
  const db = await openDB("messages");

  return new Promise((resolve, reject) => {
    let tx;
    try {
      tx = db.transaction("messageStore", "readonly");
    } catch (error) {
      db.close();
      reject(error);
      return;
    }

    const store = tx.objectStore("messageStore");
    const index = store.index("threadId");
    const req = index.getAll(IDBKeyRange.only(threadId));

    let result = null;
    let requestError = null;

    req.onsuccess = () => {
      result = req.result.map((item) => ({
        messageId: item.key,
        message: item.data,
      }));
    };

    req.onerror = () => {
      requestError = req.error;
    };

    tx.oncomplete = () => {
      db.close();
      if (requestError) {
        reject(requestError);
      } else {
        resolve(result || []);
      }
    };

    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };

    tx.onabort = () => {
      db.close();
      reject(tx.error || new Error("Transaction aborted"));
    };
  });
}

// ============================================================================
// HEADER OPERATIONS
// ============================================================================

export async function storeHeader(threadId, key, data) {
  await dbOperation("headers", "headerStore", "readwrite", (store) => {
    store.put({ threadId, key, data });
  });
}

export async function getStoredHeader(threadId, key) {
  const result = await dbOperation(
    "headers",
    "headerStore",
    "readonly",
    (store) => store.get([threadId, key])
  );

  return result?.data;
}

// ============================================================================
// FILE OPERATIONS
// ============================================================================

export async function storeFile(threadId, key, data) {
  await dbOperation("files", "fileStore", "readwrite", (store) => {
    store.put({ threadId, key, data });
  });
}

export async function getStoredFile(threadId, key) {
  const result = await dbOperation("files", "fileStore", "readonly", (store) =>
    store.get([threadId, key])
  );

  return result?.data;
}

export async function getStoredFiles(threadId) {
  const db = await openDB("files");

  return new Promise((resolve, reject) => {
    let tx;
    try {
      tx = db.transaction("fileStore", "readonly");
    } catch (error) {
      db.close();
      reject(error);
      return;
    }

    const store = tx.objectStore("fileStore");
    const index = store.index("threadId");
    const req = index.getAll(IDBKeyRange.only(threadId));

    let result = null;
    let requestError = null;

    req.onsuccess = () => {
      result = req.result.map((item) => ({
        fileId: item.key,
        file: item.data,
      }));
    };

    req.onerror = () => {
      requestError = req.error;
    };

    tx.oncomplete = () => {
      db.close();
      if (requestError) {
        reject(requestError);
      } else {
        resolve(result || []);
      }
    };

    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };

    tx.onabort = () => {
      db.close();
      reject(tx.error || new Error("Transaction aborted"));
    };
  });
}

// ============================================================================
// UTILITY: Clear all databases (useful for testing/logout)
// ============================================================================

export async function clearAllDatabases() {
  const dbNames = Object.keys(DB_CONFIG);

  await Promise.all(
    dbNames.map(
      (dbName) =>
        new Promise((resolve, reject) => {
          const req = indexedDB.deleteDatabase(dbName);
          req.onsuccess = () => resolve();
          req.onerror = () => reject(req.error);
          req.onblocked = () => {
            console.warn(`Delete of "${dbName}" blocked`);
            // Still resolve - the delete will complete when connections close
            resolve();
          };
        })
    )
  );

  // Reset init state so databases will be recreated on next use
  initPromise = null;
}


export async function generateKeyPackage(privateIk, publicIk, index, uid) {

  const { privateKey, publicKey } = await generateX25519Keypair();
  const key = await exportKey(publicKey);
  await storeOPK(privateKey, `${index}_init_key`);

  let keypackage = {
    ciphersuite: 1,
    credential: {
      identityKey: publicIk,
      user: uid
    },
    init_key: key,
    protocol_version: "mls10",
  }

  const data = te.encode(JSON.stringify(keypackage))

  const signature = await signKey(privateIk, data)

  keypackage.signature = b64(signature)

  return keypackage
}
