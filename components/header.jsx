import styles from "../styles/header.module.css";
import Image from "next/image";
import Popup from "../components/popup";
import Link from "next/link";
import Add from "../components/add";
import { useState, useContext } from "react";
import { UserContext } from "../lib/context";

export default function Header({}) {
    const [popup, setPopup] = useState(false);
    const [add, setAdd] = useState(false);
    const { user, data } = useContext(UserContext);

    return (
        <>
            {popup && <Popup setPopup={setPopup} />}
            {add && <Add setPopup={setAdd} />}
            <main className={styles.header}>
                <Link href={"/"}>
                    <a>
                        <Image src="/home.png" width="50" height="50" />
                    </a>
                </Link>
                {user && (
                    <>
                        <button
                            onClick={() => (
                                setPopup(popup ? false : true), setAdd(false)
                            )}
                            className={styles.new}
                        >
                            <Image src="/tabs.png" width="50" height="50" />
                        </button>
                        <div className={styles.profile}>
                            <Link href={"/profile"}>
                                <a>
                                    <Image
                                        src={
                                            data
                                                ? data.profileIMG
                                                : "/close.png"
                                        }
                                        width="50"
                                        height="50"
                                    />
                                </a>
                            </Link>
                        </div>
                        <button
                            onClick={() => (
                                setAdd(add ? false : true), setPopup(false)
                            )}
                            className={styles.plus}
                        >
                            <Image src="/plus.png" width="50" height="50" />
                        </button>
                    </>
                )}
            </main>
        </>
    );
}
