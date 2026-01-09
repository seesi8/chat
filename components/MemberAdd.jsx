import Image from "next/image";
import { useContext, useReducer, useState } from "react";
import { UserContext } from "../lib/context";
import { useRequests } from "../lib/hooks";
import {
  acceptFriend,
  getUserData,
  inviteFriend,
  removeFriend,
  removeRequest,
  submitUsername,
} from "../lib/functions";
import ProfileImage from "./ProfileImage";
import ConfirmKeyPopup from "./ConfirmKeysPopup";

export function MemberAdd({ item, threadId, messageHandler, updateMembers }) {

  const { user, data } = useContext(UserContext);

  const addFriendSubmit = async (id) => {
    await inviteFriend(id, user, data, threadId, messageHandler.thread.members)
    messageHandler.setThread()
    updateMembers(messageHandler.thread.members)
  }

  return (
    <>
      <div className="flex mb-4" key={item.username}>
        <div
          className="border bg-transparent border-neutral-500 rounded mr-6 w-full min-w-fit text-white px-4 flex p-2 items-center "
        >
          <ProfileImage src={item.profileIMG} />
          <h2 className="ml-4 text-2xl">{`@${item.username}`}</h2>
        </div>

        <button
          type="button"
          onClick={(e) => addFriendSubmit(item.uid)}
          className="border border-neutral-400 px-6 rounded text-white font-bold"
        >
          Invite
        </button>

      </div>
    </>
  );
}
