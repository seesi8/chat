import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { uuidv4 } from "@firebase/util";
import { getDoc, setDoc, getDocs, orderBy, limit } from "firebase/firestore";
import { auth, firestore, functions } from "../lib/firebase";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from "firebase/auth";
import {
  b64,
  decryptBackup,
  deleteKey,
  encryptObject,
  exportKey,
  generateAndStoreEd25519Keypair,
  generateAndStoreX25519Keypair,
  generateKeyPackage,
  generateX25519Keypair,
  getAllMKsWithKeys,
  getAllOPKsWithKeys,
  getMyPrivateKey,
  getStoredFiles,
  getStoredKey,
  getStoredMessages,
  getStoredMetadata,
  importHKDFKeyRaw,
  importMessageKey,
  importX25519PublicRaw,
  signKey,
  sixNums,
  storeFile,
  storeKey,
  storeMessage,
  storeMetadata,
  storeMK,
  storeOPK,
  ub64,
} from "../lib/e2ee/e2ee";
import { getStorage, ref, uploadBytes, getDownloadURL, uploadString, getBytes, deleteObject } from "firebase/storage";
import toast from "react-hot-toast";
import { httpsCallable } from "firebase/functions";

// FRIEND MANAGMENT

export async function removeFriend(friendId, user, userData) {
  await deleteKey(id)

  const userRef = doc(firestore, "users", user.uid);
  const batch = writeBatch(firestore);
  const otherFriend = doc(firestore, "users", friendId);
  let userFreinds = userData.friends;
  let friendFriends = (await getDoc(otherFriend)).data().friends;
  var filteredFriends = userFreinds.filter((item) => item !== friendId);
  var freindsFilteredFriends = friendFriends.filter(
    (item) => item !== user.uid
  );
  batch.set(userRef, { friends: filteredFriends }, { merge: true });
  batch.set(otherFriend, { friends: freindsFilteredFriends }, { merge: true });
  batch.commit();
}

export async function acceptFriend(id, user, data) {
  const otherUserData = (await getDoc(doc(firestore, "users", id))).data()
  await storeKey(otherUserData.publicKey, id)

  const batch = writeBatch(firestore);
  batch.delete(doc(firestore, "requests", `from${id}to${user.uid}`));
  batch.update(doc(firestore, "users", user.uid), {
    friends: data.friends.concat(id),
  });
  const thierFriends = (await getDoc(doc(firestore, "users", id))).data()
    .friends;
  batch.update(doc(firestore, "users", id), {
    friends: thierFriends.concat(user.uid),
  });
  batch.commit();
}

export async function getUserData(id) {
  console.log(id)
  let _doc = (await getDoc(doc(firestore, "users", id))).data()
  _doc.id = id
  return _doc
}

export async function submitUsername(id, user, data) {
  if (id != undefined) {
    let isOpen = false;
    const fromUser = await getDocs(
      query(
        collection(firestore, "requests"),
        where("from", "==", user.uid),
        where("to", "==", id)
      )
    );
    const toUser = await getDocs(
      query(
        collection(firestore, "requests"),
        where("from", "==", id),
        where("to", "==", user.uid)
      )
    );
    const otherUserData = (await getDoc(doc(firestore, "users", id))).data()
    await storeKey(otherUserData.publicKey, id)

    fromUser.forEach((doc) => {
      isOpen = true;
    });
    toUser.forEach((doc) => {
      isOpen = true;
    });
    if (data.friends.includes(id) == false && !isOpen) {
      const requestRef = doc(firestore, "requests", `from${user.uid}to${id}`);
      setDoc(requestRef, {
        from: user.uid,
        to: id,
        members: [id, user.uid],
      });
      return true;
    }
  }
  return false;
}

export const nextPow2 = n => n <= 1 ? 1 : 1 << (32 - Math.clz32(n - 1));

export async function removeRequest(id, user, data) {
  await deleteKey(id)
  await removeFriend(id, user, data)
  await deleteDoc(doc(firestore, "requests", `from${user.uid}to${id}`));
}

export const getFriends = async (user, data, friends) => {
  const docSnap = await getDoc(doc(firestore, "users", user.uid));
  let docData = docSnap.data();
  docData.id = docSnap.id;
  let localFriends = friends;
  for (let i = 0; i < docData.friends.length; i++) {
    const friendDocSnap = await getDoc(
      doc(firestore, "users", docData.friends[i])
    );
    let friendData = friendDocSnap.data();
    friendData.uid = friendDocSnap.id;
    localFriends.push(friendData);
  }
  return localFriends;
};

