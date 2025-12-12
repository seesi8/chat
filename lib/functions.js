import {
  collection,
  deleteDoc,
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
  combineKeys,
  decryptBackup,
  decryptGroupMessage,
  decryptMessageDR,
  decryptMissedMessageDR,
  decryptSingleKey,
  encryptGroupMessage,
  encryptKeysForMembers,
  encryptMessageDR,
  encryptObject,
  exportKey,
  generateAndStoreX25519Keypair,
  generateX25519Keypair,
  getOPK,
  getStoredKey,
  getStoredMessage,
  getStoredMessages,
  getStoredMetadata,
  hkdfExpand,
  importHKDFKey,
  importHKDFKeyRaw,
  importMessageKey,
  importX25519PublicRaw,
  rotateGroupKey,
  runDH,
  skipMessageDR,
  storeKey,
  storeMessage,
  storeMetadata,
  storeOPK,
  ub64,
} from "../lib/e2ee/e2ee";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
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

export function uploadImage(e, setStoreageUrl) {
  e.preventDefault();

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
    const publicB64 = btoa(String.fromCharCode(...publicRaw));

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

    await generateAndStoreSupplementalKeyPairs();
    const supplimentalKeyPairs = await getSupplimentalPublicKeyPairs();

    const batch = writeBatch(firestore);

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

    await generateOPKS({ uid: userUID }, "");
    return true;
  } catch (error) {
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
export const decryptMessages = async (messagesValue, threadId, user, data) => {
  if (!messagesValue) {
    return;
  }

  const thread = await getDoc(doc(firestore, "threads", threadId));
  if (thread.data().dm) {
    return decryptDmMessages(messagesValue, threadId, user, data);
  }
  const members = thread.data().members.filter((item) => {
    return item != user.uid;
  });
  // if (members.length != 1) {
  let currentMessages = messagesValue.docs;
  let finalMessages = [];
  for (let messageIndex in currentMessages) {
    const id = currentMessages[messageIndex].id;
    currentMessages[messageIndex] = currentMessages[messageIndex].data();
    currentMessages[messageIndex].id = id;
    let decryptedMessage = "";

    decryptedMessage = await decryptMessage(
      currentMessages[messageIndex],
      user,
      data,
      threadId
    );

    if (decryptedMessage !== undefined) {
      currentMessages[messageIndex].message = decryptedMessage;
      currentMessages[messageIndex].timeSent =
        new Date(
          currentMessages[messageIndex].timeSent.toDate()
        ).toLocaleDateString() +
        " " +
        new Date(
          currentMessages[messageIndex].timeSent.toDate()
        ).toLocaleTimeString();
      finalMessages.push(currentMessages[messageIndex]);
    }
  }
  return finalMessages;
};

export const sendMessage = async (threadId, message, user, data) => {
  const thread = await getDoc(doc(firestore, "threads", threadId));
  const dm = thread.data().dm;
  const leader = thread.data().leader;
  const currentKeyVersion = thread.data().currentKeyVersion;
  let messageE;

  const tn = await getStoredMetadata(`nextN_${threadId}_t`);
  // if (tn != 0) {
  //   console.log("did this");
  //   await storeMetadata(0, `nextN_${threadId}_t`);
  //   if (tn != null) {
  //     await storeMetadata(tn, `PN_${threadId}`);
  //     await storeMetadata(0, `nextN_${threadId}`);
  //   }
  // }

  if (!dm) {
    return await sendGroupMessage(threadId, message, user, data, thread);
  } else {
    const n = await getStoredMetadata(`nextN_${threadId}`);
    const pn = await getStoredMetadata(`PN_${threadId}`);
    const nr = await getStoredMetadata(`nextN_${threadId}_r`);
    const pnr = await getStoredMetadata(`PN_${threadId}_r`);
    console.log("Send");
    console.log(`ns: ${n}, pns: ${pn}`);
    console.log(`nrs: ${nr}, pnrs: ${pnr}`);
    if (n == null && pn == null) {
      console.log("Cycle Send");
      messageE = sendDRDMWithDHExchange(user, data, threadId, message);
    } else {
      if (n == 0) {
        console.log("Cycle Send2");

        messageE = sendDRDMWithDHExchange(
          user,
          data,
          threadId,
          message,
          n,
          pn,
          true
        );
      }
      else {
        messageE = sendDRDM(user, data, threadId, message, n, pn);
      }
    }
  }
  return messageE;
};

// DRDM

//DECRYPT
export const decryptDmMessages = async (
  messagesValue,
  threadId,
  user,
  data
) => {
  if (!messagesValue) {
    return;
  }

  let currentMessages = messagesValue.docs;
  let finalMessages = [];

  const thread = (await getDoc(doc(firestore, "threads", threadId))).data();

  for (let messageIndex in currentMessages) {
    const id = currentMessages[messageIndex].id;

    currentMessages[messageIndex] = currentMessages[messageIndex].data();
    currentMessages[messageIndex].id = id;

    let decryptedMessage = undefined;

    decryptedMessage = await getStoredMessage(threadId, id);

    const n = currentMessages[messageIndex].header.n;
    const pn = currentMessages[messageIndex].header.pn;

    let storedN = await getStoredMetadata(`nextN_${threadId}_r`);
    let storedPN = await getStoredMetadata(`PN_${threadId}_r`);
    let ns = await getStoredMetadata(`nextN_${threadId}`);
    let pns = await getStoredMetadata(`PN_${threadId}`);
    if (decryptedMessage == undefined) {
      const missedMessage = await decryptMissedDRDM(
        user,
        data,
        currentMessages[messageIndex],
        threadId,
        n
      );
      decryptedMessage = missedMessage;
    }
    if ((await getStoredKey(`otherPublicKey_n_${threadId}`)) == null ||
      currentMessages[messageIndex] !=
      (await exportKey(await getStoredKey(`otherPublicKey_n_${threadId}`)))) {
      const missedMessage = await decryptMissedDRDM(
        user,
        data,
        currentMessages[messageIndex],
        threadId,
        n,
        true
      );
      decryptedMessage = missedMessage;
    }
    // return; 
    try {
      if (decryptedMessage == undefined) {
        if (n == 0 && pn > storedN) {
          console.log("missed last");
          let public_key_old = await getStoredKey(`otherPublicKey_n_${threadId}`)
          public_key_old = await exportKey(public_key_old);
          console.log(public_key_old)
          await bypassMissedMessage(threadId, storedN, public_key_old, true);
        }
        // if (n != 0 && ns != 0) {
        //   // CYCLE NOW IF LEADER
        //   console.log("Cycle Leader");
        //   await cycleDHRachet(
        //     user,
        //     data, 
        //     currentMessages[messageIndex],
        //     threadId
        //   );
        //   await storeMetadata(0, `nextN_${threadId}_r`);
        //   await storeMetadata(1, `nextN_${threadId}_t`);
        //   storedN = await getStoredMetadata(`nextN_${threadId}_r`);
        //   storedPN = await getStoredMetadata(`PN_${threadId}_r`);
        //   ns = await getStoredMetadata(`nextN_${threadId}`);
        //   pns = await getStoredMetadata(`PN_${threadId}`);
        // }
        console.log("Recv");
        console.log(`n: ${n}, pn: ${pn}`);
        console.log(`ns: ${ns}, pns: ${pns}`);
        console.log(`nrs: ${storedN}, pnrs: ${storedPN}`);
        // if (ns != 0 && n != 0 && user.uid != thread.leader && ns != undefined && n != undefined) {
        //   console.log("IDEKANYMORE");
        //   continue;
        // }
        if (n > storedN) {
          console.log("Recv");
          console.log(`n: ${n}, pn: ${pn}`);
          console.log(`ns: ${ns}, pns: ${pns}`);
          console.log(`nrs: ${storedN}, pnrs: ${storedPN}`);
          console.log("MISSED");
          for (let i = 0; i < n - storedN; i++) {
            await bypassMissedMessage(threadId, storedN + i, currentMessages[messageIndex].header.publicKey_n);
          }
          storedN = n;
          storedPN = pn;
        }
        if (decryptedMessage == undefined) {
          if (n === 0 && pn === 0 && thread.leader != user.uid) {
            // VERY FIRST MESSAGE
            const firstMessage = await decryptFirstDRDM(
              user,
              data,
              currentMessages[messageIndex],
              threadId
            );
            await storeMetadata(n + 1, `nextN_${threadId}_r`);
            await storeMetadata(pn, `PN_${threadId}_r`);
            await storeMetadata(n, `nextN_${threadId}_t`);
            decryptedMessage = firstMessage;
          } else {
            if (((await getStoredKey(`otherPublicKey_n_${threadId}`)) == null ||
              currentMessages[messageIndex] !=
              (await exportKey(await getStoredKey(`otherPublicKey_n_${threadId}`))))) {
              console.log("Cycle Recv");
              await cycleDHRachet(
                user,
                data,
                currentMessages[messageIndex],
                threadId
              );
              await storeMetadata(1, `nextN_${threadId}_t`);
            }
            decryptedMessage = await decryptDRDM(
              user,
              data,
              currentMessages[messageIndex],
              threadId
            );
            await storeMetadata(n + 1, `nextN_${threadId}_r`);
            await storeMetadata(pn, `PN_${threadId}_r`);
            await storeMetadata(n, `nextN_${threadId}_t`);
          }
        }
      }
    } catch (e) {
      console.log(e);
    }
    if (decryptedMessage !== undefined) {
      currentMessages[messageIndex].message = decryptedMessage;
      currentMessages[messageIndex].timeSent =
        new Date(
          currentMessages[messageIndex].timeSent.toDate()
        ).toLocaleDateString() +
        " " +
        new Date(
          currentMessages[messageIndex].timeSent.toDate()
        ).toLocaleTimeString();
      finalMessages.push(currentMessages[messageIndex]);
    }
  }
  return finalMessages;
};

export async function x3dh_r(user, data, data_b, salt, threadId) {
  const thread = (await getDoc(doc(firestore, "threads", threadId))).data();
  const ekPublic = thread.ekPublic;
  const opkIndex = parseInt(thread.opkIndex);

  let privKey_a = await importX25519PublicRaw(ub64(data_b.publicKey));
  let EKpriv_a = await importX25519PublicRaw(ub64(ekPublic));
  let pubKey_b = data.privateKey;
  let SPKpub_b = data.SPKPrivateKey;
  let OPKpub_b = await getOPK(opkIndex);

  const dh1 = await runDH(SPKpub_b, privKey_a);
  const dh2 = await runDH(pubKey_b, EKpriv_a);
  const dh3 = await runDH(SPKpub_b, EKpriv_a);

  const dh4 = await runDH(OPKpub_b, EKpriv_a);

  const ikm = combineKeys(dh1, dh2, dh3, dh4);
  const prk = await importHKDFKey(ikm);

  const expanded = await hkdfExpand(prk);

  const chainKey = await importHKDFKeyRaw(expanded["chainKey"]);
  const rootKey = expanded["rootKey"];

  await storeKey(chainKey, `chainKey_${threadId}_r`);
  await storeKey(expanded["chainKey"], `chainKey_${threadId}_r_raw`);
  await storeKey(rootKey, `rootKey_${threadId}`);
  await generateOPK(user, data, opkIndex);

  return expanded;
}

export async function decryptFirstDRDM(user, data, message, threadId) {
  const member = (
    await getDoc(doc(firestore, "users", message.sentBy.user))
  ).data();
  const salt = (await getDoc(doc(firestore, "threads", threadId))).data().salt;

  const result = await x3dh_r(user, data, member, salt, threadId);

  const chainKey = await getStoredKey(`chainKey_${threadId}_r`);

  const decrypted = await decryptMessageDR(
    chainKey,
    message.header,
    message.message,
    message.nonce
  );

  const otherPublicKey = await importX25519PublicRaw(
    ub64(message.header.publicKey_n)
  );

  await storeKey(otherPublicKey, `otherPublicKey_n_${threadId}`);

  await storeMessage(threadId, message.id, decrypted.plaintext);

  const key = await importHKDFKeyRaw(decrypted.nextChainKey);

  await storeKey(key, `chainKey_${threadId}_r`);
  await storeKey(decrypted.nextChainKey, `chainKey_${threadId}_r_raw`);

  return decrypted.plaintext;
}

export async function decryptDRDM(user, data, message, threadId) {
  const chainKey = await getStoredKey(`chainKey_${threadId}_r`);

  const decrypted = await decryptMessageDR(
    chainKey,
    message.header,
    message.message,
    message.nonce
  );

  await storeMessage(threadId, message.id, decrypted.plaintext);

  const otherPublicKey = await importX25519PublicRaw(
    ub64(message.header.publicKey_n)
  );

  await storeKey(otherPublicKey, `otherPublicKey_n_${threadId}`);
  const key = await importHKDFKeyRaw(decrypted.nextChainKey);

  await storeKey(key, `chainKey_${threadId}_r`);
  await storeKey(decrypted.nextChainKey, `chainKey_${threadId}_r_raw`);
  return decrypted.plaintext;
}

export async function decryptMissedDRDM(user, data, message, threadId, n, old=false) {
  const mk = await getStoredKey(`mk_${threadId}_${n}_${message.header.publicKey_n}`);
  if (!mk) {
    return;
  } else {
    console.log("FOUND MK");
  }

  try {
    const decrypted = await decryptMissedMessageDR(
      mk,
      message.header,
      message.message,
      message.nonce,
    );

    await storeMessage(threadId, message.id, decrypted.plaintext);

    const otherPublicKey = await importX25519PublicRaw(
      ub64(message.header.publicKey_n)
    );

    await storeKey(otherPublicKey, `otherPublicKey_n_${threadId}`);
    return decrypted.plaintext;
  }
  catch (e) {
    console.log("error when decrypting missed message", e);
    return;
  }
}

export async function bypassMissedMessage(threadId, n, publicKey_n, old = false) {
  let mk = await getStoredKey(`mk_${threadId}_${n}_${publicKey_n}`);
  if (!mk) {
    console.log("BYPASSING");
    let chainKey;

    if (old) {
      console.log("OLD CK");
      chainKey = await getStoredKey(`chainKey_${threadId}_r_old`);
    }
    else {
      chainKey = await getStoredKey(`chainKey_${threadId}_r`);
    }

    console.log(chainKey)
    const { mkBytes, nextChainKey } = await skipMessageDR(chainKey);

    const key = await importHKDFKeyRaw(nextChainKey);
    mk = await importMessageKey(mkBytes);
    if (old) {
      await storeKey(key, `chainKey_${threadId}_r_old`);
      await storeKey(nextChainKey, `chainKey_${threadId}_r_raw_old`);
    }
    else {
      await storeKey(key, `chainKey_${threadId}_r`);
      await storeKey(nextChainKey, `chainKey_${threadId}_r_raw`);
    }

    await storeKey(mk, `mk_${threadId}_${n}_${publicKey_n}`);
    await storeKey(mkBytes, `mk_${threadId}_${n}_${publicKey_n}_raw`);
  }
}

//CREATE

export const createDRDM = async (
  user,
  data,
  members,
  groupName = "",
  groupId
) => {
  if (members.length != 2) {
    toast.error("Direct messages must have 2 people.");
    return;
  }

  if (groupName == "") {
    groupName = members[1].username;
  }

  let memberUID = [];
  for (let i in members) {
    memberUID.push(members[i].uid);
  }

  const otherMember = (
    await getDoc(doc(firestore, "users", members[1].uid))
  ).data();

  if (!groupId) {
    groupId = uuidv4();
  }

  const batch = writeBatch(firestore);

  const { privateKey: ekPrivate, publicKey: ekPublic } =
    await generateX25519Keypair();

  await storeKey(ekPrivate, `ekPrivate_${groupId}`);
  const exportedEk = await exportKey(ekPublic);

  const { result, opkIndex } = await x3dh(
    user,
    data,
    otherMember,
    groupId,
    members[1].uid
  );
  const salt = b64(result["salt"]);

  batch.set(doc(firestore, "threads", groupId), {
    groupName: groupName.toString(),
    members: memberUID,
    createdAt: new Date(),
    latestMessage: new Date(),
    leader: user.uid,
    dm: true,
    salt: salt,
    ekPublic: exportedEk,
    opkIndex,
  });
  batch.set(doc(firestore, "threadsId", groupId), {
    id: groupId,
    members: memberUID,
  });

  await sendWelcomeMessage(user, data, groupId, batch, ekPublic, ekPrivate);

  await batch.commit();
  return groupId;
};

export async function x3dh(user, data, data_b, threadId, uid_b) {
  const preKey = await getRecentOPK(uid_b);
  const opkIndex = parseInt(preKey.index);

  let privKey_a = data.privateKey;
  let EKpriv_a = await getStoredKey(`ekPrivate_${threadId}`);
  let pubKey_b = await importX25519PublicRaw(ub64(data_b.publicKey));
  let SPKpub_b = await importX25519PublicRaw(ub64(data_b.SPKPublicKey));
  let OPKpub_b = await importX25519PublicRaw(ub64(preKey.key));

  const dh1 = await runDH(privKey_a, SPKpub_b);
  const dh2 = await runDH(EKpriv_a, pubKey_b);
  const dh3 = await runDH(EKpriv_a, SPKpub_b);
  const dh4 = await runDH(EKpriv_a, OPKpub_b);

  const ikm = combineKeys(dh1, dh2, dh3, dh4);
  const prk = await importHKDFKey(ikm);

  const expanded = await hkdfExpand(prk);

  const chainKey = await importHKDFKeyRaw(expanded["chainKey"]);
  const rootKey = expanded["rootKey"];

  await storeKey(chainKey, `chainKey_${threadId}_s`);
  await storeKey(expanded["chainKey"], `chainKey_${threadId}_s_raw`);
  await storeKey(rootKey, `rootKey_${threadId}`);

  return { result: expanded, opkIndex };
}

export async function sendWelcomeMessage(
  user,
  data,
  threadId,
  batch,
  ekPublic,
  ekPrivate
) {
  const message = "Welcome";
  const messageId = uuidv4();

  const n = await getStoredMetadata(`nextN_${threadId}`);
  const pn = await getStoredMetadata(`PN_${threadId}`);
  const nr = await getStoredMetadata(`nextN_${threadId}_r`);
  const pnr = await getStoredMetadata(`PN_${threadId}_r`);
  console.log("Send");
  console.log(`ns: ${n}, pns: ${pn}`);
  console.log(`nrs: ${nr}, pnrs: ${pnr}`);

  const welcomeMessage = await getWelcomeMessage(
    user,
    data,
    message,
    threadId,
    ekPublic,
    ekPrivate
  );

  batch.set(doc(firestore, "threads", threadId, "messages", messageId), {
    message: welcomeMessage["ciphertext"],
    header: welcomeMessage["header"],
    nonce: welcomeMessage["nonce"],
    timeSent: new Date(),
    sentBy: {
      user: user.uid,
      profileIMG: data.profileIMG,
      username: data.displayName,
    },
  });

  batch.update(doc(firestore, "threads", threadId), {
    latestMessage: new Date(),
  });

  await storeMessage(threadId, messageId, message);
}

export async function getWelcomeMessage(
  user,
  data,
  message,
  threadId,
  ekPublic,
  ekPrivate
) {
  await migrateKeys(user, data, threadId, ekPublic, ekPrivate);
  const publicKey_n = await getStoredKey(`publicKey_${threadId}_n`);
  const privateKey_n = await getStoredKey(`privateKey_${threadId}_n`);
  const chainKey = await getStoredKey(`chainKey_${threadId}_s`);

  const encrypted = await encryptMessageDR(
    chainKey,
    0,
    0,
    publicKey_n,
    message,
    user.uid
  );

  storeMetadata(1, `nextN_${threadId}`);

  const nextChainKey = await importHKDFKeyRaw(encrypted["nextChainKey"]);

  await storeKey(nextChainKey, `chainKey_${threadId}_s`);
  await storeKey(encrypted["nextChainKey"], `chainKey_${threadId}_s_raw`);

  return {
    ciphertext: encrypted["ciphertext"],
    header: encrypted["header"],
    nonce: encrypted["nonce"],
  };
}

// SEND

export async function sendDRDM(user, data, threadId, message, n = 0, pn = 0) {
  const chainKey = await getStoredKey(`chainKey_${threadId}_s`);
  const publicKey_n = await getStoredKey(`publicKey_${threadId}_n`);
  const privateKey_n = await getStoredKey(`privateKey_${threadId}_n`);
  const messageId = uuidv4();

  const encrypted = await encryptMessageDR(
    chainKey,
    n,
    pn,
    publicKey_n,
    message,
    user.uid
  );

  storeMetadata(n + 1, `nextN_${threadId}`);

  const nextChainKey = await importHKDFKeyRaw(encrypted["nextChainKey"]);

  const batch = writeBatch(firestore);

  batch.set(doc(firestore, "threads", threadId, "messages", messageId), {
    message: encrypted["ciphertext"],
    header: encrypted["header"],
    nonce: encrypted["nonce"],
    timeSent: new Date(),
    sentBy: {
      user: user.uid,
      profileIMG: data.profileIMG,
      username: data.displayName,
    },
  });

  batch.update(doc(firestore, "threads", threadId), {
    latestMessage: new Date(),
  });

  batch.commit();

  await storeKey(nextChainKey, `chainKey_${threadId}_s`);
  await storeKey(encrypted["nextChainKey"], `chainKey_${threadId}_s_raw`);
  await storeMessage(threadId, messageId, message);

  return {
    ciphertext: encrypted["ciphertext"],
    header: encrypted["header"],
    nonce: encrypted["nonce"],
    messageId,
  };
}

export async function createOldKeys(threadId) {
  console.log(await getStoredKey(`chainKey_${threadId}_r`))

  const chainKey_s_old = await getStoredKey(`chainKey_${threadId}_s`);
  const chainKey_s_raw_old = await getStoredKey(
    `chainKey_${threadId}_s_raw`
  );
  const chainKey_r_old = await getStoredKey(`chainKey_${threadId}_r`);
  const chainKey_r_raw_old = await getStoredKey(`chainKey_${threadId}_r_raw`);
  return {
    chainKey_s_old,
    chainKey_s_raw_old,
    chainKey_r_old,
    chainKey_r_raw_old,
  };
}

export async function sendDRDMWithDHExchange(
  user,
  data,
  threadId,
  message,
  n = 0,
  pn = 0,
  restrict = false
) {

  console.log(await getStoredKey(`chainKey_${threadId}_r`))
  // Get Old Keys
  const { chainKey_s_old, chainKey_s_raw_old, chainKey_r_old, chainKey_r_raw_old } = await createOldKeys(threadId);

  //const get member data
  let memberUid = (await getDoc(doc(firestore, "threads", threadId)))
    .data()
    .members.filter((item) => {
      return item != user.uid;
    })[0];
  let memberData = (await getDoc(doc(firestore, "users", memberUid))).data();
  memberData.uid = memberUid;

  // Derive new keys
  let {
    chainKey: chainKey_s,
    chainKey2: chainKey_r,
    privateKey,
    publicKey,
    rootKey,
    salt,
  } = await deriveNewKeys(user, data, memberData, threadId);

  const chainKey_s_raw = chainKey_s;
  const chainKey_r_raw = chainKey_r;

  chainKey_s = await importHKDFKeyRaw(chainKey_s);
  chainKey_r = await importHKDFKeyRaw(chainKey_r);
  // Done with Rachett step now encrypt message


  const encrypted = await encryptMessageDR(
    chainKey_s,
    n,
    pn,
    publicKey,
    message,
    user.uid
  );
  const messageId = uuidv4();

  const nextChainKey = await importHKDFKeyRaw(encrypted["nextChainKey"]);

  const batch = writeBatch(firestore);

  batch.set(doc(firestore, "threads", threadId, "messages", messageId), {
    message: encrypted["ciphertext"],
    header: encrypted["header"],
    nonce: encrypted["nonce"],
    timeSent: new Date(),
    sentBy: {
      user: user.uid,
      profileIMG: data.profileIMG,
      username: data.displayName,
    },
  });

  batch.update(doc(firestore, "threads", threadId), {
    latestMessage: new Date(),
  });

  batch.commit();

  await storeKey(nextChainKey, `chainKey_${threadId}_s`);
  await storeKey(encrypted["nextChainKey"], `chainKey_${threadId}_s_raw`);
  await storeMessage(threadId, messageId, message);
  await storeMetadata(n + 1, `nextN_${threadId}`);
  if (!restrict) {
    await storeMetadata(0, `PN_${threadId}`);
  }

  await storeKey(chainKey_r_old, `chainKey_${threadId}_r_old`);
  await storeKey(chainKey_r_raw_old, `chainKey_${threadId}_r_raw_old`);
  await storeKey(chainKey_s_old, `chainKey_${threadId}_s_old`);
  await storeKey(chainKey_s_raw_old, `chainKey_${threadId}_s_raw_old`);

  await storeKey(chainKey_r, `chainKey_${threadId}_r`);
  await storeKey(chainKey_r_raw, `chainKey_${threadId}_r_raw`);
  await storeKey(privateKey, `privateKey_${threadId}_n`);
  await storeKey(publicKey, `publicKey_${threadId}_n`);
  await storeKey(rootKey, `rootKey_${threadId}`);

  return {
    ciphertext: encrypted["ciphertext"],
    header: encrypted["header"],
    nonce: encrypted["nonce"],
    messageId,
  };
}

// GROUP
export const createGroup = async (user, data, members, groupName) => {
  if (members.length < 3) {
    toast.error("Group messages must have 3 or more people.");
    return;
  }

  const groupId = uuidv4();
  if (groupName == "") {
    groupName = "unnamed group";
  }

  let memberUID = [];
  for (let i in members) {
    memberUID.push(members[i].uid);
  }

  const secretKey = crypto.getRandomValues(new Uint8Array(32));
  const secretKeyB64 = btoa(String.fromCharCode(...secretKey));
  const myPrivKey = data.privateKey;

  const keys = await encryptKeysForMembers(
    myPrivKey,
    members,
    secretKeyB64,
    1,
    groupId
  );

  const batch = writeBatch(firestore);
  batch.set(doc(firestore, "threads", groupId), {
    groupName: groupName.toString(),
    members: memberUID,
    createdAt: new Date(),
    latestMessage: new Date(),
    keys: keys,
    leader: user.uid,
    currentKeyVersion: 1,
    dm: false,
  });
  batch.set(doc(firestore, "threadsId", groupId), {
    id: groupId,
    members: memberUID,
  });
  await batch.commit();
  return true;
};

const decryptMessage = async (message, user, data, threadId) => {
  if (!data.privateKey) {
    return undefined;
  }
  const decryptedKey = await getDecryptedKey(
    message.version,
    user,
    data,
    threadId
  );
  const sentBy = message.sentBy.user;

  if (!decryptedKey) {
    return undefined;
  }

  if (sentBy == user.uid) {
    const decryptedMessage = await decryptGroupMessage(
      decryptedKey,
      message.message,
      user.uid,
      ub64(message.nonce)
    );
    return decryptedMessage;
  } else {
    const decryptedMessage = await decryptGroupMessage(
      decryptedKey,
      message.message,
      message.sentBy.user,
      ub64(message.nonce)
    );
    return decryptedMessage;
  }
};

const getDecryptedKey = async (version, user, data, threadId) => {
  try {
    const myPrivKey = data.privateKey;

    const thread = (await getDoc(doc(firestore, "threads", threadId))).data();

    const member = await getDoc(doc(firestore, "users", thread.leader));
    const fromPublicKey = await importX25519PublicRaw(
      ub64(member.data().publicKey)
    );
    const salt = ub64(thread.keys[version][user.uid].salt);
    const iv = ub64(thread.keys[version][user.uid].nonce);
    const decryptedKey = ub64(
      await decryptSingleKey(
        myPrivKey,
        fromPublicKey,
        salt,
        iv,
        thread.keys[version][user.uid].ciphertext,
        version,
        threadId
      )
    );

    return decryptedKey;
  } catch (e) {
    console.log(e);
    return;
  }
};

const sendGroupMessage = async (threadId, message, user, data, thread) => {
  const decryptedKey = await getDecryptedKey(
    thread.data().currentKeyVersion,
    user,
    data,
    threadId
  );
  let encryption = await encryptGroupMessage(decryptedKey, message, user.uid);

  const batch = writeBatch(firestore);
  batch.set(doc(firestore, "threads", threadId, "messages", uuidv4()), {
    message: encryption.ciphertext,
    aad: encryption.aad,
    nonce: encryption.nonce,
    timeSent: new Date(),
    sentBy: {
      user: user.uid,
      profileIMG: data.profileIMG,
      username: data.displayName,
    },
    version: thread.data().currentKeyVersion,
  });

  batch.update(doc(firestore, "threads", threadId), {
    latestMessage: new Date(),
  });
  await batch.commit();
};

export const rotate = async (
  threadData,
  members,
  thread,
  user,
  data,
  _batch = undefined
) => {
  if (threadData.dm) {
    const secretKey = crypto.getRandomValues(new Uint8Array(32));
    const secretKeyB64 = btoa(String.fromCharCode(...secretKey));
    const myPrivKey = data.privateKey;

    const keys = await rotateGroupKey(
      myPrivKey,
      members,
      secretKeyB64,
      threadData.currentKeyVersion + 1,
      threadData.keys[user.uid],
      thread
    );

    let batch;
    if (_batch) {
      batch = _batch;
    } else {
      batch = writeBatch(firestore);
    }

    const { [user.uid]: _, ...otherKeys } = threadData.keys;

    batch.update(doc(firestore, "threads", thread), {
      keys: { ...otherKeys, [user.uid]: keys },
      currentKeyVersion: threadData.currentKeyVersion + 1,
    });
    await batch.commit();
  } else {
    const secretKey = crypto.getRandomValues(new Uint8Array(32));
    const secretKeyB64 = btoa(String.fromCharCode(...secretKey));
    const myPrivKey = data.privateKey;

    const keys = await rotateGroupKey(
      myPrivKey,
      members,
      secretKeyB64,
      threadData.currentKeyVersion + 1,
      threadData.keys,
      thread
    );

    let batch;
    if (_batch) {
      batch = _batch;
    } else {
      batch = writeBatch(firestore);
    }

    batch.update(doc(firestore, "threads", thread), {
      keys: keys,
      currentKeyVersion: threadData.currentKeyVersion + 1,
    });
    await batch.commit();
  }
};

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

async function cycleDHRachet(user, data, message, threadId) {
  if (
    (await getStoredKey(`otherPublicKey_n_${threadId}`)) == null ||
    message.header.publicKey_n !=
    (await exportKey(await getStoredKey(`otherPublicKey_n_${threadId}`)))
  ) {
    const chainKey_r_old = await getStoredKey(`chainKey_${threadId}_r`);
    const chainKey_r_raw_old = await getStoredKey(
      `chainKey_${threadId}_r_raw`
    );
    const chainKey_s_old = await getStoredKey(`chainKey_${threadId}_s`);
    const chainKey_s_raw_old = await getStoredKey(`chainKey_${threadId}_s_raw`);
    const { privateKey: newPrivateKey, publicKey: newPublicKey } =
      await generateX25519Keypair();
    const otherPublicKey_n = await importX25519PublicRaw(
      ub64(message.header.publicKey_n)
    );
    const privateKey = await getStoredKey(`privateKey_${threadId}_n`);
    const publicKey = await getStoredKey(`publicKey_${threadId}_n`);
    const dh = await runDH(privateKey, otherPublicKey_n);
    const prk = await importHKDFKey(dh);
    const rootKey = await getStoredKey(`rootKey_${threadId}`);
    let {
      chainKey: chainKey_r,
      chainKey2: chainKey_s,
      rootKey: newRootKey,
      salt,
    } = await hkdfExpand(prk, rootKey);

    const chainKey_s_raw = chainKey_s;
    const chainKey_r_raw = chainKey_r;

    chainKey_s = await importHKDFKeyRaw(chainKey_s);
    chainKey_r = await importHKDFKeyRaw(chainKey_r);

    const n = await getStoredMetadata(`nextN_${threadId}`);

    await storeMetadata(0, `nextN_${threadId}`);
    await storeMetadata(n, `PN_${threadId}`);
    await storeKey(otherPublicKey_n, `otherPublicKey_n_${threadId}`);
    await storeKey(chainKey_s, `chainKey_${threadId}_s`);
    await storeKey(chainKey_s_raw, `chainKey_${threadId}_s_raw`);
    await storeKey(chainKey_r, `chainKey_${threadId}_r`);
    await storeKey(chainKey_r_raw, `chainKey_${threadId}_r_raw`);
    await storeKey(chainKey_s_old, `chainKey_${threadId}_s_old`);
    await storeKey(chainKey_s_raw_old, `chainKey_${threadId}_s_raw_old`);
    await storeKey(chainKey_r_old, `chainKey_${threadId}_r_old`);
    await storeKey(chainKey_r_raw_old, `chainKey_${threadId}_r_raw_old`);
    await storeKey(newPrivateKey, `privateKey_${threadId}_n`);
    await storeKey(newPublicKey, `publicKey_${threadId}_n`);
    await storeKey(privateKey, `privateKey_${threadId}_n-1`);
    await storeKey(publicKey, `publicKey_${threadId}_n-1`);
    await storeKey(newRootKey, `rootKey_${threadId}`);
  }
}

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

async function migrateKeys(user, data, threadId, ekPublic, ekPrivate) {
  const privateKey = ekPrivate;
  const publicKey = ekPublic;

  await storeKey(privateKey, `privateKey_${threadId}_n`);
  await storeKey(publicKey, `publicKey_${threadId}_n`);
}

export async function deriveNewKeys(user, data, data_b, threadId) {
  const { privateKey, publicKey } = await generateX25519Keypair();
  const otherPublicKey_n = await getStoredKey(`otherPublicKey_n_${threadId}`);
  const rootKey = await getStoredKey(`rootKey_${threadId}`);
  const dh = await runDH(privateKey, otherPublicKey_n);

  const prk = await importHKDFKey(dh);

  const expanded = await hkdfExpand(prk, rootKey);
  return { publicKey, privateKey, ...expanded };
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

  for (let document of documents) {
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

    const messages = await getStoredMessages(threadId);

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

  const encrypted = await encryptObject(
    JSON.stringify({ threadsData, SPKPrivateKey, privateKey }),
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
  for (let index = 0; index < 100; index++) {
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
  const OUser = { uid: THEUID };
  const OData = (
    await getDoc(doc(firestore, "users", THEUID))
  ).data();
  if (NUM == 0) {
    await deleteMostRecentThread(user, data);
    threadId = await createDRDM(
      user,
      data,
      [
        { uid: user.uid, username: data.username },
        { uid: THEUID, username: THEUSERNAME },
      ],
      `TEST`,
      uuidv4()
    );
    let messageE0 = await sendMessage(threadId, "Hello0", user, data);
    let messageE1 = await sendMessage(threadId, "Hello1", user, data);
    let messageE2 = await sendMessage(threadId, "Hello2", user, data);
    let messageE3 = await sendMessage(threadId, "Hello3", user, data);
    let messageE4 = await sendMessage(threadId, "Hello4", user, data);

    messageD2 = await deleteMessage(user, data, threadId, messageE4);
    // messageD3 = await deleteMessage(user, data, threadId, messageE3);
  } else {
    resendDoc(user, data, messageD2.deletedDocRef, messageD2.docData);
    // resendDoc(user, data, messageD3.deletedDocRef, messageD3.docData);
  }
  NUM++;
  toast.success("Success");
}
export async function testThread(user, data, threadId) {
  if (NUM == 0) {
    let messageE4 = await sendMessage(threadId, "Hello4", user, data);
    messageD2 = await deleteMessage(user, data, threadId, messageE4);
  } else {
    // messageD3 = await deleteMessage(user, data, threadId, messageE3);
    resendDoc(user, data, messageD2.deletedDocRef, messageD2.docData);
  }
  NUM++;
  toast.success("Success");
} 
