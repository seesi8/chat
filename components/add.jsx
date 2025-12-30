import { useContext, useEffect, useState } from "react";
import { UserContext } from "../lib/context";
import {
  getAllUsers,
  getSuggestionsFromInput,
  submitUsername,
} from "../lib/functions";
import { Person } from "./person";
import Popup from "./popup";

export default function AddFriend({ setPopup }) {
  const { user, data } = useContext(UserContext);
  const [currentInput, setCurrentInput] = useState("");
  const [people, setPeople] = useState([]);
  const [suggestions, setSuggestion] = useState([]);

  useEffect(() => {
    getAllUsers().then((allUsers) => {
      setPeople(allUsers);
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
  }, [currentInput]);

  return (
    <Popup title={"Add Friend"} setPopup={setPopup}>
      <form onSubmit={(e) => submitUsername(e, suggestions[0].id, user, data)} className="max-h-[85%] overflow-y-scroll overflow-x-hidden">
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
            <Person key={item.uid} item={item} />
          ))}
        </div>
      </form>
    </Popup>
  );
}
