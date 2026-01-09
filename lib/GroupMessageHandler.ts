import { uuidv4 } from "@firebase/util";
import { b64, checkKeySignature, deleteKey, encryptMLS, generateAndStoreX25519Keypair, generateX25519Keypair, getStoredKey, getStoredMetadata, hkdfExpand, hkdfExpandWithLabels, hkdfExpandWithSalt, importEd25519PublicRaw, importHKDFKey, importMK, importX25519PublicRaw, sha256Bytes, storeHeader, storeKey, storeMessage, storeMetadata, te, ub64, xorBytes } from "./e2ee/e2ee";
import { setDoc, doc, writeBatch, getDoc, query, getDocs, collection, where, limitToLast, limit } from "firebase/firestore";
import { firestore } from "./firebase"
import { MessageHandler } from "./MessageHandler";
import { GoogleAuthProvider } from "firebase/auth";
import { SetStateAction } from "react";
import toast from "react-hot-toast";
import { DocumentData } from "firebase-admin/firestore";

type MessageType = typeof MessageHandler.MESSAGETYPES[keyof typeof MessageHandler.MESSAGETYPES];
type ProposalType = typeof MessageHandler.MESSAGETYPES[keyof typeof GroupMessageHandler.PROPOSALTYPES];

export class GroupMessageHandler {
    user: any;
    data: any;
    threadId: string;
    thread: any;
    id: string;

    constructor(user: any, data: any, threadId: string) {
        if (!user || !data) {
            throw new Error("you must provide both user and data")
        }
        this.user = user
        this.data = data
        this.threadId = threadId
    }

    static PROPOSALTYPES = {
        ADD: 0x01,
        UPDATE: 0x02
    }

    static async create(user: string, data: string, threadId?: string) {
        const h = new GroupMessageHandler(user, data, threadId);
        if (threadId) await h.setThread();
        h.id = uuidv4()
        return h;
    }


    async setThread() {
        if (this.threadId) {
            this.thread = (await getDoc(doc(firestore, "threads", this.threadId))).data()
        }
    }

    async initializeThreadState(groupName: string) {
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
            groupName: groupName,
            ratchetTree: undefined,
            latestMessage: new Date()
        }

        const groupContext = await sha256Bytes(te.encode(JSON.stringify({
            threadId: this.threadId,
            epoch: 0
        })));

        const init_secret = crypto.getRandomValues(new Uint8Array(32))
        const leaf_path_secret = await importHKDFKey(crypto.getRandomValues(new Uint8Array(32)))
        const root_path_secret = await importHKDFKey(await hkdfExpandWithLabels(leaf_path_secret, "path"))
        const commit_secret = root_path_secret
        const joiner_secret = await importHKDFKey(await hkdfExpandWithSalt(commit_secret, "joiner", init_secret))
        const epoch_secret = await importHKDFKey(await hkdfExpandWithLabels(joiner_secret, `epoch:${b64(groupContext)}`))

        const sender_data_secret = await hkdfExpandWithLabels(
            epoch_secret,
            "sender data"
        );

        const encryption_secret = await hkdfExpandWithLabels(
            epoch_secret,
            "encryption"
        );

        const membership_key = await hkdfExpandWithLabels(
            epoch_secret,
            "membership"
        );

        const confirmation_key = await hkdfExpandWithLabels(
            epoch_secret,
            "confirmation"
        );

        const exporter_secret = await hkdfExpandWithLabels(
            epoch_secret,
            "exporter"
        );

        await storeKey(epoch_secret, `epochSecret_${this.threadId}`);
        await storeKey(epoch_secret, `secret_${this.threadId}_`)
        // await storeKey(await importHKDFKey(sender_data_secret), `senderDataSecret_${this.threadId}`);
        // await storeKey(await importHKDFKey(encryption_secret), `encryptionSecret_${this.threadId}`);
        // await storeKey(await importHKDFKey(membership_key), `membershipKey_${this.threadId}`);
        // await storeKey(await importHKDFKey(confirmation_key), `confirmationKey_${this.threadId}`);
        // await storeKey(await importHKDFKey(exporter_secret), `exporterSecret_${this.threadId}`);
        await storeMetadata(0, `nextN_${this.threadId}`)
        await storeMetadata(true, `initiated_${this.threadId}`)

