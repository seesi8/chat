import { useState } from "react";
import styles from "../styles/create.module.css";
import { auth, firestore } from "../lib/firebase";
import { createUserWithEmailAndPassword } from "firebase/auth";
import toast from "react-hot-toast";
import { v4 as uuidv4 } from "uuid";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import {
    doc,
    limit,
    orderBy,
    setDoc,
    getDocs,
    collection,
    query,
    where,
    writeBatch,
} from "firebase/firestore";
import { useRouter } from "next/router";
import { generateAndStoreX25519Keypair } from "../lib/e2ee/e2ee";

function uploadImage(e, setStoreageUrl) {
    e.preventDefault();

    const storage = getStorage();
    const storageRef = ref(storage, uuidv4());

    const file = Array.from(e.target.files)[0];

    // 'file' comes from the Blob or File API
    uploadBytes(storageRef, file).then((snapshot) => {
        getDownloadURL(snapshot.ref).then((url) => {
            setStoreageUrl(url);
        });
    });
}

export default function Create({}) {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [displayName, setDisplayName] = useState("");
    const [storageUrl, setStoreageUrl] = useState("");
    const router = useRouter();

    const submit = async (e) => {
        e.preventDefault();
        if (!storageUrl) {
            toast.error("No Profile Picture");
            return;
        }
        createUserWithEmailAndPassword(auth, email, password)
            .then(async (userCredential) => {
                // Signed in
                const userUID = userCredential.user.uid;
                const usersRef = collection(firestore, "users");
                const q = query(
                    usersRef,
                    where("displayName", "==", displayName),
                    orderBy("username", "asc", limit(1))
                );
                const querySnapshot = await getDocs(q);

                const publicRaw = await generateAndStoreX25519Keypair()
                const publicB64 = btoa(String.fromCharCode(...publicRaw)); // or your b64(u8) helper

                let username = "";
                if (querySnapshot.docs.length == 0) {
                    console.log("no username");
                    username = displayName;
                } else {
                    console.log(querySnapshot);
                    querySnapshot.forEach((doc) => {
                        console.log(doc.data());
                        let index = doc.data().username.split(displayName)[1];
                        if (index == "") {
                            console.log(doc.id, displayName);
                            index = "0";
                        }

                        username = displayName.concat(
                            (parseInt(index) + 1).toString()
                        );
                    });
                }
                const batch = writeBatch(firestore);
                batch.set(doc(firestore, "users", userUID), {
                    displayName: displayName,
                    username: username,
                    profileIMG: storageUrl,
                    email: email,
                    creationDate: new Date(),
                    lastActive: new Date(),
                    publicKey: publicB64, 
                    friends: [],
                });
                batch.set(doc(firestore, "usernames", username), {
                    uid: userUID,
                });

                await batch.commit();
                router.push("/");
            })
            .catch((error) => {
                const errorCode = error.code;
                const errorMessage = error.message;
                console.log(error);
                if (errorCode.includes("email-already-in-use")) {
                    toast.error("Invalid Email");
                    return;
                }
                if (errorCode.includes("email")) {
                    toast.error("Invalid Email");
                    return;
                } else if (errorCode.includes("password")) {
                    toast.error("Invalid Password");
                    return;
                } else {
                    toast.error("Invalid Info");
                }
                console.log(errorCode);
                return;
            });
    };

    return (
        <main>
            <form onSubmit={(e) => submit(e)} className={styles.inputContainer}>
                <label className={styles.label}>Create Account</label>
                <input
                    placeholder="Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={styles.input}
                />
                <input
                    type="password"
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={styles.input}
                />
                <input
                    placeholder="Display Name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className={styles.input}
                />
                <label className={styles.label}>Profile Picture</label>
                <input
                    className={styles.input}
                    type="file"
                    onChange={(e) => uploadImage(e, setStoreageUrl)}
                    accept=".gif,.jpg,.jpeg,.png"
                />
                <label className={styles.label}>Submit</label>
                <button
                    disabled={storageUrl ? false : true}
                    className={styles.button}
                >
                    Submit
                </button>
            </form>
        </main>
    );
}