export const getAllUsers = async () => {
  const querySnapshot = await getDocs(query(collection(firestore, "users")));
  const currentMembers = [];
  querySnapshot.forEach((doc) => {
    let docData = doc.data();
    docData.uid = doc.id;
    currentMembers.push(docData);
  });
  return currentMembers;
};

// THREAD MANAGEMENT

export const loadThreads = async (data, user, usersThreads) => {
  if (!data || !user || !usersThreads) return;

  const localThreads = [];
  for (let i in usersThreads.docs) {
    if (!usersThreads.docs[i].data().members.includes(user.uid)) {
      return;
    }
    let docData = (
      await getDoc(doc(firestore, "threads", usersThreads.docs[i].id))
    ).data();
    docData.id = usersThreads.docs[i].id;
    localThreads.push(docData);
  }

  localThreads.sort((a, b) => (a.latestMessage < b.latestMessage ? 1 : -1));
  return localThreads;
};

export const getThreadData = async (thread) => {
  if (!thread) return;
  const docData = (await getDoc(doc(firestore, "threads", thread))).data();
  return docData;
};

export const getMembers = async (threadData) => {
  if (!threadData) return;
  const membersData = [];
  for (let i = 0; i < threadData.members.length; i++) {
    const memberDoc = await getDoc(
      doc(firestore, "users", threadData.members[i])
    );
    const memberData = memberDoc.data();
    memberData.uid = memberDoc.id;
    membersData.push(memberData);
  }
  return membersData;
};

export const removeGroupMember = async (
  friendId,
  threadData,
  thread,
  membersData,
  user,
  data
) => {
  const batch = writeBatch(firestore);
  batch.update(doc(firestore, "threads", thread), {
    members: threadData.members.filter((id) => id !== friendId),
  });
  batch.update(doc(firestore, "threadsId", thread), {
    members: threadData.members.filter((id) => id !== friendId),
  });
  await rotate(
    threadData,
    membersData.filter((item) => item.uid !== friendId),
    thread,
    user,
    data,
    batch
  );
  toast.success("Member removed");
  return membersData.filter((member) => member.uid !== friendId);
};

export const addGroupMember = async (
  member,
  thread,
  threadData,
  membersData,
  user,
  data
) => {
  if (membersData.filter((item) => item.uid === member.uid).length > 0) {
    return membersData;
  }
  const docData = (await getDoc(doc(firestore, "threads", thread))).data();
  if (docData.members.filter((item) => item == member.uid).length > 0) {
    return [...membersData, member];
  }
  const batch = writeBatch(firestore);
  batch.update(doc(firestore, "threads", thread), {
    members: [...threadData.members, member.uid],
  });
  batch.update(doc(firestore, "threadsId", thread), {
    members: [...threadData.members, member.uid],
  });
  await rotate(threadData, [...membersData, member], thread, user, data, batch);
  toast.success("Member added");
  return [...membersData, member];
};

export const changeGroupName = async (thread, threadData, groupName) => {
  if (groupName == "") {
    toast.error("Group name cannot be empty");
    return;
  }
  await updateDoc(doc(firestore, "threads", thread), {
    groupName: groupName,
  });
  toast.success("Group name changed");
  return { ...threadData, groupName: groupName };
};

export async function deleteGroupChat(threadId) {
  const batch = writeBatch(firestore);
  batch.delete(doc(firestore, "threads", threadId));
  batch.delete(doc(firestore, "threadsId", threadId));
  await batch.commit();
  toast.success(
    "Succesfully deleted group chat. Please wait while we redirect you home."
  );
  return true;
}

// USER CREATION

export function uploadImage(setStoreageUrl, e) {
  e && e.preventDefault();

  const storage = getStorage();
  const storageRef = ref(storage, uuidv4());

  const file = Array.from(e.target.files)[0];

  // 'file' comes from the Blob or File API
  uploadBytes(storageRef, file).then((snapshot) => {
    getDownloadURL(snapshot.ref).then((url) => {
      setStoreageUrl(url);
    });
  });
}

