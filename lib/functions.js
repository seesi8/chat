import {
  collection,
  deleteDoc,
  query,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { uuidv4 } from "@firebase/util";
import {
  getDoc,
  setDoc,
  getDocs,
  orderBy,
  limit,
  getCountFromServer,
} from "firebase/firestore";
import { auth, firestore } from "../lib/firebase";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from "firebase/auth";
import {
  b64,
  combineKeys,
  cycleKey,
  decryptDmContent,
  decryptGroupMessage,
  decryptMessageDR,
  decryptSingleKey,
  ecnryptMessageDR,
  encryptDm,
  encryptGroupMessage,
  encryptKeysForMembers,
  encryptMessageDR,
  exportKey,
  generateAndStoreX25519Keypair,
  generateX25519Keypair,
  getStoredKey,
  getStoredMessage,
  hkdfExpand,
  importHKDFKey,
  importHKDFKeyRaw,
  importX25519PublicRaw,
  rotateGroupKey,
  runDH,
  storeKey,
  storeMessage,
  ub64,
} from "../lib/e2ee/e2ee";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { doc } from "firebase/firestore";
import toast from "react-hot-toast";

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
      //const userRef = doc(firestore, 'users', user.uid);
      // await updateDoc(userRef, { friends: data.friends.concat(suggestions[0].id) });
    }
  }
  return false;
}

