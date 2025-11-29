import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
    apiKey: "AIzaSyAO3d0rzfBpXDzXzyxLstFncYjY8-jyEJ4",
    authDomain: "chat-24ce7.firebaseapp.com",
    projectId: "chat-24ce7",
    storageBucket: "chat-24ce7.appspot.com",
    messagingSenderId: "857402905955",
    appId: "1:857402905955:web:90479eea6612733f732f56",
    measurementId: "G-13T0TD79M6"
};

const app = initializeApp(firebaseConfig);

/*
export function getProviderForProviderId(id) {

    const providers = {
        'password': undefined,
        'phone': undefined,
        'google.com': googleAuthProvider,
        'facebook.com': undefined,
        'twitter.com': undefined,
        'github.com': undefined,
        'apple.com': undefined,
        'yahoo.com': undefined,
        'hotmail.com': undefined
    };

    if (providers.hasOwnProperty(id)) {
        return (providers[id]);
    }
}
*/

export const auth = getAuth(app);
export const googleAuthProvider = new GoogleAuthProvider();
export const firestore = getFirestore(app);
export const functions = getFunctions(app);
export const storage = getStorage(app);