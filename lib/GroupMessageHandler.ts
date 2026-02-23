import { uuidv4 } from "@firebase/util";
import { b64, decryptMLS, decryptWithPrivateKey, encryptMLS, generateX25519Keypair, importEd25519PublicRaw, importX25519PublicRaw, sha256Bytes, sign, td, te, ub64, verify, xorBytes } from "./e2ee/e2ee";
import { getOPK, getStoredFile, getStoredMessage, getStoredMetadata, storeFile, storeKey, storeMessage, storeMetadata, getStoredKey } from "./e2ee/indexDB";
import { setDoc, doc, writeBatch, getDoc, query, getDocs, collection, where, limitToLast, limit, updateDoc, QuerySnapshot, deleteDoc } from "firebase/firestore";
import { firestore } from "./firebase"
import { MessageHandler } from "./MessageHandler";
import { GoogleAuthProvider } from "firebase/auth";
import { SetStateAction } from "react";
import toast from "react-hot-toast";
import { DocumentData } from "firebase-admin/firestore";
import { KEMTree } from "./KEMTree";
import { SecretTree, SecretTreeRoot } from "./SecretTree";
import { compressImage, deleteStorage, downloadText, formatDate, generateKeyPackages, isEqual, readFileBytes, stableStringify, uploadText, withinDistance } from "./functions";
import AsyncLock from "async-lock";
import { useRouter } from "next/router";

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
    drLock: AsyncLock;

    constructor(user: any, data: any, threadId: string) {
        if (!user || !data) {
            throw new Error("you must provide both user and data")
        }
        this.user = user
        this.data = data
        this.threadId = threadId
        this.drLock = new AsyncLock({
            timeout: 20_000,
            maxPending: 1000,
        });
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

        const treeHash = await sha256Bytes(te.encode(stableStringify(tree)))

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
        await storeMetadata(0, `epochJoined_${this.threadId}`)

        return threadState
    }

    async createThread(members: any[], groupName: string) {
        const publicThreadState = await this.initializeThreadState(groupName)

        const batch = writeBatch(firestore);
        batch.set(doc(firestore, "threads", this.threadId), publicThreadState)
        batch.set(doc(firestore, "threadsId", publicThreadState.threadId), {
            id: publicThreadState.threadId,
            members: [this.user.uid],
        });
        await batch.commit()

        const otherMembers = members.filter((item) => item.uid != this.user.uid)

        for (let otherMember of otherMembers) {
            await this.addUser(otherMember.uid)
        }

        return true;
    }


    async sendFile(fileBytes: Uint8Array, type: MessageType, options: any = {}) {
        const KEMTreeNode = this.kemTree.root.findUser(this.user.uid)
        const SecretTreeNode = this.secretTree.root.findIndex(KEMTreeNode.index)
        let messageSecrets = options?.messageSecrets ?? null

        if (messageSecrets == null) {
            messageSecrets = await SecretTreeNode.getSendingKey()
        }
        const { ciphertext } = await encryptMLS(messageSecrets.sendingKey, messageSecrets.nonce, fileBytes, `${this.user.uid}`)

        const n = messageSecrets.n

        const header = {
            from: this.user.uid,
            reuseGuard: messageSecrets.reuseGuard,
            n,
            type,
            epoch: this.kemTree.root.epoch
        }

        const timeSent = options?.timeSent ?? new Date()


        let message = {
            header, ciphertext, signature: null, timeSent: timeSent
        }

        console.log(stableStringify({ ...message, timeSent: timeSent.getTime() }))

        const signature = await sign(this.data.privateSK, te.encode(stableStringify({ ...message, timeSent: timeSent.getTime() })))

        message.signature = b64(signature)

        const messageId = uuidv4()

        await storeFile(this.threadId, messageId, td.decode(fileBytes))

        const storageUrl = await uploadText(message.ciphertext, messageId)

        message.ciphertext = storageUrl

        await this.uploadMessage(message, messageId, options)
    }


    async submitMessage(files: Array<File>, message: string, setLoading: (value: SetStateAction<boolean>) => void) {

        try {
            for (let i = 0; i < files.length; i++) {
                const file = files[i]
                let compressed;
                const image = file.type.includes("image");
                if (image) {
                    compressed = await compressImage(file)
                }
                else {
                    compressed = file
                }
                const fileByteArray = await readFileBytes(compressed)
                const text = b64(fileByteArray)
                if (compressed.size > 5e+8) {
                    toast.error("File uploads over 500mb are not permitted")
                    continue;
                }
                if (image) {
                    await this.sendFileWithLock(te.encode(text), MessageHandler.MESSAGETYPES.IMAGE)
                }
                else {

                    const info = {
                        "type": file.type,
                        "name": file.name,
                        "size": file.size,
                        "content": text
                    }
                    await this.sendFileWithLock(te.encode(stableStringify(info)), MessageHandler.MESSAGETYPES.FILE)
                }
            }
            if (message) {

                const messageBytes = te.encode(message)
                const messageSize = messageBytes.length
                if (messageSize > 2000) {
                    const b64Content = b64(messageBytes)
                    const info = {
                        "type": "text/plain",
                        "name": `${this.data.username}'s Message.txt`,
                        "size": messageSize,
                        "content": b64Content
                    }

                    await this.sendFileWithLock(te.encode(stableStringify(info)), MessageHandler.MESSAGETYPES.FILE)
                }
                else {
                    await this.sendMessageWithLock(te.encode(message), MessageHandler.MESSAGETYPES.TEXT)
                }
            }
        }
        catch (e) {
            throw e
        } finally {
            setLoading(false)
        }
    }

    async getKeyPackage(id: string) {
        let keyPackageDoc = (await getDocs(query(
            collection(firestore, "users", id, "keyPackages"),
            limit(1)
        ))).docs[0]

        const keyPackageDocId = keyPackageDoc.id
        let keyPackage = keyPackageDoc.data()

        await deleteDoc(doc(firestore, "users", id, "keyPackages", keyPackageDocId))

        return { keyPackage, keyPackageDocId }
    }

    async addUser(id: string) {
        let { keyPackage, keyPackageDocId } = await this.getKeyPackage(id)

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
        const data = te.encode(stableStringify(keyPackage))
        const verified = await verify(publicKey, data, ub64(signature).buffer)

        
        if (!verified) {
            toast.error("Invalid Key Signature")
            // throw Error("Invalid Key Signature")
        }
        await this.kemTree.addNode(keyPackage)

        this.secretTree.root = await SecretTreeRoot.rebuildTree(this.kemTree.root)
        const tree = await this.kemTree.exportJson()

        const treeHash = await sha256Bytes(te.encode(stableStringify(tree)))

        const threadState = {
            ratchetTree: tree,
            treeHash: b64(treeHash),
            members: [...this.thread.members, id]
        }

        let initSecret = this.kemTree.root.initSecret
        if (!initSecret) {
            initSecret = await getStoredKey(`initSecret_${this.kemTree.root.epoch}_${this.kemTree.root.threadId}`)
            if (initSecret) {
                this.kemTree.root.initSecret = initSecret
            }
        }
        if (!initSecret) {
            throw Error(`Missing init secret for epoch ${this.kemTree.root.epoch}`)
        }

        await this.sendMessageUnencryptedWithLock(te.encode(stableStringify({ epoch: this.kemTree.root.epoch + 1, user: id, init_id: keyPackageDocId, init_secret: b64(initSecret) })), MessageHandler.MESSAGETYPES.UNENCRYPTED_ADDITION)
        await updateDoc(doc(firestore, "threads", this.threadId), threadState)
        await this.setThread();
        await this.setTrees();
        await this.startUpdate(false)
    }

    async removeUser(id: string) {
        const kemTreeNode = this.kemTree.root.findUser(id)
        await kemTreeNode.removePathToRoot()
        this.secretTree.root = await SecretTreeRoot.rebuildTree(this.kemTree.root)
        
        const tree = await this.kemTree.exportJson()
        
        const treeHash = await sha256Bytes(te.encode(stableStringify(tree)))
        
        const threadState = {
            ratchetTree: tree,
            treeHash: b64(treeHash),
            members: this.thread.members.filter((item: string) => item != id)
        }
        
        await updateDoc(doc(firestore, "threads", this.threadId), threadState)

        await this.setThread();
        await this.setTrees();

        await this.sendMessageUnencryptedWithLock(te.encode(stableStringify({ user: id })), MessageHandler.MESSAGETYPES.UNENCRYPTED_REMOVAL)
        
        await this.startUpdate(false)
    }

    async sendMessage(messageBytes: Uint8Array, type: MessageType, options: any = {}) {
        const KEMTreeNode = this.kemTree.root.findUser(this.user.uid)
        const SecretTreeNode = this.secretTree.root.findIndex(KEMTreeNode.index)
        let messageSecrets = options?.messageSecrets ?? null

        if (messageSecrets == null) {
            messageSecrets = await SecretTreeNode.getSendingKey()
        }
        const { ciphertext } = await encryptMLS(messageSecrets.sendingKey, messageSecrets.nonce, messageBytes, `${this.user.uid}`)

        const n = messageSecrets.n

        

        const header = {
            from: this.user.uid,
            reuseGuard: messageSecrets.reuseGuard,
            n,
            type,
            epoch: this.kemTree.root.epoch
        }

        const timeSent = options?.timeSent ?? new Date()


        let message = {
            header, ciphertext, signature: null, timeSent: timeSent
        }


        const signature = await sign(this.data.privateSK, te.encode(stableStringify({ ...message, timeSent: timeSent.getTime() })))

        message.signature = b64(signature)

        const messageId = uuidv4()

        await storeMessage(this.threadId, messageId, td.decode(messageBytes))

        await this.uploadMessage(message, messageId, options)
    }

    async sendMessageUnencrypted(messageBytes: Uint8Array, type: MessageType, options: any = {}) {
        console.log(this.kemTree.root)
        const KEMTreeNode = this.kemTree.root.findUser(this.user.uid)

        const n = (await getStoredMetadata(`n_${KEMTreeNode.epoch}_${this.threadId}`)) ?? 0
        await storeMetadata(n + 1, `n_${KEMTreeNode.epoch}_${this.threadId}`)

        const header = {
            from: this.user.uid,
            n,
            type,
            epoch: this.kemTree.root.epoch
        }

        const timeSent = options?.timeSent ?? new Date()

        let message = {
            header, plaintext: b64(messageBytes), signature: null, timeSent: timeSent
        }
        const signature = await sign(this.data.privateSK, te.encode(stableStringify({ ...message, timeSent: timeSent.getTime() })))

        message.signature = b64(signature)

        const messageId = uuidv4()

        await storeMessage(this.threadId, messageId, td.decode(messageBytes))

        await this.uploadMessage(message, messageId, options)
    }


    async uploadMessage(message: any, messageId: string, options: any = {}) {
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

    async decryptMessage(message: any, fromUser: any) {
        const header = message.header
        const signature = message.signature
        const ciphertext = message.ciphertext
        const from = header.from
        const type = header.type
        let storedMessage: any;

        if (MessageHandler.isFileType(type)) {
            storedMessage = await getStoredFile(this.threadId, message.id)
        }
        else {
            storedMessage = await getStoredMessage(this.threadId, message.id)
        }

        if (storedMessage !== undefined) {
            return { plaintext: storedMessage, already: true }
        }

        const fromPublicKey = await importEd25519PublicRaw(ub64(fromUser.publicKeySK))
        const { id: _id, read: _read, ...stableMessage } = { ...message, signature: null, timeSent: message.timeSent.toDate().getTime() }
        const verified = await verify(fromPublicKey, te.encode(stableStringify(stableMessage)), ub64(signature))


        if (!verified) {
            // console.warn("Invalid Identity Key")
            throw Error("Invalid Identity Key")
        }

        if (MessageHandler.isUnencryptedType(type)) {
            const plaintext = td.decode(ub64(message.plaintext))
            await storeMessage(this.threadId, message.id, plaintext)
            return { plaintext, already: false }
        }

        const KEMTreeNode = this.kemTree.root.findUser(from)

        const SecretTreeNode = this.secretTree.root.findIndex(KEMTreeNode.index)

        const messageSecrets = await SecretTreeNode.getReceivingKey(ub64(header.reuseGuard), header.n)

        const { plaintext } = await decryptMLS(messageSecrets.receivingKey, messageSecrets.nonce, ub64(ciphertext), from)

        if (MessageHandler.isFileType(type)) {
            await storeFile(this.threadId, message.id, plaintext)
        }
        else {
            await storeMessage(this.threadId, message.id, plaintext)
        }
        return { plaintext: plaintext, already: false }
    }

    async handleMessage(message: any, users: any, currentMessages: any[] = [], finalMessages: any[] = []): Promise<any> {
        const type = message.header.type

        const epochJoined = await getStoredMetadata(`epochJoined_${this.threadId}`)
        if ((epochJoined == undefined || epochJoined == null || epochJoined > message.header.epoch) && !MessageHandler.isUnencryptedType(type)) {


            return;
        }

        const from = message.header.from

        let fromUser = users.find((a: any) => a.id == from)
        if (!fromUser) {
            const fromUserDoc = await getDoc(doc(firestore, "users", from))
            if (!fromUserDoc.exists()) {
                return;
            }
            fromUser = { ...fromUserDoc.data(), id: from }
        }

        if (MessageHandler.isFileType(type)) {
            message.ciphertext = await downloadText(message.ciphertext)
        }

        const decryptedMessage = await this.decryptMessage(message, fromUser)

        if (!decryptedMessage.already) {
            
        }

        message.type = type
        message.sentBy = fromUser

        if (!decryptedMessage) return;

        if (type == MessageHandler.MESSAGETYPES.UNENCRYPTED_ADDITION && !decryptedMessage.already) {
            const data = JSON.parse(decryptedMessage.plaintext)
            if (data["user"] == this.user.uid) {
                const node = this.kemTree.root.findUser(this.user.uid)
                if (!node) {
                    throw Error(`Could not find local user node in tree for thread ${this.threadId}`)
                }
                await storeMetadata(data["epoch"], `epochJoined_${this.threadId}`)
                const privateKey = await getOPK(`${data["init_id"]}_init_key`)
                if (!privateKey) {
                    throw Error(`Missing OPK private key for init package ${data["init_id"]}`)
                }
                this.kemTree.root.initSecret = ub64(data["init_secret"])
                await storeKey(ub64(data["init_secret"]), `initSecret_${data["epoch"]}_${this.kemTree.root.threadId}`)
                await node.setPrivateKey(privateKey)
                await generateKeyPackages(this.user, this.data, 1)
            }
            else {
                await storeKey(ub64(data["init_secret"]), `initSecret_${data["epoch"]}_${this.kemTree.root.threadId}`)
                await this.setThread()
                await this.setTrees()
            }

        }
        if ((type == MessageHandler.MESSAGETYPES.UPDATE || type == MessageHandler.MESSAGETYPES.UNENCRYPTED_UPDATE) && !decryptedMessage.already) {
            const updatePayload = JSON.parse(decryptedMessage.plaintext)
            console.log("Handling update")
            await this.receiveUpdate(updatePayload)
        }
        if(message.type === MessageHandler.MESSAGETYPES.UNENCRYPTED_REMOVAL){
            const data = JSON.parse(decryptedMessage.plaintext)
            if(data.user == this.user.uid){
                toast.error("You have been removed from this group chat")
                const router = useRouter()
                router.push("/")
            }
            else{
                await this.setThread()
                await this.setTrees()
            }
        }
        if (message.type === MessageHandler.MESSAGETYPES.READ) {

            if (message.sentBy.id !== this.user.uid) {


                const decryptedMessageObj = JSON.parse(decryptedMessage.plaintext);
                const finalIndex = finalMessages.findIndex(m => m.id === decryptedMessageObj["id"]);
                const currentIndex = currentMessages.findIndex(m => m.id === decryptedMessageObj["id"]);

                const timeRead = formatDate(new Date(decryptedMessageObj["timeRead"]));

                if (finalIndex !== -1) {
                    finalMessages[finalIndex].read = true;
                    finalMessages[finalIndex].timeRead = timeRead;
                    if (finalMessages[finalIndex].readBy == undefined) {
                        finalMessages[finalIndex].readBy = [message.sentBy.displayName]
                    }
                    else {
                        finalMessages[finalIndex].readBy.push(message.sentBy.displayName);
                    }
                }
                else if (currentIndex !== -1) {
                    currentMessages[currentIndex].read = true;
                    currentMessages[currentIndex].timeRead = timeRead;
                    if (currentMessages[currentIndex].readBy == undefined) {
                        currentMessages[currentIndex].readBy = [message.sentBy.displayName]
                    } else {
                        currentMessages[currentIndex].readBy.push(message.sentBy.displayName);
                    }

                }
            }

            return null;
        }

        if (MessageHandler.isTextType(message.type) || MessageHandler.isFileType(message.type)) {
            message.message = decryptedMessage.plaintext;
        }


        if (!decryptedMessage.already && (type != MessageHandler.MESSAGETYPES.READ) && MessageHandler.isGroupableType(type)) {
            const readData = {
                id: message.id,
                timeRead: (new Date()).getTime(),
            }

            await this.sendMessage(te.encode(stableStringify(readData)), MessageHandler.MESSAGETYPES.READ, { timeSent: new Date(message.timeSent.toDate()) });
        }

        else if (type === MessageHandler.MESSAGETYPES.IMAGE) {
            if (!decryptedMessage.already) await deleteStorage(message.id);
        }

        else if (type === MessageHandler.MESSAGETYPES.FILE) {
            if (!decryptedMessage.already) await deleteStorage(message.id);
            message.message = JSON.parse(message.message);
        }


        message.timeSentFormated = formatDate(
            message.timeSent.toDate()
        );

        return message
    }

    groupMessages(messages: any[]) {
        let lastCallMessage = messages.filter(m => MessageHandler.isCallType(m.type)).at(-1);
        let groupedMessages = [];
        for (let i = 0; i < messages.length; i++) {
            if (i == 0) {
                const output = {
                    id: messages[i].id,
                    messages: [messages[i].message],
                    timeSentFormated: messages[i].timeSentFormated,
                    timeSent: messages[i].timeSent,
                    read: messages[i].read,
                    timeRead: messages[i].timeRead,
                    sentBy: messages[i].sentBy,
                    type: messages[i].type,
                    readBy: messages[i].readBy,
                    callOpen: false,
                }
                if (lastCallMessage && messages[i].id == lastCallMessage.id) {
                    output.callOpen = true;
                }
                groupedMessages.push(output);
                continue
            }
            if (
                messages[i].sentBy.id == groupedMessages[groupedMessages.length - 1].sentBy.id
                && messages[i].type == groupedMessages[groupedMessages.length - 1].type
                && messages[i].read == groupedMessages[groupedMessages.length - 1].read
                && isEqual(messages[i].readBy, groupedMessages[groupedMessages.length - 1].readBy)
                && withinDistance(messages[i].timeSent, groupedMessages[groupedMessages.length - 1].timeSent)
                && MessageHandler.isGroupableType(messages[i].type)
            ) {
                groupedMessages[groupedMessages.length - 1].messages.push(messages[i].message);
                groupedMessages[groupedMessages.length - 1].timeRead = messages[i].timeRead;
                groupedMessages[groupedMessages.length - 1].read = messages[i].read;
            }
            else {
                const output = {
                    id: messages[i].id,
                    messages: [messages[i].message],
                    timeSentFormated: messages[i].timeSentFormated,
                    timeSent: messages[i].timeSent,
                    read: messages[i].read,
                    timeRead: messages[i].timeRead,
                    sentBy: messages[i].sentBy,
                    type: messages[i].type,
                    readBy: messages[i].readBy,
                    callOpen: false,
                }
                if (lastCallMessage && messages[i].id == lastCallMessage.id) {
                    output.callOpen = true;
                }
                groupedMessages.push(output);
                continue
            }
        }
        return groupedMessages;
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
        const decryptionEpoch = Math.max(0, epoch - 1)
        let applied = false
        console.log(updatePath)
        for (let indexStr in updatePath) {
            const index = parseInt(indexStr)
            const kemTreeNode = this.kemTree.root.findIndex(index)
            console.log(kemTreeNode)
            if (!kemTreeNode) continue
            console.log(kemTreeNode.findUser(this.user.uid))
            console.log(this.user.uid)
            if (kemTreeNode.findUser(this.user.uid) == null) continue;
            const privateKey = (await kemTreeNode.getPrivateKey(decryptionEpoch))
            console.log(privateKey)

            if (!privateKey) continue
            const decryptedPayload: {
                nextPathKey: Uint8Array<ArrayBuffer>;
                publicKey: string;
                for: number;
                pathPublicKeys?: { [key: string]: string };
            } = JSON.parse(td.decode(await decryptWithPrivateKey(privateKey, updatePath[indexStr])))
            if (decryptedPayload.pathPublicKeys) {
                for (const nodeIndexStr in decryptedPayload.pathPublicKeys) {
                    const pathNode = this.kemTree.root.findIndex(parseInt(nodeIndexStr))
                    if (!pathNode) continue
                    pathNode.publicKey = await importX25519PublicRaw(ub64(decryptedPayload.pathPublicKeys[nodeIndexStr]))
                }
            }
            const coPathNode = this.kemTree.root.findIndex(decryptedPayload.for)
            if (!coPathNode || !coPathNode.parent) continue
            if (!decryptedPayload.pathPublicKeys) {
                const directPathPublicKey = await importX25519PublicRaw(ub64(decryptedPayload.publicKey))
                const directPathNode = coPathNode.parent.left?.index === coPathNode.index
                    ? coPathNode.parent.right
                    : coPathNode.parent.left
                if (!directPathNode) continue
                directPathNode.publicKey = directPathPublicKey
            }

            await coPathNode.parent.workUpPath(ub64(decryptedPayload.nextPathKey), {}, epoch)
            applied = true
            if (!decryptedPayload.pathPublicKeys || decryptedPayload.pathPublicKeys["" + originIndex]) {
                break
            }
        }
        if (!applied) return

        this.secretTree.root = await SecretTreeRoot.rebuildTree(this.kemTree.root)
    }

    async startUpdate(encrytped = true) {
        const KEMTreeNode = this.kemTree.root.findUser(this.user.uid)
        
        const updatePayload = await this.kemTree.getUpdatePayload(KEMTreeNode.index)
        this.secretTree.root = await SecretTreeRoot.rebuildTree(this.kemTree.root)
        const tree = await this.kemTree.exportJson()

        const treeHash = await sha256Bytes(te.encode(stableStringify(tree)))

        const threadState = {
            ratchetTree: tree,
            treeHash: b64(treeHash)
        }

        await updateDoc(doc(firestore, "threads", this.threadId), threadState)

        if (encrytped) {
            const SecretTreeNode = this.secretTree.root.findIndex(KEMTreeNode.index)
            const sendingKeys = await SecretTreeNode.getSendingKey()
            await this.sendMessageWithLock(te.encode(stableStringify(updatePayload)), MessageHandler.MESSAGETYPES.UPDATE, { messageSecrets: sendingKeys })
        }
        else {

            await this.sendMessageUnencryptedWithLock(te.encode(stableStringify(updatePayload)), MessageHandler.MESSAGETYPES.UNENCRYPTED_UPDATE)
        }
    }

    async handleMessageWithLock(message: any, users: any, currentMessages?: any[], finalMessages?: any[]) {
        const returnData = await this.drLock.acquire(this.threadId, async () => {
            return await this.handleMessage(message, users, currentMessages, finalMessages)
        });

        return returnData
    };

    async sendMessageWithLock(messageBytes: Uint8Array<ArrayBufferLike>, type: MessageType, options?: any) {
        const returnData = await this.drLock.acquire(this.threadId, async () => {
            return await this.sendMessage(messageBytes, type, options)
        });
        return returnData
    };

    async sendFileWithLock(messageBytes: Uint8Array<ArrayBufferLike>, type: MessageType, options?: any) {
        const returnData = await this.drLock.acquire(this.threadId, async () => {
            return await this.sendFile(messageBytes, type, options)
        });
        return returnData
    };

    async sendMessageUnencryptedWithLock(messageBytes: Uint8Array<ArrayBufferLike>, type: MessageType, options?: any) {
        const returnData = await this.drLock.acquire(this.threadId, async () => {
            return await this.sendMessageUnencrypted(messageBytes, type, options)
        });
        return returnData
    };

    async decryptMessages(messagesValue: QuerySnapshot<DocumentData>) {
        const decryptedMessages = []
        const currentMessages = messagesValue.docs.map((docSnap) => ({
            ...docSnap.data(),
            id: docSnap.id,
            read: false
        }));

        const members = await Promise.all(this.thread.members.map(async (member) => {
            let user = (await getDoc(doc(firestore, "users", member))).data()
            user.id = member
            return user
        }))



        for (let data of currentMessages) {
            const decrypted = await this.handleMessageWithLock(data, members, currentMessages, decryptedMessages)
            if (decrypted) {
                decryptedMessages.push(decrypted)
            }
        }
        return this.groupMessages(decryptedMessages)
    }

    async test() {
        await this.startUpdate(false)
    }
}