export async function uploadImages(setStorageUrl, e) {
  e?.preventDefault();

  if (!e?.target?.files?.length) return;

  const storage = getStorage();
  const files = e.target.files;
  const urls = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];

    const storageRef = ref(storage, `images/${uuidv4()}`);
    const snapshot = await uploadBytes(storageRef, file);
    const url = await getDownloadURL(snapshot.ref);
    urls.push(url);
  }

  setStorageUrl(urls);
}
export async function createUser(
  auth,
  email,
  password,
  displayName,
  storageUrl
) {
  try {
    const userCredential = await createUserWithEmailAndPassword(
      auth,
      email,
      password
    );
    // Signed in
    const userUID = userCredential.user.uid;
    const usersRef = collection(firestore, "users");
    const q = query(
      usersRef,
      where("displayName", "==", displayName),
      orderBy("username", "asc", limit(1))
    );
    const querySnapshot = await getDocs(q);


    const publicRaw = await generateAndStoreX25519Keypair();
    const publicRawSK = await generateAndStoreEd25519Keypair("privateSK", "publicSK");
    const privateSK = await getStoredKey("privateSK")

    const publicB64 = btoa(String.fromCharCode(...publicRaw));
    const publicB64SK = btoa(String.fromCharCode(...publicRawSK));


    let username = "";
    if (querySnapshot.docs.length == 0) {
      username = displayName;
    } else {
      querySnapshot.forEach((doc) => {
        let index = doc.data().username.split(displayName)[1];
        if (index == "") {
          index = "0";
        }

        username = displayName.concat((parseInt(index) + 1).toString());
      });
    }


    const SPKBundle = await generateAndStoreSupplementalKeyPairs(privateSK);

    const batch = writeBatch(firestore);

    await generateOPKS({ uid: userUID }, 10);

    batch.set(doc(firestore, "users", userUID), {
      displayName: displayName,
      username: username,
      profileIMG: storageUrl,
      email: email,
      creationDate: new Date(),
      lastActive: new Date(),
      publicKey: publicB64,
      publicKeySK: publicB64SK,
      friends: [],
      SPKBundle,
    });
    batch.set(doc(firestore, "usernames", username), {
      uid: userUID,
    });

    await batch.commit();

    return true;
  } catch (error) {
    console.log(error)
    const errorCode = error.code;
    const errorMessage = error.message;
    console.log(error);
    if (errorCode.includes("email-already-in-use")) {
      toast.error("Invalid Email");
      return;
    }
    if (errorCode.includes("email")) {
      toast.error("Invalid Email");
      return;
    } else if (errorCode.includes("password")) {
      toast.error("Invalid Password");
      return;
    } else {
      toast.error("Invalid Info");
    }
    return false;
  }
}

export const getCurrentMembers = async (data, user) => {
  if (!data || !user) {
    return;
  }
  const people = [];
  const fromUser = await getDocs(
    query(collection(firestore, "requests"), where("from", "==", user.uid))
  );
  const toUser = await getDocs(
    query(collection(firestore, "requests"), where("to", "==", user.uid))
  );

  for (let i in fromUser.docs) {
    const otherUser = fromUser.docs[i].data().to;
    people.push(await getDoc(doc(firestore, "users", otherUser)));
  }
  for (let i in toUser.docs) {
    const otherUser = toUser.docs[i].data().from;
    people.push(await getDoc(doc(firestore, "users", otherUser)));
  }
  for (let i in data.friends) {
    people.push(await getDoc(doc(firestore, "users", data.friends[i])));
  }
  const currentMembers = [];
  people.map((doc) => {
    let docData = doc.data();
    docData.uid = doc.id;
    currentMembers.push(docData);
  });
  return currentMembers;
};

export const routeUser = async (auth, user, threadId, setValid, setOwner) => {
  if (auth.currentUser && auth.currentUser.uid) {
    const threadMembers = (
      await getDoc(doc(firestore, "threadsId", threadId))
    ).data().members;

    if (!threadMembers.includes(user.uid)) {
      // router.push("/");
      setValid(true);

    } else {
      setValid(true);
    }
    const threadData = (
      await getDoc(doc(firestore, "threads", threadId))
    ).data();
    if (threadData.leader == user.uid || threadData.dm) {
      setOwner(true);
    }
  }
};

// E2EE

export function isSameDate(d1, d2) {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

export function formatDate(date) {
  if (isSameDate(date, new Date())) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  else {
    return date.toLocaleDateString()
  }
}

export function withinDistance(t1, t2) {
  const diff = Math.abs(t1 - t2);
  return diff < 300;
}


export function readFileBytes(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      resolve(new Uint8Array(reader.result));
    };

    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}


