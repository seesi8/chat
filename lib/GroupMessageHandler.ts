import { uuidv4 } from "@firebase/util";
import { b64, checkKeySignature, decryptMLS, decryptWithPrivateKey, deleteKey, encryptMLS, generateAndStoreHPKEKeypair, generateAndStoreX25519Keypair, generateX25519Keypair, getOPK, getStoredKey, getStoredMessage, getStoredMetadata, hkdfExpand, hkdfExpandWithLabels, hkdfExpandWithSalt, importEd25519PublicRaw, importHKDFKey, importMK, importX25519PublicRaw, sha256Bytes, sign, storeHeader, storeKey, storeMessage, storeMetadata, td, te, ub64, verify, xorBytes } from "./e2ee/e2ee";
import { setDoc, doc, writeBatch, getDoc, query, getDocs, collection, where, limitToLast, limit, updateDoc, QuerySnapshot } from "firebase/firestore";
import { firestore } from "./firebase"
import { MessageHandler } from "./MessageHandler";
import { GoogleAuthProvider } from "firebase/auth";
import { SetStateAction } from "react";
import toast from "react-hot-toast";
import { DocumentData } from "firebase-admin/firestore";
import { KEMTree } from "./KEMTree";
import { SecretTree, SecretTreeRoot } from "./SecretTree";

type MessageType = typeof MessageHandler.MESSAGETYPES[keyof typeof MessageHandler.MESSAGETYPES];

export type GroupThread = {
    threadId: string;
    epoch: number;
    dm: false,
    members: string[];
    createdAt: Date,
    leader: string,
    groupName: string,
    latestMessage: Date,
    ratchetTree: KEMTree,
    treeHash: Uint8Array,
}


export class GroupMessageHandler {
    user: any;
    data: any;
    threadId: string;
    thread: any;
    kemTree: KEMTree;
    secretTree: SecretTree;
    index: number;

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

    static LEAFNODESOURCES = {
        reserved: 0,
        key_package: 1,
        update: 2,
        commit: 3,
    }

    static async create(user: string, data: string, threadId?: string) {
        const h = new GroupMessageHandler(user, data, threadId);
        if (threadId) await h.setThread();
        if (threadId) await h.setTrees();
        return h;
    }


    async setThread() {
        if (this.threadId) {
            this.thread = (await getDoc(doc(firestore, "threads", this.threadId))).data()
        }
    }

    async setTrees() {
        const kemTreeJson = this.thread.ratchetTree
        const kemTree = await KEMTree.createFromJson(kemTreeJson)
        const secretTree = await SecretTree.initiate({ kemTreeRoot: kemTree.root })
        this.kemTree = kemTree
        this.secretTree = secretTree;
    }

    async initializeThreadState(groupName: string) {
        if (!this.threadId) {
            this.threadId = uuidv4()
        }

        const { publicKey, privateKey } = await generateX25519Keypair()
        const credential = { user: this.user.uid, identityKey: this.data.publicKeySK }

        const kemTree = await KEMTree.initiate({ publicKey, privateKey, threadId: this.threadId, credential })
        const secretTree = await SecretTree.initiate({ kemTreeRoot: kemTree.root })

        this.secretTree = secretTree
        this.kemTree = kemTree

        const tree = await kemTree.exportJson()

        const treeHash = await sha256Bytes(te.encode(JSON.stringify(tree)))

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
            latestMessage: new Date(),
            ratchetTree: tree,
            treeHash: b64(treeHash),
        }

        this.thread = threadState;

        await storeMetadata(0, `n_${0}_${this.threadId}`)

        return threadState
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

    async submitMessage(files: Array<Blob>, message: string, setLoading: (value: SetStateAction<boolean>) => void) {
        await this.sendMessage(te.encode(message), MessageHandler.MESSAGETYPES.TEXT)
        setLoading(false)
    }

