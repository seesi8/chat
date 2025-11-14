import {
  query,
  getDoc,
  getDocs,
  doc,
  collection,
  orderBy,
  writeBatch,
} from "firebase/firestore";
import { createRef, useContext, useEffect, useState } from "react";
import { UserContext } from "../lib/context";
import { auth, firestore } from "../lib/firebase";
import { useRouter } from "next/router";
import styles from "../styles/thread.module.css";
import { uuidv4 } from "@firebase/util";
import { useCollection } from "react-firebase-hooks/firestore";
import {
  decryptGroupMessage,
  decryptMessage,
  decryptSingleKey,
  encryptGroupMessage,
  encryptMessage,
  getMyPrivateKey,
  importX25519PublicRaw,
  ub64,
} from "../lib/e2ee/e2ee";

export default function Thread({ threadId }) {
  const { user, data } = useContext(UserContext);
  const bottomOfMessages = createRef();
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState("");
  const [valid, setValid] = useState(false);
  const router = useRouter();

  const checkUser = async () => {
    if (auth.currentUser && auth.currentUser.uid) {
      const threadMembers = (
        await getDoc(doc(firestore, "threadsId", threadId))
      ).data().members;
      if (!threadMembers.includes(user.uid)) {
        router.push("/");
      } else {
        setValid(true);
      }
    }
  };
  useEffect(() => {
    bottomOfMessages.current?.scrollIntoView({ behavior: "smooth" });
  });

  useEffect(() => {
    checkUser();
  }, [user, data]);

  const [messagesValue, messagesLoading, messagesError] = useCollection(
    query(
      collection(firestore, "threads", threadId, "messages"),
      orderBy("timeSent")
    ),
    {
      snapshotListenOptions: { includeMetadataChanges: true },
    }
  );

  useEffect(() => {
    user && data && doMessages();
  }, [messagesValue, user, data]);

  const decrypt = async (message) => {
    if (!data.privateKey) {
      return "Error Decoding";
    }

    const sentBy = message.sentBy.user;
    if (sentBy == user.uid) {
      //Sent by me
      const thread = await getDoc(doc(firestore, "threads", threadId));
      const otherUid = thread
        .data()
        .members.filter((item) => item != user.uid)[0];
      const myPrivKey = data.privateKey;
      const member = await getDoc(doc(firestore, "users", otherUid));
      const fromPublicKey = await importX25519PublicRaw(
        ub64(member.data().publicKey)
      );
      let storedSalt = thread.data().salt;
      const salt = new Uint8Array(
        atob(storedSalt)
          .split("")
          .map((c) => c.charCodeAt(0))
      );
      const nonce = new Uint8Array(
        atob(message.nonce)
          .split("")
          .map((c) => c.charCodeAt(0))
      );
      const decryptedMessage = await decryptMessage(
        myPrivKey,
        fromPublicKey,
        salt,
        otherUid,
        user.uid,
        nonce,
        message.message
      );
      return decryptedMessage;
    } else {
      const myPrivKey = data.privateKey;
      const member = await getDoc(doc(firestore, "users", sentBy));
      const fromPublicKey = await importX25519PublicRaw(
        ub64(member.data().publicKey)
      );
      const thread = await getDoc(doc(firestore, "threads", threadId));

      let storedSalt = thread.data().salt;
      const salt = new Uint8Array(
        atob(storedSalt)
          .split("")
          .map((c) => c.charCodeAt(0))
      );

      const nonce = new Uint8Array(
        atob(message.nonce)
          .split("")
          .map((c) => c.charCodeAt(0))
      );

      const decryptedMessage = await decryptMessage(
        myPrivKey,
        fromPublicKey,
        salt,
        user.uid,
        sentBy,
        nonce,
        message.message
      );
      return decryptedMessage;
    }
  };

  const decryptGroup = async (message) => {
    if (!data.privateKey) {
      return "Error Decoding";
    }

    const sentBy = message.sentBy.user;
    if (sentBy == user.uid) {
      const decryptedKey = await getDecryptedKey();
      console.log(decryptedKey, message.message, user.uid, message.nonce);
      const decryptedMessage = await decryptGroupMessage(
        decryptedKey,
        message.message,
        user.uid,
        ub64(message.nonce)
      );
      return decryptedMessage;
    } else {
      const decryptedKey = await getDecryptedKey();

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

  const doMessages = async () => {
    if (!messagesValue) {
      return;
    }

    const thread = await getDoc(doc(firestore, "threads", threadId));
    const members = thread.data().members.filter((item) => {
      return item != user.uid;
    });
    if (members.length != 1) {
      let currentMessages = messagesValue.docs;
      for (let messageIndex in currentMessages) {
        currentMessages[messageIndex] = currentMessages[messageIndex].data();
        console.log(currentMessages[messageIndex]);
        const decryptedMessage = await decryptGroup(
          currentMessages[messageIndex]
        );
        currentMessages[messageIndex].message = decryptedMessage;
        currentMessages[messageIndex].timeSent =
          new Date(
            currentMessages[messageIndex].timeSent.toDate()
          ).toLocaleDateString() +
          " " +
          new Date(
            currentMessages[messageIndex].timeSent.toDate()
          ).toLocaleTimeString();
        console.log(currentMessages);
      }
      setMessages(currentMessages);
    } else {
      let currentMessages = messagesValue.docs;
      for (let messageIndex in currentMessages) {
        currentMessages[messageIndex] = currentMessages[messageIndex].data();
        const decryptedMessage = await decrypt(currentMessages[messageIndex]);
        currentMessages[messageIndex].message = decryptedMessage;
        currentMessages[messageIndex].timeSent =
          new Date(
            currentMessages[messageIndex].timeSent.toDate()
          ).toLocaleDateString() +
          " " +
          new Date(
            currentMessages[messageIndex].timeSent.toDate()
          ).toLocaleTimeString();
      }
      console.log(currentMessages);
    }
  };

  const getDecryptedKey = async () => {
    const myPrivKey = data.privateKey;

    const thread = (await getDoc(doc(firestore, "threads", threadId))).data();

    const member = await getDoc(doc(firestore, "users", thread.leader));
    const fromPublicKey = await importX25519PublicRaw(
      ub64(member.data().publicKey)
    );
    const salt = ub64(thread.keys[user.uid].salt);
    const iv = ub64(thread.keys[user.uid].nonce);
    const decryptedKey = ub64(
      await decryptSingleKey(
        myPrivKey,
        fromPublicKey,
        salt,
        iv,
        thread.keys[user.uid].ciphertext
      )
    );

    return decryptedKey;
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!valid) {
      return;
    }
    if (!message) {
      return;
    }
    if (!data.privateKey) {
      return;
    }

    const thread = await getDoc(doc(firestore, "threads", threadId));
    const members = thread.data().members.filter((item) => {
      return item != user.uid;
    });

    let encryption;

    if (members.length != 1) {
      const decryptedKey = await getDecryptedKey();
      console.log(decryptedKey);
      encryption = await encryptGroupMessage(decryptedKey, message, user.uid);
    } else {
      const member = await getDoc(doc(firestore, "users", members[0]));
      const toPublicKey = await importX25519PublicRaw(
        ub64(member.data().publicKey)
      );
      const myPrivKey = data.privateKey;
      const storedSalt = thread.data().salt;
      const salt = new Uint8Array(
        atob(storedSalt)
          .split("")
          .map((c) => c.charCodeAt(0))
      );

      encryption = await encryptMessage(
        myPrivKey,
        toPublicKey,
        salt,
        message,
        user.uid,
        members[0]
      );
    }

    console.log(encryption);
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
    });

    batch.update(doc(firestore, "threads", threadId), {
      latestMessage: new Date(),
    });
    console.log(batch);
    await batch.commit();
    setMessage("");
  };

  return (
    <main className={styles.main}>
      {messages &&
        messages.map((el) => {
          return <div className={styles.messageContainer} key={uuidv4()}>
            <div className={styles.row1}>
              <div className={styles.imgContainer}>
                <img className={styles.profileIMG} src={el.sentBy.profileIMG} />
              </div>
              <div className={styles.col1}>
                <p className={styles.user}>{el.sentBy.username}</p>
                <p className={styles.messageDate}>{el.timeSent}</p>
              </div>
            </div>
            <div className={styles.message}>
              <h3 className={styles.messageText}>{el.message}</h3>
            </div>
          </div>;
        })}
      <div ref={bottomOfMessages} />
      <form onSubmit={(e) => sendMessage(e)} className={styles.messageForm}>
        <input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className={styles.messageInput}
        />
        <button className={styles.sendMessage}>Send</button>
      </form>
    </main>
  );
}

export async function getStaticProps({ params }) {
  const { thread } = params;

  return {
    props: { threadId: thread },
    revalidate: 1,
  };
}

export async function getStaticPaths() {
  const projectsRef = query(collection(firestore, "threadsId"));
  const projectsSnap = await getDocs(projectsRef);
  let paths = [];

  projectsSnap.forEach((doc) => {
    paths.push({ params: { thread: doc.id } });
  });

  return {
    paths,
    fallback: "blocking",
  };
}