export async function compressImage(file, {
  maxWidth = 1600,
  quality = 0.75,
  type = "image/webp"
} = {}) {
  const img = new Image();
  img.src = URL.createObjectURL(file);

  await new Promise(res => img.onload = res);

  const scale = Math.min(1, maxWidth / img.width);
  const canvas = document.createElement("canvas");

  canvas.width = img.width * scale;
  canvas.height = img.height * scale;

  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  return new Promise(resolve =>
    canvas.toBlob(resolve, type, quality)
  );
}


export async function uploadText(text, messageId) {
  const storage = getStorage();
  const storageRef = ref(storage, `${messageId}.enc`);

  await uploadString(storageRef, text, "raw", {
    contentType: "text/plain",
  });

  return await getDownloadURL(storageRef);
}

export async function downloadText(messageId) {
  try {
    const storage = getStorage();
    const storageRef = ref(storage, `${messageId}.enc`);

    const bytes = await getBytes(storageRef);

    return new TextDecoder("utf-8").decode(bytes);
  }
  catch (e) {
  }
  return undefined
}

export async function deleteStorage(messageId) {
  try {
    const storage = getStorage();
    const storageRef = ref(storage, `${messageId}.enc`);

    await deleteObject(storageRef);
  }
  catch (e) {
  }
}

// SUGGESTIONS MANAGEMENT
export const getSuggestionsFromInput = (
  friends,
  currentInput,
  membersData,
  user,
  data
) => {
  let currentSuggestions = [];

  if (currentInput == "") {
    return currentSuggestions;
  }

  for (let i = 0; i < friends.length; i++) {
    if (
      membersData.length > 0 &&
      (friends[i].uid === user.uid ||
        membersData.filter((member) => member.uid === friends[i].uid).length >
        0)
    )
      continue;
    if (
      friends[i].username.toLowerCase().includes(currentInput.toLowerCase()) &&
      !friends[i].uid.includes(user.uid)
    ) {
      currentSuggestions.push(friends[i]);
    }
  }
  return currentSuggestions;
};

export const removeMember = (e, item, members, user, data) => {
  e.preventDefault();
  if (
    members.filter((_item) => _item.uid === item.uid).length > 0 &&
    item.uid !== user.uid
  ) {
    return members.filter((_item) => _item.uid !== item.uid);
  }
};

export const submitMember = async (item, members, user, data, dm) => {
  if (dm) {
    return [
      {
        uid: user.uid,
        username: data.username,
        publicKey: data.publicKey,
      },
      {
        uid: item.uid,
        username: item.username,
        publicKey: item.publicKey,
      },
    ];
  }
  if (members.filter((_item) => _item.uid === item.uid).length === 0) {
    return members.concat({
      uid: item.uid,
      username: item.username,
      publicKey: item.publicKey,
    });
  }
};

// AUTH

export const login = async (e, email, password) => {
  e.preventDefault();

  signInWithEmailAndPassword(auth, email, password)
    .then(async (userCredential) => {
      const userUID = userCredential.user.uid;
      toast.success("Signed In");

      await setDoc(
        doc(firestore, "users", userUID),
        {
          lastActive: new Date(),
        },
        { merge: true }
      );
    })
    .catch((error) => {
      const errorCode = error.code;
      const errorMessage = error.message;
      console.log(error);
      if (errorMessage.includes("wrong-password")) {
        toast.error("Wrong Password");
      } else if (errorMessage.includes("invalid-email")) {
        toast.error("Invalid Email");
      } else if (errorMessage.includes("too-many-requests")) {
        toast.error("Too Many Tries. Try Again Later");
      } else if (errorMessage.includes("auth/user-not-found")) {
        toast.error("User Does Not Exist");
      } else {
        //toast.error("Error");
      }
    });
};

// KEYPAIR MANAGEMENT
export async function generateAndStoreSupplementalKeyPairs(privateKey) {
  const publicRaw = await generateAndStoreX25519Keypair("SPKPrivateKey", "SPKPublicKey");
  const publicRawB64 = b64(publicRaw)
  const signature = await signKey(privateKey, publicRaw)
  const SPKBundle = {
    SPKPublicKey: publicRawB64,
    signature: b64(signature),
    timestamp: new Date(),
    keyId: 1
  }
  return SPKBundle
}

