import styles from "../styles/popup.module.css";
import Image from "next/image";
import { useEffect, useContext, useState } from "react";
import { firestore } from "../lib/firebase";
import { collection, query, where } from "firebase/firestore";
import { UserContext } from "../lib/context";
import { uuidv4 } from "@firebase/util";
import {
    doc,
    getDoc,
    setDoc,
    getDocs,
    orderBy,
    limit,
    writeBatch,
} from "firebase/firestore";
import { FaTimes } from "react-icons/fa";

export default function Popup({ setPopup }) {
    const { user, data } = useContext(UserContext);
    const [members, setMembers] = useState([
        { uid: user.uid, username: data.username },
    ]);
    const [groupName, setGroupName] = useState([]);
    const [currentInput, setCurrentInput] = useState("");
    const [friends, setFriends] = useState([]);
    const [suggestions, setSuggestion] = useState([]);

    function contains(list, element) {
        return list.some((elem) => {
            return JSON.stringify(element) === JSON.stringify(elem);
        });
    }

    const getData = async () => {
        const docSnap = await getDoc(doc(firestore, "users", user.uid));
        let docData = docSnap.data();
        docData.id = docSnap.id;
        let localFriends = friends;
        for (let i = 0; i < docData.friends.length; i++) {
            console.log(docData.friends[1]);
            const friendDocSnap = await getDoc(
                doc(firestore, "users", docData.friends[i])
            );
            let friendData = friendDocSnap.data();
            friendData.uid = friendDocSnap.id;
            localFriends.push(friendData);
        }
        setFriends(localFriends);
    };

    useEffect(() => {
        getData();
    }, []);

    useEffect(() => {
        console.log(friends)
        setSuggestion([]);
        let currentSuggestions = [];
        for (let i = 0; i < friends.length; i++) {
            if (
                friends[i].username.toLowerCase().includes(currentInput.toLowerCase()) &&
                !friends[i].uid.includes(user.uid)
            ) {
                currentSuggestions.push(friends[i]);
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
            if (
                !contains(members, {
                    uid: suggestions[0].uid,
                    username: suggestions[0].username,
                })
            ) {
                setMembers(
                    members.concat({
                        uid: suggestions[0].uid,
                        username: suggestions[0].username,
                    })
                );
            }
        }
        console.log(members);
        setCurrentInput("");
    };

    const submitMember = (e, item) => {
        e.preventDefault();
        console.log(members);
        console.log(
            contains(members, { uid: item.uid, username: item.username })
        );
        console.log({ uid: item.uid, username: item.username });
        if (!contains(members, { uid: item.uid, username: item.username })) {
            console.log(members);
            console.log(
                contains(members, { uid: item.uid, username: item.username })
            );
            console.log({ uid: item.uid, username: item.username });
            setMembers(
                members.concat({ uid: item.uid, username: item.username })
            );
        }
        setCurrentInput("");
    };

    const removeMember = (e, item) => {
        e.preventDefault();
        if (contains(members, { uid: item.uid, username: item.username })) {
            setMembers(
                members.filter(_item => _item.uid !== item.uid)
            );
        }
        setCurrentInput("");
    };

    const createGroup = async () => {
        const groupId = uuidv4();
        if (groupName == "") {
            groupName = "unnamed group";
        }
        let memberUID = [];
        for (let i in members) {
            memberUID.push(members[i].uid);
        }
        console.log(memberUID);
        const batch = writeBatch(firestore);
        batch.set(doc(firestore, "threads", groupId), {
            groupName: groupName.toString(),
            members: memberUID,
            createdAt: new Date(),
            latestMessage: new Date(),
        });
        batch.set(doc(firestore, "threadsId", groupId), {
            id: groupId,
            members: memberUID,
        });
        await batch.commit();
        setPopup(false);
    };

    return (
        <div className={styles.popupContainer}>
            <div className={styles.popup}>
                <button className={styles.x} onClick={() => setPopup(false)}>
                    <FaTimes className={styles.xtext}/>
                </button>
                <h1 className={styles.title}>Create Group</h1>
                <form onSubmit={(e) => submitUsername(e)}>
                    <input
                        placeholder="Group Name"
                        required
                        value={groupName}
                        onChange={(e) => setGroupName(e.target.value)}
                        className={styles.groupName}
                        type="text"
                    />
                    <div className={styles.users}>
                        {members.map((item) => (
                            <div className={styles.memberItem} key={uuidv4()} onClick={(e) => {
                                removeMember(e, item)
                            }}>
                                <p
                                    className={styles.memberUsername}
                                >{`@${item.username}`}</p>
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
                            <li
                                className={styles.suggestionListItem}
                                key={item.username}
                            >
                                <button
                                    type="button"
                                    className={styles.suggestionListItemButton}
                                    onClick={(e) => submitMember(e, item)}
                                >
                                    <div className={styles.imageContainer}>
                                        <Image
                                            src={item.profileIMG}
                                            layout="fill"
                                            objectFit="contain"
                                        />
                                    </div>
                                    <h2
                                        className={styles.username}
                                    >{`@${item.username}`}</h2>
                                </button>
                            </li>
                        ))}
                    </ul>
                </form>
                <button
                    onClick={() => createGroup()}
                    className={styles.createButton}
                >
                    <h1 className={styles.create}>Create</h1>
                </button>
            </div>
        </div>
    );
}
