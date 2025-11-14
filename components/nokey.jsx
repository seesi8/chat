import styles from "../styles/backup.module.css";
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

export default function NoKey({ setPopup, makeBackup, already }) {
    const { user, data } = useContext(UserContext);
    const [currentInput, setCurrentInput] = useState("");


    return (
        <div className={styles.popupContainer}>
            <div className={styles.popup}>
                <h1 className={styles.title}>Lost your key?</h1>
                <form>
                    <p className={styles.des}>No encryption key was detected on your device. You can recover your account using the passphrase you provided during backup. <b>Please enter your passphrase below.</b></p>
                    <p className={styles.des}>Your passphrase should be multiple words or phrases.</p>
                    <p className={styles.des}>{"For example: \"The quick brown fox jumps over the lazy dog.\""}</p>

 
                    <div className={styles.users}>

                        <input
                            placeholder="Passphrase"
                            value={currentInput}
                            className={styles.usersType}
                            onChange={(e) => setCurrentInput(e.target.value)}
                            type="text"
                            required={true}
                        />
                    </div>
                    {
                        already ?
                            <p className={styles.already}>A backup already exists for your account. <b>Click Create again to replace it</b></p>
                            : ""
                    }

                </form>
                <button
                    onClick={() => makeBackup(currentInput)}
                    className={styles.createButton}
                >
                    <h1 className={styles.create}>Restore</h1>
                </button>
            </div>
        </div>
    );
}