export async function getSupplimentalPrivateKeyPairs() {
  return {
    SPKPrivateKey: await getStoredKey("SPKPrivateKey"),
    privateSK: await getStoredKey("privateSK"),
  };
}

// BACKUP
export async function createBackup(user, data, passphrase) {
  // const OPKPrivateKey = await exportKey(await getStoredKey("OPKPrivateKey"), "pkcs8")
  const SPKPrivateKey = await exportKey(
    await getStoredKey("SPKPrivateKey"),
    "pkcs8"
  );
  const privateKey = await exportKey(await getStoredKey("privateKey"), "pkcs8");

  const documents = (
    await getDocs(
      query(
        collection(firestore, "threads"),
        where("members", "array-contains", user && user.uid)
      )
    )
  ).docs.map((document) => {
    let data = document.data();
    data.id = document.id;
    return data;
  });

  let threadsData = [];

  const opks = await getAllOPKsWithKeys()
  let exportedOpks = [];

  for (let opk of opks) {
    let new_opk = {
      storeKey: opk.storeKey,
      opk: await exportKey(opk.opk, "pkcs8")
    }

    exportedOpks.push(new_opk);
  }

  const mks = await getAllMKsWithKeys();
  let new_mks = [];
  for (let mk of mks) {
    const emk = b64(mk.mk);
    if (!emk) {
      continue;
    }
    let new_mk = {
      storeKey: mk.storeKey,
      mk: b64(mk.mk)
    }
    new_mks.push(new_mk);
  }


  for (let document of documents) {
    try {
      const threadId = document.id;

      let ekPrivate;
      if ((await getStoredKey(`ekPrivate_${threadId}`)) != undefined) {
        ekPrivate = await exportKey(
          await getStoredKey(`ekPrivate_${threadId}`),
          "pkcs8"
        );
      } else {
        ekPrivate = null;
      }
      const chainKeyS = b64(await getStoredKey(`chainKey_${threadId}_s_raw`));
      const chainKeyR = b64(await getStoredKey(`chainKey_${threadId}_r_raw`));
      const rootKey = b64(await getStoredKey(`rootKey_${threadId}`));

      const otherPublicKey_n = await exportKey(
        await getStoredKey(`otherPublicKey_n_${threadId}`)
      );
      const publicKey_n = await exportKey(
        await getStoredKey(`publicKey_${threadId}_n`)
      );
      const privateKey_n = await exportKey(
        await getStoredKey(`privateKey_${threadId}_n`),
        "pkcs8"
      );

      const pn = await getStoredMetadata(`PN_${threadId}`);
      const n = await getStoredMetadata(`nextN_${threadId}`);
      const pnr = await getStoredMetadata(`PN_${threadId}_r`);
      const nr = await getStoredMetadata(`nextN_${threadId}_r`);

      const messages = await getStoredMessages(threadId);

      const files = await getStoredFiles(threadId);
      const uploadedFiles = [];

      for (let file of files) {
        const fileId = file.fileId;
        const fileData = file.file;

        const encryptedFile = await encryptObject(
          fileData,
          passphrase
        );

        const uploadedFileUrl = await uploadText(
          encryptedFile.ciphertext,
          fileId
        );

        const fileObj = {
          messageId: fileId,
          nonce: encryptedFile.nonce,
          salt: encryptedFile.salt,
          iterations: encryptedFile.iterations,
        }

        uploadedFiles.push(fileObj);
      }

      let threadData = {
        ekPrivate,
        chainKeyS,
        chainKeyR,
        rootKey,
        otherPublicKey_n,
        publicKey_n,
        n,
        pn,
        nr,
        pnr,
        messages,
        threadId,
        privateKey_n,
        uploadedFiles
      };

      threadsData.push(threadData);
    }
    catch (e) {
      console.log(e)

    }
  }

  const encrypted = await encryptObject(
    JSON.stringify({ threadsData, SPKPrivateKey, privateKey, exportedOpks, mks: new_mks }),
    passphrase
  );
  return encrypted;
}

