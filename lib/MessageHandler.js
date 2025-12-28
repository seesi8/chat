import { uuidv4 } from "@firebase/util";
import { getDoc, writeBatch, doc } from "firebase/firestore";
import { firestore } from "../lib/firebase";
import toast from "react-hot-toast";
import AsyncLock from "async-lock";
import {
    b64,
    combineKeys,
    decryptGroupMessage,
    decryptMessageDR,
    decryptMissedMessageDR,
    decryptSingleKey,
    deleteMK,
    encryptGroupMessage,
    encryptKeysForMembers,
    encryptMessageDR,
    exportKey,
    generateX25519Keypair,
    getMK,
    getOPK,
    getStoredFile,
    getStoredKey,
    getStoredMessage,
    getStoredMetadata,
    hkdfExpand,
    importHKDFKey,
    importHKDFKeyRaw,
    importMessageKey,
    importX25519PublicRaw,
    rotateGroupKey,
    runDH,
    skipMessageDR,
    storeFile,
    storeKey,
    storeMessage,
    storeMetadata,
    storeMK,
    ub64,
} from "../lib/e2ee/e2ee";
import { compressImage, deleteStorage, downloadText, formatDate, generateOPK, getRecentOPK, readFileBytes, uploadText, withinDistance } from "./functions";
import { useEffect } from "react";

export class MessageHandler {
    user;
    data;
    threadId;

    decryptedMessages = [];

    drLock;

    static MESSAGETYPES = {
        // Text
        TEXT: 0x01,
        // Read Recipts
        READ: 0x02,
        // Files
        IMAGE: 0x11,
        FILE: 0x12,
    }

    static isTextType(type) {
        return (type > 0x00 && type < 0x10) || (type > 0x20 && type < 0x30)
    }
    static isFileType(type) {
        return type < 0x20 && type > 0x10
    }
    static isVisableType(type) {
        return type < 0x30 && type > 0x00
    }
    static isGroupableType(type) {
        return (type < 0x20 && type > 0x00)
    }

    constructor(user, data, threadId) {
        this.user = user
        this.data = data

        if (!user || !data) {
            throw Error("Must provide \"user\" and \"data\" parameters")
        }
        this.threadId = threadId

        this.drLock = new AsyncLock({
            timeout: 20_000,
            maxPending: 1000,
        });
    }

    async decryptMessages(messagesValue) {
        if (!messagesValue) {
            return;
        }

        const thread = await getDoc(doc(firestore, "threads", this.threadId));
        if (thread.data().dm) {
            const decryptedDmMessages = await this.decryptDmMessages(messagesValue);
            const groupedMessages = this.groupMessages(decryptedDmMessages)
            this.decryptedMessages = groupedMessages;
            return groupedMessages
        }
        const members = thread.data().members.filter((item) => {
            return item != this.user.uid;
        });
        // if (members.length != 1) {
        let currentMessages = messagesValue.docs;
        let finalMessages = [];
        for (let messageIndex in currentMessages) {
            const id = currentMessages[messageIndex].id;
            currentMessages[messageIndex] = currentMessages[messageIndex].data();
            currentMessages[messageIndex].id = id;
            let decryptedMessage = "";

            decryptedMessage = await this.decryptMessage(
                currentMessages[messageIndex]
            );

            if (decryptedMessage !== undefined) {
                currentMessages[messageIndex].message = decryptedMessage;
                currentMessages[messageIndex].timeSent = formatDate(currentMessages[messageIndex].timeSent.toDate());
                finalMessages.push(currentMessages[messageIndex]);
            }
        }
        this.decryptedMessages = finalMessages;
        return finalMessages;
    };

    async decryptDmMessageWithLock(
        currentMessage,
        thread,
        id
    ) {
        const returnData = await this.drLock.acquire(this.threadId, async () => {
            return await this.decryptDmMessage(
                currentMessage,
                thread,
                id
            );
        });

        return returnData;
    }

    async sendTextWithLock(message) {
        const returnData = await this.drLock.acquire(this.threadId, async () => {
            return await this.sendMessageWithoutLock(message, MessageHandler.MESSAGETYPES.TEXT)
        });

        return returnData
    };

    async sendTypeWithLock(message, type) {
        const returnData = await this.drLock.acquire(this.threadId, async () => {
            return await this.sendMessageWithoutLock(message, type)
        });

        return returnData
    };

    async sendFileWithLock(file, type = MessageHandler.MESSAGETYPES.IMAGE) {
        const returnData = await this.drLock.acquire(this.threadId, async () => {
            return await this.sendFileWithoutLock(file, type)
        });

        return returnData
    };

    async sendMessageWithoutLock(message, type = MessageHandler.MESSAGETYPES.TEXT) {
        const thread = await getDoc(doc(firestore, "threads", this.threadId));
        const dm = thread.data().dm;
        let messageE;

        if (!dm) {
            return await this.sendGroupMessage(message, thread);
        } else {
            const n = await getStoredMetadata(`nextN_${this.threadId}`);
            const pn = await getStoredMetadata(`PN_${this.threadId}`);
            if (n == null && pn == null) {
                console.log("Send Cycled");
                messageE = await this.sendDRDMWithDHExchange(message, 0, 0, type);
            } else {
                if (n == 0) {
                    console.log("Send Cycled");

                    messageE = await this.sendDRDMWithDHExchange(
                        message,
                        n,
                        pn,
                        type,
                        true
                    );
                }
                else {
                    messageE = await this.sendDRDM(message, n, pn, type);
                }
            }
        }
        return messageE;
    };


