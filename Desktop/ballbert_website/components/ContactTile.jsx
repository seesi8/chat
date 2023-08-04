import React, { useState } from "react";
import styles from "../styles/tile.module.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

const ContactTile = ({ icon, front, back, type }) => {
    const [isFlipped, setFlipped] = useState(false);

    const handleFlip = () => {
        setFlipped(!isFlipped);
    };

    return (
        <div
            className={`${styles.tile} ${isFlipped ? styles.flipped : ""}`}
            onClick={handleFlip}
        >
            <div className={styles.inner}>
                <div className={styles.front}>
                    <div className={styles.icon}>
                        <FontAwesomeIcon icon={icon} fill />
                    </div>
                    {front}
                </div>
                <div className={styles.back}>
                    <a
                        href={
                            type == "email"
                                ? `mailto:${back}`
                                : type == "phone"
                                ? `tel:${back}`
                                : back
                        }
                    >
                        {back}
                    </a>
                </div>
            </div>
        </div>
    );
};

export default ContactTile;
