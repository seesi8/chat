// pages/api/tts.js
import axios from "axios";
import * as admin from "firebase-admin";
import { TextToSpeechClient } from "@google-cloud/text-to-speech";

const serviceAccount = JSON.parse(process.env.GOOGLE);

console.log(serviceAccount);

const ttsClient = new TextToSpeechClient({
    credential: admin.credential.cert(serviceAccount),
});

export default async function handler(req, res) {
    const { phrase } = req.body;

    try {
        const [response] = await ttsClient.synthesizeSpeech({
            input: { text: phrase },
            voice: { languageCode: "en-US", name: "en-US-Wavenet-D" }, // Replace with desired voice if needed
            audioConfig: { audioEncoding: "MP3" }, // You can choose other audio encodings like LINEAR16 or MP3
        });

        const audioBuffer = response.audioContent;
        res.setHeader("Content-Type", "audio/mpeg");
        res.send(audioBuffer);
    } catch (error) {
        console.error("Error occurred during TTS:", error);
        res.status(500).json({ error: "Something went wrong" });
    }
}
