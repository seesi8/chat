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

export default function Profile({}) {
    const incrimentValue = 3;

    const { user, data } = useContext(UserContext);
    const [friends, setFriends] = useState([]);
    const [currentFriends, setCurrentFriends] = useState(friends);
    const [friendsNumber, setFriendsNumber] = useState(incrimentValue);

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
        user && data && getData();
    }, [data, user]);

    useEffect(() => {
        setCurrentFriends(friends.slice(0, friendsNumber));
    }, [friends, friendsNumber]);

    if (!user) {
        return <Login />;
    }

    return (
        <main className={styles.main}>
            <div className={styles.container}>
                <div className={styles.profileImageContainerContainer}>
                    <div className={styles.profileImageContainer}>
                        <img
                            className={styles.profileImage}
                            src={data && data.profileIMG}
                        />
                    </div>
                </div>
                <h1 className={styles.displayName}>
                    {data && data.displayName}
                </h1>
                <p className={styles.username}>@{data && data.username}</p>
                <hr />
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
                <hr />
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
