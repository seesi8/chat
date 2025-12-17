import { useEffect, useState } from "react";
import Image from "next/image";
import { base64ToBlob } from "../lib/e2ee/e2ee";

export function Message({ message }) {
  const [fileUrls, setFileUrls] = useState([]);

  useEffect(() => {
    if (message.type !== 0x03) return;

    const urls = message.messages.map((file) => {
      const blob = base64ToBlob(file);
      console.log(blob)
      return window.URL.createObjectURL(blob);
    });

    setFileUrls(urls);

    // return () => {
    //   urls.forEach((url) => window.URL.revokeObjectURL(url));
    // };
  }, [message]);

  return (
    <div className="ml-6 mb-4 text-white flex items-start relative">
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
                className="relative w-24 h-24 rounded-xl overflow-hidden m-4"
              >
                <img
                  src={url}
                  alt="uploaded"
                  className="w-full h-full object-cover"
                />
              </div>
            )
          })}

        <p className="text-gray-500 text-xs">
          {message.read ? `Read ${message.timeRead}` : ""}
        </p>
      </div>
    </div>
  );
}
