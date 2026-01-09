import Image from "next/image";
import { useContext, useEffect, useState } from "react";
import { UserContext } from "../lib/context";
import { auth } from "../lib/firebase";
import Login from "../components/login";
import { Person } from "../components/person";
import Backup from "../components/backup";
import toast from "react-hot-toast";
import { getCurrentMembers, storeAndDownloadBackup } from "../lib/functions";
import ProfileImage from "../components/ProfileImage";

export default function Profile({}) {
  const { user, data } = useContext(UserContext);
  const [friends, setFriends] = useState([]);
  const [currentFriends, setCurrentFriends] = useState(friends);
  const [popup, setPopup] = useState(false);
  const [already, setAlready] = useState(false);

  useEffect(() => {
    user &&
      data &&
      getCurrentMembers(data, user).then((members) => {
        setFriends(members);
      });
  }, [data, user]);

  useEffect(() => {
    setCurrentFriends(friends);
  }, [friends]);

  if (!user) {
    return <Login />;
  }

  const downloadBackup = async (passphrase) => {
    let success = await storeAndDownloadBackup(passphrase, user, data, already)
    
    if (already) {
      setAlready(false);
    }
    
    if (success) {
      setPopup(false);
      toast.success("Backup Created");
    } else {
      setAlready(true);
    }
  };

  return (
    <main className="mt-24 flex justify-center text-white">
      <div className="">
        {popup ? (
          <Backup
            setPopup={setPopup}
            makeBackup={downloadBackup}
            already={already}
          />
        ) : (
          ""
        )}
        <div className="flex justify-center gap-4 items-center">
          <ProfileImage src={data ? data.profileIMG : "/close.png"} width={24} height={24} />
          <div className="">
            <p className="text-4xl font-bold">{data && data.displayName}</p>
            <p className="text-l text-center text-neutral-400">User Id: {user.uid}</p>
          </div>
        </div>
        <h1 className="text-4xl font-bold mb-4">Friends</h1>
        {currentFriends &&
          currentFriends.map((item) => (
            <div key={item.id}>
              <Person item={item} />
            </div>
          ))}
        <h1 className="text-4xl font-bold mb-4">End-To-End-Encryption</h1>
        <h2 className="text-2xl mb-4">Backup</h2>
        <p className="text-sm text-neutral-400">
          Backing up your key allows you to access your messages from another
          device if this device is lost or stolen. Without the key you will be
          unable to access your account if you switch devices.
        </p>
        <p className="text-sm font-bold text-red-500">
          Do not loose the passkey or you will not be able to access your
          account
        </p>
        <button onClick={(e) => setPopup(true)} className="mt-4 border border-neutral-400 px-12 rounded text-white font-bold h-12">
          Download Backup
        </button>
        <div className="w-full flex justify-center">
          <button
            onClick={() => auth.signOut()}
            className="mt-4 border border-neutral-400 px-12 rounded text-white font-bold h-12"
          >
            Sign Out
          </button>
        </div>
      </div>
    </main>
  );
}
