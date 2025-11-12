import { auth, firestore } from "./firebase";
import {
    doc,
    onSnapshot,
    getDoc,
    setDoc,
    query,
    collection,
    where,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import { useCollection } from "react-firebase-hooks/firestore";
import { useAuthState } from "react-firebase-hooks/auth";
import { getMyPrivateKey } from "./e2ee/e2ee";

// Custom hook to read  auth record and user profile doc
export function useUserData() {
    const [user] = useAuthState(auth);
    const [data, setData] = useState(null);

    useEffect(() => {
        // turn off realtime subscription
        let unsubscribe;

        if (user) {
            const ref = doc(firestore, "users", user.uid);
            unsubscribe = onSnapshot(ref, async (doc) => {
                const private_key = await getMyPrivateKey()
                setData({...doc.data(), privateKey: private_key});
            });
        } else {
            setData(null);
        }

        return unsubscribe;
    }, [user]);

    return { user, data };
}

export function useRequests(user, id, data) {
    let isIncoming = false;
    let isOutgoing = false;
    let abled = "enabled";

    const [userOther] = useAuthState(auth);

    const fromUserQ = query(
        collection(firestore, "requests"),
        where("from", "==", user.uid),
        where("to", "==", id)
    );
    const toUserQ = query(
        collection(firestore, "requests"),
        where("from", "==", id),
        where("to", "==", user.uid)
    );

    const [fromUser, fromUserLoading, fromUserError] = useCollection(fromUserQ);
    const [toUser, toUserLoading, toUserError] = useCollection(toUserQ);

    fromUser &&
        fromUser.docs.map(() => {
            isOutgoing = true;
        });
    toUser &&
        toUser.docs.map(() => {
            isIncoming = true;
        });

    if (data.friends.includes(id)) {
        abled = "disabled";
    } else if (isIncoming) {
        abled = "incoming";
    } else if (isOutgoing) {
        abled = "outgoing";
    } else {
        abled = "enabled";
    }
    return abled;
}