export async function storeAndDownloadBackup(
  passphrase,
  user,
  data,
  force = false
) {
  const encrypted = await createBackup(user, data, passphrase);

  const requestRef = doc(firestore, "backups", user.uid);

  const backup = await getDoc(requestRef);

  if (backup.exists() && !force) {
    return false;
  } else {
    setDoc(requestRef, {
      kdf: {
        algo: "PBKDF2",
        salt: encrypted.salt,
        iterations: encrypted.iterations,
        hash: "SHA-256",
      },
      aead: {
        algo: "AES-GCM",
        nonce: encrypted.nonce,
        ciphertext: encrypted.ciphertext,
      },
    });
    return true;
  }
}

export async function restoreBackup(userData, passphrase, setPopup) {
  const requestRef = doc(firestore, "backups", userData.user.uid);

  const backup = (await getDoc(requestRef)).data();

  const ciphertext = backup["aead"]["ciphertext"];
  const salt = backup["kdf"]["salt"];
  const nonce = backup["aead"]["nonce"];

  try {
    const decrypted = await decryptBackup(ciphertext, salt, passphrase, nonce);
    const loaded = JSON.parse(decrypted);

    // const OPKPrivateKey = await importX25519PublicRaw(ub64(loaded["OPKPrivateKey"]), ["deriveBits", "deriveKey"], 'pkcs8')
    const SPKPrivateKey = await importX25519PublicRaw(
      ub64(loaded["SPKPrivateKey"]),
      ["deriveBits", "deriveKey"],
      "pkcs8"
    );
    const privateKey = await importX25519PublicRaw(
      ub64(loaded["privateKey"]),
      ["deriveBits", "deriveKey"],
      "pkcs8"
    );

    for (let opk of loaded["exportedOpks"]) {
      const importedOpk = await importX25519PublicRaw(
        ub64(opk.opk),
        ["deriveBits", "deriveKey"],
        "pkcs8");
      await storeOPK(importedOpk, opk.storeKey);
    }

    for (let mk of loaded["mks"]) {
      const importedMK = await importMessageKey(
        ub64(mk.mk));
      await storeMK(importedMK, mk.storeKey);
      await storeMK(ub64(mk.mk), `${mk.storeKey}_raw`);
    }

    for (let thread of loaded["threadsData"]) {
      const threadId =
        thread.threadId || "d36ceb77-5709-46d7-a0c7-27c46e2ae27c";
      const chainKeyR = await importHKDFKeyRaw(ub64(thread.chainKeyR));
      const chainKeyS = await importHKDFKeyRaw(ub64(thread.chainKeyS));
      const publicKey_n = await importX25519PublicRaw(ub64(thread.publicKey_n));
      const privateKey_n = await importX25519PublicRaw(
        ub64(thread.privateKey_n),
        ["deriveBits", "deriveKey"],
        "pkcs8"
      );
      const n = thread.n;
      const pn = thread.pn;
      const nr = thread.nr;
      const pnr = thread.pnr;
      const otherPublicKey_n = await importX25519PublicRaw(
        ub64(thread.otherPublicKey_n)
      );
      const rootKey = ub64(thread.rootKey);

      const messages = thread.messages;

      const files = thread.uploadedFiles;
      for (let file of files) {
        const fileId = file.messageId
        const ciphertext = await downloadText(fileId);
        const plaintext = await decryptBackup(ciphertext, file.salt, passphrase, file.nonce);
        await storeFile(threadId, fileId, plaintext);
        await deleteStorage(fileId);
      }
      for (let _message of messages) {
        const message = _message.message;
        const messageId = _message.messageId;

        await storeMessage(threadId, messageId, message);
      }
      await storeKey(chainKeyR, `chainKey_${threadId}_r`);
      await storeKey(ub64(thread.chainKeyR), `chainKey_${threadId}_r_raw`);
      await storeKey(chainKeyS, `chainKey_${threadId}_s`);
      await storeKey(ub64(thread.chainKeyS), `chainKey_${threadId}_s_raw`);
      await storeKey(publicKey_n, `publicKey_${threadId}_n`);
      await storeKey(rootKey, `rootKey_${threadId}`);
      await storeKey(privateKey_n, `privateKey_${threadId}_n`);
      await storeKey(otherPublicKey_n, `otherPublicKey_n_${threadId}`);
      await storeMetadata(n, `nextN_${threadId}`);
      await storeMetadata(pn, `PN_${threadId}`);
      await storeMetadata(nr, `nextN_${threadId}_r`);
      await storeMetadata(pnr, `PN_${threadId}_r`);

      if (thread.ekPrivate != null) {
        const ekPrivate = await importX25519PublicRaw(
          ub64(thread.ekPrivate),
          ["deriveBits", "deriveKey"],
          "pkcs8"
        );
        await storeKey(ekPrivate, `ekPrivate_${threadId}`);
      }
    }

    // await storeKey(OPKPrivateKey, `OPKPrivateKey`)
    await storeKey(SPKPrivateKey, `SPKPrivateKey`);
    await storeKey(privateKey, `privateKey`);

    setPopup(false);
    toast.success("Account recovered. Please wait while we reload the page.");
    new Promise((resolve) =>
      setTimeout(() => {
        window.location.reload(true);
        resolve();
      }, 1000)
    );
  } catch (e) {
    console.log(e);
    toast.error("Wrong passphrase please try again.");
  }
}