        threadState.ratchetTree = {
            leaves: [{
                leaf_index: "0",
                leaf_publicKey: b64(publicLeafKeyRaw),
                credential: {
                    identityKey: this.data.publicKey,
                    uid: this.user.uid
                }
            }, {
                leaf_index: "1"
            }]
        }

        this.thread = threadState;

        return threadState
    }
    async deriveNode(targetLeafIndex: string) {

        let handshake = await getStoredKey(`handshakeRachet_${this.threadId}_${targetLeafIndex}`);
        let application = await getStoredKey(`applicationRachet_${this.threadId}_${targetLeafIndex}`);

        if (application || handshake) return { handshake, application };

        let closestNodeIndex: string | null = null;

        for (let i = targetLeafIndex.length; i >= 0; i--) {
            const candidate = targetLeafIndex.slice(0, i);
            const secret = await getStoredKey(`secret_${this.threadId}_${candidate}`);
            if (secret) {
                closestNodeIndex = candidate;
                break;
            }
        }

        if (closestNodeIndex === null)
            throw new Error(`No ancestor secret found for ${targetLeafIndex}`);

        for (let depth = closestNodeIndex.length; depth < targetLeafIndex.length; depth++) {

            const parentIndex = targetLeafIndex.slice(0, depth);
            const parentSecret = await getStoredKey(`secret_${this.threadId}_${parentIndex}`);

            if (!parentSecret)
                throw new Error(`Missing secret for node ${parentIndex}`);

            const left = await importHKDFKey(await hkdfExpandWithLabels(parentSecret, "tree:left"));
            const right = await importHKDFKey(await hkdfExpandWithLabels(parentSecret, "tree:right"));

            await storeKey(left, `secret_${this.threadId}_${parentIndex}0`);
            await storeKey(right, `secret_${this.threadId}_${parentIndex}1`);

            await deleteKey(`secret_${this.threadId}_${parentIndex}`);
        }

        const leafSecret = await getStoredKey(`secret_${this.threadId}_${targetLeafIndex}`);
        if (!leafSecret)
            throw new Error(`Leaf secret missing for ${targetLeafIndex}`);

        handshake = await importHKDFKey(await hkdfExpandWithLabels(leafSecret, "handshake"));
        application = await importHKDFKey(await hkdfExpandWithLabels(leafSecret, "application"));

        await storeKey(handshake, `handshakeRachet_${this.threadId}_${targetLeafIndex}`);
        await storeKey(application, `applicationRachet_${this.threadId}_${targetLeafIndex}`);

        await deleteKey(`secret_${this.threadId}_${targetLeafIndex}`);

        return { handshake, application };
    }


    async createThread(groupName: string) {
        const publicThreadState = await this.initializeThreadState(groupName)
        const batch = writeBatch(firestore);
        batch.set(doc(firestore, "threads", this.threadId), publicThreadState)
        batch.set(doc(firestore, "threadsId", publicThreadState.threadId), {
            id: publicThreadState.threadId,
            members: [this.user.uid],
        });
        await batch.commit()
        return true;
    }

    async createMessage(message: Uint8Array, type: MessageType = MessageHandler.MESSAGETYPES.TEXT) {
        const messageId = uuidv4()
        const n = await getStoredMetadata(`nextN_${this.threadId}`)
        const leafIndex = this.thread.ratchetTree.leaves.filter((item: any) => item.credential.uid == this.user.uid)[0].leaf_index

        let metadata = {
            n: n,
            timeSent: new Date(),
            type: type,
            from: this.user.uid,
            reuseGuard: undefined
        }

        const { application, handshake } = await this.deriveNode(leafIndex)

        const key = await importMK(await hkdfExpandWithLabels(application, `key:${n}`, 16))
        const nonce = new Uint8Array(await hkdfExpandWithLabels(application, `nonce:${n}`, 12))
        const nextKey = await importHKDFKey(await hkdfExpandWithLabels(application, `application:${n}`, 32))
        const reuseGuard = crypto.getRandomValues(new Uint8Array(4))
        metadata.reuseGuard = reuseGuard;
        const firstFourNonce = xorBytes(nonce.slice(0, 4), new Uint8Array(reuseGuard))

        var mergedArray = new Uint8Array(firstFourNonce.length + nonce.length);
        mergedArray.set(firstFourNonce);
        mergedArray.set(nonce.slice(4), 4);

        await storeKey(nextKey, `applicationRachet_${this.threadId}_${leafIndex}`)

        const { ciphertext } = await encryptMLS(key, mergedArray, message, JSON.stringify(metadata))

        await storeMetadata(n + 1, `nextN_${this.threadId}`)
        await storeMessage(this.threadId, messageId, message)
        await storeHeader(this.threadId, messageId, metadata)

        return {
            header: metadata,
            ciphertext
        }
    }

    async uploadMessage(message: {
        header: {
            n: any;
            timeSent: Date;
            type: number;
            from: any;
        };
        ciphertext: string;
    }) {
        const messageId = uuidv4()
        const batch = writeBatch(firestore)
        batch.set(doc(firestore, "threads", this.threadId, "messages", messageId), { ...message, timeSent: new Date() })
        batch.update(doc(firestore, "threads", this.threadId), {
            latestMessage: new Date()
        })
        await batch.commit()
        return messageId
    }

    async submitMessage(files: Array<Blob>, message: string, setLoading: (value: SetStateAction<boolean>) => void) {
        const messageData = await this.createMessage(te.encode(message))
        await this.uploadMessage(messageData)
        setLoading(false)
    }

    async addUser(id: string) {
        let keyPackage = (await getDocs(query(
            collection(firestore, "users", id, "keyPackages"),
            limit(1)
        ))).docs[0].data()

        const signature = keyPackage.signature

        keyPackage = {
            ciphersuite: keyPackage.ciphersuite,
            credential: {
                identityKey: keyPackage.credential.identityKey,
                uid: keyPackage.credential.uid
            },
            init_key: keyPackage.init_key,
            protocol_version: keyPackage.protocol_version,
        }

        const ikRaw = ub64(keyPackage.credential.identityKey)
        const publicKey = await importEd25519PublicRaw(ikRaw)
        const data = te.encode(JSON.stringify(keyPackage))
        const verified = await checkKeySignature(publicKey, data, ub64(signature).buffer)

        if (!verified) {
            toast.error("Invalid Key Signature")
            throw Error("Invalid Key Signature")
        }

        const addProposal = {
            keyPackage: keyPackage,
            type: GroupMessageHandler.PROPOSALTYPES.ADD
        }

        // const messageData = await this.createMessage(te.encode(JSON.stringify(addProposal)), MessageHandler.MESSAGETYPES.PROPOSAL)
        // const proposalID = await this.uploadMessage(messageData)

        const commit = {
            proposals: [
                addProposal,
            ],
        }

        this.applyProposals(commit.proposals)
    }

    async joinThread() {
        console.log("here")
    }

    async applyProposals(proposals: {
        keyPackage: DocumentData;
        type: number;
    }[]) {

        for (let proposal in proposals) {
            this.applyProposal()
        }
    }

    async applyProposal() {
        const leftMost = this.findLeftMostEmptyLeaf()

        if(leftMost == undefined){

        }
    }

    findLeftMostEmptyLeaf() {
        for (let leaf of this.thread.ratchetTree.leaves) {
            if (!leaf.leaf_publicKey) {
                return leaf
            }
        }
    }
}