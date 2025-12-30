import toast from "react-hot-toast";
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
    localStream;
    remoteStream;
    pendingCandidates = [];
    active = false;
    callState = CallHandler.CALLSTATES.NO_STATE;
    suppressReconnect = false;
    rebuildInProgress = false;
    onSteamChanges = () => { };

    static MESSAGETYPES = {
        // Calls
        CALL_REQUEST: 0x21,
        CANCEL_CALL_REQUEST: 0x22,
        ACCEPT_CALL_REQUEST: 0x23,
        CLOSE_CALL: 0x24,
        VIDEO_OFFER: 0x25,
        VIDEO_ANSWER: 0x26,
        NEW_ICE_CANDIDATE: 0x27,
        REBUILD_CALL: 0x28
    }
    static CALLSTATES = {
        // Calls
        NO_STATE: 0x00,
        CALL_REQUESTED: 0x01,
        INCOMING_CALL: 0x02,
        CALL_ACTIVE: 0x03,
    }

    constructor(user, userData, threadId, onSteamChanges = () => { }) {
        super(user, userData, threadId);
        this.onSteamChanges = onSteamChanges;
    }

    static isCallType(type) {
        return type > 0x20 && type < 0x30
    }
    static isCallRequestType(type) {
        return type > 0x20 && type < 0x25
    }

    async sendCallRequest() {
        this.active = true;
        const callId = uuidv4()
        await this.sendTypeWithLock(callId, 0x21)
        return callId
    }

    async onCallStateChange() {
        if (this.suppressReconnect) return;
        if (this.callState == CallHandler.CALLSTATES.CALL_ACTIVE && !this.active) {
            this.rebuildCall();
        }
        // if (this.callState != CallHandler.CALLSTATES.NO_STATE) {
        //     await this.shutdownWebcam()
        //     await this.shutdownPc()
        // }
    }

    async rebuildCall() {
        if (this.rebuildInProgress) {
            
            return;
        }
        toast("Call Disconnected. Attemping to Reconnect.", {
            icon: '⚠️'
        })
        this.rebuildInProgress = true;
        try {
            this.active = true;
            this.createPC()
            await this.setupWebcam()
            const offerDescription = await this.setupCallOffer();
            await this.sendTypeWithLock(
                JSON.stringify({
                    type: offerDescription.type,
                    sdp: offerDescription.sdp,
                }),
                CallHandler.MESSAGETYPES.REBUILD_CALL
            );
        } finally {
            this.rebuildInProgress = false;
        }
    }

    getOpenCallRequest(finalMessages = this.decryptedMessages) {
        const callMessages = finalMessages.filter((message) => {
            return CallHandler.isCallRequestType(message.type)
        })
        if (callMessages[callMessages.length - 1] && callMessages[callMessages.length - 1].type == CallHandler.MESSAGETYPES.CALL_REQUEST) {
            return callMessages[callMessages.length - 1]
        }
        return;
    }

    isCallActive(finalMessages = this.decryptedMessages) {
        const callMessages = finalMessages.filter((message) => {
            return CallHandler.isCallRequestType(message.type)
        })
        if (callMessages[callMessages.length - 1] && callMessages[callMessages.length - 1].type == CallHandler.MESSAGETYPES.ACCEPT_CALL_REQUEST) {
            return callMessages[callMessages.length - 1]
        }
        return;
    }

    getCallState(finalMessages = this.decryptedMessages) {
        const openCallRequest = this.getOpenCallRequest(finalMessages);
        if (openCallRequest && openCallRequest.sentBy.user == this.user.uid) return CallHandler.CALLSTATES.CALL_REQUESTED;
        if (openCallRequest && openCallRequest.sentBy.user != this.user.uid) return CallHandler.CALLSTATES.INCOMING_CALL;
        const callActive = this.isCallActive(finalMessages);
        if (callActive) return CallHandler.CALLSTATES.CALL_ACTIVE
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

    async closeCall() {
        
        this.suppressReconnect = true;   // <-- add this

        const callActive = this.isCallActive();
        if (callActive) {
            await this.sendTypeWithLock(`${callActive.id}`, CallHandler.MESSAGETYPES.CLOSE_CALL)
        }
        else {
            await this.sendTypeWithLock(``, CallHandler.MESSAGETYPES.CLOSE_CALL)
        }
        this.callState = CallHandler.CALLSTATES.NO_STATE;
        await this.shutdownWebcam()
        await this.shutdownPc()
    }

    async acceptCallRequest() {
        this.active = true;
        this.suppressReconnect = false;   // <-- add this

        
        const openRequest = this.getOpenCallRequest()
        
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

    async shutdownWebcam() {
        this.active = false;
        this.callState = CallHandler.CALLSTATES.NO_STATE;

        try {
            if (this.localStream) {
                this.localStream.getTracks().forEach(t => t.stop());
                this.localStream = null;
            }

            if (this.remoteStream) {
                this.remoteStream.getTracks().forEach(t => t.stop());
                this.remoteStream = null;
            }
            this.onSteamChanges(null, null);

            if (this.pc && this.pc.connectionState !== "closed") {
                this.pc.getSenders().forEach(sender => {
                    try { this.pc.removeTrack(sender); } catch { }
                });

                this.pc.ontrack = null;
                this.pc.onicecandidate = null;
            }
        } catch (e) {
            console.warn("Shutdown error:", e);
        }
    }


    async shutdownPc() {
        this.active = false;
        this.callState = CallHandler.CALLSTATES.NO_STATE;

        if (this.pc) {
            this.pc.ontrack = null;
            this.pc.onicecandidate = null;

            try { this.pc.close(); } catch { }
            this.pc = null;
        }

        this.pendingCandidates = [];
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

        this.localStream = localStream;
        this.remoteStream = remoteStream;
        this.onSteamChanges(localStream, remoteStream);
        return { localStream, remoteStream };
    };

    createPC() {
        const pc = new RTCPeerConnection(SERVERS);
        this.pc = pc;

        this.pc.onicecandidate = async (event) => {
            if (event.candidate) {
                
                await this.sendTypeWithLock(
                    JSON.stringify(event.candidate.toJSON()),
                    CallHandler.MESSAGETYPES.NEW_ICE_CANDIDATE
                );
            }
        };

        this.pc.onconnectionstatechange = async () => {
            switch (pc.connectionState) {
                case "connected":
                    toast.success("Call Connected")
                    this.active = true;
                    break;

                case "disconnected":
                    toast.error("Connection Failed")
                    await this.shutdownWebcam()
                    await this.shutdownPc()
                    await this.closeCall()
                    break;
                case "failed":
                    toast.error("Connection Failed")
                    await this.shutdownWebcam()
                    await this.shutdownPc()
                    await this.closeCall()
                    break;
                case "closed":
                    toast.success("Call Ended")
                    break;
            }
        };
        return pc;
    };

    async setupCallOffer() {
        if (!this.pc || this.pc.signalingState == "closed") {
            return;
        }

        const offerDescription = await this.pc.createOffer();

        await this.pc.setLocalDescription(offerDescription);
        return offerDescription;
    }

    async sendCallOffer() {
        const offerDescription = await this.setupCallOffer();
        await this.sendTypeWithLock(
            JSON.stringify({
                type: offerDescription.type,
                sdp: offerDescription.sdp,
            }),
            CallHandler.MESSAGETYPES.VIDEO_OFFER
        );
    };
    async setupCallAnswer(callData) {

        if (!this.pc || this.pc.signalingState === "closed") return;

        // ----- Apply remote offer -----
        const offerDesc = new RTCSessionDescription(callData);

        if (!this.pc.remoteDescription ||
            this.pc.remoteDescription.sdp !== offerDesc.sdp) {

            if (this.pc.signalingState === "have-local-offer") {
                await this.pc.setLocalDescription({ type: "rollback" });
            }

            await this.pc.setRemoteDescription(offerDesc);
        }

        if (this.pc.signalingState !== "have-remote-offer") {
            
            return;
        }

        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);

        await this.drainIceQueueIfReady();

        return answer;
    }


    async sendCallAnswer(callData) {

        const answerDesc = await this.setupCallAnswer(callData);

        if (answerDesc === undefined) return;
        await this.sendTypeWithLock(
            JSON.stringify({
                type: answerDesc.type,
                sdp: answerDesc.sdp,
            }),
            CallHandler.MESSAGETYPES.VIDEO_ANSWER
        )

    };


    async handleICECandidate(candidateData) {
        const candidate = new RTCIceCandidate(candidateData);
        this.pendingCandidates.push(candidate);

        await this.drainIceQueueIfReady();
    }

    async drainIceQueueIfReady() {
        if (!this.pc || !this.pc.remoteDescription) return;

        while (this.pendingCandidates.length) {
            const c = this.pendingCandidates.shift();
            try {
                await this.pc.addIceCandidate(c);
            } catch (e) {
                console.warn("Failed to add ICE candidate", e, c);
            }
        }
    }

    async handleAnswer(callData) {
        if (!this.pc.currentRemoteDescription) {
            await this.pc.setRemoteDescription(
                new RTCSessionDescription(callData)
            );
            await this.drainIceQueueIfReady();
        }
    }


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
                if (processed.type == CallHandler.MESSAGETYPES.VIDEO_OFFER) {
                    
                    this.active = true;
                    this.createPC()
                    await this.setupWebcam()
                    this.sendCallAnswer(JSON.parse(processed.message));
                }
                else if (processed.type == CallHandler.MESSAGETYPES.CLOSE_CALL) {
                    
                    await this.shutdownWebcam()
                    await this.shutdownPc()
                }
                else if (processed.type == CallHandler.MESSAGETYPES.VIDEO_ANSWER) {
                    if (this.pc) {
                        this.active = true;
                        this.handleAnswer(JSON.parse(processed.message));
                        
                    }
                }
                else if (processed.type == CallHandler.MESSAGETYPES.NEW_ICE_CANDIDATE) {
                    if (this.pc) {
                        
                        this.handleICECandidate(JSON.parse(processed.message));
                    }
                }
                else if (processed.type == CallHandler.MESSAGETYPES.REBUILD_CALL) {
                    if (this.rebuildInProgress) {
                        
                        return;
                    }
                    await this.shutdownWebcam()
                    await this.shutdownPc()
                    this.active = true;
                    this.createPC()
                    await this.setupWebcam()
                    await this.sendCallAnswer(JSON.parse(processed.message));
                }
            }
            if (processed) {
                finalMessages.push(processed);
            }
        }
        
        this.callState = this.getCallState(finalMessages);
        await this.onCallStateChange();

        return finalMessages;
    }

}