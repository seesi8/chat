import { auth, firestore } from '../lib/firebase';
import { doc, onSnapshot, getDoc, setDoc } from "firebase/firestore";
import { useEffect, useState } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';

// Custom hook to read  auth record and user profile doc
export function useUserData() {
    const [user] = useAuthState(auth);
    const [data, setData] = useState(null);



    useEffect(() => {
        // turn off realtime subscription
        let unsubscribe;

        if (user) {
            console.log(user.uid)
            const ref = doc(firestore, 'users', user.uid);
            unsubscribe = onSnapshot(ref, (doc) => {
                setData(doc.data());
            });
        } else {
            setData(null);
        }

        return unsubscribe;
    }, [user]);

    return { user, data };
}

export function fixDate(theProjects) {

    //force projects to be an array or else it toDate is not a function error
    let projects = []
    projects = projects.concat(theProjects)

    for (let docIndex in projects) {
        /*
        for(let message in projects[docIndex].messages){
            const docSnapshot = await getDoc(doc(firestore, "users", projects[docIndex].messages[message].sentBy));
            projects[docIndex].messages[message].sentBy = {
              user: projects[docIndex].messages[message].sentBy,
              profileIMG: docSnapshot.data().profileIMG,
              username: docSnapshot.data().username
            }
          }
        console.log(docIndex, ":", projects[docIndex])
        */
        if (isNaN(docIndex)) {
            continue
        }
        for (let memberIndex in projects[docIndex].members) {
            projects[docIndex].members[memberIndex] = JSON.stringify(projects[docIndex].members[memberIndex])
        }
        for (let messageIndex in projects[docIndex].messages) {
            projects[docIndex].messages[messageIndex].timeSent = ((new Date(projects[docIndex].messages[messageIndex].timeSent.toDate())).toLocaleDateString()) + " " + ((new Date(projects[docIndex].messages[messageIndex].timeSent.toDate())).toLocaleTimeString())
        }
        projects[docIndex].latestMessage = (new Date(projects[docIndex].latestMessage.toDate())).toLocaleDateString()
        projects[docIndex].createdAt = (new Date(projects[docIndex].createdAt.toDate())).toLocaleDateString()
    }
    return (projects);
}

export async function removeFriend(friendId, user, userData) {
    const userRef = doc(firestore, 'users', user.uid)
    let userFreinds = userData.friends
    var filteredFriends = userFreinds.filter(item => item !== friendId)
    await setDoc(userRef, { friends: filteredFriends }, { merge: true })
}