import Image from "next/image";
import { useContext, useEffect, useState } from "react";
import { UserContext } from "../lib/context";
import styles from "../styles/profile.module.css";
import {
    getDoc,
    doc,
    getDocs,
    query,
    collection,
    where,
} from "firebase/firestore";
import { firestore } from "../lib/firebase";
import { uuidv4 } from "@firebase/util";
import { auth } from "../lib/firebase";
import { removeFriend } from "../lib/hooks";
import Login from "../components/login";
import { Person } from "../components/person";
import { getMyPrivateKey, storeAndDownloadKey } from "../lib/e2ee/e2ee";
import Backup from "../components/backup";
import toast from "react-hot-toast";

export default function Profile({ }) {
    const incrimentValue = 3;

    const { user, data } = useContext(UserContext);
    const [friends, setFriends] = useState([]);
    const [currentFriends, setCurrentFriends] = useState(friends);
    const [friendsNumber, setFriendsNumber] = useState(incrimentValue);
    const [popup, setPopup] = useState(false)
    const [already, setAlready] = useState(false)

    const getData = async () => {
        if (!data || !user) {
            return;
        }
        const people = [];
        const fromUser = await getDocs(
            query(
                collection(firestore, "requests"),
                where("from", "==", user.uid)
            )
        );
        const toUser = await getDocs(
            query(
                collection(firestore, "requests"),
                where("to", "==", user.uid)
            )
        );

        for (let i in fromUser.docs) {
            const otherUser = fromUser.docs[i].data().to;
            people.push(await getDoc(doc(firestore, "users", otherUser)));
            console.log("pushed");
        }
        for (let i in toUser.docs) {
            const otherUser = toUser.docs[i].data().from;
            people.push(await getDoc(doc(firestore, "users", otherUser)));
        }
        for (let i in data.friends) {
            people.push(await getDoc(doc(firestore, "users", data.friends[i])));
        }
        const currentMembers = [];
        people.map((doc) => {
            let docData = doc.data();
            docData.id = doc.id;
            currentMembers.push(docData);
        });
        console.log(currentMembers);
        setFriends(currentMembers);
    };

    useEffect(() => {
        console.log(user)
        console.log(data)

        user && data && getData();
    }, [data, user]);


    useEffect(() => {
        setCurrentFriends(friends.slice(0, friendsNumber));
    }, [friends, friendsNumber]);

    if (!user) {
        return <Login />;
    }

    const downloadBackup = async (passphrase) => {
        const myPrivateKey = data.privateKey; // <-- await

        const data = await storeAndDownloadKey(myPrivateKey, passphrase, user.uid, already);
        if (already) {
            setAlready(false)
        }
        console.log(data)
        if (data) {
            setPopup(false)
            toast.success("Backup Created");
        } else {
            setAlready(true)
        }
    }



    return (
        <main className={styles.main}>
            <div className={styles.container}>
                {
                    popup ?
                        <Backup setPopup={setPopup} makeBackup={downloadBackup} already={already} />
                        :
                        ""
                }
                <div className={styles.profileImageContainerContainer}>
                    <div className={styles.profileImageContainer}>
                        <img
                            className={styles.profileImage}
                            src={data && data.profileIMG}
                        />

                    </div>
                    <div className={styles.col2}>
                        <p className={styles.displayName}>
                            {data && data.displayName}
                        </p>
                        <p className={styles.username}>@{data && data.username}</p>

                    </div>
                </div>
                <h1 className={styles.friendsTitle}>Friends</h1>
                {currentFriends.map((item) => (
                    <div key={item.id}>
                        <Person item={item} />
                    </div>
                ))}
                {friends.length > friendsNumber && (
                    <div className={styles.moreContainer}>
                        {" "}
                        <button
                            onClick={() =>
                                setFriendsNumber(friendsNumber + incrimentValue)
                            }
                            className={styles.more}
                        >
                            More...
                        </button>{" "}
                    </div>
                )}
                <h1 className={styles.friendsTitle}>End-To-End-Encryption</h1>
                <h2 className={styles.backup}>Backup</h2>
                <p className={styles.backupInfo} >Backing up your key allows you to access your messages from another device if this device is lost or stolen. Without the key you will be unable to access your account if you switch devices.</p>
                <p className={styles.warning}>Do not loose the passkey or you will not be able to access your account</p>
                <button
                    onClick={(e) => setPopup(true)}
                    className={styles.backupButton}
                >
                    Download Backup
                </button>
                <div className={styles.signOutButtonContainer}>
                    <button
                        onClick={() => auth.signOut()}
                        className={styles.signOutButton}
                    >
                        Sign Out
                    </button>
                </div>
            </div>
        </main>
    );
}
