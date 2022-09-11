import { query, getDoc, getDocs, doc, collection, setDoc, orderBy } from "firebase/firestore";
import { createRef, useContext, useEffect, useState } from "react";
import { UserContext } from "../lib/context";
import { auth, firestore } from "../lib/firebase";
import { fixDate } from "../lib/hooks";
import Image from 'next/image';
import { useRouter } from 'next/router'
import styles from '../styles/thread.module.css';
import { uuidv4 } from "@firebase/util";
import { useDocument, useCollection } from "react-firebase-hooks/firestore";

export default function thread({ threadId }) {
  console.log("here")
  const { user, data } = useContext(UserContext)
  const bottomOfMessages = createRef()
  const [messages, setMessages] = useState([])
  const [thread, setThread] = useState()
  const [message, setMessage] = useState("")
  const [valid, setValid] = useState(false)
  const router = useRouter()

  const checkUser = async () => {
    if (auth.currentUser && auth.currentUser.uid) {
      const userThreads = (await getDoc(doc(firestore, "users", auth.currentUser.uid))).data().threads
      if (!userThreads.includes(threadId)) {
        //router.push("/login")
      }
      else {
        setValid(true)
      }
    }
  }

  checkUser()


  const [value, loading, error] =
    useDocument(
      doc(firestore, 'threads', threadId),
      {
        snapshotListenOptions: { includeMetadataChanges: true },
      }
    );

  const [messagesValue, messagesLoading, messagesError] =
    useCollection(
      query(collection(firestore, 'threads', threadId, 'messages'), orderBy("timeSent")),
      {
        snapshotListenOptions: { includeMetadataChanges: true },
      }
    );

  useEffect(() => {
    if (value) {
      let steamData = fixDate(value.data())[0]
      steamData.id = threadId
      setThread(steamData)
      bottomOfMessages.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [value]);

  useEffect(() => {
    if (messagesValue) {
      let currentMessages = messagesValue.docs
      for (let messageIndex in currentMessages) {
        currentMessages[messageIndex] = currentMessages[messageIndex].data()
        currentMessages[messageIndex].timeSent = ((new Date(currentMessages[messageIndex].timeSent.toDate())).toLocaleDateString()) + " " + ((new Date(currentMessages[messageIndex].timeSent.toDate())).toLocaleTimeString())
      }
      setMessages(currentMessages)
      bottomOfMessages.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messagesValue]);



  const sendMessage = async (e) => {
    e.preventDefault();
    if (!valid) {
      return
    }
    if (!message) {
      return
    }
    await setDoc(doc(firestore, "threads", thread.id, "messages", uuidv4()), {
      message: message,
      timeSent: new Date(),
      sentBy: {
        user: user.uid,
        profileIMG: data.profileIMG,
        username: data.displayName
      },
      latestMessage: new Date()
    }, { merge: true })
    setMessage("")
  }



  return (

    <main className={styles.main}>
      {thread && messages &&
        messages.map((el) =>
          <div className={styles.messageContainer} key={uuidv4()}>
            <p className={styles.user}>{el.sentBy.username}</p>
            <div className={styles.row1}>
              <div className={styles.imgContainer}><img className={styles.profileIMG} src={el.sentBy.profileIMG} /></div>
              <div className={styles.message}>
                <h3 className={styles.messageText}>
                  {el.message}
                </h3>
              </div>
            </div>
            <p className={styles.messageDate}>
              {el.timeSent}
            </p>
          </div>
        )
      }
      <div ref={bottomOfMessages} />
      <form onSubmit={(e) => sendMessage(e)} className={styles.messageForm}>
        <input value={message} onChange={(e) => setMessage(e.target.value)} className={styles.messageInput} />
        <button className={styles.sendMessage}>Send</button>
      </form>
    </main>
  )
}


export async function getStaticProps({ params }) {
  const { thread } = params;

  return {
    props: { threadId: thread },
    revalidate: 1,
  }
}

export async function getStaticPaths() {
  const projectsRef = query(collection(firestore, "threadsId"))
  const projectsSnap = await getDocs(projectsRef);
  let paths = []

  projectsSnap.forEach((doc) => {
    paths.push({ params: { thread: doc.id } })
  });

  return {
    paths,
    fallback: 'blocking'
  }
}