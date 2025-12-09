import Image from "next/image";

export function Message({ message }) {
  return (
    <div className="ml-6 mb-4 text-white flex items-start z-[-1] relative" key={message.key}>
      <div className="rounded-full overflow-hidden bg-white w-10 h-10 flex justify-center flex-shrink-0  items-center relative mt-1">
        <Image
          layout="fill"
          src={message.sentBy.profileIMG}
          objectFit="contain"
        />
      </div>
      <div className="ml-2">
        <div className="flex">
          <p className="text-neutral-300">@{message.sentBy.username}</p>
          <p className="text-neutral-500 ml-2">{message.timeSent}</p>
        </div>
        <div className="">
          <h3 className="mr-12">{message.message}</h3>
        </div>
      </div>
    </div>
  );
}
