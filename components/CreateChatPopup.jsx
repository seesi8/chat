import { useEffect, useContext, useState } from "react";
import { UserContext } from "../lib/context";
import Popup from "./popup";
import {
  createDRDM,
  createGroup,
  getFriends,
  getSuggestionsFromInput,
  removeMember,
  submitMember,
} from "../lib/functions";
import { MemberSuggestion } from "./MemberSuggestion";
import { MessageHandler } from "../lib/MessageHandler";

export default function CreateChatPopup({ setPopup }) {
  const { user, data } = useContext(UserContext);
  const [members, setMembers] = useState([
    { uid: user.uid, username: data.username, publicKey: data.publicKey },
  ]);
  const [groupName, setGroupName] = useState([]);
  const [currentInput, setCurrentInput] = useState("");
  const [friends, setFriends] = useState([]);
  const [suggestions, setSuggestion] = useState([]);
  const [dm, setDm] = useState(true);
  const [messageHandler, setMessageHandler] = useState();

  useEffect(() => {
    getFriends(user, data, friends).then((localFriends) => {
      localFriends;
    });
    setFriends;
  }, []);

  useEffect(() => {
    setSuggestion(
      getSuggestionsFromInput(friends, currentInput, members, user, data)
    );
  }, [currentInput]);

  useEffect(() => {
    if (user && data) {
      setMessageHandler(new MessageHandler(user, data))
    }
  }, [user, data])

  return (
    <Popup setPopup={setPopup} title={"Create Message"}>
      <div className="flex w-full justify-center p-4 pt-0">
        <button
          className={`border ${dm ? "bg-neutral-500/15" : ""
            } p-4 w-1/2 rounded cursor-pointer mr-4 min-w-fit`}
          onClick={(e) => {
            setDm(true);
          }}
        >
          Direct Message
        </button>
        <button
          className={`cursor-pointer  ${!dm ? "bg-neutral-500/15" : ""
            } p-4 w-1/2 border rounded min-w-fit`}
          onClick={(e) => {
            setDm(false);
          }}
        >
          Group Message
        </button>
      </div>
      <form>
        <input
          placeholder={`Chat Name`}
          required
          value={groupName}
          onChange={(e) => setGroupName(e.target.value)}
          className="border bg-transparent border-neutral-500 rounded mr-6 h-12 w-full text-white px-4 text-xl mb-4"
          type="text"
        />
        <p className="text-white text-xl mb-4">Add Members:</p>
        <div className="border bg-transparent border-neutral-500 rounded mr-6 h-12 w-full text-white px-2 text-xl mb-4 flex items-center gap-2">
          {members.map((item) => (
            <div
              className="border bg-transparent border-neutral-500 rounded text-white px-2 cursor-pointer"
              key={item.uid}
              data-testid={`selected-member-${item.uid}`}
              onClick={(e) => {
                setMembers(removeMember(e, item, members, user, data));
                setCurrentInput("");
              }}
            >
              <p className="text-sm my-1">{`@${item.username}`}</p>
            </div>
          ))}
          <input
            placeholder="Member Username"
            value={currentInput}
            onChange={(e) => setCurrentInput(e.target.value)}
            className="bg-transparent border-none outline-none w-full"
            type="text"
          />
        </div>
        <div>
          {suggestions.map((item) => (
            <MemberSuggestion
              key={item.uid}
              item={item}
              addGroupMember={(member) =>
                submitMember(member, members, user, data, dm)
              }
              setMembersData={setMembers}
              setCurrentInput={setCurrentInput}
            />
          ))}
        </div>
      </form>
      <button
        onClick={() => {
          if (!dm) {
            messageHandler.createGroup(members, groupName).then((success) => {
              if (success) {
                setPopup(false);
              }
            });
          } else {
            messageHandler.createDRDM(members, groupName).then((success) => {
              if (success) {
                setPopup(false);
              }
            });
          }
        }}
        className="border border-neutral-400 px-6 rounded text-white font-bold h-12 w-full"
      >
        <h1>Create</h1>
      </button>
    </Popup>
  );
}