export async function removeRequest(id, user) {
  await deleteDoc(doc(firestore, "requests", `from${user.uid}to${id}`));
}

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

  for (let messageIndex in currentMessages) {
    const id = currentMessages[messageIndex].id;
    currentMessages[messageIndex] = currentMessages[messageIndex].data();
    currentMessages[messageIndex].id = id;
    let decryptedMessage = "";
    decryptedMessage = await getStoredMessage(threadId, id);
    if (decryptedMessage == undefined) {
      if (currentMessages[messageIndex].header.n === 0) {
        const firstMessage = await decryptFirstDRDM(
          user,
          data,
          currentMessages[messageIndex],
          threadId
        );
        decryptedMessage = firstMessage;
      }
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

const decryptDm = async (message, user, data, threadId, key) => {
  if (!data.privateKey) {
    return undefined;
  }
  const sentBy = message.sentBy.user;

  if (sentBy == user.uid) {
    const decryptedMessage = await decryptDmContent(
      key,
      message.message,
      message.sentBy.user,
      threadId,
      ub64(message.nonce)
    );

    return {
      plaintext: decryptedMessage.plaintext,
      nextChainKey: decryptedMessage.nextChainKey,
    };
  } else {
    const decryptedMessage = await decryptDmContent(
      key,
      message.message,
      message.sentBy.user,
      threadId,
      ub64(message.nonce)
    );

    return {
      plaintext: decryptedMessage.plaintext,
      nextChainKey: decryptedMessage.nextChainKey,
    };
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

const getDecryptedDmSendKey = async (version, user, data, threadId) => {
  try {
    const myPrivKey = data.privateKey;

    const thread = (await getDoc(doc(firestore, "threads", threadId))).data();

    if (thread.leader == user.uid) {
      const member = await getDoc(doc(firestore, "users", thread.leader));
      const fromPublicKey = await importX25519PublicRaw(
        ub64(member.data().publicKey)
      );
      const salt = ub64(thread.keys[user.uid][version][user.uid].salt);
      const iv = ub64(thread.keys[user.uid][version][user.uid].nonce);

      const decryptedKey = ub64(
        await decryptSingleKey(
          myPrivKey,
          fromPublicKey,
          salt,
          iv,
          thread.keys[user.uid][version][user.uid].ciphertext,
          version,
          threadId
        )
      );
      return decryptedKey;
    } else {
      const fromPublicKey = await importX25519PublicRaw(ub64(data.publicKey));
      const salt = ub64(thread.keys[user.uid][version][user.uid].salt);
      const iv = ub64(thread.keys[user.uid][version][user.uid].nonce);

      const decryptedKey = ub64(
        await decryptSingleKey(
          myPrivKey,
          fromPublicKey,
          salt,
          iv,
          thread.keys[user.uid][version][user.uid].ciphertext,
          version,
          threadId
        )
      );
      return decryptedKey;
    }
  } catch (e) {
    console.log(e);
    return;
  }
};

const getDecryptedDmRecvKey = async (
  version,
  user,
  data,
  threadId,
  otherUid
) => {
  try {
    const myPrivKey = data.privateKey;

    const thread = (await getDoc(doc(firestore, "threads", threadId))).data();

    if (thread.leader != user.uid) {
      const member = await getDoc(doc(firestore, "users", thread.leader));
      const fromPublicKey = await importX25519PublicRaw(
        ub64(member.data().publicKey)
      );

      if (thread.keys[otherUid] == undefined) {
        return;
      }

      const salt = ub64(thread.keys[otherUid][version][user.uid].salt);
      const iv = ub64(thread.keys[otherUid][version][user.uid].nonce);

      const decryptedKey = ub64(
        await decryptSingleKey(
          myPrivKey,
          fromPublicKey,
          salt,
          iv,
          thread.keys[otherUid][version][user.uid].ciphertext,
          version,
          threadId
        )
      );
      return decryptedKey;
    } else {
      const member = await getDoc(
        doc(
          firestore,
          "users",
          thread.members.filter((member) => member != user.uid)[0]
        )
      );
      const fromPublicKey = await importX25519PublicRaw(
        ub64(member.data().publicKey)
      );

      if (thread.keys[otherUid] == undefined) {
        return;
      }

      const salt = ub64(thread.keys[otherUid][version][user.uid].salt);
      const iv = ub64(thread.keys[otherUid][version][user.uid].nonce);

      const decryptedKey = ub64(
        await decryptSingleKey(
          myPrivKey,
          fromPublicKey,
          salt,
          iv,
          thread.keys[otherUid][version][user.uid].ciphertext,
          version,
          threadId
        )
      );
      return decryptedKey;
    }
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

const sendDm = async (threadId, message, user, data, thread, key) => {
  let encryption = await encryptDm(key, message, user.uid, threadId);

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

  return {
    key: encryption.nextChainKey,
    version: thread.data().currentKeyVersion,
  };
};

export const getNextKey = async (threadId, user, data) => {
  if (user == undefined || data == undefined) {
    return;
  }

  const threadRef = doc(firestore, "threads", threadId);

  const dm = (await getDoc(threadRef)).data().dm;

  if (!dm) {
    return;
  }

  const version = (await getDoc(threadRef)).data().currentKeyVersion;

  const decryptedKey = await getDecryptedDmSendKey(
    version,
    user,
    data,
    threadId
  );

  const messagesRef = collection(threadRef, "messages");

  const q = query(
    messagesRef,
    where("sentBy.user", "==", user.uid),
    where("version", "==", version)
  );

  const count = (await getCountFromServer(q)).data().count;

  console.log(decryptedKey, count);

  let key = decryptedKey;

  for (let i = 0; i < count; i++) {
    key = await cycleKey(key, threadId);
  }

  return { key, version };
};

export const sendMessage = async (
  threadId,
  message,
  user,
  data,
  _key,
  keyVersion
) => {
  const thread = await getDoc(doc(firestore, "threads", threadId));
  const dm = thread.data().dm;
  const currentKeyVersion = thread.data().currentKeyVersion;

  if (!dm) {
    return await sendGroupMessage(threadId, message, user, data, thread);
  } else {
    let key = _key;

    if (key == undefined || keyVersion != currentKeyVersion) {
      key = await createSendKey(thread, user, data, currentKeyVersion);
    }

    console.log(key);

    return await sendDm(threadId, message, user, data, thread, key);
  }
};

async function getMembersData(members) {
  const data = await Promise.all(
    members.map(async (member) => {
      const user = await getDoc(doc(firestore, "users", member));
      return { ...user.data(), uid: user.id };
    })
  );
  return data;
}

async function createSendKey(thread, user, data, version = 1) {
  const threadData = thread.data();
  const members = await getMembersData(threadData.members);
  const groupId = thread.id;

  if (threadData.keys[user.uid] != undefined) {
    if (threadData.keys[user.uid][version] != undefined) {
      return;
    }
  }

  const secretKey = crypto.getRandomValues(new Uint8Array(32));
  const secretKeyB64 = btoa(String.fromCharCode(...secretKey));
  const myPrivKey = data.privateKey;

  let keys = await encryptKeysForMembers(
    myPrivKey,
    members,
    secretKeyB64,
    version,
    groupId
  );

  if (threadData.keys[user.uid] != undefined) {
    await updateDoc(doc(firestore, "threads", groupId), {
      keys: {
        ...threadData.keys,
        [user.uid]: { ...threadData.keys[user.uid], ...keys },
      },
    });
  } else {
    await updateDoc(doc(firestore, "threads", groupId), {
      keys: {
        ...threadData.keys,
        [user.uid]: keys,
      },
    });
  }

  const fromPublicKey = await importX25519PublicRaw(ub64(data.publicKey));

  const decrypted = ub64(
    await decryptSingleKey(
      data.privateKey,
      fromPublicKey,
      ub64(keys[version][user.uid].salt),
      ub64(keys[version][user.uid].nonce),
      keys[version][user.uid].ciphertext,
      version,
      groupId
    )
  );

  return decrypted;
}

export const getThreadData = async (thread) => {
  if (!thread) return;
  const docData = (await getDoc(doc(firestore, "threads", thread))).data();
  return docData;
};

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

export function contains(list, element) {
  return list.some((elem) => {
    return JSON.stringify(element) === JSON.stringify(elem);
  });
}

export const createDm = async (user, data, members, groupName) => {
  if (members.length != 2) {
    toast.error("Direct messages must have 2 people.");
    return;
  }

  const groupId = uuidv4();
  if (groupName == "") {
    groupName = members[1].username;
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
    keys: { [user.uid]: keys },
    leader: user.uid,
    currentKeyVersion: 1,
    dm: true,
  });
  batch.set(doc(firestore, "threadsId", groupId), {
    id: groupId,
    members: memberUID,
  });
  await batch.commit();
  return true;
};
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

//DRDM

export async function x3dh(user, data, data_b, threadId) {
  let privKey_a = data.privateKey;
  let EKpriv_a = data.ekPrivate;
  let pubKey_b = await importX25519PublicRaw(ub64(data_b.publicKey));
  let SPKpub_b = await importX25519PublicRaw(ub64(data_b.SPKPublicKey));
  let OPKpub_b = await importX25519PublicRaw(ub64(data_b.OPKPublicKey));

  const dh1 = await runDH(privKey_a, SPKpub_b);
  const dh2 = await runDH(EKpriv_a, pubKey_b);
  const dh3 = await runDH(EKpriv_a, SPKpub_b);
  const dh4 = await runDH(EKpriv_a, OPKpub_b);

  const ikm = combineKeys(dh1, dh2, dh3, dh4);
  const prk = await importHKDFKey(ikm);

  const expanded = await hkdfExpand(prk);

  const chainKey = await importHKDFKeyRaw(expanded["chainKey"]);
  const rootKey = await importX25519PublicRaw(expanded["rootKey"]);

  await storeKey(chainKey, `chainKey_${threadId}`);
  await storeKey(rootKey, `rootKey_${threadId}`);

  return expanded;
}

export async function x3dh_r(user, data, data_b, salt, threadId) {
  salt = ub64(salt);

  let privKey_a = await importX25519PublicRaw(ub64(data_b.publicKey));
  let EKpriv_a = await importX25519PublicRaw(ub64(data_b.ekPublic));
  let pubKey_b = data.privateKey;
  let SPKpub_b = data.SPKPrivateKey;
  let OPKpub_b = data.OPKPrivateKey;

  const dh1 = await runDH(SPKpub_b, privKey_a);
  const dh2 = await runDH(pubKey_b, EKpriv_a);
  const dh3 = await runDH(SPKpub_b, EKpriv_a);

  const dh4 = await runDH(OPKpub_b, EKpriv_a);

  const ikm = combineKeys(dh1, dh2, dh3, dh4);
  const prk = await importHKDFKey(ikm);

  const expanded = await hkdfExpand(prk, (salt = salt));

  const chainKey = await importHKDFKeyRaw(expanded["chainKey"]);
  const rootKey = await importX25519PublicRaw(expanded["rootKey"]);

  await storeKey(chainKey, `chainKey_${threadId}`);
  await storeKey(rootKey, `rootKey_${threadId}`);

  return expanded;
}

export async function generateAndStoreSupplementalKeyPairs() {
  await generateAndStoreX25519Keypair("ekPrivate", "ekPublic");
  await generateAndStoreX25519Keypair("SPKPrivateKey", "SPKPublicKey");
  await generateAndStoreX25519Keypair("OPKPrivateKey", "OPKPublicKey");
}

export async function getSupplimentalPrivateKeyPairs() {
  return {
    ekPrivate: await getStoredKey("ekPrivate"),
    SPKPrivateKey: await getStoredKey("SPKPrivateKey"),
    OPKPrivateKey: await getStoredKey("OPKPrivateKey"),
  };
}

export async function getSupplimentalPublicKeyPairs() {
  return {
    ekPublic: await exportKey(await getStoredKey("ekPublic")),
    SPKPublicKey: await exportKey(await getStoredKey("SPKPublicKey")),
    OPKPublicKey: await exportKey(await getStoredKey("OPKPublicKey")),
  };
}

export async function uploadSupplimentalKeyPairs(user) {
  await updateDoc(doc(firestore, "users", user.uid), {
    ekPublic: await exportKey(await getStoredKey("ekPublic")),
    SPKPublicKey: await exportKey(await getStoredKey("SPKPublicKey")),
    OPKPublicKey: await exportKey(await getStoredKey("OPKPublicKey")),
  });
}

export const createDRDM = async (user, data, members, groupName) => {
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

  const groupId = uuidv4();

  const batch = writeBatch(firestore);

  const result = await x3dh(user, data, otherMember, groupId);
  const salt = b64(result["salt"]);

  console.log({
    groupName: groupName.toString(),
    members: memberUID,
    createdAt: new Date(),
    latestMessage: new Date(),
    leader: user.uid,
    dm: true,
    salt: salt,
  });

  batch.set(doc(firestore, "threads", groupId), {
    groupName: groupName.toString(),
    members: memberUID,
    createdAt: new Date(),
    latestMessage: new Date(),
    leader: user.uid,
    dm: true,
    salt: salt,
  });
  batch.set(doc(firestore, "threadsId", groupId), {
    id: groupId,
    members: memberUID,
  });

  await sendWelcomeMessage(user, data, groupId, batch);

  await batch.commit();
  return true;
};

export async function sendWelcomeMessage(user, data, threadId, batch) {
  const message = "Welcome";
  const messageId = uuidv4();

  const welcomeMessage = await getWelcomeMessage(user, data, message, threadId);

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

export async function getWelcomeMessage(user, data, message, threadId) {
  await generateAndStoreX25519Keypair("privateKey_n", "publicKey_n");
  const publicKey_n = await getStoredKey("publicKey_n");
  const privateKey_n = await getStoredKey("privateKey_n");
  const chainKey = await getStoredKey(`chainKey_${threadId}`);
  console.log(chainKey);

  const encrypted = await encryptMessageDR(
    chainKey,
    0,
    0,
    publicKey_n,
    message,
    user.uid
  );

  const nextChainKey = await importHKDFKeyRaw(encrypted["nextChainKey"]);

  await storeKey(nextChainKey, `chainKey_${threadId}`);

  return {
    ciphertext: encrypted["ciphertext"],
    header: encrypted["header"],
    nonce: encrypted["nonce"],
  };
}

export async function decryptFirstDRDM(user, data, message, threadId) {
  const member = (
    await getDoc(doc(firestore, "users", message.sentBy.user))
  ).data();
  const salt = (await getDoc(doc(firestore, "threads", threadId))).data().salt

  const result = await x3dh_r(user, data, member, salt, threadId);

  const chainKey = await getStoredKey(`chainKey_${threadId}`);

  const decrypted = await decryptMessageDR(
    chainKey,
    message.header,
    message.message,
    message.nonce
  );

  console.log(decrypted);

  await storeMessage(threadId, message.id, decrypted.plaintext);

  const key = await importHKDFKeyRaw(decrypted.nextChainKey);

  console.log(key);

  await storeKey(key, `chainKey_${threadId}`);

  return decrypted.plaintext;
}

export async function test(user, data) {}
