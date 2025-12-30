import Image from "next/image";
import { useContext, useReducer } from "react";
import { UserContext } from "../lib/context";
import { useRequests } from "../lib/hooks";
import {
  acceptFriend,
  removeFriend,
  removeRequest,
  submitUsername,
} from "../lib/functions";
import ProfileImage from "./ProfileImage";

export function Person({ item }) {
  
  const { user, data } = useContext(UserContext);
  const id = item.uid;
  const type = useRequests(user, id, data);
    
  return (
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
          onClick={() => acceptFriend(item.uid, user, data)}
          className="border border-neutral-400 px-6 rounded text-white font-bold"
        >
          Accept Friend
        </button>
      )}
      {type == "outgoing" && (
        <button
          type="button"
          onClick={() => removeRequest(item.uid, user)}
          className="border border-neutral-400 px-6 rounded text-white font-bold"
        >
          Stop Friend Request
        </button>
      )}
      {type == "enabled" && (
        <button
          type="button"
          onClick={(e) => submitUsername(e, item.uid, user, data)}
          className="border border-neutral-400 px-6 rounded text-white font-bold"
        >
          Add Friend
        </button>
      )}
    </div>
  );
}
