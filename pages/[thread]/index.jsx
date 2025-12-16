import { query, getDocs, collection, orderBy } from "firebase/firestore";
import { createRef, useContext, useEffect, useState } from "react";
import { UserContext } from "../../lib/context";
import { auth, firestore } from "../../lib/firebase";
import { useRouter } from "next/router";
import { useCollection } from "react-firebase-hooks/firestore";
import { IoIosSettings } from "react-icons/io";
import {
  decryptMessages,
  getNextKey,
  routeUser,
  sendMessageWithLock,
  testThread,
} from "../../lib/functions";
import { Message } from "../../components/message";

export default function Thread({ threadId }) {
  const { user, data } = useContext(UserContext);
  const bottomOfMessages = createRef();
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState("");
  const [valid, setValid] = useState(false);
  const [owner, setOwner] = useState(false);
  const [messagesValue, messagesLoading, messagesError] = useCollection(
    query(
      collection(firestore, "threads", threadId, "messages"),
      orderBy("timeSent")
    ),
    {
      snapshotListenOptions: { includeMetadataChanges: true },
    }
  );
  const router = useRouter();

  useEffect(() => {
    bottomOfMessages.current?.scrollIntoView({ behavior: "smooth" });
  });

  useEffect(() => {
    routeUser(auth, user, threadId, setValid, setOwner);
  }, [user, data]);

  useEffect(() => {
    user &&
      data &&
      decryptMessages(messagesValue, threadId, user, data).then((msgs) => {
        setMessages(msgs);
      });
  }, [messagesValue, user, data]);

  const submit = async (e) => {
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
    sendMessageWithLock(threadId, message, user, data)
    setMessage("");
  };

  return (
    <main className="mb-24 mt-16">
      <div className="fixed text-4xl text-white w-full flex justify-end pr-2 top-14">
        {owner && (
          <IoIosSettings
            onClick={(e) => router.push(`/${threadId}/settings`)}
          />
        )}
      </div>
      {messages &&
        messages.map((el) => {
          return <Message message={el} key={el.key}/>;
        })}
      <div ref={bottomOfMessages} />
      <form
        onSubmit={(e) => submit(e)}
        className="w-full flex justify-center fixed bottom-6"
      >
        <input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="border bg-transparent border-neutral-500 rounded mr-6 h-12 w-1/2 text-white px-4"
        />
        <button className="border border-neutral-400 px-12 rounded text-white font-bold">
          Send
        </button>
      </form>
      <button
        onClick={() =>
          testThread(user, data, threadId).then((_data) => {
            console.log(_data);
          })
        }
        className="fixed right-5 bottom-5 h-20 w-20 bg-green-500 rounded font-bold text-black cursor-pointer"
      >
        test
      </button>
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
