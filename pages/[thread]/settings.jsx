import { useRouter } from "next/router";
import { useContext, useEffect, useState } from "react";
import { UserContext } from "../../lib/context";
import Image from "next/image";
import { FaArrowLeft } from "react-icons/fa";
import {
  changeGroupName,
  deleteGroupChat,
  getFriends,
  getMembers,
  getSuggestionsFromInput,
  getThreadData,
  rotate,
} from "../../lib/functions";
import { Member } from "../../components/member";
import { MemberSuggestion } from "../../components/MemberSuggestion";
import toast from "react-hot-toast";

export default function SettingsPage() {
  const router = useRouter();
  const { user, data } = useContext(UserContext);
  const { thread } = router.query;
  const [threadData, setThreadData] = useState(null);
  const [membersData, setMembersData] = useState([]);
  const [currentInput, setCurrentInput] = useState("");
  const [suggestions, setSuggestion] = useState([]);
  const [friends, setFriends] = useState([]);
  const [groupName, setGroupName] = useState([]);

  useEffect(() => {
    if (!user || !data) {
      return;
    }
    getFriends(user, data, friends).then((friendsList) => {
      setFriends(friendsList);
    });
  }, [user, data]);

  useEffect(() => {
    setSuggestion([]);
    const currentSuggestions = getSuggestionsFromInput(
      friends,
      currentInput,
      membersData,
      user,
      data
    );
    setSuggestion(currentSuggestions);
  }, [currentInput]);

  useEffect(() => {
    getThreadData(thread).then((data) => {
      setThreadData(data);
    });
  }, [thread]);

  useEffect(() => {
    getMembers(threadData).then((members) => {
      setMembersData(members);
    });


    if (threadData && (threadData.leader !== user.uid && !threadData.dm)) {
      router.push(`/${thread}`);
    }
  }, [threadData]);

  return (
    <div className="mt-20 ml-4 text-white">
      <a href={`/${thread}`} className="text-xl">
        <FaArrowLeft />
      </a>
      <div className="mt-2 ml-6">
        <h1 className="text-4xl font-bold">
          {threadData ? threadData.groupName : "Thread"} Settings
        </h1>
        <h2 className="text-2xl">Group Name</h2>
        <div className="my-4 text-xl">
          <input
            placeholder="New Group Name"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            type="text"
            className="border bg-transparent border-neutral-500 rounded mr-6 h-12 w-1/2 text-white px-4 focus:outline-none focus:ring-0"
          />
          <button
            className="border border-neutral-400 px-12 rounded text-white font-bold h-12"
            onClick={() =>
              changeGroupName(thread, threadData, groupName).then((data) => {
                setThreadData(data);
              })
            }
          >
            Change Group Name
          </button>
        </div>
        {/* <h2 className="text-2xl mb-2">Members</h2>
        {threadData && !threadData.dm ? <>
          {membersData &&
            membersData.map((_item) => (
              <Member
                item={_item}
                removeGroupMember={removeGroupMember}
                threadData={threadData}
                thread={thread}
                membersData={membersData}
                setMembersData={setMembersData}
                key={_item.uid}
              />
            ))}
          <h3 className="text-xl mb-2">Add Members:</h3>
          <div className="">
            <input
              placeholder="Member Username"
              value={currentInput}
              onChange={(e) => setCurrentInput(e.target.value)}
              className="border bg-transparent border-neutral-500 rounded mr-6 h-12 w-1/2 text-white px-4 focus:outline-none focus:ring-0"
              type="text"
            />
          </div>
          <div className="">
            {suggestions.map((item) => (
              <MemberSuggestion
                item={item}
                key={item.uid}
                addGroupMember={(member) => {
                  return addGroupMember(
                    member,
                    thread,
                    threadData,
                    membersData,
                    user,
                    data
                  );
                }}
                setCurrentInput={setCurrentInput}
                setMembersData={setMembersData}
              />
            ))}
          </div>
        </> : ""} */}
        <h2 className="text-2xl my-2">End to End Encryption</h2>
        <button
          className="border border-neutral-400 px-6 rounded text-white font-bold h-12"
          onClick={() =>
            rotate(user, data, thread).then(() =>
              toast.success("Successfully rotated key")
            )
          }
        >
          Rotate Encryption Key
        </button>
        <h2 className="text-2xl my-2">Delete</h2>
        <button
          className="border border-neutral-400 px-6 rounded text-white font-bold h-12"
          onClick={() =>
            deleteGroupChat(thread).then((success) => {
              if (success) {
                new Promise((resolve) =>
                  setTimeout(() => {
                    router.push("/");
                    resolve();
                  }, 1000)
                );
              }
            })
          }
        >
          Delete Group Chat
        </button>
      </div>
    </div>
  );
}
