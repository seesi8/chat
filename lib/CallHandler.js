import { getStoredFile, getStoredMessage } from "./e2ee/e2ee";
import { firestore } from "./firebase";
import { MessageHandler } from "./MessageHandler";
import { uuidv4 } from "@firebase/util";
import { doc, getDoc, onSnapshot } from "firebase/firestore";


const SERVERS = {
    iceServers: [
        {
            urls: [
                'stun:stun1.l.google.com:19302',
                'stun:stun2.l.google.com:19302',
            ],
        },
    ],
    iceCandidatePoolSize: 10,
};

export class CallHandler extends MessageHandler {
    pc;

    static MESSAGETYPES = {
        // Calls
        CALL_REQUEST: 0x21,
        CANCEL_CALL_REQUEST: 0x22,
        ACCEPT_CALL_REQUEST: 0x22,
        VIDEO_OFFER: 0x23,
        VIDEO_ANSWER: 0x24,
        NEW_ICE_CANDIDATE: 0x25
    }
    static CALLSTATES = {
        // Calls
        NO_STATE: 0x00,
        CALL_REQUESTED: 0x01,
        INCOMING_CALL: 0x02,
        CALL_ACTIVE: 0x03,
    }

    static isCallType(type) {
        return type > 0x20 && type < 0x30
    }
    static isCallRequestType(type) {
        return type > 0x20 && type < 0x23
    }

    async sendCallRequest() {
        const callId = uuidv4()
        await this.sendTypeWithLock(callId, 0x21)
        return callId
    }

    getOpenCallRequest() {
        const callMessages = this.decryptedMessages.filter((message) => {
            return CallHandler.isCallRequestType(message.type)
        })
        if (callMessages[callMessages.length - 1] && callMessages[callMessages.length - 1].type == CallHandler.MESSAGETYPES.CALL_REQUEST) {
            return callMessages[callMessages.length - 1]
        }
        return;
    }

    isCallActive() {
        const callMessages = this.decryptedMessages.filter((message) => {
            return CallHandler.isCallRequestType(message.type)
        })
        if (callMessages[callMessages.length - 1] && callMessages[callMessages.length - 1].type == CallHandler.MESSAGETYPES.ACCEPT_CALL_REQUEST) {
            return callMessages[callMessages.length - 1]
        }
        return;
    }

    getCallState() {
        const openCallRequest = this.getOpenCallRequest();
        if (openCallRequest && openCallRequest.sentBy.user == this.user.uid) return CallHandler.CALLSTATES.CALL_REQUESTED;
        if (openCallRequest && openCallRequest.sentBy.user != this.user.uid) return CallHandler.CALLSTATES.INCOMING_CALL;
        const callActive = this.isCallActive();
        if(callActive) return CallHandler.CALLSTATES.CALL_ACTIVE
        return CallHandler.CALLSTATES.NO_STATE
    }

    async cancelCallRequest() {
        const openRequest = this.getOpenCallRequest()
        if (openRequest) {
            await this.sendTypeWithLock(`${openRequest.id}`, CallHandler.MESSAGETYPES.CANCEL_CALL_REQUEST)
        }
        else {
            await this.sendTypeWithLock(``, CallHandler.MESSAGETYPES.CANCEL_CALL_REQUEST)
        }
    }

    async acceptCallRequest() {
        console.log("accepting")
        const openRequest = this.getOpenCallRequest()
        console.log(openRequest)
        if (openRequest) {
            await this.sendTypeWithLock(`${openRequest.id}`, CallHandler.MESSAGETYPES.ACCEPT_CALL_REQUEST)
        }
        else {
            await this.sendTypeWithLock(``, CallHandler.MESSAGETYPES.ACCEPT_CALL_REQUEST)
        }

        this.createPC()
        await this.setupWebcam()
        await this.sendCallOffer()
    }


    async setupWebcam() {
        if (!this.pc || this.pc.signalingState == "closed") {
            return;
        }

        const localStream = await navigator.mediaDevices.getUserMedia({
            video: { deviceId: { exact: this.cameraId } },
            audio: true,
        });

        const remoteStream = new MediaStream();

        localStream.getTracks().forEach((track) => {
            if (this.pc.signalingState != "closed") {
                this.pc.addTrack(track, localStream);
            }
        });

        this.pc.ontrack = (event) => {
            event.streams[0].getTracks().forEach((track) => {
                remoteStream.addTrack(track);
            });
        };

        return { localStream, remoteStream };
    };

    createPC() {
        const pc = new RTCPeerConnection(SERVERS);
        this.pc = pc;
        return pc;
    };

    async sendCallOffer() {
        if (!this.pc || this.pc.signalingState == "closed") {
            return;
        }

        const offerDescription = await this.pc.createOffer({ iceRestart: true });
        await this.pc.setLocalDescription(offerDescription);

        this.sendTypeWithLock(
            JSON.stringify({
                type: offerDescription.type,
                sdp: offerDescription.sdp,
            }),
            CallHandler.MESSAGETYPES.VIDEO_OFFER
        );
    };


    async decryptDmMessages(messagesValue) {
        if (!messagesValue) return;

        const thread = (await getDoc(doc(firestore, "threads", this.threadId))).data();

        const currentMessages = messagesValue.docs.map(docSnap => ({
            ...docSnap.data(),
            id: docSnap.id,
            read: false
        }));

        const finalMessages = [];

        for (let messageIndex in currentMessages) {
            let currentMessage = currentMessages[messageIndex];
            let firstTimeDecrypted = false;

            if (CallHandler.isCallType(currentMessage.type)) {
                if (await getStoredMessage(this.threadId, currentMessage.id) === undefined) {
                    firstTimeDecrypted = true;
                }
            }

            const processed = await this.processSingleMessage(
                currentMessages,
                messageIndex,
                finalMessages,
                thread
            );

            if (firstTimeDecrypted) {
                if (CallHandler.isCallType(processed.type)) {
                    console.log(processed)
                }
            }

            if (processed) {
                finalMessages.push(processed);
            }
        }

        return finalMessages;
    }

}