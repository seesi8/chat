import { x25519 } from '@noble/curves/ed25519';
import { dbOperation, getStoredKey, storeOPK } from './indexDB';


//Encoding
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

//Crypto Helpers
export function getCryptoRandomValues(array) {
  return crypto.getRandomValues(array)
}

export async function sign(privateKey, data) {
  const signature = await crypto.subtle.sign(
    { name: "Ed25519" },
    privateKey,
    data
  );
  return signature;
}


export async function sha256Bytes(msgBytes) {
  const buf = await crypto.subtle.digest("SHA-256", msgBytes);
  return new Uint8Array(buf);
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

// Key Management

async function generateAndStoreKeypair(algo, uses, storePrivKey = "privateKey",
  storePubKey = "publicKey") {
  const { publicKey, privateKey } = await crypto.subtle.generateKey(
    algo,
    true,
    uses
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

export async function generateAndStoreX25519Keypair(
  storePrivKey = "privateKey",
  storePubKey = "publicKey"
) {
  return await generateAndStoreKeypair("X25519", ["deriveBits", "deriveKey"], storePrivKey, storePubKey);
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

  return await generateAndStoreKeypair("Ed25519", ["sign", "verify"], storePrivKey, storePubKey);
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


  const alg = { name: "X25519" };

  const toB64Url = (u8) =>
    btoa(String.fromCharCode(...u8))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");

  const jwkPriv = {
    kty: "OKP",
    crv: "X25519",
    d: toB64Url(new Uint8Array(privateKeyRaw)),
    x: toB64Url(new Uint8Array(publicKeyRaw)),
    key_ops: ["deriveBits"],
    ext: false,
  };

  const privateKey = await crypto.subtle.importKey(
    "jwk",
    jwkPriv,
    alg,
    false,
    ["deriveBits"] // or ["deriveKey","deriveBits"]
  );

  const publicKey = await crypto.subtle.importKey(
    "raw",
    publicKeyRaw,
    alg,
    true,
    []
  );

  // const privateKey = await crypto.subtle.importKey("raw", privateKeyRaw, "X25519", false, ["deriveBits", "deriveKey"])
  // const publicKey = await crypto.subtle.importKey("raw", publicKeyRaw, "X25519", true)

  return { privateKey, publicKey };
}

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

//Backup Stuff
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

// MLS stuff
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
  const ctBuf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: nonce, additionalData: te.encode(aad) },
    key,
    messageBytes
  );

  return {
    plaintext: td.decode(ctBuf),
  };
}

// DRDM
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

  const signature = await sign(privateIk, data)

  keypackage.signature = b64(signature)

  return keypackage
}
