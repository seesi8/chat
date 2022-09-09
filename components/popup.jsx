import styles from "../styles/popup.module.css"
import Image from 'next/image'
import { useEffect, useContext, useState } from "react"
import { firestore } from "../lib/firebase"
import { collection, query, where } from "firebase/firestore";
import { UserContext } from '../lib/context'
import { uuidv4 } from "@firebase/util"
import { doc, getDoc, setDoc, getDocs, orderBy, limit } from "firebase/firestore"

export default function Page({ setPopup }) {
    const { user, data } = useContext(UserContext)
    const [members, setMembers] = useState([data.username])
    const [groupName, setGroupName] = useState([])
    const [currentInput, setCurrentInput] = useState("")
    const [friends, setFriends] = useState([])
    const [suggestions, setSuggestion] = useState([])

    const getData = async () => {
        const docSnap = await getDoc(doc(firestore, "users", user.uid));
        let docData = docSnap.data();
        docData.id = docSnap.id
        let localFriends = friends
        for (let i = 0; i < docData.friends.length; i++) {
            console.log(docData.friends[1])
            const friendDocSnap = await getDoc(doc(firestore,"users", docData.friends[i]));
            localFriends.push(friendDocSnap.data())
        }
        setFriends(localFriends)
    }

    useEffect(() => {
        getData();
    }, [])

    useEffect(() => {
        setSuggestion([])
        let currentSuggestions = []
        for (let i = 0; i < friends.length; i++) {
            if (friends[i].username.includes(currentInput)) {
                currentSuggestions.push(friends[i])
            }
        }
        setSuggestion(currentSuggestions)
        if (currentInput == "") {
            setSuggestion([])
        }
        console.log(suggestions)
    }, [currentInput])

    const submitUsername = (e) => {
        e.preventDefault()
        if (suggestions[0] != undefined) {
            if (members.includes(suggestions[0].username) == false) {
                setMembers(members.concat(suggestions[0].username))
            }
        }
        console.log(members)
        setCurrentInput("")
    }

    const submitMember = (e, username) => {
        e.preventDefault()
        if (members.includes(username) == false) {
            setMembers(members.concat(username))
        }
        setCurrentInput("")
    }

    const createGroup = async () => {
        let membersRef = []
        const groupId = uuidv4()
        for (let i = 0; i < members.length; i++) {
            const usersRef = collection(firestore, "users");
            const q = query(usersRef, where("username", "==", members[i]), orderBy("lastActive"), limit(1));
            const querySnapshot = await getDocs(q);

            querySnapshot.forEach(async (item) => {
                const userRef = doc(firestore, "users", item.id);
                membersRef.push(item.id);
                const memberThreads = (await getDoc(userRef)).data().threads; setDoc(userRef, {
                    threads: memberThreads.concat(groupId)
                }, { merge: true })
            });
        }
        setDoc(doc(firestore, "threads", groupId), {
            groupName: groupName,
            members: membersRef,
            createdAt: new Date(),
            messages: [],
            latestMessage: new Date()
        })
        .then(function(){
            console.log("Fin1")
        });
        console.log({
            groupName: groupName,
            members: membersRef,
            createdAt: new Date(),
            messages: [],
            latestMessage: new Date()
        })
        setDoc(doc(firestore, "threadsId", groupId), {
            id: groupId
        })
        .then(function(){
            console.log("Fin")
        });
        setPopup(false)
    }

    return (
        <div className={styles.popupContainer}>
            <div className={styles.popup}>
                <button className={styles.x} onClick={() => setPopup(false)}>
                    <Image src="/close.png" width={40} height={40} />
                </button>
                <h1 className={styles.title}>Create Group</h1>
                <form onSubmit={(e) => submitUsername(e)}>
                    <input placeholder="Group Name" required value={groupName} onChange={(e) => setGroupName(e.target.value)} className={styles.groupName} type="text" />
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
                                    <button type="button" className={styles.suggestionListItemButton} onClick={(e) => submitMember(e, item.username)} >
                                        <div className={styles.imageContainer}>
                                            <Image src={item.profileIMG} layout="fill" objectFit='contain' />
                                        </div>
                                        <h2 className={styles.username}>{`@${item.username}`}</h2>
                                    </button>
                                </li>)
                        }
                    </ul>
                </form>
                <button onClick={() => createGroup()} className={styles.createButton}>
                    <h1 className={styles.create}>Create</h1>
                </button>
            </div>
        </div>
    )
}


