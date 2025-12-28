import {
  addDoc,
  collection,
  deleteDoc,
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
  encryptObject,
  exportKey,
  generateAndStoreX25519Keypair,
  generateX25519Keypair,
  getAllMKsWithKeys,
  getAllOPKsWithKeys,
  getStoredFiles,
  getStoredKey,
  getStoredMessages,
  getStoredMetadata,
  importHKDFKeyRaw,
  importMessageKey,
  importX25519PublicRaw,
  storeKey,
  storeMessage,
  storeMetadata,
  storeMK,
  storeOPK,
  ub64,
} from "../lib/e2ee/e2ee";
import { getStorage, ref, uploadBytes, getDownloadURL, uploadString, getBytes, deleteObject } from "firebase/storage";
import { doc } from "firebase/firestore";
import toast from "react-hot-toast";
import { httpsCallable } from "firebase/functions";

// FRIEND MANAGMENT

export async function removeFriend(friendId, user, userData) {
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

export async function submitUsername(e, id, user, data) {
  e.preventDefault();
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

export async function removeRequest(id, user) {
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
  console.log(urls)
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
    console.log("here")

    const publicRaw = await generateAndStoreX25519Keypair();
    console.log("bannana")
    const publicB64 = btoa(String.fromCharCode(...publicRaw));
    console.log("here")

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
    console.log("here")

    await generateAndStoreSupplementalKeyPairs();
    const supplimentalKeyPairs = await getSupplimentalPublicKeyPairs();
    console.log("here")
    const batch = writeBatch(firestore);
    await generateOPKS({ uid: userUID }, "");

    console.log(supplimentalKeyPairs)
    batch.set(doc(firestore, "users", userUID), {
      displayName: displayName,
      username: username,
      profileIMG: storageUrl,
      email: email,
      creationDate: new Date(),
      lastActive: new Date(),
      publicKey: publicB64,
      friends: [],
      ...supplimentalKeyPairs,
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
      router.push("/");
    } else {
      setValid(true);
    }
    const threadData = (
      await getDoc(doc(firestore, "threads", threadId))
    ).data();
    if (threadData.leader == user.uid) {
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
export async function generateAndStoreSupplementalKeyPairs() {
  await generateAndStoreX25519Keypair("SPKPrivateKey", "SPKPublicKey");
}

export async function getSupplimentalPrivateKeyPairs() {
  return {
    SPKPrivateKey: await getStoredKey("SPKPrivateKey"),
  };
}

export async function getSupplimentalPublicKeyPairs() {
  return {
    SPKPublicKey: await exportKey(await getStoredKey("SPKPublicKey")),
  };
}

export async function uploadSupplimentalKeyPairs(user) {
  await updateDoc(doc(firestore, "users", user.uid), {
    SPKPublicKey: await exportKey(await getStoredKey("SPKPublicKey")),
  });
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
      console.log(threadId)
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

      const messages = await getStoredMessages(threadId);
      const files = await getStoredFiles(threadId);
      console.log(files)

      let threadData = {
        ekPrivate,
        chainKeyS,
        chainKeyR,
        rootKey,
        otherPublicKey_n,
        publicKey_n,
        n,
        pn,
        messages,
        threadId,
        privateKey_n,
      };

      threadsData.push(threadData);
    }
    catch (e) {
      console.log(e)
      console.log(document.id)
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
      const otherPublicKey_n = await importX25519PublicRaw(
        ub64(thread.otherPublicKey_n)
      );
      const rootKey = ub64(thread.rootKey);

      const messages = thread.messages;

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

export async function generateOPKS(user, data) {
  for (let index = 0; index < 10; index++) {
    generateOPK(user, data, index);
  }
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
    console.log("No threads to delete.");
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

  // console.log(`Deleted most recent thread ${threadId}`);
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
  // const OUser = { uid: THEUID };
  // const OData = (
  //   await getDoc(doc(firestore, "users", THEUID))
  // ).data();
  // if (NUM == 0) {
  //   await deleteMostRecentThread(user, data);
  //   threadId = await createDRDM(
  //     user,
  //     data,
  //     [
  //       { uid: user.uid, username: data.username },
  //       { uid: THEUID, username: THEUSERNAME },
  //     ],
  //     `TEST`,
  //     uuidv4()
  //   );
  //   let messageE0 = await sendMessage(threadId, "Hello0", user, data);
  //   let messageE1 = await sendMessage(threadId, "Hello1", user, data);
  //   let messageE2 = await sendMessage(threadId, "Hello2", user, data);
  //   let messageE3 = await sendMessage(threadId, "Hello3", user, data);
  //   let messageE4 = await sendMessage(threadId, "Hello4", user, data);

  //   messageD2 = await deleteMessage(user, data, threadId, messageE4);
  //   // messageD3 = await deleteMessage(user, data, threadId, messageE3);
  // } else {
  //   resendDoc(user, data, messageD2.deletedDocRef, messageD2.docData);
  //   // resendDoc(user, data, messageD3.deletedDocRef, messageD3.docData);
  // }
  // NUM++;
  toast.success("Success");
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

export async function handleDisconnect(closeCallConnection, answerCallRequestHandler, createCallHandler, getRequest, submitCallRequest, user, data) {
  closeCallConnection()
  const request = getRequest();
  if (request?.from != user.uid) {
    answerCallRequestHandler()
  }
  else if (request?.from == user.uid) {
    submitCallRequest().then((_requestId) => {
      acceptCallRequest(_requestId).then(() => {
        createCallHandler()
      })
    })
  }
}

export const callHandler = async (pc, threadId, closeCallConnection, createCallHandler, answerCallRequestHandler, getRequest, submitCallRequest, user, data) => {
  if (!pc || pc.signalingState == "closed") {
    return;
  }
  console.log("Starting call generation");

  const callDoc = doc(collection(firestore, "calls"), threadId);
  const offerCandidates = collection(callDoc, "offerCandidates");
  const answerCandidates = collection(callDoc, "answerCandidates");

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      addDoc(offerCandidates, event.candidate.toJSON());
    }
  };

  pc.onconnectionstatechange = () => {
    console.log("state:", pc.connectionState);

    console.log("HERE")
    switch (pc.connectionState) {
      case "connected":
        toast.success("Call Connected")
        break;

      case "disconnected":

        toast("Call Disconnected. Attemping to Reconnect.", {
          icon: '⚠️'
        })
        handleDisconnect(closeCallConnection, answerCallRequestHandler, createCallHandler, getRequest, submitCallRequest, user, data)
        break;

      case "failed":
        console.log("Restarting ICE…");
        restartIce(pc, callDoc);
        toast.error("Connection Failed")
        break;

      case "closed":
        toast.success("Call Ended")
        break;
    }
  };


  const offerDescription = await pc.createOffer({ iceRestart: true });
  await pc.setLocalDescription(offerDescription);

  console.log("SETTONG")
  await setDoc(callDoc, {
    offer: {
      type: offerDescription.type,
      sdp: offerDescription.sdp,
    },
  });

  const pendingCandidates = [];

  const unsubCall = onSnapshot(callDoc, async (snapshot) => {
    const data = snapshot.data();
    if (!pc.currentRemoteDescription && data?.answer) {
      await pc.setRemoteDescription(
        new RTCSessionDescription(data.answer)
      );

      pendingCandidates.forEach((c) => pc.addIceCandidate(c));
      pendingCandidates.length = 0;
    }
  });

  const unsubCandidates = onSnapshot(answerCandidates, (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type !== "added") return;

      const candidate = new RTCIceCandidate(change.doc.data());
      if (pc.remoteDescription) {
        pc.addIceCandidate(candidate).catch(console.error);
      } else {
        pendingCandidates.push(candidate);
      }
    });
  });

  return () => {
    unsubCall();
    unsubCandidates();
  };
};
export const answerHandler = async (pc, callId, closeCallConnection, createCallHandler, answerCallRequestHandler, getRequest, submitCallRequest, user, data) => {
  if (!pc || pc.signalingState == "closed") {
    return;
  }
  const callDocRef = doc(firestore, "calls", callId);
  const answerCandidatesRef = collection(callDocRef, "answerCandidates");
  const offerCandidatesRef = collection(callDocRef, "offerCandidates");

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      addDoc(answerCandidatesRef, event.candidate.toJSON());
    }
  };

  pc.onconnectionstatechange = () => {
    switch (pc.connectionState) {
      case "connected":
        toast.success("Call Connected")
        break;

      case "disconnected":
        toast("Call Disconnected. Attemping to Reconnect.", {
          icon: '⚠️'
        })
        handleDisconnect(closeCallConnection, answerCallRequestHandler, createCallHandler, getRequest, submitCallRequest, user, data)
        break;
      case "failed":
        restartIce(pc, callDocRef);
        toast.error("Connection Failed")
        break;

      case "closed":
        toast.success("Call Ended")
        break;
    }
  };


  const pendingCandidates = [];

  const unsubCall = onSnapshot(callDocRef, async (snapshot) => {
    const data = snapshot.data();
    if (!data?.offer) return;

    const offerDesc = new RTCSessionDescription(data.offer);

    if (
      pc.remoteDescription &&
      pc.remoteDescription.sdp === offerDesc.sdp
    ) return;

    console.log("Received offer", offerDesc.type);

    if (pc.signalingState === "have-local-offer") {
      await pc.setLocalDescription({ type: "rollback" });
    }

    await pc.setRemoteDescription(offerDesc);

    const answerDesc = await pc.createAnswer();
    await pc.setLocalDescription(answerDesc);

    await updateDoc(callDocRef, {
      answer: {
        type: answerDesc.type,
        sdp: answerDesc.sdp,
      },
    });

    while (pendingCandidates.length) {
      const c = pendingCandidates.shift();
      await pc.addIceCandidate(c).catch(console.error);
    }
  });

  // 🔹 Listen for incoming ICE candidates from caller
  const unsubCandidates = onSnapshot(offerCandidatesRef, (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type !== "added") return;

      const candidate = new RTCIceCandidate(change.doc.data());

      if (pc.remoteDescription) {
        pc.addIceCandidate(candidate).catch(console.error);
      } else {
        pendingCandidates.push(candidate);
      }
    });
  });

  return () => {
    unsubCall();
    unsubCandidates();
  };
};


