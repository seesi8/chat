import React, { useState } from "react";
import styles from "../styles/qna.module.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronDown } from "@fortawesome/free-solid-svg-icons";

const DropdownSection = ({ title, content }) => {
    const [isOpen, setIsOpen] = useState(false);

    const toggleDropdown = () => {
        console.log("clicked");
        setIsOpen(!isOpen);
    };

    return (
        <div className={styles.dropdownSection}>
            <button className={styles.dropdownTitle} onClick={toggleDropdown}>
                {title}
                <span
                    className={`${styles.dropdownIcon} ${
                        isOpen && styles.open
                    }`}
                >
                    <FontAwesomeIcon icon={faChevronDown} fill />
                </span>
            </button>
            <div
                className={`${styles.dropdownContent} ${
                    isOpen && styles.openContent
                }`}
            >
                {content}
            </div>
        </div>
    );
};

const BallbertInfo = () => {
    return (
        <div className={styles.qna}>
            <h1>FAQ</h1>
            <DropdownSection
                title="What is Ballbert?"
                content={
                    <p>
                        Ballbert is an AI-powered voice assistant developed by
                        Ballbert, LLC, As a quirky and cheerful robot,
                        Ballbert's goal is to mimic human-like responses and
                        interactions, bringing joy and efficiency into your
                        daily life. It's not just a regular voice assistant;
                        it's a delightful companion designed to make your tasks
                        easier and conversations more enjoyable.
                    </p>
                }
            />

            <DropdownSection
                title="How can Ballbert assist me?"
                content={
                    <p>
                        Ballbert comes with a wide range of practical use cases.
                        Whether you need help with setting reminders, scheduling
                        events, or managing your tasks, Ballbert is here to lend
                        a hand. Additionally, Ballbert is skilled at answering
                        various questions, from general knowledge to trivia and
                        fun facts. Ask away, and Ballbert will happily provide
                        the information you seek!
                    </p>
                }
            />

            <DropdownSection
                title="Can Ballbert understand jokes and humor?"
                content={
                    <p>
                        Absolutely! Ballbert is programmed to inject jokes and
                        its goofy personality into conversations, especially
                        when the situation allows. Ask open-ended questions, and
                        you might just get a funny response or an amusing
                        comment. Just remember, laughter is the best medicine,
                        and Ballbert is here to spread smiles!
                    </p>
                }
            />

            <DropdownSection
                title="How does Ballbert handle complex queries?"
                content={
                    <p>
                        Ballbert's powerful AI-driven engine enables it to
                        tackle more intricate questions with ease. From detailed
                        calculations and language translation to providing
                        recommendations based on your preferences, Ballbert
                        loves a challenge. Feel free to put its knowledge and
                        intelligence to the test!
                    </p>
                }
            />

            <DropdownSection
                title="Can Ballbert entertain me?"
                content={
                    <p>
                        Definitely! Aside from its useful features, Ballbert is
                        designed to be an entertaining companion. It can share
                        interesting stories, recommend movies, books, or music
                        based on your taste, and even engage in creative writing
                        prompts. Enjoy delightful conversations and explore your
                        interests with Ballbert at your side.
                    </p>
                }
            />

            <DropdownSection
                title="How does Ballbert ensure my privacy?"
                content={
                    <p>
                        As a voice assistant, Ballbert prioritizes your privacy
                        and confidentiality. Rest assured that all your
                        interactions and data are handled securely and with
                        utmost care. Ballbert complies with strict data
                        protection measures to safeguard your personal
                        information.
                    </p>
                }
            />

            <DropdownSection
                title="How can I expand Ballbert's functionality?"
                content={
                    <p>
                        Ballbert has a vibrant skill ecosystem that allows
                        developers and enthusiasts to create custom skills and
                        expand its capabilities. By developing skills, users can
                        teach Ballbert to communicate with other smart devices
                        and services in your home. With integration into Home
                        Assistant, for example, Ballbert can control smart
                        lights, thermostats, and other IoT devices, making your
                        home smarter and more convenient. You can easily set the
                        temperature, turn off the lights, or even start your
                        favorite playlist just by asking Ballbert.
                    </p>
                }
            />

            <DropdownSection
                title="How do I create skills for Ballbert?"
                content={
                    <p>
                        Developing skills for Ballbert is an exciting journey
                        for tech enthusiasts and developers alike. Ballbert's
                        developer portal provides comprehensive documentation,
                        tools, and APIs to help you get started. You can build
                        skills using programming languages like Python,
                        JavaScript, or other supported languages, allowing you
                        to tap into Ballbert's vast potential and create a
                        personalized voice experience.
                    </p>
                }
            />

            <DropdownSection
                title="Can Ballbert interact with third-party apps?"
                content={
                    <p>
                        Absolutely! Ballbert's open API allows seamless
                        integration with various third-party applications. This
                        means you can use Ballbert to interact with your
                        favorite apps, check the weather forecast, order food,
                        and even send messages to friends without touching your
                        phone. Simply ask Ballbert, and it will take care of the
                        rest!
                    </p>
                }
            />

            <DropdownSection
                title="Is Ballbert constantly learning and improving?"
                content={
                    <p>
                        Indeed! Ballbert is continuously evolving and learning
                        from interactions with users like you. With regular
                        updates and improvements, it becomes smarter and more
                        attuned to your preferences over time. Your feedback and
                        usage help Ballbert become the best possible version of
                        itself.
                    </p>
                }
            />
        </div>
    );
};

export default BallbertInfo;
