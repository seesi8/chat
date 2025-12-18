import { FaFile } from "react-icons/fa";
import { IoIosCloseCircle } from "react-icons/io";
import { GoPaperclip } from "react-icons/go";
import { query, getDocs, collection, orderBy } from "firebase/firestore";
import { createRef, useContext, useEffect, useRef, useState } from "react";
import { UserContext } from "../../lib/context";
import { auth, firestore } from "../../lib/firebase";
import { useRouter } from "next/router";
import { useCollection } from "react-firebase-hooks/firestore";
import { IoIosSettings } from "react-icons/io";
import { PiPhoneTransferFill } from "react-icons/pi";
import {
  answerHandler,
  callHandler,
  decryptMessages,
  getNextKey,
  handleCallConnection,
  routeUser,
  sendFileWithLock,
  sendMessageWithLock,
  submitMessage,
  testThread,
  uploadImage,
  uploadImages,
  webCamHandler,
} from "../../lib/functions";
import { Message } from "../../components/message";
import Image from "next/image";
import { b64 } from "../../lib/e2ee/e2ee";
import { LinearProgress } from "@mui/material";

export default function Thread({ threadId }) {
  const { user, data } = useContext(UserContext);
  const bottomOfMessages = createRef();
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState("");
  const [valid, setValid] = useState(false);
  const [owner, setOwner] = useState(false);
  const [loading, setLoading] = useState(false);
  const [images, setImages] = useState([]);
  const [files, setFiles] = useState([]);
  const [otherFiles, setOtherFiles] = useState([]);

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
    const incoming = Array.from(e.target.files);

    const newImages = [];
    const newOtherFiles = [];

    for (const file of incoming) {
      if (file.type.startsWith("image/")) {
        newImages.push({
          file,
          url: URL.createObjectURL(file),
        });
      } else {
        newOtherFiles.push(file);
      }
    }

    setImages(prev => [...prev, ...newImages]);
    setOtherFiles(prev => [...prev, ...newOtherFiles]);
    setFiles(prev => [...prev, ...incoming]);
  };

  const removeFile = (file) => {
    setOtherFiles(prev => prev.filter(f => f !== file));
    setFiles(prev => prev.filter(f => f !== file));
  };

  const removeImage = (image) => {
    URL.revokeObjectURL(image.url);
    console.log(images, image)
    console.log(images.filter(i => i.file != image.file))
    setImages(prev => prev.filter(i => i.file !== image.file));
    setFiles(prev => prev.filter(f => f !== image.file));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!valid) {
      return;
    }
    if (!message && files.length < 1) {
      return;
    }
    if (!data.privateKey) {
      return;
    }
    setLoading(true)
    submitMessage(files, message, threadId, user, data, setLoading)
    setImages([]);
    setFiles([]);
    setMessage("");
    setOtherFiles([])
  };


  return (
    <main className="mb-24 mt-16">
      <div className="fixed text-4xl text-white w-full flex justify-end pr-2 top-14 z-10">
        <a type="button" href={`${router.asPath}/call`}>
          <PiPhoneTransferFill className="mr-4" />
        </a>
        {owner && (
          <IoIosSettings
            onClick={(e) => router.push(`/${threadId}/settings`)}
          />
        )}
      </div>
      <div className="">
        {messages &&
          messages.map((el) => {
            return <Message message={el} key={el.key} />;
          })}
      </div>
      <div ref={bottomOfMessages} />
      <div>
        <form
          onSubmit={(e) => submit(e)}
          className="w-full flex justify-center fixed bottom-6"
        >
          <div className="flex flex-col items-center w-2/3 max-w-2xl">
            <div className="text-white w-full flex justify-start flex-wrap">
              {
                images.map(({ file, url }) => (
                  <div
                    key={url}
                    className="relative w-24 h-24 rounded-xl overflow-hidden m-4"
                  >
                    <button type="button" className="absolute left-2 top-2 text-white text-xl" onClick={(e) => { removeImage({ url, file }) }}><IoIosCloseCircle /></button>
                    <img
                      src={url}
                      alt="uploaded"
                      className="w-full h-full object-cover"
                    />
                  </div>
                ))
              }
              {
                otherFiles.map((file) => {
                  return (
                    <div
                      key={file}
                      className="relative w-24 h-24 rounded-xl overflow-hidden m-4 bg-gray-800 text-xs p-2 text-nowrap"
                    >
                      <button type="button" className="absolute left-2 top-2 text-white text-xl" onClick={(e) => { removeFile(file) }}><IoIosCloseCircle /></button>
                      <div className="w-full flex pt-5 pb-2 justify-center">
                        <FaFile className="text-4xl" />
                      </div>
                      <p className="text-ellipsis overflow-hidden w-full">{file.name}</p>
                    </div>
                  )
                })
              }
            </div>
            <div className="w-full h-1s mb-1 rounded overflow-hidden">
              {loading ? <LinearProgress /> : ""}
            </div>
            <div className="flex w-full items-center">
              <div
                className={`border bg-transparent border-neutral-500 rounded h-12 w-full text-white flex`}
              >
                <button type="button" className="flex w-12 h-12 flex content-center justify-center flex-wrap text-xl" onClick={(e) => { e.preventDefault(); console.log("clicked"); fileInputRef.current.click() }}>
                  <GoPaperclip />
                </button>
                <input onChange={handleChange} multiple={true} ref={fileInputRef} type='file' hidden
                />
                <input
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="bg-transparent border-none rounded h-full w-full px-4 outline-none focus:outline-none focus:ring-0"
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
        onClick={async () => {
        }}
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
