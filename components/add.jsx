import styles from "../styles/add.module.css";
import Image from 'next/image';
import { useEffect, useContext, useState } from "react";
import { firestore } from "../lib/firebase";
import { collection, query, updateDoc, where } from "firebase/firestore";
import { UserContext } from '../lib/context';
import { async, uuidv4 } from "@firebase/util";
import { doc, getDoc, setDoc, getDocs, orderBy, limit } from "firebase/firestore";
import { removeFriend } from "../lib/hooks";

export default function Add({ setPopup }) {
    const { user, data } = useContext(UserContext);
    const [members, setMembers] = useState([]);
    const [currentInput, setCurrentInput] = useState("");
    const [people, setPeople] = useState([]);
    const [suggestions, setSuggestion] = useState([]);

    const getData = async () => {
        const querySnapshot = await getDocs(query(collection(firestore, "users")));
        const currentMembers = [];
        querySnapshot.forEach((doc) => {
            let docData = doc.data();
            docData.id = doc.id;
            currentMembers.push(docData);
        });
        setPeople(currentMembers);

    };

    useEffect(() => {
        getData();
    }, []);

    useEffect(() => {
        setSuggestion([]);
        let currentSuggestions = [];
        for (let i = 0; i < people.length; i++) {
            if (people[i].username.includes(currentInput)) {
                currentSuggestions.push(people[i]);
            }
        }
        setSuggestion(currentSuggestions);
        if (currentInput == "") {
            setSuggestion([]);
        }
        console.log(suggestions);
    }, [currentInput]);

    const submitUsername = (e) => {
        e.preventDefault();
        if (suggestions[0] != undefined) {
            if (data.friends.includes(suggestions[0].id) == false) {
                const userRef = doc(firestore, 'users', user.uid);
                updateDoc(userRef, { friends: data.friends.concat(suggestions[0].id) });
            }
        }
    };

    const submitFriend = async (e, id) => {
        console.log("Cool");
        e.preventDefault();
        if (data.friends.includes(id) == false) {
            const userRef = doc(firestore, 'users', user.uid);
            await updateDoc(userRef, { friends: data.friends.concat(id) });

        }
        console.log(data);
    };

    return (
        <div className={styles.popupContainer}>
            <div className={styles.popup}>
                <button className={styles.x} onClick={() => setPopup(false)}>
                    <Image src="/close.png" width={40} height={40} />
                </button>
                <h1 className={styles.title}>Add Friend</h1>
                <form onSubmit={(e) => submitUsername(e)}>
                    <div className={styles.users}>
                        {
                            members.map((item) =>
                                <div className={styles.memberItem} key={uuidv4()}>
                                    <p className={styles.memberUsername}>{`@${item}`}</p>
                                </div>)
                        }
                        <input placeholder="Member Username" value={currentInput} onChange={(e) => setCurrentInput(e.target.value)} className={styles.usersType} type="text" />
                    </div>
                    <ul className={styles.members}>
                        {
                            suggestions.map((item) =>
                                <li className={styles.suggestionListItem} key={item.username}>
                                    <div className={styles.buttonContainer}>
                                        <button disabled={data.friends.includes(item.id)} type="button" className={styles.suggestionListItemButton} onClick={(e) => submitFriend(e, item.id)} >
                                            <div className={styles.imageContainer}>
                                                <Image src={item.profileIMG} layout="fill" objectFit='contain' />
                                            </div>
                                            <h2 className={styles.username}>{`@${item.username}`}</h2>
                                        </button>
                                        {data.friends.includes(item.id) && <button type="button" onClick={() => removeFriend(item.id, user, data)} className={styles.removeFreind}>Remove Friend</button>}
                                    </div>
                                </li>)
                        }
                    </ul>
                </form>
            </div>
        </div>
    );
}


