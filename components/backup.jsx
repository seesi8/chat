import { useState } from "react";
import Popup from "./popup";

export default function Backup({ setPopup, makeBackup, already }) {
  const [currentInput, setCurrentInput] = useState("");

  return (
    <Popup setPopup={setPopup} title={"Create Backup"}>
      <form onSubmit={(e) => {e.preventDefault()}}>
        <div className="">
          <input
            placeholder="Passphrase"
            value={currentInput}
            className="border bg-transparent border-neutral-500 rounded mr-6 h-12 w-full text-white px-4 text-xl mb-4 focus:outline-none focus:ring-0"
            onChange={(e) => setCurrentInput(e.target.value)}
            type="text"
            required={true}
            data-testid="backup-passphrase"
          />
        </div>
        {already ? (
          <p className="text-red-500">
            A backup already exists for your account.{" "}
            <b>Click Create again to replace it</b>
          </p>
        ) : (
          ""
        )}
        <p className="my-2">
          Select a unique passphrase. <b>Do not lose the passphrase</b> or else
          you will not be able to access your account.
        </p>
        <p className="my-2">
          We recommend storing the passphrase somewhere secure such as a
          password manager.
        </p>
        <p className="my-2">
          A good passphrase is multiple words or phrases.
        </p>
        <p className="my-2">
          {'For example: "The quick brown fox jumps over the lazy dog."'}
        </p>
      </form>
      <button
        onClick={() => makeBackup(currentInput)}
        className="border border-neutral-400 px-6 rounded text-white font-bold h-12 mt-5 w-full"
        data-testid="backup-create"
      >
        <h1 className="">Create</h1>
      </button>
    </Popup>
  );
}
