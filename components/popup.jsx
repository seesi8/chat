import React from "react";
import { FaTimes } from "react-icons/fa";

export default function Popup({ children, title, setPopup }) {
  return (
    <div className="flex items-center justify-center fixed w-full h-full top-0 bg-black/90 text-white left-0 z-10 overflow-y-scroll min-w-fit">
      <div className="border w-1/3 h-2/3 rounded p-6 min-w-fit">
        {setPopup && (
          <button className="text-3xl" onClick={() => setPopup(false)}>
            <FaTimes />
          </button>
        )}
        <h1 className="font-bold text-2xl text-center mb-6">{title}</h1>
        {children}
      </div>
    </div>
  );
}
