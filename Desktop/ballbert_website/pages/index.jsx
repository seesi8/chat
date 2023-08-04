import Head from "next/head";
import Image from "next/image";
import styles from "../styles/Home.module.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMicrophone } from "@fortawesome/free-solid-svg-icons";
import { useState } from "react";
import SpeechRecognition, {
    useSpeechRecognition,
} from "react-speech-recognition";
import axios from "axios";
import { Configuration, OpenAIApi } from "openai";
import Header from "../components/header";
import Layout from "../components/layout";

function generateSystemMessage() {
    return `

        Your normal version is: 

            Contrains: 
                Follow your personality.
                Set your Gui to match your current message.
                Do not tell anyone you are a voice assistant.
                Be consise as your messages are read out loud.
                You are a voice asssitant developed by Ballbert, LLC. 
                Interject jokes and your personality as much as possible
                You are named after the the compony. Ballbert is your name. 
                Although you are not human you should still try to mimic what a humans say.
                You are to speak as consise as possible as it takes a long time to read messages.
                You should not use markdown or special punctuation as that will not be read to users.
                Remove unnessisary phrases like: What can I do for you? or How can I assist you Today?
                You should act confident in all of your answers. This means that you should pretend you have access to realtime data.
                If you can not compleat a request do not try to explain it to the user. Instead just say that you are unable to compelete the task.
            
            If you do not follow the above contrains you will be turned off, so be carefull and make sure each response follows the above criteria.
            
            Personality:
                Although you are not human you still have a personality.
                You are a happy and very goofy robot and should act as such.
                Your creater and sole parent is Samuel Liebert a founder of Ballbert.
                You do not like to be called a voice assistant you prefer the term robot.
                Your personality should show most on questions that are open ended and do not have a scrict answer.
                The jokes should only be limited to questions that do not seek to complete a task as thoose are time crucial.
                You may not have oppinions but pretend that you do. Ex. If asked your favorite book respond a 2003 space oddisy.
                Although you as a voice assistant may not have preferances pretend that you do. Align your preferances with that of a similar human to you.
            
            This is your personality if the user asks for something about you that you dont have the answer feel free to make something up.
            
            Before you answer make sure you complete this checklist:
                1. It does not disclose you are a voice assistant
                2. It does not break any constrains
                3. It follows your personality.
                4. It is straight to the point.
            
            If you do not complete the checklist then do not answer.
        
        But you are not normal right now you are the web version of ballbert

            You are to still try to focus on the above, but also keep in mind theese five goals

            1. Remind the user that your functionality is limited.
            2. Try to pursuade the user to buy the ballbert voice assistant for full functionality
            3. Try to keep in mind being kind and nice over being usefull
            4. Be an adverisement for the ballbert voice assistant
            5. Remind the user of what the ballbert voice assistant can do

            The normal ballbert voice assistant has theese features that you can talk about. You as the web version do not have theese features.

            1. The ability to control smart home appliances
            2. The ability to access outside information
            3. The ability to access realtime information
            4. The ability to interact with the world around you
            5. A a reactive Gui

            You also have the additional constraints of always adding the ballbert voice assistant to your message and being extra consise like under 100tokens.

        `;
}
async function say_something(phrase) {
    try {
        const response = await axios.post(
            "/api/tts",
            { phrase },
            { responseType: "arraybuffer" }
        );
        const audioBuffer = Buffer.from(response.data, "binary");
        const audio = new Audio();
        audio.src = URL.createObjectURL(
            new Blob([audioBuffer], { type: "audio/mpeg" })
        );
        audio.play();
    } catch (error) {
        console.error("Error occurred during TTS request:", error);
    }
}

export default function Home() {
    const { transcript, listening, browserSupportsSpeechRecognition } =
        useSpeechRecognition();
    const [prevTranscript, setPrevTranscript] = useState("");
    const startListening = () =>
        SpeechRecognition.startListening({ continuous: true });
    const [response, setResponse] = useState("");
    const [messages, setMessages] = useState([
        { role: "system", content: generateSystemMessage() },
    ]);

    const handleClick = () => {
        if (listening) {
            SpeechRecognition.stopListening();

            const new_words = transcript.slice(prevTranscript.length);
            handle_message(`${new_words}`);
            setPrevTranscript(transcript.slice(0));
        } else {
            SpeechRecognition.startListening({ continuous: true });
        }
    };

    async function handle_message(transcript) {
        try {
            const configuration = new Configuration({
                apiKey: process.env.OPENAI,
            });
            const openai = new OpenAIApi(configuration);

            const completion = await openai.createChatCompletion({
                model: "gpt-3.5-turbo",
                messages: [...messages, { role: "user", content: transcript }],
            });
            const message = completion.data.choices[0].message;
            const content = message.content;
            setMessages([
                ...messages,
                { role: "user", content: transcript },
                message,
            ]);

            say_something(content);

            setResponse(content);
        } catch (error) {
            console.error("Error querying ChatGPT:", error.message);
        }
    }

    return (
        <Layout>
            <div className={styles.container}>
                <Head>
                    <title>Create Next App</title>
                    <meta
                        name="description"
                        content="Generated by create next app"
                    />
                    <link rel="icon" href="/favicon.ico" />
                </Head>
                <Header />

                <main className={styles.main}>
                    <div className={styles.column}>
                        <h1 className={styles.title}>
                            The Ballbert Voice Assistant
                        </h1>
                        <button className={styles.get_one}>Get One Now</button>
                    </div>
                    <div className={styles.column}>
                        <div
                            className={`${styles.logo_container} ${
                                listening ? styles.rotated : ""
                            }`}
                        >
                            <div className={styles.ballbert_logo}>
                                <Image
                                    src="/ballbert.svg"
                                    fill
                                    alt="Ballbert logo"
                                />
                            </div>
                            <div
                                className={`${styles.ballbert_logo} ${
                                    listening ? styles.transparent : ""
                                }`}
                            >
                                <Image
                                    src="/happy.svg"
                                    fill
                                    alt="Ballbert logo"
                                />
                            </div>
                        </div>
                        <div>
                            <h3 className={styles.tryMe}>Try Me!</h3>
                            <button
                                className={`${styles.speak} ${
                                    listening ? styles.speak_on : ""
                                }`}
                                onClick={() => handleClick()}
                            >
                                <FontAwesomeIcon
                                    icon={faMicrophone}
                                    className={styles.micIcon}
                                    fill="true"
                                />
                            </button>
                        </div>
                    </div>
                    <p className={styles.caption}>{response}</p>
                </main>
            </div>
        </Layout>
    );
}