export const webCamHandler = async (
  pc,
  cameraId,
) => {
  if (!pc || pc.signalingState == "closed") {
    return;
  }
  console.log(cameraId)

  const localStream = await navigator.mediaDevices.getUserMedia({
    video: { deviceId: { exact: cameraId } },
    audio: true,
  });

  const remoteStream = new MediaStream();

  localStream.getTracks().forEach((track) => {
    if (pc.signalingState != "closed") {
      pc.addTrack(track, localStream);
    }
  });

  pc.ontrack = (event) => {
    event.streams[0].getTracks().forEach((track) => {
      remoteStream.addTrack(track);
    });
  };

  return { localStream, remoteStream };
};

export const hangupHandler = async ({
  pcRef,
  localStreamRef,
  remoteStreamRef,
  webcamVideoRef,
  remoteVideoRef,
  unsubscribeRef,
  request,
}) => {
  console.log("Hanging up call");

  unsubscribeRef?.current?.();
  unsubscribeRef.current = null;

  if (localStreamRef.current) {
    localStreamRef.current.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
  }

  if (remoteStreamRef.current) {
    remoteStreamRef.current.getTracks().forEach((t) => t.stop());
    remoteStreamRef.current = null;
  }

  if (webcamVideoRef.current) {
    webcamVideoRef.current.srcObject = null;
  }
  if (remoteVideoRef.current) {
    remoteVideoRef.current.srcObject = null;
  }

  if (pcRef.current) {
    pcRef.current.getSenders().forEach((s) =>
      pcRef.current.removeTrack(s)
    );
    pcRef.current.ontrack = null;
    pcRef.current.onicecandidate = null;
    pcRef.current.close();
    pcRef.current = null;
  }

  // if (request?.id) {
  //   await deleteCallRequest(request.id);
  // }
};



