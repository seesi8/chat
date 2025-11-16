import {
  collection,
  deleteDoc,
  query,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { UserContext } from "../lib/context";
import { async, uuidv4 } from "@firebase/util";
import { getDoc, setDoc, getDocs, orderBy, limit } from "firebase/firestore";
import { auth, firestore } from "../lib/firebase";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from "firebase/auth";
import {
  decryptGroupMessage,
  decryptSingleKey,
  encryptGroupMessage,
  encryptKeysForMembers,
  generateAndStoreX25519Keypair,
  importX25519PublicRaw,
  rotateGroupKey,
  ub64,
} from "../lib/e2ee/e2ee";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { doc } from "firebase/firestore";
import toast from "react-hot-toast";

export async function removeFriend(friendId, user, userData) {
  !user && console.log("hi");
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
  console.log(thierFriends.concat(user.uid));
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
    console.log(isOpen);
    if (data.friends.includes(id) == false && !isOpen) {
      console.log("now");
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
  console.log("thing");
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
    const publicB64 = btoa(String.fromCharCode(...publicRaw)); // or your b64(u8) helper

    let username = "";
    if (querySnapshot.docs.length == 0) {
      console.log("no username");
      username = displayName;
    } else {
      console.log(querySnapshot);
      querySnapshot.forEach((doc) => {
        console.log(doc.data());
        let index = doc.data().username.split(displayName)[1];
        if (index == "") {
          console.log(doc.id, displayName);
          index = "0";
        }

        username = displayName.concat((parseInt(index) + 1).toString());
      });
    }
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
    console.log("pushed");
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
    console.log(currentMessages[messageIndex]);
    const decryptedMessage = await decryptMessage(
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
    console.log(decryptedKey, message.message, user.uid, message.nonce);
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
    console.log(decryptedMessage);
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

export const sendMessage = async (threadId, message, user, data) => {
  const thread = await getDoc(doc(firestore, "threads", threadId));

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
    console.log(docData.friends[1]);
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
  console.log("removing", friendId);
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
};

export const addGroupMember = async (
  member,
  thread,
  threadData,
  membersData,
  user,
  data
) => {
  if(membersData.filter((item) => item.uid === member.uid).length > 0){
    return membersData
  }
  const docData = (await getDoc(doc(firestore, "threads", thread))).data();
  console.log(docData.members)
  if(docData.members.filter((item) => item == member.uid).length > 0){
    return [...membersData, member]
  }
  console.log("adding", thread);
  console.log(membersData, member)
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
    console.log(membersData.filter((member) => member.uid === friends[i].uid));

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
      console.log(friends[i]);
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

export const createGroup = async (user, data, members, groupName) => {
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

export const submitMember = async (item, members, user, data) => {

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
