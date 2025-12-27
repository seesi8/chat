import { useEffect, useState } from "react";
import Image from "next/image";
import { base64ToBlob } from "../lib/e2ee/e2ee";
import { FaFile } from "react-icons/fa";
import { FaCloudDownloadAlt } from "react-icons/fa";
import { CallMessage } from "./CallMessage";

export function Message({ message, threadId }) {
  const [fileUrls, setFileUrls] = useState([]);
  const [files, setFiles] = useState([])

  useEffect(() => {
    if (message.type == 0x03) {
      const urls = message.messages.map((file) => {
        const blob = base64ToBlob(file);
        return window.URL.createObjectURL(blob);
      });

      setFileUrls(urls);
    }
    else if (message.type == 0x04) {
      const blobs = message.messages.map((file) => {
        const blob = base64ToBlob(file.content, { type: file.type });
        file.blob = blob
        file.url = window.URL.createObjectURL(blob);
        return file
      });

      setFiles(blobs);
    }
  }, [message]);

  if (message.type == 0x05) {
    return <CallMessage message={message} threadId={threadId}/>;
  }
  return (
    <div className="ml-6 mb-4 text-white flex items-start relative">
      {(message.type == 0x01 || message.type == 0x02 || message.type == 0x03 || message.type == 0x04) ? <>
        <div className="rounded-full overflow-hidden bg-white w-10 h-10 flex justify-center flex-shrink-0 items-center relative mt-1">
          <Image
            layout="fill"
            src={message.sentBy.profileIMG}
            alt=""
            className="object-contain"
          />
        </div>

        <div className="ml-2">
          <div className="flex">
            <p className="text-neutral-300">@{message.sentBy.username}</p>
            <p className="text-neutral-500 ml-2">
              {message.timeSentFormated}
            </p>
          </div>

          {message.type === 0x01 &&
            message.messages.map((msg, i) => (
              <h3 key={i} className="mr-12">
                {msg}
              </h3>
            ))}

          {message.type === 0x03 &&
            fileUrls.map((url, i) => {
              return (
                <div
                  key={i}
                  className="relative h-24 max-w-4/5 rounded-xl overflow-hidden m-4"
                >
                  <img
                    src={url}
                    alt="uploaded"
                    className="w-full h-full object-cover"
                  />
                </div>
              )
            })}

          {message.type === 0x04 &&
            files.map((file, i) => {
              return (
                <div
                  key={file}
                  className="relative w-24 h-24 rounded-xl overflow-hidden m-4 bg-gray-800 text-xs p-2 text-nowrap"
                >
                  <div className="w-full flex pb-2 justify-center">
                    <FaFile className="text-4xl" />
                  </div>
                  <p className="text-ellipsis overflow-hidden w-full">{file.name}</p>
                  <a type="button" className="w-full border rounded mt-1 flex items-center justify-center cursor-pointer" download href={file.url}><span className="pr-1">Download </span> <FaCloudDownloadAlt /></a>
                </div>
              )
            })}

          <p className="text-gray-500 text-xs">
            {message.read ? `Read ${message.timeRead}` : ""}
          </p>
        </div>
      </> : ""}
    </div>
  );
}
