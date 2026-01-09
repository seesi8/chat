import { useEffect, useState } from "react";
import Image from "next/image";
import { base64ToBlob } from "../lib/e2ee/e2ee";
import { FaFile } from "react-icons/fa";
import { FaCloudDownloadAlt } from "react-icons/fa";
import { CallMessage } from "./CallMessage";
import { MessageHandler } from "../lib/MessageHandler";
import { CallHandler } from "../lib/CallHandler";
import ProfileImage from "./ProfileImage";
import { InviteMessage } from "./InviteMessage";

export function Message({ message, messageHandler }) {
  let fileUrls = [];
  let files = [];

  if (message.type == MessageHandler.MESSAGETYPES.IMAGE) {
    const urls = message.messages.map((file) => {
      const blob = base64ToBlob(file);
      return window.URL.createObjectURL(blob);
    });

    fileUrls = urls;
  }
  else if (message.type == MessageHandler.MESSAGETYPES.FILE) {
    const blobs = message.messages.map((file) => {
      const blob = base64ToBlob(file.content, { type: file.type });
      file.blob = blob
      file.url = window.URL.createObjectURL(blob);
      return file
    });

    files = blobs;
  }
  if (CallHandler.isCallType(message.type)) {
    return <CallMessage message={message} messageHandler={messageHandler} />;
  }
  // if(message.type == MessageHandler.MESSAGETYPES.GROUP_INVITE){
  //   return <InviteMessage message={message} messageHandler={messageHandler}/>
  // }
  return (
    <div className="ml-6 mb-4 text-white flex items-start relative">
      {(MessageHandler.isVisableType(message.type)) ? <>
        <ProfileImage src={message.sentBy.profileIMG} width={10} height={10} />

        <div className="ml-2">
          <div className="flex">
            <p className="text-neutral-300">@{message.sentBy.username}</p>
            <p className="text-neutral-500 ml-2">
              {message.timeSentFormated}
            </p>
          </div>

          {MessageHandler.isTextType(message.type) &&
            message.messages.map((msg, i) => (
              <h3 key={i} className="mr-12">
                {msg}
              </h3>
            ))}

          {message.type === MessageHandler.MESSAGETYPES.IMAGE &&
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

          {message.type === MessageHandler.MESSAGETYPES.FILE &&
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
