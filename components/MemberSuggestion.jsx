import { useContext } from "react";
import { UserContext } from "../lib/context";
import Image from "next/image";
import ProfileImage from "./ProfileImage";

export function MemberSuggestion({ item, addGroupMember, setMembersData, setCurrentInput }) {
  const { user, data } = useContext(UserContext);
  return (
    <div
      className="w-2/5 mb-4 flex"
      data-testid={`member-suggestion-${item.uid}`}
    >
      <div
        type="button"
        className="border bg-transparent border-neutral-500 rounded mr-6 w-1/2 min-w-fit text-white px-4 flex p-2 items-center "
      >
        <ProfileImage src={item.profileIMG} />
        <h2 className="ml-4 text-2xl">{`@${item.username}`}</h2>
      </div>
      <button
        type="button"
        onClick={() =>
          addGroupMember(item).then((newMembers) => {
            setMembersData(newMembers);
            setCurrentInput("");
          })
        }
        className="border border-neutral-400 px-6 rounded text-white font-bold"
      >
        Add Member
      </button>
    </div>
  );
}