// OPK
export async function generateOPK(user, data, index) {
  const { privateKey, publicKey } = await generateX25519Keypair();
  const key = await exportKey(publicKey);
  await storeOPK(privateKey, index);
  const addOPK = httpsCallable(functions, "addOPK");
  const result = await addOPK({
    index,
    key,
    uid: user.uid,
  });

  return result;
}

export async function generateOPKS(user, data, n = 10) {
  for (let index = 0; index < n; index++) {
    generateOPK(user, data, index);
  }
}

export async function generateKeyPackages(user, data, n=10){
  const privateIk = await getStoredKey("privateSK")
  const batch = writeBatch(firestore);
  for (let index =0; index < n; index ++){
    const keyPackage = await generateKeyPackage(privateIk, data.publicKey, index, user.uid)
    console.log(keyPackage)
    batch.set(doc(firestore, "users", user.uid, "keyPackages", `${index}`), keyPackage)
  }
  await batch.commit()
  console.log("commmited")
}

export async function getRecentOPK(uid) {
  const getOPK = httpsCallable(functions, "getOPK");
  const result = await getOPK({
    uid: uid,
  });
  const resData = result.data;
  return resData;
}

export async function deleteMessage(user, data, threadId, messageE) {
  const messageId = (await messageE).messageId;
  const docRef = doc(firestore, "threads", threadId, "messages", messageId);
  const deletedDoc = await getDoc(docRef);
  const docData = deletedDoc.data();
  const deletedDocRef = deletedDoc.ref;
  await deleteDoc(docRef);
  return { docData, deletedDocRef };
}

export async function resendDoc(user, data, deletedDocRef, deletedDocData) {
  return await setDoc(deletedDocRef, deletedDocData);
}

export async function deleteThreadMessages(threadId) {
  const msgsCol = collection(firestore, "threads", threadId, "messages");
  const snapshot = await getDocs(msgsCol);

  const deletes = snapshot.docs.map((d) => deleteDoc(d.ref));
  await Promise.all(deletes);
}

export async function deleteMostRecentThread(user, data) {
  // 1. Query for newest thread
  const threadsCol = collection(firestore, "threads");
  const q = query(threadsCol, orderBy("createdAt", "desc"), limit(1));
  const snap = await getDocs(q);

  if (snap.empty) {

    return null;
  }

  const threadDoc = snap.docs[0];
  const threadId = threadDoc.id;

  // 2. Delete messages for that thread
  const msgsCol = collection(firestore, "threads", threadId, "messages");
  const msgsSnap = await getDocs(msgsCol);

  const deletes = msgsSnap.docs.map((d) => deleteDoc(d.ref));
  await Promise.all(deletes);

  // 3. Delete the thread doc itself
  await deleteDoc(doc(firestore, "threads", threadId));

  // 
  return threadId; // optional
}
let NUM = 0;
let messageD2;
let messageD3;
let threadId;
const THEUID = "iVTm4IkpDOg0BNnjwVEEJrgaYto2";
const THEUSERNAME = "grant";
// TESTING
export async function test(user, data) {
  generateKeyPackages(user, data, 10)
}
export async function testThread(user, data, threadId) {
  if (NUM == 0) {
    let messageE4 = await sendMessage(threadId, "Hello4", user, data, 0x01);
    messageD2 = await deleteMessage(user, data, threadId, messageE4);
  } else {
    // messageD3 = await deleteMessage(user, data, threadId, messageE3);
    resendDoc(user, data, messageD2.deletedDocRef, messageD2.docData);
  }
  NUM++;
  toast.success("Success");
}

export const getCameras = async () => {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const cameras = devices.filter(d => d.kind === "videoinput");

  return cameras

}