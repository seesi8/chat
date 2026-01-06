import { uuidv4 } from "@firebase/util";
import { b64, deleteKey, encryptMLS, generateAndStoreX25519Keypair, generateX25519Keypair, getStoredKey, getStoredMetadata, hkdfExpand, hkdfExpandWithLabels, storeHeader, storeKey, storeMessage, storeMetadata, te, xorBytes } from "./e2ee/e2ee";
import { setDoc, doc } from "firebase/firestore";
import { firestore } from "./firebase"
import { MessageHandler } from "./MessageHandler";
class GroupMessageHandler {
    user;
    data;
    threadId;

    constructor(user, data, threadId) {
        if (!user || !data) {
            throw new Error("you must provide both user and data")
        }
        this.user = user
        this.data = data
        this.threadId = threadId
    }

    async initializeThreadState() {
        if (!this.threadId) {
            this.threadId = uuidv4()
        }

        const publicLeafKeyRaw = await generateAndStoreX25519Keypair(`privateLeafKey_${this.threadId}`, `publicLeafKey_${this.threadId}`)

        let threadState = {
            threadId: this.threadId,
            epoch: 0,
            dm: false,
            members: [
                this.user.uid
            ],
            createdAt: new Date(),
            leader: this.user.uid,
            name: "Group"
        }

        const epochSecret = crypto.getRandomValues(new Uint8Array(32))
        const encryptionSecret = await hkdfExpandWithLabels(epochSecret, `${this.threadId}:${0}:encryption`)
        const senderDataSecret = await hkdfExpandWithLabels(epochSecret, `${this.threadId}:${0}:sender`)
        const membershipKey = await hkdfExpandWithLabels(epochSecret, `${this.threadId}:${0}:membershipKey`)
        const init_secret = await hkdfExpandWithLabels(epochSecret, `${this.threadId}:${0}:init`)

        await storeKey(init_secret, `initSecret_${this.threadId}`)
        await storeKey(epochSecret, `epochSecret_${this.threadId}`)
        await storeKey(encryptionSecret, `encryptionSecret_${this.threadId}`)
        await storeKey(senderDataSecret, `senderDataSecret_${this.threadId}`)
        await storeKey(membershipKey, `membershipKey_${this.threadId}`)

        threadState.ratchetTree = {
            leaves: [{
                leaf_index: 0,
                leaf_publicKey: b64(publicLeafKeyRaw),
                credential: {
                    identityKey: this.data.publicKey,
                    uid: this.user.uid
                }
            }]
        }

        return threadState
    }

    async deriveSecretTree(targetLeafIndex, memberCount) {
        let current = await getStoredKey(`encryptionSecret_${this.threadId}`)
        await deleteKey(`encryptionSecret_${this.threadId}`)
        const depth = Math.ceil(Math.log2(memberCount))
        const bits = targetLeafIndex.toString(2).padStart(depth, '0')
        for (let stringIndex of bits) {
            const index = parseInt(stringIndex)
            if (!index) {
                current = await hkdfExpandWithLabels(current, `tree:left`)
            } else {
                current = await hkdfExpandWithLabels(current, `tree:right`)
            }
        }
        const handshakeRachet = await hkdfExpandWithLabels(current, "handshake")
        const applicationRachet = await hkdfExpandWithLabels(current, "application")
        await storeKey(handshakeRachet, `handshakeRachet_${this.threadId}`)
        await storeKey(applicationRachet, `applicationRachet_${this.threadId}`)
    }

    async createThread() {
        const publicThreadState = await this.initializeThreadState()

        await setDoc(doc(firestore, "threads", this.threadId), publicThreadState)
    }

    async sendMessage(message) {
        const messageId = uuidv4()

        const n = await getStoredMetadata(`nextN_${this.threadId}`)
        let metadata = {
            n: n,
            timeSent: new Date(),
            type: MessageHandler.MESSAGETYPES.TEXT,
            from: this.user.uid
        }

        const applicationRachet = await getStoredKey(`applicationRachet_${this.threadId}`)

        const key = await hkdfExpandWithLabels(applicationRachet, `application:${n}`, 16)
        let nonce = new Uint8Array(await hkdfExpandWithLabels(applicationRachet, `nonce:${n}`, 12))
        const nextKey = await hkdfExpandWithLabels(applicationRachet, `secret:${n}`, 32)
        const reuseGuard = crypto.getRandomValues(new Uint8Array(4))

        const firstFourNonce = xorBytes(nonce.slice(0,4), new Uint8Array(reuseGuard))

        var mergedArray = new Uint8Array(firstFourNonce.length + nonce.length);
        mergedArray.set(firstFourNonce);
        mergedArray.set(nonce.slice(4), 4);


        await storeKey(nextKey, `applicationRachet_${this.threadId}`)

        const { ciphertext } = await encryptMLS(key, mergedArray, te.encode(message), JSON.stringify(metadata))

        await storeMetadata(n + 1, `nextN_${this.threadId}`)
        await storeMessage(this.threadId, messageId, message)
        await storeHeader(this.threadId, messageId, metadata)

        return {
            header: metadata,
            ciphertext
        }
    }
}