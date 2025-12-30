import Image from "next/image";
import { useContext } from "react";
import { UserContext } from "../lib/context";
import ProfileImage from "./ProfileImage";

export function Member({
  item,
  removeGroupMember,
  threadData,
  thread,
  membersData,
  setMembersData
}) {
  const { user, data } = useContext(UserContext);

  return (
    <div className="w-2/5 my-2 flex" key={item.username}>
      <div
        type="button"
        className="border bg-transparent border-neutral-500 rounded mr-6 w-1/2 text-white px-4 flex p-2 items-center "
      >
        <ProfileImage width={10} height={10} src={item.profileIMG} />
        <h2 className="ml-4 text-2xl">{`@${item.username}`}</h2>
      </div>
      <button
        type="button"
        onClick={() =>
          removeGroupMember(
            item.uid,
            threadData,
            thread,
            membersData,
            user,
            data
          ).then((newMembers) => {
            setMembersData(newMembers);
          })
        }
        className="border border-neutral-400 px-6 rounded text-white font-bold"
      >
        Remove Member
      </button>
    </div>
  );
}
