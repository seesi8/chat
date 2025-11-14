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

export default function Backup({ setPopup, makeBackup, already }) {
    const { user, data } = useContext(UserContext);
    const [currentInput, setCurrentInput] = useState("");


    return (
        <div className={styles.popupContainer}>
            <div className={styles.popup}>
                <button className={styles.x} onClick={() => setPopup(false)}>
                    <FaTimes className={styles.xtext} />
                </button>
                <h1 className={styles.title}>Create Backup</h1>
                <form>


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
                    <p className={styles.des}>Select a unique passphrase. <b>Do not lose the passphrase</b> or else you will not be able to access your account.</p>
                    <p className={styles.des}>We recommend storing the passphrase somewhere secure such as a password manager.</p>
                    <p className={styles.des}>A good passphrase is multiple words or phrases.</p>
                    <p className={styles.des}>{"For example: \"The quick brown fox jumps over the lazy dog.\""}</p>

                </form>
                <button
                    onClick={() => makeBackup(currentInput)}
                    className={styles.createButton}
                >
                    <h1 className={styles.create}>Create</h1>
                </button>
            </div>
        </div>
    );
}
