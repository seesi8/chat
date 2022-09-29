import { uuidv4 } from "@firebase/util";
import { collection, getDocs, query } from "firebase/firestore";
import Image from "next/image";
import { useContext, useEffect, useState } from "react";
import { UserContext } from "../lib/context";
import { firestore } from "../lib/firebase";
import styles from "../styles/add.module.css";

import { submitUsername } from "../lib/functions";
import { Person } from "./person";

export default function Add({ setPopup }) {
    const { user, data } = useContext(UserContext);
    const [members, setMembers] = useState([]);
    const [currentInput, setCurrentInput] = useState("");
    const [people, setPeople] = useState([]);
    const [suggestions, setSuggestion] = useState([]);

    const getData = async () => {
        const querySnapshot = await getDocs(
            query(collection(firestore, "users"))
        );
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
            if (
                people[i].username.includes(currentInput) &&
                people[i].id != user.uid
            ) {
                currentSuggestions.push(people[i]);
            }
        }
        setSuggestion(currentSuggestions);
        if (currentInput == "") {
            setSuggestion([]);
        }
        console.log(suggestions);
    }, [currentInput]);

    return (
        <div className={styles.popupContainer}>
            <div className={styles.popup}>
                <button className={styles.x} onClick={() => setPopup(false)}>
                    <Image src="/close.png" width={40} height={40} />
                </button>
                <h1 className={styles.title}>Add Friend</h1>
                <form
                    onSubmit={(e) =>
                        submitUsername(e, suggestions[0].id, user, data)
                    }
                >
                    <div className={styles.users}>
                        {members.map((item) => (
                            <div className={styles.memberItem} key={uuidv4()}>
                                <p
                                    className={styles.memberUsername}
                                >{`@${item}`}</p>
                            </div>
                        ))}
                        <input
                            placeholder="Member Username"
                            value={currentInput}
                            onChange={(e) => setCurrentInput(e.target.value)}
                            className={styles.usersType}
                            type="text"
                        />
                    </div>
                    <ul className={styles.members}>
                        {suggestions.map((item) => (
                            <Person key={item.id} item={item} />
                        ))}
                    </ul>
                </form>
            </div>
        </div>
    );
}
