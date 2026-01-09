import Head from "next/head";
import Login from "../components/login";
import { firestore } from "../lib/firebase";
import { collection, limit, orderBy, query, where } from "firebase/firestore";
import { useContext, useEffect, useState } from "react";
import { UserContext } from "../lib/context";
import { uuidv4 } from "@firebase/util";
import { useCollection } from "react-firebase-hooks/firestore";
import { Thread } from "../components/thread";
import {
  generateAndStoreSupplementalKeyPairs,
  loadThreads,
  _sendWelcomeMessage,
  test,
  x3dh,
} from "../lib/functions";

export default function Home() {
  const { user, data } = useContext(UserContext);

  const [threads, setThreads] = useState();
  const [threadCount, setThreadCount] = useState(14);

  const [usersThreads, usersThreadsLoading, usersThreadsError] = useCollection(
    query(
      collection(firestore, "threads"),
      where("members", "array-contains", user && user.uid),
      // where("hidden", "==",false),
      limit(threadCount),
      orderBy("latestMessage", "desc")
    ),
    {
      snapshotListenOptions: { includeMetadataChanges: true },
    }
  );

  useEffect(() => {
    console.log(usersThreadsError)
    if (!usersThreadsLoading) {
      loadThreads(data, user, usersThreads).then((loadedThreads) => {
        setThreads(loadedThreads);
      });
    }
  }, [usersThreads, user, data, usersThreadsError, usersThreadsLoading]);

  if (!user) {
    return <Login />;
  }

  return (
    <div className="">
      <Head>
        <title>Your Feed</title>
        <meta name="e2ee-chat" content="e2ee-chat" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <main
        className="p-5 mt-12 h-[calc(100vh-3rem)] overflow-y-scroll"
        onScroll={(e) => {
          const target = e.target;
          const scrollHeight = target.scrollHeight;
          const scrollTop = target.scrollTop;
          const clientHeight = target.clientHeight;

          const isAtBottom = scrollTop + clientHeight >= scrollHeight;

          if (isAtBottom) {
            setThreadCount(threadCount + 2);
          }
        }}
      >
        <h1 className="text-4xl font-bold text-white">Threads</h1>
        {threads && threads.map((el) => <Thread key={el.id} thread={el} />)}
        <button
          onClick={() =>
            test(user, data, data).then((_data) => {
              // 
            })
          }
          className="fixed right-5 bottom-5 h-20 w-20 bg-green-500 rounded font-bold text-black cursor-pointer"
        >
          test
        </button>
      </main>
    </div>
  );
}