export async function handleCallConnection(pc, threadId) {
  const callDocRef = doc(firestore, "calls", threadId);
  const exists = (await getDoc(callDocRef)).exists();
  if (exists) {
    console.log("Answering")
    await answerHandler(pc, threadId)
  } else {
    console.log("Creating")
    await callHandler(pc, threadId)
  }
}

export async function createCallRequest(threadId, user, data) {
  const requestId = uuidv4()
  await setDoc(doc(firestore, "callRequests", requestId), {
    from: user.uid,
    threadId: threadId,
    timeCreated: new Date(),
    type: 0,
  })
  return requestId
}

export async function deleteCallRequest(requestId) {
  try {
    await deleteDoc(doc(firestore, "callRequests", requestId))
  }
  catch (e) {
    console.log(e)
  }
}

export async function acceptCallRequest(requestId) {
  console.log("ACCEPTING")
  try {
    await updateDoc(doc(firestore, "callRequests", requestId), { type: 1 })
  }
  catch (e) {
    console.log(e)
  }
}

export const getCameras = async () => {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const cameras = devices.filter(d => d.kind === "videoinput");

  return cameras

}

export async function fillRequestData(requestData) {
  const from = requestData.from

  let fromData = (await getDoc(doc(firestore, "users", from))).data()
  fromData.from = from

  requestData.from = fromData

  return requestData
}

async function restartIce(pc, callDoc) {
  const offer = await pc.createOffer({ iceRestart: true });
  await pc.setLocalDescription(offer);

  await updateDoc(callDoc, {
    offer: {
      type: offer.type,
      sdp: offer.sdp,
    },
  });
}
