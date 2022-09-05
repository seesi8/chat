import { query, getDoc, getDocs, doc, collection, setDoc } from "firebase/firestore";
import { createRef, useContext, useEffect, useState } from "react";
import { UserContext } from "../lib/context";
import { auth, firestore } from "../lib/firebase";
import { fixDate } from "../lib/hooks";
import Image from 'next/image';
import { useRouter } from 'next/router'
import styles from '../styles/thread.module.css';
import { uuidv4 } from "@firebase/util";
import { useDocument } from "react-firebase-hooks/firestore";

export default function thread({ preThread }) {

  const { user, data } = useContext(UserContext)
  const bottomOfMessages = createRef()
  const [thread, setThread] = useState(preThread[0])
  const [message, setMessage] = useState("")
  const [valid, setValid] = useState(false)
  const router = useRouter()

  const checkUser = async () => {
    if (auth.currentUser && auth.currentUser.uid) {
      const userThreads = (await getDoc(doc(firestore, "users", auth.currentUser.uid))).data().threads
      if (!userThreads.includes(preThread[0].id)){
        router.push("/login")
      }
      else{
        setValid(true)
      }
    }
  }

  checkUser()


  const [value, loading, error] = 
    useDocument(
    doc(firestore, 'threads', preThread[0].id),
    {
      snapshotListenOptions: { includeMetadataChanges: true },
    }
  );

  useEffect(() => {
    if (value) {
      let steamData = fixDate(value.data())[0]
      steamData.id = preThread[0].id
      setThread(steamData)
      bottomOfMessages.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [value]);



  const sendMessage = async (e) => {
    e.preventDefault();
    if(!valid){
      return
    }
    if (!message) {
      return
    }
    const docSnapShot = await getDoc(doc(firestore, "threads", thread.id));
    await setDoc(doc(firestore, "threads", thread.id), {
      messages: docSnapShot.data().messages.concat({
        message: message,
        timeSent: new Date(),
        sentBy: {
          user: user.uid,
          profileIMG: data.profileIMG,
          username: data.displayName
        }
      }),
      latestMessage: new Date()

    }, { merge: true })
    setMessage("")
  }



  return (

    <main className={styles.main}>
      {thread.messages &&
        thread.messages.map((el) =>
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
  const projectsRef = doc(firestore, "threads", thread)
  const projectsSnap = await getDoc(projectsRef);
  let data = undefined;

  if (projectsSnap.data() != undefined) {
    data = projectsSnap.data()
    data.id = thread
    data = await fixDate(data)




  } else {
    data = "404"
  }
  return {
    props: { preThread: data },
    revalidate: 1,
  }
}

export async function getStaticPaths() {
  const projectsRef = query(collection(firestore, "threads"))
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