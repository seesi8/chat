import Head from "next/head";
import Login from "../components/login";
import { firestore } from "../lib/firebase";
import { collection, query, where } from "firebase/firestore";
import { useContext, useEffect, useState } from "react";
import { UserContext } from "../lib/context";
import { uuidv4 } from "@firebase/util";
import { useCollection } from "react-firebase-hooks/firestore";
import { Thread } from "../components/thread";
import {
  generateAndStoreSupplementalKeyPairs,
  loadThreads,
  sendWelcomeMessage,
  x3dh,
} from "../lib/functions";

export default function Home() {
  const { user, data } = useContext(UserContext);

  const [threads, setThreads] = useState();

  const [usersThreads, usersThreadsLoading, usersThreadsError] = useCollection(
    query(
      collection(firestore, "threadsId"),
      where("members", "array-contains", user && user.uid)
    ),
    {
      snapshotListenOptions: { includeMetadataChanges: true },
    }
  );

  useEffect(() => {
    loadThreads(data, user, usersThreads).then((loadedThreads) => {
      setThreads(loadedThreads);
    });
  }, [usersThreads, user, data]);

  if (!user) {
    return <Login />;
  }

  return (
    <div className="mt-14">
      <Head>
        <title>Your Feed</title>
        <meta name="e2ee-chat" content="e2ee-chat" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <main className="p-5">
        <h1 className="text-4xl font-bold text-white">Threads</h1>
        {threads && threads.map((el) => <Thread key={uuidv4()} thread={el} />)}
        <button
          onClick={() =>
            x3dh(user, data, data).then((_data) => {
              console.log(_data);
              sendWelcomeMessage(user, data)
            })
          }
          className="absolute right-5 bottom-5 h-20 w-20 bg-green-500 rounded font-bold text-black cursor-pointer"
        >
          test
        </button>
      </main>
    </div>
  );
}
