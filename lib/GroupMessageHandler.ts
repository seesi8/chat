import { uuidv4 } from "@firebase/util";
import { b64, checkKeySignature, deleteKey, encryptMLS, generateAndStoreHPKEKeypair, generateAndStoreX25519Keypair, generateX25519Keypair, getStoredKey, getStoredMetadata, hkdfExpand, hkdfExpandWithLabels, hkdfExpandWithSalt, importEd25519PublicRaw, importHKDFKey, importMK, importX25519PublicRaw, sha256Bytes, sign, storeHeader, storeKey, storeMessage, storeMetadata, te, ub64, xorBytes } from "./e2ee/e2ee";
import { setDoc, doc, writeBatch, getDoc, query, getDocs, collection, where, limitToLast, limit } from "firebase/firestore";
import { firestore } from "./firebase"
import { MessageHandler } from "./MessageHandler";
import { GoogleAuthProvider } from "firebase/auth";
import { SetStateAction } from "react";
import toast from "react-hot-toast";
import { DocumentData } from "firebase-admin/firestore";
import { KEMTree } from "./KEMTree";
import { SecretTree } from "./SecretTree";

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
        const kemTreeJson = await this.thread.KEMTree
        const kemTree = await KEMTree.createFromJson(kemTreeJson)
        const secretTree = await SecretTree.initiate({kemTreeRoot: kemTree.root})
        this.kemTree = kemTree
        this.secretTree = secretTree;
    }

    async initializeThreadState(groupName: string) {
        if (!this.threadId) {
            this.threadId = uuidv4()
        }

        const {publicKey, privateKey} = await generateX25519Keypair()
        const credential = {user: this.user.uid, identityKey: this.data.publicKeySK}

        const kemTree = await KEMTree.initiate({publicKey, privateKey, threadId: this.threadId, credential})
        const secretTree = await SecretTree.initiate({kemTreeRoot: kemTree.root})

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
            treeHash: treeHash,
        }

        this.thread = threadState;

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
    }

    async runUpdate(){
        
    }
}