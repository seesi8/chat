import '../styles/globals.css'
import toast, { Toaster } from 'react-hot-toast';
import { useEffect, useState } from 'react';
import { auth, firestore } from '../lib/firebase'
import React from 'react';
import { onAuthStateChanged } from "firebase/auth";
import { UserContext } from '../lib/context'
import { useUserData } from '../lib/hooks'
import Header from '../components/header';
import NoKey from '../components/nokey';
import { restoreKey } from '../lib/e2ee/e2ee';
import { doc, getDoc } from 'firebase/firestore';

function MyApp({ Component, pageProps }) {

  const userData = useUserData();
  const [popup, setPopup] = useState(false)

  useEffect(() => {
    if (!userData.data || !userData.user) {
      return;
    }
    if (userData.data.privateKey) {
      return
    }
    console.log("print once")
    setPopup(true)
  }, [userData])

  const makeBackup = async (passphrase) => {
    const requestRef = doc(
      firestore,
      "backups",
      userData.user.uid
    );

    const data = (await getDoc(requestRef)).data()

    const cypherText = data["aead"]["ciphertext"]
    const salt = data["kdf"]["salt"]
    const nonce = data["aead"]["nonce"]
    try {
      console.log("here")
      await restoreKey(cypherText, salt, passphrase, nonce, false)
      setPopup(false)
      toast.success("Account recovered. Please wait while we reload the page.")
      new Promise(resolve => setTimeout(() => {
        window.location.reload(true);
        resolve();
      }, 1000));
    }
    catch {
      toast.error("Wrong passphrase please try again.")
    }
  }

  return (
    <UserContext.Provider value={userData}>
      <Header />
      {
        popup ?
          <NoKey setPopup={setPopup} makeBackup={makeBackup} />
          : ""
      }
      <Component {...pageProps} />
      <Toaster />
    </UserContext.Provider>
  )
}

export default MyApp