    async sendFileWithoutLock(file, type = MessageHandler.MESSAGETYPES.IMAGE) {
        const thread = await getDoc(doc(firestore, "threads", this.threadId));
        const dm = thread.data().dm;
        let messageE;

        if (!dm) {
            // return await sendGroupMessage(threadId, message, user, data, thread);
        } else {
            const n = await getStoredMetadata(`nextN_${this.threadId}`);
            const pn = await getStoredMetadata(`PN_${this.threadId}`);
            if (n == null && pn == null) {
                console.log("Send Cycled");
                messageE = await this.sendFileWithDHExchange(file, 0, 0, type);
            } else {
                if (n == 0) {
                    console.log("Send Cycled");

                    messageE = await this.sendFileWithDHExchange(
                        file,
                        n,
                        pn,
                        type,
                        true
                    );
                }
                else {
                    messageE = await this.sendAndEncryptFile(file, n, pn, type);
                }
            }
        }
        return messageE;
    };

    async bypassMissed(n, pn, storedN, currentMessage) {
        let state = {}
        if (n == 0 && pn > storedN) {
            if (pn - storedN > 500) {
                throw "Too many missed messages"
            }
            for (let i = 0; i < pn - storedN; i++) {
                let public_key_old = await getStoredKey(`otherPublicKey_n_${this.threadId}`)
                public_key_old = await exportKey(public_key_old);
                state = { ...state, ...(await this.bypassMissedMessage(storedN + i, public_key_old, state)) };
            }
        }
        if (n > storedN) {
            console.log("Missed Messages")
            for (let i = 0; i < n - storedN; i++) {
                if (n - storedN > 500) {
                    throw "Too many missed messages"
                }
                state = { ...state, ...(await this.bypassMissedMessage(storedN + i, currentMessage.header.publicKey_n, state)) };
            }
        }
        return state;
    }


    async decryptDmMessage(currentMessage, thread, id) {
        //Setup metadata
        const n = currentMessage.header.n;
        const pn = currentMessage.header.pn;
        let storedN = await getStoredMetadata(`nextN_${this.threadId}_r`);
        let alreadyDecrypted = false;
        let state = {}
        let decryptedMessage = undefined;

        if (MessageHandler.isTextType(currentMessage.type)) {
            decryptedMessage = await getStoredMessage(this.threadId, id);
        }
        else {
            decryptedMessage = await getStoredFile(this.threadId, id);
        }

        if (decryptedMessage != undefined) alreadyDecrypted = true;

        if (decryptedMessage == undefined) {
            decryptedMessage = await this.decryptMissedDRDM(
                currentMessage,
                n
            );
        }

        if (decryptedMessage == undefined) {
            decryptedMessage = await this.decryptFirstDRDM(
                currentMessage,
                thread,
                n,
                pn
            );
        }


        if (decryptedMessage == undefined) {
            state = { ...state, ...await this.bypassMissed(n, pn, storedN, currentMessage) };
        }

        try {
            if (decryptedMessage == undefined) {
                state = {
                    ...state, ...(await this.cycleDHRachet(
                        currentMessage,
                        n,
                        state
                    ))
                };
                state = {
                    ...state, ...(await this.decryptDRDM(
                        currentMessage,
                        n,
                        pn,
                        state
                    ))
                };
                decryptedMessage = state.plaintext;
            }
        }
        catch (e) {
            console.log(e)
            return undefined
        }
        if (decryptedMessage !== undefined) {
            if (!alreadyDecrypted && (currentMessage.type != MessageHandler.MESSAGETYPES.READ)) {
                console.log("Sending Acknowledgment");
                await this.sendMessageWithoutLock(currentMessage.id, MessageHandler.MESSAGETYPES.READ);
            }
            if (MessageHandler.isTextType(currentMessage.type)) {
                await storeMessage(this.threadId, currentMessage.id, decryptedMessage);
            }
            else if (MessageHandler.isFileType(currentMessage.type)) {
                await storeFile(this.threadId, currentMessage.id, decryptedMessage);
            }
            await this.storeState(state)
        }

        return decryptedMessage;
    }


