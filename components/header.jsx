import Image from "next/image";
import CreateChatPopup from "./CreateChatPopup";
import Link from "next/link";
import AddFriend from "../components/add";
import { useState, useContext } from "react";
import { UserContext } from "../lib/context";
import { IoCreateOutline } from "react-icons/io5";
import { FaUserPlus } from "react-icons/fa";
import ProfileImage from "./ProfileImage";

export default function Header({ }) {
  const [popup, setPopup] = useState(false);
  const [add, setAdd] = useState(false);
  const { user, data } = useContext(UserContext);

  return (
    <>
      {popup && <CreateChatPopup setPopup={setPopup} />}
      {add && <AddFriend setPopup={setAdd} />}
      <div className="fixed flex w-full top-0 p-2 left-0 items-center border-b text-white justify-between px-5 bg-neutral-900 z-40">
        <Link href={"/"}>
          <a className="font-bold text-2xl">CipherLine.net</a>
        </Link>
        {user && (
          <div className="flex gap-8">
            <button
              onClick={() => (setPopup(popup ? false : true), setAdd(false))}
              className="text-3xl"
              aria-label="Create chat"
            >
              <IoCreateOutline />
            </button>
            <Link href={"/profile"}>
              <a href="">
                <ProfileImage src={data ? data.profileIMG : "/close.png"} width={8} height={8}/>
              </a>
            </Link>
            <button
              onClick={() => (setAdd(add ? false : true), setPopup(false))}
              className="text-3xl"
              aria-label="Add friend"
            >
              <FaUserPlus />
            </button>
          </div>
        )}
      </div>
    </>
  );
}
