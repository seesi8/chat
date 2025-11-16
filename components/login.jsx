import { useState } from "react";
import Link from "next/link";
import { login } from "../lib/functions";

export default function Login({}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <form
      className="flex pt-20 flex-wrap text-white justify-center h-1/2 items-center"
    >
      <label className="text-4xl font-bold w-full text-center mb-4">
        Login To Account
      </label>
      <input
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="border bg-transparent border-neutral-500 rounded mr-6 h-12 w-2/3 text-white px-4 my-2"
      />
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="border bg-transparent border-neutral-500 rounded mr-6 h-12 w-2/3 text-white px-4 my-2"
      />
      <button onClick={(e) => login(e, email, password)} className="border border-neutral-400 px-6 rounded text-white font-bold h-12 w-1/2 my-2" type="submit">Submit</button>
      <Link href="/create">
        <h3 className="w-full text-center my-2 cursor-pointer text-teal-500">Create Account</h3>
      </Link>
    </form>
  );
}
