import Image from "next/image";
import { useContext, useReducer } from "react";
import { UserContext } from "../lib/context";
import { useRequests } from "../lib/hooks";
import styles from "../styles/add.module.css";
import {
    acceptFriend,
    removeFriend,
    removeRequest,
    submitUsername,
} from "../lib/functions";
 
export function Person({ item }) {
    console.log(item);
    const { user, data } = useContext(UserContext);
    const id = item.id;
    const type = useRequests(user, id, data);

    return (
        <li className={styles.suggestionListItem} key={item.username}>
            <div className={styles.buttonContainer}>
                <button
                    type="button"
                    className={`${styles.suggestionListItemButton} ${styles[type]}`}
                    onClick={(e) => submitUsername(e, item.id, user, data)}
                >
                    <div className={styles.imageContainer}>
                        <Image
                            alt="profileImg"
                            src={item.profileIMG}
                            layout="fill"
                            objectFit="contain"
                            sd
                        />
                        ` `
                    </div>
                    <h2 className={styles.username}>{`@${item.username}`}</h2>
                </button>
                {console.log(type)}
                {type == "disabled" && (
                    <button
                        type="button"
                        onClick={() => removeFriend(item.id, user, data)}
                        className={styles.removeFreind}
                    >
                        Remove Friend
                    </button>
                )}
                {type == "incoming" && (
                    <button
                        type="button"
                        onClick={() => acceptFriend(item.id, user, data)}
                        className={styles.removeFreind}
                    >
                        Accept Friend
                    </button>
                )}
                {type == "outgoing" && (
                    <button
                        type="button"
                        onClick={() => removeRequest(item.id, user)}
                        className={styles.removeFreind}
                    >
                        Stop Friend Request
                    </button>
                )}
            </div>
        </li>
    );
}
