import { useState } from "react";
import { auth } from "../lib/firebase";
import toast from "react-hot-toast";
import { useRouter } from "next/router";
import { createUser, uploadImage } from "../lib/functions";

export default function Create({}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [storageUrl, setStoreageUrl] = useState("");
  const router = useRouter();

  const submit = async (e) => {
    e.preventDefault();
    if (!storageUrl) {
      toast.error("No Profile Picture");
      return;
    }

    createUser(auth, email, password, displayName, storageUrl).then(
      (success) => {
        console.log("success", success)
        if (success) {
          router.push("/");
        }
      }
    );
  };

  return (
    <form
      onSubmit={(e) => submit(e)}
      className="flex pt-20 flex-wrap text-white justify-center h-1/2 items-center w-full"
    >
      <label className="text-4xl font-bold w-full text-center mb-4">
        Create Account
      </label>
      <input
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="border block bg-transparent border-neutral-500 rounded mr-6 h-12 w-2/3 text-white px-4 my-2"
      />
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="border block bg-transparent border-neutral-500 rounded mr-6 h-12 w-2/3 text-white px-4 my-2"
      />
      <input
        placeholder="Display Name"
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        className="border block bg-transparent border-neutral-500 rounded mr-6 h-12 w-2/3 text-white px-4 my-2"
      />
      <label className="text-2xl w-full text-center block mb-4">
        Profile Picture
      </label>
      <label className="flex items-center justify-center w-2/3 h-12 px-4 rounded border border-neutral-500 text-white cursor-pointer relative right-3 my-2">
        <span>Select Image</span>

        <input
          type="file"
          className="hidden"
          onChange={(e) => uploadImage(e, setStoreageUrl)}
          accept=".gif,.jpg,.jpeg,.png,.webp,.avif"
        />
      </label>

      <button
        disabled={
          !(
            (storageUrl ? true : false) &&
            displayName != "" &&
            email != "" &&
            password != ""
          )
        }
        className="border border-neutral-400 px-6 rounded text-white font-bold h-12 w-1/2 my-2 disabled:opacity-40"
      >
        Submit
      </button>
    </form>
  );
}