    async storeState(state) {
        const promises = [];

        for (const [key, value] of Object.entries(state)) {
            if (key.startsWith("mk_")) {
                promises.push(storeMK(value, key));
                continue;
            }

            if (
                key.startsWith("nextN_") ||
                key.startsWith("PN_")
            ) {
                promises.push(storeMetadata(value, key));
                continue;
            }

            if (
                key.startsWith("chainKey_") ||
                key.startsWith("rootKey_") ||
                key.startsWith("privateKey_") ||
                key.startsWith("publicKey_") ||
                key.startsWith("otherPublicKey_n_")
            ) {
                promises.push(storeKey(value, key));
                continue;
            }

            console.warn("Unknown state key:", key);
        }

        await Promise.all(promises);
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
            const processed = await this.processSingleMessage(
                currentMessages,
                messageIndex,
                finalMessages,
                thread
            );

            if (processed) {
                finalMessages.push(processed);
            }
        }
        return finalMessages;
    }


    async processSingleMessage(currentMessages, messageIndex, finalMessages, thread) {

        let currentMessage = currentMessages[messageIndex];
        let decryptedMessage;
        let needToDelete = false;

        if (MessageHandler.isFileType(currentMessage.type)) {
            if (await getStoredFile(this.threadId, currentMessage.id) === undefined) {
                currentMessage.message = await downloadText(currentMessage.id);
                needToDelete = true;
            }
        }

        try {
            decryptedMessage = await this.decryptDmMessageWithLock(
                currentMessage,
                thread,
                currentMessage.id
            );
        } catch (e) {
            console.log("Error logging decrypt attempt", e);
            return null;
        }

        if (decryptedMessage === undefined) return null;

        if (currentMessage.type === MessageHandler.MESSAGETYPES.READ) {

            if (currentMessage.sentBy.user !== this.user.uid) {

                const finalIndex = finalMessages.findIndex(m => m.id === decryptedMessage);
                const currentIndex = currentMessages.findIndex(m => m.id === decryptedMessage);

                const timeRead = formatDate(currentMessage.timeSent.toDate());

                if (finalIndex !== -1) {
                    finalMessages[finalIndex].read = true;
                    finalMessages[finalIndex].timeRead = timeRead;
                }
                else if (currentIndex !== -1) {
                    currentMessages[currentIndex].read = true;
                    currentMessages[currentIndex].timeRead = timeRead;
                }
            }

            return null;
        }

        if (MessageHandler.isTextType(currentMessage.type)) {
            currentMessage.message = decryptedMessage;
        }

        else if (currentMessage.type === MessageHandler.MESSAGETYPES.IMAGE) {
            if (needToDelete) await deleteStorage(currentMessage.id);
            currentMessage.message = decryptedMessage;
        }

        else if (currentMessage.type === MessageHandler.MESSAGETYPES.FILE) {
            if (needToDelete) await deleteStorage(currentMessage.id);
            currentMessage.message = JSON.parse(decryptedMessage);
        }

        currentMessage.timeSentFormated = formatDate(
            currentMessage.timeSent.toDate()
        );

        return currentMessage;
    }


    async x3dh_r(user_a, data_a, data_b, salt, threadId) {
        const thread = (await getDoc(doc(firestore, "threads", threadId))).data();
        const ekPublic = thread.ekPublic;
        const opkIndex = parseInt(thread.opkIndex);

        let privKey_a = await importX25519PublicRaw(ub64(data_b.publicKey));
        let EKpriv_a = await importX25519PublicRaw(ub64(ekPublic));
        let pubKey_b = data_a.privateKey;
        let SPKpub_b = data_a.SPKPrivateKey;
        let OPKpub_b = await getOPK(opkIndex);

        const dh1 = await runDH(SPKpub_b, privKey_a);
        const dh2 = await runDH(pubKey_b, EKpriv_a);
        const dh3 = await runDH(SPKpub_b, EKpriv_a);

        const dh4 = await runDH(OPKpub_b, EKpriv_a);

        const ikm = combineKeys(dh1, dh2, dh3, dh4);
        const prk = await importHKDFKey(ikm);

        const expanded = await hkdfExpand(prk);

        const chainKey = await importHKDFKeyRaw(expanded["chainKey"]);
        const rootKey = expanded["rootKey"];

        await storeKey(chainKey, `chainKey_${threadId}_r`);
        await storeKey(expanded["chainKey"], `chainKey_${threadId}_r_raw`);
        await storeKey(rootKey, `rootKey_${threadId}`);
        await generateOPK(user_a, data_a, opkIndex);

        return expanded;
    }


    async cycleDHRachet(message, n) {
        const key_n = await getStoredKey(`otherPublicKey_n_${this.threadId}`);
        if (key_n == null || message.header.publicKey_n != await exportKey(key_n)) {
            console.log("CYCLE RECV")

            const { privateKey: newPrivateKey, publicKey: newPublicKey } =
                await generateX25519Keypair();
            const otherPublicKey_n = await importX25519PublicRaw(
                ub64(message.header.publicKey_n)
            );

            const privateKey = await getStoredKey(`privateKey_${this.threadId}_n`);
            const publicKey = await getStoredKey(`publicKey_${this.threadId}_n`);
            const dh = await runDH(privateKey, otherPublicKey_n);
            const prk = await importHKDFKey(dh);
            const rootKey = await getStoredKey(`rootKey_${this.threadId}`);
            let {
                chainKey: chainKey_r,
                chainKey2: chainKey_s,
                rootKey: newRootKey,
                salt,
            } = await hkdfExpand(prk, rootKey);

            const chainKey_s_raw = chainKey_s;
            const chainKey_r_raw = chainKey_r;

            chainKey_s = await importHKDFKeyRaw(chainKey_s);
            chainKey_r = await importHKDFKeyRaw(chainKey_r);

            const ns = await getStoredMetadata(`nextN_${this.threadId}`);

            let state = {
                [`nextN_${this.threadId}`]: 0,
                [`PN_${this.threadId}`]: ns,
                [`otherPublicKey_n_${this.threadId}`]: otherPublicKey_n,
                [`chainKey_${this.threadId}_r`]: chainKey_r,
                [`chainKey_${this.threadId}_r_raw`]: chainKey_r_raw,
                [`privateKey_${this.threadId}_n`]: newPrivateKey,
                [`publicKey_${this.threadId}_n`]: newPublicKey,
                [`rootKey_${this.threadId}`]: newRootKey,
            };

            if (n > 0) {
                if (n > 500) {
                    throw ("Skipping too many messages, stopping at 500")
                }
                for (let i = 0; i < n - 0; i++) {
                    state = { ...state, ...(await this.bypassMissedMessage(0 + i, message.header.publicKey_n, state)) };
                }
            }

            return state;
        }

        return {}
    }


    groupMessages(messages) {
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
                    type: messages[i].type
                }
                groupedMessages.push(output);
                continue
            }

            if (messages[i].sentBy.user == groupedMessages[groupedMessages.length - 1].sentBy.user && messages[i].type == groupedMessages[groupedMessages.length - 1].type && messages[i].read == groupedMessages[groupedMessages.length - 1].read && withinDistance(messages[i].timeSent, groupedMessages[groupedMessages.length - 1].timeSent) && MessageHandler.isGroupableType(messages[i].type)) {
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
                    type: messages[i].type

                }
                groupedMessages.push(output);
                continue
            }
        }
        return groupedMessages;
    }


    async decryptFirstDRDM(message, thread, n, pn) {
        if (n === 0 && pn === 0 && thread.leader != this.user.uid) {
            const member = (
                await getDoc(doc(firestore, "users", message.sentBy.user))
            ).data();
            const salt = (await getDoc(doc(firestore, "threads", this.threadId))).data().salt;

            const result = await this.x3dh_r(this.user, this.data, member, salt, this.threadId);

            const chainKey = await getStoredKey(`chainKey_${this.threadId}_r`);

            const decrypted = await decryptMessageDR(
                chainKey,
                message.header,
                message.message,
                message.nonce
            );

            const otherPublicKey = await importX25519PublicRaw(
                ub64(message.header.publicKey_n)
            );

            await storeKey(otherPublicKey, `otherPublicKey_n_${this.threadId}`);


            const key = await importHKDFKeyRaw(decrypted.nextChainKey);

            await storeKey(key, `chainKey_${this.threadId}_r`);
            await storeKey(decrypted.nextChainKey, `chainKey_${this.threadId}_r_raw`);
            await storeMetadata(n + 1, `nextN_${this.threadId}_r`);
            await storeMetadata(pn, `PN_${this.threadId}_r`);

            return decrypted.plaintext;
        }
        else {
            return;
        }
    }


    async decryptDRDM(message, n, pn, state) {
        let chainKey

        if (state && state[`chainKey_${this.threadId}_r`]) {
            chainKey = state[`chainKey_${this.threadId}_r`];
        }
        else {
            chainKey = await getStoredKey(`chainKey_${this.threadId}_r`);
        }

        const decrypted = await decryptMessageDR(
            chainKey,
            message.header,
            message.message,
            message.nonce
        );

        const otherPublicKey = await importX25519PublicRaw(
            ub64(message.header.publicKey_n)
        );
        const key = await importHKDFKeyRaw(decrypted.nextChainKey);

        return {
            [`otherPublicKey_n_${this.threadId}`]: otherPublicKey,
            [`chainKey_${this.threadId}_r`]: key,
            [`chainKey_${this.threadId}_r_raw`]: decrypted.nextChainKey,
            [`nextN_${this.threadId}_r`]: n + 1,
            [`PN_${this.threadId}_r`]: pn,
            plaintext: decrypted.plaintext,
        }

    }

    async decryptMissedDRDM(message, n) {
        const mk = await getMK(`mk_${this.threadId}_${n}_${message.header.publicKey_n}`);
        if (!mk) {
            return;
        } else {
            console.log("FOUND MK");
        }

        try {
            const decrypted = await decryptMissedMessageDR(
                mk,
                message.header,
                message.message,
                message.nonce,
            );

            await deleteMK(`mk_${this.threadId}_${n}_${message.header.publicKey_n}`);
            await deleteMK(`mk_${this.threadId}_${n}_${message.header.publicKey_n}_raw`);

            return decrypted.plaintext;
        }
        catch (e) {
            console.log("error when decrypting missed message", e);
            return;
        }
    }


    async submitMessage(files, message, setLoading) {
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
                toast.warn("File uploads over 500mb are not permitted")
                continue;
            }
            if (image) {
                await this.sendFileWithLock(text, MessageHandler.MESSAGETYPES.IMAGE)
            }
            else {
                console.log(file)
                const info = {
                    "type": file.type,
                    "name": file.name,
                    "size": file.size,
                    "content": text
                }
                await this.sendFileWithLock(JSON.stringify(info), MessageHandler.MESSAGETYPES.FILE)
            }
        }
        if (message) {
            await this.sendTextWithLock(message)
        }
        setLoading(false)
    }


    async bypassMissedMessage(n, publicKey_n, state) {
        if (state && state[`mk_${this.threadId}_${n}_${publicKey_n}`]) return {};

        let mk = await getMK(`mk_${this.threadId}_${n}_${publicKey_n}`);
        if (!mk) {
            console.log("BYPASSING");
            let chainKey;

            if (state && state[`chainKey_${this.threadId}_r`]) {
                chainKey = state[`chainKey_${this.threadId}_r`];
            }
            else {
                chainKey = await getStoredKey(`chainKey_${this.threadId}_r`);
            }

            const { mkBytes, nextChainKey } = await skipMessageDR(chainKey);

            const key = await importHKDFKeyRaw(nextChainKey);
            mk = await importMessageKey(mkBytes);

            return {
                [`chainKey_${this.threadId}_r`]: key,
                [`chainKey_${this.threadId}_r_raw`]: nextChainKey,
                [`mk_${this.threadId}_${n}_${publicKey_n}`]: mk,
                [`mk_${this.threadId}_${n}_${publicKey_n}_raw`]: mkBytes,
            }
        }

        return {};
    }

    async createDRDM(
        members,
        groupName = "",
    ) {
        if (members.length != 2) {
            toast.error("Direct messages must have 2 people.");
            return;
        }

        if (groupName == "") {
            groupName = members[1].username;
        }

        let memberUID = [];
        for (let i in members) {
            memberUID.push(members[i].uid);
        }

        const otherMember = (
            await getDoc(doc(firestore, "users", members[1].uid))
        ).data();

        const groupId = uuidv4();
        this.threadId = groupId;

        const batch = writeBatch(firestore);

        const { privateKey: ekPrivate, publicKey: ekPublic } =
            await generateX25519Keypair();

        await storeKey(ekPrivate, `ekPrivate_${groupId}`);
        const exportedEk = await exportKey(ekPublic);

        const { result, opkIndex } = await this.x3dh(
            this.user,
            this.data,
            otherMember,
            groupId,
            members[1].uid
        );
        const salt = b64(result["salt"]);

        batch.set(doc(firestore, "threads", groupId), {
            groupName: groupName.toString(),
            members: memberUID,
            createdAt: new Date(),
            latestMessage: new Date(),
            leader: this.user.uid,
            dm: true,
            salt: salt,
            ekPublic: exportedEk,
            opkIndex,
        });
        batch.set(doc(firestore, "threadsId", groupId), {
            id: groupId,
            members: memberUID,
        });


        await this.sendWelcomeMessage(batch, ekPublic, ekPrivate);

        await batch.commit();

        return groupId;
    };


    async x3dh(user_a, data_a, data_b, threadId, uid_b) {
        const preKey = await getRecentOPK(uid_b);
        const opkIndex = parseInt(preKey.index);

        let privKey_a = data_a.privateKey;
        let EKpriv_a = await getStoredKey(`ekPrivate_${threadId}`);
        let pubKey_b = await importX25519PublicRaw(ub64(data_b.publicKey));
        let SPKpub_b = await importX25519PublicRaw(ub64(data_b.SPKPublicKey));
        let OPKpub_b = await importX25519PublicRaw(ub64(preKey.key));

        const dh1 = await runDH(privKey_a, SPKpub_b);
        const dh2 = await runDH(EKpriv_a, pubKey_b);
        const dh3 = await runDH(EKpriv_a, SPKpub_b);
        const dh4 = await runDH(EKpriv_a, OPKpub_b);

        const ikm = combineKeys(dh1, dh2, dh3, dh4);
        const prk = await importHKDFKey(ikm);

        const expanded = await hkdfExpand(prk);

        const chainKey = await importHKDFKeyRaw(expanded["chainKey"]);
        const rootKey = expanded["rootKey"];

        await storeKey(chainKey, `chainKey_${threadId}_s`);
        await storeKey(expanded["chainKey"], `chainKey_${threadId}_s_raw`);
        await storeKey(rootKey, `rootKey_${threadId}`);

        return { result: expanded, opkIndex };
    }


    async sendWelcomeMessage(
        batch,
        ekPublic,
        ekPrivate
    ) {
        const message = "Welcome";
        const messageId = uuidv4();

        const welcomeMessage = await this.getWelcomeMessage(
            message,
            ekPublic,
            ekPrivate
        );

        batch.set(doc(firestore, "threads", this.threadId, "messages", messageId), {
            message: welcomeMessage["ciphertext"],
            header: welcomeMessage["header"],
            nonce: welcomeMessage["nonce"],
            timeSent: new Date(),
            sentBy: {
                user: this.user.uid,
                profileIMG: this.data.profileIMG,
                username: this.data.displayName,
            },
            type: MessageHandler.MESSAGETYPES.TEXT
        });

        batch.update(doc(firestore, "threads", this.threadId), {
            latestMessage: new Date(),
        });

        await storeMessage(this.threadId, messageId, message);
    }

    async migrateKeys(ekPublic, ekPrivate) {
        const privateKey = ekPrivate;
        const publicKey = ekPublic;

        await storeKey(privateKey, `privateKey_${this.threadId}_n`);
        await storeKey(publicKey, `publicKey_${this.threadId}_n`);
    }

    async getWelcomeMessage(
        message,
        ekPublic,
        ekPrivate
    ) {
        await this.migrateKeys(ekPublic, ekPrivate);
        const publicKey_n = await getStoredKey(`publicKey_${this.threadId}_n`);
        const privateKey_n = await getStoredKey(`privateKey_${this.threadId}_n`);
        const chainKey = await getStoredKey(`chainKey_${this.threadId}_s`);

        const encrypted = await encryptMessageDR(
            chainKey,
            0,
            0,
            publicKey_n,
            message,
            this.user.uid
        );

        storeMetadata(1, `nextN_${this.threadId}`);

        const nextChainKey = await importHKDFKeyRaw(encrypted["nextChainKey"]);

        await storeKey(nextChainKey, `chainKey_${this.threadId}_s`);
        await storeKey(encrypted["nextChainKey"], `chainKey_${this.threadId}_s_raw`);

        return {
            ciphertext: encrypted["ciphertext"],
            header: encrypted["header"],
            nonce: encrypted["nonce"],
        };
    }


    async uploadMessage(chainKey, n, pn, publicKey_n, message, type = MessageHandler.MESSAGETYPES.TEXT) {
        const messageId = uuidv4();

        const encrypted = await encryptMessageDR(
            chainKey,
            n,
            pn,
            publicKey_n,
            message,
            this.user.uid
        );

        const nextChainKey = await importHKDFKeyRaw(encrypted["nextChainKey"]);

        const batch = writeBatch(firestore);

        batch.set(doc(firestore, "threads", this.threadId, "messages", messageId), {
            message: encrypted["ciphertext"],
            header: encrypted["header"],
            nonce: encrypted["nonce"],
            timeSent: new Date(),
            sentBy: {
                user: this.user.uid,
                profileIMG: this.data.profileIMG,
                username: this.data.displayName,
            },
            type: type
        });

        batch.update(doc(firestore, "threads", this.threadId), {
            latestMessage: new Date(),
        });

        await batch.commit();

        return { nextChainKey, messageId, encrypted }
    }


    async sendDRDM(message, n = 0, pn = 0, type = MessageHandler.MESSAGETYPES.TEXT) {
        const chainKey = await getStoredKey(`chainKey_${this.threadId}_s`);
        const publicKey_n = await getStoredKey(`publicKey_${this.threadId}_n`);

        const { nextChainKey, messageId, encrypted } = await this.uploadMessage(chainKey, n, pn, publicKey_n, message, type)
        await storeKey(nextChainKey, `chainKey_${this.threadId}_s`);
        await storeKey(encrypted["nextChainKey"], `chainKey_${this.threadId}_s_raw`);
        await storeMessage(this.threadId, messageId, message);
        await storeMetadata(n + 1, `nextN_${this.threadId}`);

        return {
            ciphertext: encrypted["ciphertext"],
            header: encrypted["header"],
            nonce: encrypted["nonce"],
            messageId,
        };
    }


    async sendAndEncryptFile(message, n = 0, pn = 0, type = MessageHandler.MESSAGETYPES.TEXT) {
        const chainKey = await getStoredKey(`chainKey_${this.threadId}_s`);
        const publicKey_n = await getStoredKey(`publicKey_${this.threadId}_n`);

        const messageId = uuidv4();

        const encrypted = await encryptMessageDR(
            chainKey,
            n,
            pn,
            publicKey_n,
            message,
            this.user.uid
        );

        const nextChainKey = await importHKDFKeyRaw(encrypted["nextChainKey"]);
        const storageUrl = await uploadText(encrypted.ciphertext, messageId)

        const batch = writeBatch(firestore);

        batch.set(doc(firestore, "threads", this.threadId, "messages", messageId), {
            message: storageUrl,
            header: encrypted["header"],
            nonce: encrypted["nonce"],
            timeSent: new Date(),
            sentBy: {
                user: this.user.uid,
                profileIMG: this.data.profileIMG,
                username: this.data.displayName,
            },
            type: type
        });

        batch.update(doc(firestore, "threads", this.threadId), {
            latestMessage: new Date(),
        });

        await batch.commit();

        await storeKey(nextChainKey, `chainKey_${this.threadId}_s`);
        await storeKey(encrypted["nextChainKey"], `chainKey_${this.threadId}_s_raw`);
        await storeFile(this.threadId, messageId, message);
        await storeMetadata(n + 1, `nextN_${this.threadId}`);

        return {
            ciphertext: storageUrl,
            header: encrypted["header"],
            nonce: encrypted["nonce"],
            messageId,
        };
    }

    async deriveNewKeys() {
        const { privateKey, publicKey } = await generateX25519Keypair();
        const otherPublicKey_n = await getStoredKey(`otherPublicKey_n_${this.threadId}`);
        const rootKey = await getStoredKey(`rootKey_${this.threadId}`);
        const dh = await runDH(privateKey, otherPublicKey_n);

        const prk = await importHKDFKey(dh);

        const expanded = await hkdfExpand(prk, rootKey);
        return { publicKey, privateKey, ...expanded };
    }


    async sendDRDMWithDHExchange(
        message,
        n = 0,
        pn = 0,
        type = MessageHandler.MESSAGETYPES.TEXT,
        restrict = false
    ) {
        //const get member data
        let memberUid = (await getDoc(doc(firestore, "threads", this.threadId)))
            .data()
            .members.filter((item) => {
                return item != this.user.uid;
            })[0];
        let memberData = (await getDoc(doc(firestore, "users", memberUid))).data();
        memberData.uid = memberUid;

        // Derive new keys
        let {
            chainKey: chainKey_s,
            chainKey2: chainKey_r,
            privateKey,
            publicKey,
            rootKey,
        } = await this.deriveNewKeys();

        chainKey_s = await importHKDFKeyRaw(chainKey_s);
        chainKey_r = await importHKDFKeyRaw(chainKey_r);
        // Done with Rachett step now encrypt message

        const { nextChainKey, messageId, encrypted } = await this.uploadMessage(chainKey_s, 0, pn, publicKey, message, type);

        await storeKey(nextChainKey, `chainKey_${this.threadId}_s`);
        await storeKey(encrypted["nextChainKey"], `chainKey_${this.threadId}_s_raw`);
        await storeMessage(this.threadId, messageId, message);
        await storeMetadata(1, `nextN_${this.threadId}`);
        if (!restrict) {
            await storeMetadata(0, `PN_${this.threadId}`);
        }

        // await storeKey(chainKey_r, `chainKey_${threadId}_r`);
        // await storeKey(chainKey_r_raw, `chainKey_${threadId}_r_raw`);
        await storeKey(privateKey, `privateKey_${this.threadId}_n`);
        await storeKey(publicKey, `publicKey_${this.threadId}_n`);
        await storeKey(rootKey, `rootKey_${this.threadId}`);

        return {
            ciphertext: encrypted["ciphertext"],
            header: encrypted["header"],
            nonce: encrypted["nonce"],
            messageId,
        };
    }

    async sendFileWithDHExchange(
        file,
        n = 0,
        pn = 0,
        type = MessageHandler.MESSAGETYPES.TEXT,
        restrict = false
    ) {
        //const get member data
        let memberUid = (await getDoc(doc(firestore, "threads", this.threadId)))
            .data()
            .members.filter((item) => {
                return item != this.user.uid;
            })[0];
        let memberData = (await getDoc(doc(firestore, "users", memberUid))).data();
        memberData.uid = memberUid;

        // Derive new keys
        let {
            chainKey: chainKey_s,
            chainKey2: chainKey_r,
            privateKey,
            publicKey,
            rootKey,
        } = await this.deriveNewKeys();

        chainKey_s = await importHKDFKeyRaw(chainKey_s);
        chainKey_r = await importHKDFKeyRaw(chainKey_r);

        const messageId = uuidv4();

        const encrypted = await encryptMessageDR(
            chainKey_s,
            0,
            pn,
            publicKey,
            file,
            this.user.uid
        );

        const storageUrl = await uploadText(encrypted.ciphertext, messageId)


        const nextChainKey = await importHKDFKeyRaw(encrypted["nextChainKey"]);

        const batch = writeBatch(firestore);

        batch.set(doc(firestore, "threads", this.threadId, "messages", messageId), {
            message: storageUrl,
            header: encrypted["header"],
            nonce: encrypted["nonce"],
            timeSent: new Date(),
            sentBy: {
                user: this.user.uid,
                profileIMG: this.data.profileIMG,
                username: this.data.displayName,
            },
            type: type
        });

        batch.update(doc(firestore, "threads", this.threadId), {
            latestMessage: new Date(),
        });

        await batch.commit();

        await storeKey(nextChainKey, `chainKey_${this.threadId}_s`);
        await storeKey(encrypted["nextChainKey"], `chainKey_${this.threadId}_s_raw`);
        await storeFile(this.threadId, messageId, file);
        await storeMetadata(1, `nextN_${this.threadId}`);
        if (!restrict) {
            await storeMetadata(0, `PN_${this.threadId}`);
        }

        // await storeKey(chainKey_r, `chainKey_${threadId}_r`);
        // await storeKey(chainKey_r_raw, `chainKey_${threadId}_r_raw`);
        await storeKey(privateKey, `privateKey_${this.threadId}_n`);
        await storeKey(publicKey, `publicKey_${this.threadId}_n`);
        await storeKey(rootKey, `rootKey_${this.threadId}`);

        return {
            ciphertext: storageUrl,
            header: encrypted["header"],
            nonce: encrypted["nonce"],
            messageId,
        };
    }

    async createGroup(members, groupName) {
        if (members.length < 3) {
            toast.error("Group messages must have 3 or more people.");
            return;
        }

        const groupId = uuidv4();
        if (groupName == "") {
            groupName = "unnamed group";
        }

        let memberUID = [];
        for (let i in members) {
            memberUID.push(members[i].uid);
        }

        const secretKey = crypto.getRandomValues(new Uint8Array(32));
        const secretKeyB64 = btoa(String.fromCharCode(...secretKey));
        const myPrivKey = this.data.privateKey;

        const keys = await encryptKeysForMembers(
            myPrivKey,
            members,
            secretKeyB64,
            1,
            groupId
        );

        const batch = writeBatch(firestore);
        batch.set(doc(firestore, "threads", groupId), {
            groupName: groupName.toString(),
            members: memberUID,
            createdAt: new Date(),
            latestMessage: new Date(),
            keys: keys,
            leader: this.user.uid,
            currentKeyVersion: 1,
            dm: false,
        });
        batch.set(doc(firestore, "threadsId", groupId), {
            id: groupId,
            members: memberUID,
        });
        await batch.commit();

        this.threadId = groupId
        return true;
    };


    async decryptMessage(message) {
        if (!this.data.privateKey) {
            return undefined;
        }
        const decryptedKey = await this.getDecryptedKey(
            message.version,
        );
        const sentBy = message.sentBy.user;

        if (!decryptedKey) {
            return undefined;
        }

        if (sentBy == this.user.uid) {
            const decryptedMessage = await decryptGroupMessage(
                decryptedKey,
                message.message,
                this.user.uid,
                ub64(message.nonce)
            );
            return decryptedMessage;
        } else {
            const decryptedMessage = await decryptGroupMessage(
                decryptedKey,
                message.message,
                message.sentBy.user,
                ub64(message.nonce)
            );
            return decryptedMessage;
        }
    };

    async getDecryptedKey(version) {
        try {
            const myPrivKey = this.data.privateKey;

            const thread = (await getDoc(doc(firestore, "threads", this.threadId))).data();

            const member = await getDoc(doc(firestore, "users", thread.leader));
            const fromPublicKey = await importX25519PublicRaw(
                ub64(member.data().publicKey)
            );
            const salt = ub64(thread.keys[version][this.user.uid].salt);
            const iv = ub64(thread.keys[version][this.user.uid].nonce);
            const decryptedKey = ub64(
                await decryptSingleKey(
                    myPrivKey,
                    fromPublicKey,
                    salt,
                    iv,
                    thread.keys[version][this.user.uid].ciphertext,
                    version,
                    this.threadId
                )
            );

            return decryptedKey;
        } catch (e) {
            console.log(e);
            return;
        }
    };


    async sendGroupMessage(message, thread) {
        const decryptedKey = await this.getDecryptedKey(
            thread.data().currentKeyVersion,
        );
        let encryption = await encryptGroupMessage(decryptedKey, message, this.user.uid);

        const batch = writeBatch(firestore);
        batch.set(doc(firestore, "threads", this.threadId, "messages", uuidv4()), {
            message: encryption.ciphertext,
            aad: encryption.aad,
            nonce: encryption.nonce,
            timeSent: new Date(),
            sentBy: {
                user: this.user.uid,
                profileIMG: this.data.profileIMG,
                username: this.data.displayName,
            },
            version: thread.data().currentKeyVersion,
        });

        batch.update(doc(firestore, "threads", this.threadId), {
            latestMessage: new Date(),
        });
        await batch.commit();
    };

    async rotate(
        threadData,
        members,
        _batch = undefined
    ) {
        if (threadData.dm) {
            const secretKey = crypto.getRandomValues(new Uint8Array(32));
            const secretKeyB64 = btoa(String.fromCharCode(...secretKey));
            const myPrivKey = this.data.privateKey;

            const keys = await rotateGroupKey(
                myPrivKey,
                members,
                secretKeyB64,
                threadData.currentKeyVersion + 1,
                threadData.keys[this.user.uid],
                this.threadId
            );

            let batch;
            if (_batch) {
                batch = _batch;
            } else {
                batch = writeBatch(firestore);
            }

            const { [this.user.uid]: _, ...otherKeys } = threadData.keys;

            batch.update(doc(firestore, "threads", this.threadId), {
                keys: { ...otherKeys, [this.user.uid]: keys },
                currentKeyVersion: threadData.currentKeyVersion + 1,
            });
            await batch.commit();
        } else {
            const secretKey = crypto.getRandomValues(new Uint8Array(32));
            const secretKeyB64 = btoa(String.fromCharCode(...secretKey));
            const myPrivKey = this.data.privateKey;

            const keys = await rotateGroupKey(
                myPrivKey,
                members,
                secretKeyB64,
                threadData.currentKeyVersion + 1,
                threadData.keys,
                this.threadId
            );

            let batch;
            if (_batch) {
                batch = _batch;
            } else {
                batch = writeBatch(firestore);
            }

            batch.update(doc(firestore, "threads", this.threadId), {
                keys: keys,
                currentKeyVersion: threadData.currentKeyVersion + 1,
            });
            await batch.commit();
        }
    };
}