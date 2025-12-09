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

export function Person({ item }) {
  console.log(item);
  const { user, data } = useContext(UserContext);
  const id = item.uid;
  const type = useRequests(user, id, data);
    console.log(item.username, type)
  return (
    <div className="flex mb-4" key={item.username}>
      <div
        className="border bg-transparent border-neutral-500 rounded mr-6 w-full min-w-fit text-white px-4 flex p-2 items-center"
      >
        <div className="rounded-full overflow-hidden bg-white w-10 h-10 flex justify-center flex-shrink-0 items-center relative">
          <Image
            alt="profileImg"
            src={item.profileIMG}
            layout="fill"
            objectFit="contain"
            sd
          />
          ` `
        </div>
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
