import Image from "next/image";
import { useContext, useReducer, useState } from "react";
import { UserContext } from "../lib/context";
import { useRequests } from "../lib/hooks";
import {
  acceptFriend,
  getUserData,
  removeFriend,
  removeRequest,
  submitUsername,
} from "../lib/functions";
import ProfileImage from "./ProfileImage";
import ConfirmKeyPopup from "./ConfirmKeysPopup";

export function Person({ item }) {

  const { user, data } = useContext(UserContext);
  const id = item.uid;
  const type = useRequests(user, id, data);
  const [popup, setPopup] = useState(false)
  const [selectedUserData, setSelectedUserData] = useState()
  const [accepting, setAccepting] = useState()

  const addFriendSubmit = (id) => {
    getUserData(id).then((data) => {
      setSelectedUserData(data)
      submitUsername(id, user, data);
      setAccepting(false)
      setPopup(true)
    }
    )
  }

  const acceptFriendSubmit = (id) => {
    getUserData(id).then((_data) => {
      setSelectedUserData(_data)
      acceptFriend(item.uid, user, data)
      setAccepting(true)
      setPopup(true)
    }
    )
  }

  return (
    <>
      {popup ? <ConfirmKeyPopup setPopup={setPopup} other_data={selectedUserData} accepting={accepting} /> : <></>}
      <div className="flex mb-4" key={item.username}>
        <div
          className="border bg-transparent border-neutral-500 rounded mr-6 w-full min-w-fit text-white px-4 flex p-2 items-center"
        >
          <ProfileImage src={item.profileIMG} />
          <h2 className="ml-4 text-2xl">{`@${item.username}`}</h2>
        </div>
        {type == "disabled" && (
          <button
            type="button"
            onClick={() => removeFriend(item.uid, user, data)}
            className="border border-neutral-400 px-6 rounded text-white font-bold"
          >
            Remove Friend
          </button>
        )}
        {type == "incoming" && (
          <button
            type="button"
            onClick={() => acceptFriendSubmit(item.uid)}
            className="border border-neutral-400 px-6 rounded text-white font-bold"
          >
            Accept Friend
          </button>
        )}
        {type == "outgoing" && (
          <button
            type="button"
            onClick={() => removeRequest(item.uid, user, data)}
            className="border border-neutral-400 px-6 rounded text-white font-bold"
          >
            Stop Friend Request
          </button>
        )}
        {type == "enabled" && (
          <button
            type="button"
            onClick={(e) => addFriendSubmit(item.uid)}
            className="border border-neutral-400 px-6 rounded text-white font-bold"
          >
            Add Friend
          </button>
        )}
      </div>
    </>
  );
}
