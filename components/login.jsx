import styles from "../styles/login.module.css";
import { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../lib/firebase";
import toast from "react-hot-toast";
import Link from "next/link";
import { setDoc } from "firebase/firestore";

export default function Login({}) {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");

    const submit = async (e) => {
        e.preventDefault();

        signInWithEmailAndPassword(auth, email, password)
            .then(async (userCredential) => {
                const userUID = userCredential.user.uid;
                toast.success("Signed In");

                await setDoc(
                    doc(firestore, "users", userUID),
                    {
                        lastActive: new Date(),
                    },
                    { merge: true }
                );
            })
            .catch((error) => {
                const errorCode = error.code;
                const errorMessage = error.message;
                console.log(error);
                if (errorMessage.includes("wrong-password")) {
                    toast.error("Wrong Password");
                } else if (errorMessage.includes("invalid-email")) {
                    toast.error("Invalid Email");
                } else if (errorMessage.includes("too-many-requests")) {
                    toast.error("Too Many Tries. Try Again Later");
                } else if (errorMessage.includes("auth/user-not-found")) {
                    toast.error("User Does Not Exist");
                } else {
                    //toast.error("Error");
                }
            });
    };

    return (
        <main>
            <form onSubmit={(e) => submit(e)} className={styles.inputContainer}>
                <label className={styles.label}>Login To Account</label>
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
                <button className={styles.button}>Submit</button>
                <Link href="/create">
                    <h3 className={styles.create}>Create Account</h3>
                </Link>
            </form>
        </main>
    );
}
