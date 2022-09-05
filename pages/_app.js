import '../styles/globals.css'
import { Toaster } from 'react-hot-toast';
import { useEffect, useState } from 'react';
import { auth } from '../lib/firebase'
import React from 'react';
import { onAuthStateChanged } from "firebase/auth";
import { UserContext } from '../lib/context'
import {useUserData} from '../lib/hooks'
import Header from '../components/header';

function MyApp({ Component, pageProps }) {

  const userData = useUserData();

  return (
      <UserContext.Provider value={userData}>
        <Header />
        <Component {...pageProps} />
        <Toaster />
      </UserContext.Provider>
  )
}

export default MyApp
