import { encryptKey } from "./e2ee";
import { firestore } from "../firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";

export async function storeAndDownloadKey(
  privateKey,
  passphrase,
  userUid,
  force = false
) {
  const key = await encryptKey(privateKey, passphrase);

  const requestRef = doc(firestore, "backups", userUid);

  const backup = await getDoc(requestRef);

  if (backup.exists() && !force) {
    return false;
  } else {
    setDoc(requestRef, {
      kdf: {
        algo: "PBKDF2",
        salt: key.salt,
        iterations: key.iterations,
        hash: "SHA-256",
      },
      aead: {
        algo: "AES-GCM",
        nonce: key.nonce,
        ciphertext: key.ciphertext,
      },
    });
    return true;
  }
}
