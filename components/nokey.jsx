import { useContext, useState } from "react";
import { UserContext } from "../lib/context";
import Popup from "./popup";

export default function NoKey({ setPopup, makeBackup }) {
  const { user, data } = useContext(UserContext);
  const [currentInput, setCurrentInput] = useState("");

  return (
    <Popup title={"Lost your key?"}>
      <form onSubmit={(e) => {e.preventDefault()}}>
        <p className="my-2">
          No encryption key was detected on your device. You can recover your
          account using the passphrase you provided during backup.{" "}
          <b>Please enter your passphrase below.</b>
        </p>
        <p className="my-2">
          Your passphrase should be multiple words or phrases.
        </p>
        <p className="my-2">
          {'For example: "The quick brown fox jumps over the lazy dog."'}
        </p>

        <input
          placeholder="Passphrase"
          value={currentInput}
          className="border bg-transparent border-neutral-500 rounded mr-6 h-12 w-full text-white px-4 text-xl my-4"
          onChange={(e) => setCurrentInput(e.target.value)}
          type="text"
          required={true}
          data-testid="lost-key-passphrase"
        />
      </form>
      <button
        onClick={() => makeBackup(currentInput)}
        className="border border-neutral-400 px-6 rounded text-white font-bold h-12 mt-5 w-full"
        data-testid="lost-key-restore"
      >
        <h1>Restore</h1>
      </button>
    </Popup>
  );
}
