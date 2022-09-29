import {
    collection,
    deleteDoc,
    query,
    updateDoc,
    where,
    writeBatch,
} from "firebase/firestore";
import { UserContext } from "../lib/context";
import { async, uuidv4 } from "@firebase/util";
import {
    doc,
    getDoc,
    setDoc,
    getDocs,
    orderBy,
    limit,
} from "firebase/firestore";
import { firestore } from "../lib/firebase";

export async function removeFriend(friendId, user, userData) {
    const userRef = doc(firestore, "users", user.uid);
    const otherFriend = doc(firestore, "users", friendId);
    let userFreinds = userData.friends;
    let friendFriends = (await getDoc(otherFriend)).data().friends;
    var filteredFriends = userFreinds.filter((item) => item !== friendId);
    var freindsFilteredFriends = friendFriends.filter(
        (item) => item !== user.uid
    );
    await setDoc(userRef, { friends: filteredFriends }, { merge: true });
    await setDoc(
        otherFriend,
        { friends: freindsFilteredFriends },
        { merge: true }
    );
}

export async function acceptFriend(id) {
    const batch = writeBatch(firestore);
    batch.delete(doc(firestore, "requests", `from${id}to${user.uid}`));
    batch.update(doc(firestore, "users", user.uid), {
        friends: data.friends.concat(id),
    });
    const thierFriends = (await getDoc(doc(firestore, "users", id))).data()
        .friends;
    console.log(thierFriends.concat(user.uid));
    batch.update(doc(firestore, "users", id), {
        friends: thierFriends.concat(user.uid),
    });
    batch.commit();
}

export async function submitUsername(e, id, user, data) {
    e.preventDefault();
    if (id != undefined) {
        let isOpen = false;
        const fromUser = await getDocs(
            query(
                collection(firestore, "requests"),
                where("from", "==", user.uid),
                where("to", "==", id)
            )
        );
        const toUser = await getDocs(
            query(
                collection(firestore, "requests"),
                where("from", "==", id),
                where("to", "==", user.uid)
            )
        );
        fromUser.forEach((doc) => {
            isOpen = true;
        });
        toUser.forEach((doc) => {
            isOpen = true;
        });
        console.log(isOpen);
        if (data.friends.includes(id) == false && !isOpen) {
            console.log("now");
            const requestRef = doc(
                firestore,
                "requests",
                `from${user.uid}to${id}`
            );
            setDoc(requestRef, {
                from: user.uid,
                to: id,
            });
            return true;
            //const userRef = doc(firestore, 'users', user.uid);
            // await updateDoc(userRef, { friends: data.friends.concat(suggestions[0].id) });
        }
    }
    return false;
}

export async function removeRequest(id, user) {
    await deleteDoc(doc(firestore, "requests", `from${user.uid}to${id}`));
    console.log("thing");
}