    async addUser(id: string) {
        let keyPackageDoc = (await getDocs(query(
            collection(firestore, "users", id, "keyPackages"),
            limit(1)
        ))).docs[0]

        let keyPackage = keyPackageDoc.data()

        const signature = keyPackage.signature

        keyPackage = {
            ciphersuite: keyPackage.ciphersuite,
            credential: {
                identityKey: keyPackage.credential.identityKey,
                user: keyPackage.credential.user
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
        await this.kemTree.addNode(keyPackage)

        this.secretTree.root = await SecretTreeRoot.rebuildTree(this.kemTree.root)
        const tree = await this.kemTree.exportJson()

        const treeHash = await sha256Bytes(te.encode(JSON.stringify(tree)))
        
        const threadState = {
            ratchetTree: tree,
            treeHash: b64(treeHash),
            members: [...this.thread.members, id]
        }
        
        await this.sendMessageUnencrypted(te.encode(JSON.stringify({init_id: keyPackageDoc.id, init_secret: b64(this.kemTree.root.initSecret)})), MessageHandler.MESSAGETYPES.UNENCRYPTED_ADDITION)
        await updateDoc(doc(firestore, "threads", this.threadId), threadState)
        await this.startUpdate(false)
    }

    async sendMessage(messageBytes: Uint8Array, type: MessageType, messageSecrets: {
        nonce: Uint8Array<ArrayBuffer>;
        reuseGuard: string;
        sendingKey: CryptoKey;
    } | null = null) {
        const KEMTreeNode = this.kemTree.root.findUser(this.user.uid)
        const SecretTreeNode = this.secretTree.root.findIndex(KEMTreeNode.index)
        if (messageSecrets == null) {
            messageSecrets = await SecretTreeNode.getSendingKey()
        }
        const { ciphertext } = await encryptMLS(messageSecrets.sendingKey, messageSecrets.nonce, messageBytes, `${this.user.uid}`)

        const n = (await getStoredMetadata(`n_${KEMTreeNode.epoch}_${this.threadId}`)) ?? 0
        await storeMetadata(n + 1, `n_${KEMTreeNode.epoch}_${this.threadId}`)

        const header = {
            from: this.user.uid,
            reuseGuard: messageSecrets.reuseGuard,
            n,
            type,
        }

        let message = {
            header, ciphertext, signature: null, timeSent: new Date()
        }

        const signature = await sign(this.data.privateSK, te.encode(JSON.stringify(message)))

        message.signature = b64(signature)

        const messageId = uuidv4()

        await storeMessage(this.threadId, messageId, td.decode(messageBytes))

        await this.uploadMessage(message, messageId)
    }

    async sendMessageUnencrypted(messageBytes: Uint8Array, type: MessageType) {
        const KEMTreeNode = this.kemTree.root.findUser(this.user.uid)

        const n = (await getStoredMetadata(`n_${KEMTreeNode.epoch}_${this.threadId}`)) ?? 0
        await storeMetadata(n + 1, `n_${KEMTreeNode.epoch}_${this.threadId}`)

        const header = {
            from: this.user.uid,
            n,
            type,
        }

        let message = {
            header, plaintext: b64(messageBytes), signature: null, timeSent: new Date()
        }
        const signature = await sign(this.data.privateSK, te.encode(JSON.stringify(message)))

        message.signature = b64(signature)

        const messageId = uuidv4()

        await storeMessage(this.threadId, messageId, td.decode(messageBytes))

        await this.uploadMessage(message, messageId)
    }


    async uploadMessage(message: any, messageId: string) {
        const batch = writeBatch(firestore)

        batch.update(doc(
            firestore, "threads", this.threadId
        ), {
            "latestMessage": new Date()
        })

        batch.set(doc(
            firestore, "threads", this.threadId, "messages", messageId
        ), message)

        await batch.commit()
    }

    async decryptMessage(message: any) {
        const header = message.header
        const signature = message.signature
        const ciphertext = message.ciphertext
        const from = header.from
        const type = header.type

        const storedMessage = await getStoredMessage(this.threadId, message.id)

        if (storedMessage) {
            return { ...message, plaintext: storedMessage, already: true }
        }

        const fromUser = (await getDoc(doc(firestore, "users", from))).data()
        const fromPublicKey = await importEd25519PublicRaw(ub64(fromUser.publicKeySK))

        const verified = await verify(fromPublicKey, te.encode(JSON.stringify({
            header, ciphertext, signature: null
        })), ub64(signature))


        if (!verified) {
            // throw Error("Invalid Identity Key")
        }

        
        if (MessageHandler.isUnencryptedType(type)) {
            return { ...message, plaintext: td.decode(ub64(message.plaintext)) }
        }
        
        
        
        const KEMTreeNode = this.kemTree.root.findUser(from)
        
        const SecretTreeNode = this.secretTree.root.findIndex(KEMTreeNode.index)
        
        const messageSecrets = await SecretTreeNode.getReceivingKey(ub64(header.reuseGuard))
        
        const { plaintext } = await decryptMLS(messageSecrets.receivingKey, messageSecrets.nonce, ub64(message.ciphertext))
        await storeMessage(this.threadId, message.id, plaintext)
        return { ...message, plaintext, already: false }
    }

    async handleMessage(message: any): Promise<any> {
        const decryptedMessage = await this.decryptMessage(message)
        const type = message.header.type

        if (!decryptedMessage) return;


        if (type == MessageHandler.MESSAGETYPES.UNENCRYPTED_ADDITION && !decryptedMessage.already) {
            const node = this.kemTree.root.findUser(this.user.uid)
            const data = JSON.parse(decryptedMessage.plaintext)
            const privateKey = await getOPK(`${data["init_id"]}_init_key`)
            this.kemTree.root.initSecret = ub64(data["init_secret"])
            node.setPrivateKey(privateKey)
            
        }
        if ((type == MessageHandler.MESSAGETYPES.UPDATE || type == MessageHandler.MESSAGETYPES.UNENCRYPTED_UPDATE) && !decryptedMessage.already) {
            

            const updatePayload = JSON.parse(decryptedMessage.plaintext)
            await this.receiveUpdate(updatePayload)
        }
    }

    async receiveUpdate(updatePayload: {
        epoch: number;
        updatePath: {
            [key: string]: {
                ephemeralPublicKey: Uint8Array<ArrayBuffer>;
                iv: Uint8Array<ArrayBuffer>;
                ciphertext: Uint8Array<ArrayBuffer>;
            }
        };
        index: number;
    }) {
        const epoch = updatePayload.epoch
        const updatePath = updatePayload.updatePath
        const originIndex = updatePayload.index
        for (let indexStr in updatePath) {
            const index = parseInt(indexStr)
            const kemTreeNode = this.kemTree.root.findIndex(index)
            
            if (kemTreeNode.findUser(this.user.uid) == null) continue;
            const decryptedPayload: {
                nextPathKey: Uint8Array<ArrayBuffer>;
                publicKey: string;
            } = JSON.parse(td.decode(await decryptWithPrivateKey(kemTreeNode.privateKey, updatePath[indexStr])))
            
            const sibilingPublicKey = await importX25519PublicRaw(ub64(decryptedPayload.publicKey))
            kemTreeNode.getSibiling().publicKey = sibilingPublicKey
            console.log("dpc", ub64(decryptedPayload.nextPathKey))
            kemTreeNode.parent.workUpPath(ub64(decryptedPayload.nextPathKey))
        }

        this.secretTree.root = await SecretTreeRoot.rebuildTree(this.kemTree.root)
    }

    async startUpdate(encrytped = true) {
        const KEMTreeNode = this.kemTree.root.findUser(this.user.uid)
        
        const updatePayload = await this.kemTree.getUpdatePayload(KEMTreeNode.index)
        this.secretTree.root = await SecretTreeRoot.rebuildTree(this.kemTree.root)

        const tree = await this.kemTree.exportJson()

        const treeHash = await sha256Bytes(te.encode(JSON.stringify(tree)))

        const threadState = {
            ratchetTree: tree,
            treeHash: b64(treeHash)
        }

        await updateDoc(doc(firestore, "threads", this.threadId), threadState)

        if (encrytped) {
            const SecretTreeNode = this.secretTree.root.findIndex(KEMTreeNode.index)
            const sendingKeys = await SecretTreeNode.getSendingKey()
            await this.sendMessage(te.encode(JSON.stringify(updatePayload)), MessageHandler.MESSAGETYPES.UPDATE, sendingKeys)
        }
        else {
            
            await this.sendMessageUnencrypted(te.encode(JSON.stringify(updatePayload)), MessageHandler.MESSAGETYPES.UNENCRYPTED_UPDATE)
        }
    }

    async decryptMessages(messagesValue: QuerySnapshot<DocumentData>) {
        const decryptedMessages = []
        for (let doc of messagesValue.docs) {
            const id = doc.id
            let data = doc.data()
            data.id = id;
            const decrypted = await this.handleMessage(data)
            if (decrypted) {
                decryptedMessages.push(decrypted)
            }
        }
        return decryptedMessages
    }

    async test() {
        
        
        // await this.startUpdate(false)
    }
}