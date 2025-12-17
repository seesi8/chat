import { GoPaperclip } from "react-icons/go";
import { query, getDocs, collection, orderBy } from "firebase/firestore";
import { createRef, useContext, useEffect, useRef, useState } from "react";
import { UserContext } from "../../lib/context";
import { auth, firestore } from "../../lib/firebase";
import { useRouter } from "next/router";
import { useCollection } from "react-firebase-hooks/firestore";
import { IoIosSettings } from "react-icons/io";
import {
  decryptMessages,
  getNextKey,
  routeUser,
  sendFileWithLock,
  sendMessageWithLock,
  testThread,
  uploadImage,
  uploadImages,
} from "../../lib/functions";
import { Message } from "../../components/message";
import Image from "next/image";
import { b64 } from "../../lib/e2ee/e2ee";

export default function Thread({ threadId }) {
  const { user, data } = useContext(UserContext);
  const bottomOfMessages = createRef();
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState("");
  const [valid, setValid] = useState(false);
  const [owner, setOwner] = useState(false);
  const [imageURLs, setImageURLs] = useState([]);
  const [files, setFiles] = useState([]);
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

  const fileInputRef = useRef();

  const handleChange = (e) => {
    const files = Array.from(e.target.files);

    const urls = files.map((file) => URL.createObjectURL(file));

    setImageURLs((prev) => [...prev, ...urls]);
    setFiles((prev) => [...prev, ...files]);
  };

  function readFileBytes(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        resolve(new Uint8Array(reader.result));
      };

      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  }


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
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const fileByteArray = await readFileBytes(file)
      const text = b64(fileByteArray)
      console.log("here")
      await sendFileWithLock(threadId, text, user, data)
    }
    await sendMessageWithLock(threadId, message, user, data)
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
          return <Message message={el} key={el.key} />;
        })}
      <div ref={bottomOfMessages} />
      <div>
        <form
          onSubmit={(e) => submit(e)}
          className="w-full flex justify-center fixed bottom-6"
        >
          <div className="flex flex-col items-center w-2/3 max-w-2xl">
            <div className="text-white w-full flex justify-start flex-wrap">
              {
                imageURLs.map((url) => (
                  <div
                    key={url}
                    className="relative w-24 h-24 rounded-xl overflow-hidden m-4"
                  >
                    <img
                      src={url}
                      alt="uploaded"
                      className="w-full h-full object-cover"
                    />
                  </div>
                ))
              }
            </div>
            <div className="flex w-full items-center">
              <div
                className="border bg-transparent border-neutral-500 rounded h-12 w-full text-white flex"
              >
                <button className="flex w-12 h-12 flex content-center justify-center flex-wrap text-xl" onClick={(e) => { e.preventDefault(); fileInputRef.current.click() }}>
                  <GoPaperclip />
                </button>
                <input onChange={handleChange} multiple={true} ref={fileInputRef} type='file' hidden accept=".gif,.jpg,.jpeg,.png,.webp,.avif"
                />
                <input
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="bg-transparent border-none rounded h-full w-full px-4"
                />
              </div>
              <button className="ml-3 border border-neutral-400 px-12 rounded text-white font-bold h-12">
                Send
              </button>
            </div>
          </div>
        </form>
      </div>
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
