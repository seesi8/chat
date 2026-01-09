import { useContext, useEffect, useState } from "react";
import { UserContext } from "../lib/context";
import {
  getAllUsers,
  getFriends,
  getSuggestionsFromInput,
  submitUsername,
} from "../lib/functions";
import Popup from "./popup";
import { MemberAdd } from "./MemberAdd";

export default function AddMember({ setPopup, threadId, messageHandler }) {
  const { user, data } = useContext(UserContext);
  const [currentInput, setCurrentInput] = useState("");
  const [people, setPeople] = useState([]);
  const [suggestions, setSuggestion] = useState([]);

  useEffect(() => {
    getFriends(user, data).then((allUsers) => {
      setPeople(allUsers.filter((item) => messageHandler.thread.members.filter((_item) => _item == item.uid).length == 0));
    });
  }, []);

  useEffect(() => {
    const currentSuggestion = getSuggestionsFromInput(
      people,
      currentInput,
      [],
      user,
      data
    );
    setSuggestion(currentSuggestion);
  }, [currentInput, people]);

  const updateMembers = () => {
    getFriends(user, data).then((allUsers) => {
      setPeople(allUsers.filter((item) => messageHandler.thread.members.filter((_item) => _item == item.uid).length == 0));
    });
    // setPopup(false)
  }

  return (
    <Popup title={"Invite Member to Group"} setPopup={setPopup}>

      <form onSubmit={(e) => { e.preventDefault(); submitUsername(suggestions[0].id, user, data) }} className="max-h-[85%] overflow-y-scroll overflow-x-hidden">
        <div className="">
          <input
            placeholder="Member Username"
            value={currentInput}
            onChange={(e) => setCurrentInput(e.target.value)}
            className="border bg-transparent border-neutral-500 rounded mr-6 h-12 w-full text-white px-4 text-xl mb-4 focus:outline-none focus:ring-0"
            type="text"
          />
        </div>
        <div className="max-h-full">
          {suggestions.map((item) => (
            <MemberAdd key={item.uid} item={item} threadId={threadId} messageHandler={messageHandler} updateMembers={updateMembers} />
          ))}
        </div>
      </form>
    </Popup>
  );
}
