import { uuidv4 } from "@firebase/util";
import { getDoc, writeBatch, doc } from "firebase/firestore";
import { firestore } from "../lib/firebase";
import toast from "react-hot-toast";
import AsyncLock from "async-lock";
import {
    b64,
    checkKeySignature,
    combineKeys,
    decryptHeader,
    decryptMessageDR,
    decryptMissedMessageDR,
    encryptMessageDR,
    exportKey,
    generateX25519Keypair,
    hkdfExpand,
    importEd25519PublicRaw,
    importHKDFKey,
    importHKDFKeyRaw,
    importMessageKey,
    importX25519PublicRaw,
    runDH,
    skipMessageDR,
    td,
    te,
    ub64,
    verify,
} from "../lib/e2ee/e2ee";
import {
    deleteMK,
    getMK,
    getOPK,
    getStoredFile,
    getStoredHeader,
    getStoredKey,
    getStoredMessage,
    getStoredMetadata,
    storeFile,
    storeHeader,
    storeKey,
    storeMessage,
    storeMetadata,
    storeMK
} from "../lib/e2ee/indexDB"
import { compressImage, deleteStorage, downloadText, formatDate, generateOPK, getRecentOPK, nextPow2, readFileBytes, stableStringify, uploadText, withinDistance } from "./functions";
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
        UPDATE: 0x04,
        GROUP_INVITE: 0x03,
        READ: 0x02,
        // Files
        IMAGE: 0x11,
        FILE: 0x12,
        //Unencrypted
        UNENCRYPTED_TEXT: 0x31,
        UNENCRYPTED_ADDITION: 0x32,
        UNENCRYPTED_UPDATE: 0x33,
        UNENCRYPTED_REMOVAL: 0x34,
    }

    static isTextType(type) {
        return (type > 0x00 && type < 0x10) || (type > 0x20 && type < 0x30) || (type > 0x30 && type < 0x31)
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
    static isCallType(type) {
        return type > 0x20 && type < 0x30
    }
    static isUnencryptedType(type) {
        return type > 0x30 && type < 0x40
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


    async createDRDM(
        members,
        groupName = "",
        hidden = false,
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

        const { result, opkIndex } = await this.#x3dh(
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
            dm: true,
            salt: salt,
            ekPublic: exportedEk,
            opkIndex,
            hidden
        });
        batch.set(doc(firestore, "threadsId", groupId), {
            id: groupId,
            members: memberUID,
        });


        await this.#sendWelcomeMessage(batch, ekPublic, ekPrivate);

        await batch.commit();

        return groupId;
    };

    async decryptMessages(messagesValue) {
        if (!messagesValue) {
            return;
        }

        const thread = await getDoc(doc(firestore, "threads", this.threadId));
        if (thread.data().dm) {
            const decryptedDmMessages = await this.#decryptDmMessages(messagesValue);
            const groupedMessages = this.#groupMessages(decryptedDmMessages)
            this.decryptedMessages = groupedMessages;
            return groupedMessages
        }
    };

    async submitMessage(files, message, setLoading) {
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
                    toast.warn("File uploads over 500mb are not permitted")
                    continue;
                }
                if (image) {
                    await this.sendFileWithLock(text, MessageHandler.MESSAGETYPES.IMAGE)
                }
                else {

                    const info = {
                        "type": file.type,
                        "name": file.name,
                        "size": file.size,
                        "content": text
                    }
                    await this.sendFileWithLock(stableStringify(info), MessageHandler.MESSAGETYPES.FILE)
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

                    await this.sendFileWithLock(stableStringify(info), MessageHandler.MESSAGETYPES.FILE)
                }
                else {
                    await this.sendTextWithLock(message)
                }
            }
        }
        catch (e) {
            throw e
        } finally {
            setLoading(false)
        }
    }



    async sendTextWithLock(message) {
        const returnData = await this.drLock.acquire(this.threadId, async () => {
            return await this.#sendMessageWithoutLock(message, MessageHandler.MESSAGETYPES.TEXT)
        });

        return returnData
    };

    async sendTypeWithLock(message, type) {
        const returnData = await this.drLock.acquire(this.threadId, async () => {
            return await this.#sendMessageWithoutLock(message, type)
        });

        return returnData
    };

    async sendFileWithLock(file, type = MessageHandler.MESSAGETYPES.IMAGE) {
        const returnData = await this.drLock.acquire(this.threadId, async () => {
            return await this.#sendFileWithoutLock(file, type)
        });

        return returnData
    };


    async #decryptDmMessageWithLock(
        currentMessage,
        thread,
        id
    ) {
        const returnData = await this.drLock.acquire(this.threadId, async () => {
            return await this.#decryptDmMessage(
                currentMessage,
                thread,
                id
            );
        });

        return returnData;
    }

    async #sendMessageWithoutLock(message, type, options = {}) {
        message = te.encode(message)
        let messageE;

        const n = await getStoredMetadata(`nextN_${this.threadId}`);
        const pn = await getStoredMetadata(`PN_${this.threadId}`);
        if (n == null && pn == null) {

            messageE = await this.#sendDRDMWithDHExchange(message, 0, 0, type, options);
        } else {
            if (n == 0) {


                messageE = await this.#sendDRDMWithDHExchange(
                    message,
                    n,
                    pn,
                    type,
                    true,
                    options
                );
            }
            else {
                messageE = await this.#sendDRDM(message, n, pn, type, options);
            }
        }

        return messageE;
    };


    async #sendFileWithoutLock(file, type = MessageHandler.MESSAGETYPES.IMAGE) {
        file = te.encode(file)

        let messageE;


        const n = await getStoredMetadata(`nextN_${this.threadId}`);
        const pn = await getStoredMetadata(`PN_${this.threadId}`);
        if (n == null && pn == null) {

            messageE = await this.#sendFileWithDHExchange(file, 0, 0, type);
        } else {
            if (n == 0) {


                messageE = await this.#sendFileWithDHExchange(
                    file,
                    n,
                    pn,
                    type,
                    true
                );
            }
            else {
                messageE = await this.#sendAndEncryptFile(file, n, pn, type);
            }
        }

        return messageE;
    };

    async #bypassMissed(n, pn, storedN, currentMessage, header) {
        let state = {}
        if (n == 0 && pn > storedN) {
            if (pn - storedN > 500) {
                throw "Too many missed messages"
            }
            for (let i = 0; i < pn - storedN; i++) {
                let public_key_old = await getStoredKey(`otherPublicKey_n_${this.threadId}`)
                public_key_old = await exportKey(public_key_old);
                state = { ...state, ...(await this.#bypassMissedMessage(storedN + i, public_key_old, state)) };
            }
        }
        if (n > storedN) {

            for (let i = 0; i < n - storedN; i++) {
                if (n - storedN > 500) {
                    throw "Too many missed messages"
                }
                state = { ...state, ...(await this.#bypassMissedMessage(storedN + i, header.publicKey_n, state)) };
            }
        }
        return state;
    }


    async #decryptDmMessage(currentMessage, thread, id) {
        //Setup metadata

        let storedN = await getStoredMetadata(`nextN_${this.threadId}_r`);
        let storedPN = await getStoredMetadata(`PN_${this.threadId}_r`);

        let storedN_s = await getStoredMetadata(`nextN_${this.threadId}`);
        let storedPN_s = await getStoredMetadata(`PN_${this.threadId}`);
        let alreadyDecrypted = false;
        let state = {}
        let decryptedMessage = undefined;
        const firstMessage = storedN == undefined && storedPN == undefined && storedN_s == undefined && storedPN_s == undefined
        let needToCycle = false;
        let headerKey;
        let header;
        let n;
        let pn;


        header = await getStoredHeader(this.threadId, id)


        if (header) {

            if (MessageHandler.isTextType(header.type)) {
                decryptedMessage = await getStoredMessage(this.threadId, id);
            }
            else {
                decryptedMessage = await getStoredFile(this.threadId, id);
            }
        }

        if (decryptedMessage != undefined) alreadyDecrypted = true;

        if (decryptedMessage == undefined) {

            if (firstMessage) {
                state = { ...state, ...(await this.#decryptFirstDRDM(currentMessage, thread)) }
            }
            if (state[`headerKey_${this.threadId}_r`]) {
                headerKey = state[`headerKey_${this.threadId}_r`]
            }
            else {
                headerKey = await getStoredKey(`headerKey_${this.threadId}_r`)
            }
            try {
                header = await decryptHeader(headerKey, currentMessage.header.ciphertext, currentMessage.header.nonce)
            }
            catch (e) {
                // if (e.name == "OperationError") {
                if (e) {
                    let nextHeaderKey;
                    if (state[`nextHeaderKey_${this.threadId}_r`]) {
                        nextHeaderKey = state[`nextHeaderKey_${this.threadId}_r`]
                    }
                    else {
                        nextHeaderKey = await getStoredKey(`nextHeaderKey_${this.threadId}_r`)
                    }

                    header = await decryptHeader(nextHeaderKey, currentMessage.header.ciphertext, currentMessage.header.nonce)
                    if (header) {
                        needToCycle = true;
                    }
                }
                else {

                    throw e;
                }
            }
            header = JSON.parse(header.plaintext)
            n = header.n;
            pn = header.pn;

        }

        if (MessageHandler.isFileType(header.type)) {
            if (await getStoredFile(this.threadId, currentMessage.id) === undefined) {
                currentMessage.message = await downloadText(currentMessage.id);
                header.needToDelete = true;
                
            }
        }

        if (decryptedMessage == undefined) {
            decryptedMessage = await this.#decryptMissedDRDM(
                currentMessage,
                n,
                header,
                currentMessage.header
            );
        }

        if (decryptedMessage == undefined) {
            state = { ...state, ...await this.#bypassMissed(n, pn, storedN, currentMessage, header) };
        }

        try {
            if (decryptedMessage == undefined) {
                state = {
                    ...state, ...(await this.#cycleDHRachet(
                        currentMessage,
                        n,
                        state,
                        header,
                        needToCycle
                    ))
                };

                state = {
                    ...state, ...(await this.#decryptDRDM(
                        currentMessage,
                        n,
                        pn,
                        state,
                        header,
                        currentMessage.header
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
            await this.#storeState(state)

            if (!alreadyDecrypted && (header.type != MessageHandler.MESSAGETYPES.READ) && MessageHandler.isGroupableType(header.type)) {

                const readData = {
                    id: currentMessage.id,
                    timeRead: (new Date()).getTime(),
                }
                await this.#sendMessageWithoutLock(stableStringify(readData), MessageHandler.MESSAGETYPES.READ, { timeSent: currentMessage.timeSent.toDate().getTime() });
            }
            if (MessageHandler.isTextType(header.type)) {
                await storeMessage(this.threadId, currentMessage.id, decryptedMessage);
                await storeHeader(this.threadId, currentMessage.id, header);
            }
            else if (MessageHandler.isFileType(header.type)) {
                await storeFile(this.threadId, currentMessage.id, decryptedMessage);
                await storeHeader(this.threadId, currentMessage.id, header);
            }
        }

        return { decryptedMessage, header };
    }


    async #storeState(state) {
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
                key.startsWith("otherPublicKey_n_") ||
                key.startsWith("nextHeaderKey_") ||
                key.startsWith("headerKey_")
            ) {
                promises.push(storeKey(value, key));
                continue;
            }

            if (key == "opk") {
                await generateOPK(value.user, value.data, value.opkIndex);
            }

            console.warn("Unknown state key:", key);
        }

        await Promise.all(promises);
    }

    async #decryptDmMessages(messagesValue) {
        if (!messagesValue) return;

        const thread = (await getDoc(doc(firestore, "threads", this.threadId))).data();
        const membersData = await Promise.all(thread.members.map(async (member) => {
            let memberData = await getDoc(doc(firestore, "users", member))
            const id = memberData.id;
            memberData = memberData.data()
            memberData.id = id;
            return memberData
        }))
        const currentMessages = messagesValue.docs.map(docSnap => ({
            ...docSnap.data(),
            id: docSnap.id,
            read: false
        }));

        const finalMessages = [];

        for (let messageIndex in currentMessages) {
            const processed = await this.#processSingleMessage(
                currentMessages,
                messageIndex,
                finalMessages,
                thread,
                membersData
            );

            if (processed) {
                finalMessages.push(processed);
            } else {
            }
        }
        return finalMessages;
    }


    async #processSingleMessage(currentMessages, messageIndex, finalMessages, thread, membersData) {


        let currentMessage = currentMessages[messageIndex];
        let decryptedMessage;
        let header;

        try {
            let { decryptedMessage: _decryptedMessage, header: _header } = await this.#decryptDmMessageWithLock(
                currentMessage,
                thread,
                currentMessage.id
            );
            decryptedMessage = _decryptedMessage
            header = _header
        } catch (e) {
            console.log(e)
            return null;
        }

        if (decryptedMessage === undefined) return null;
        currentMessage.sentBy = membersData.filter((member) => member.id === header.from)[0];
        currentMessage.type = header.type;

        

        if (currentMessage.type === MessageHandler.MESSAGETYPES.READ) {
            
            if (currentMessage.sentBy.id !== this.user.uid) {


                const decryptedMessageObj = JSON.parse(decryptedMessage);

                const finalIndex = finalMessages.findIndex(m => m.id === decryptedMessageObj["id"]);
                const currentIndex = currentMessages.findIndex(m => m.id === decryptedMessageObj["id"]);

                const timeRead = formatDate(new Date(decryptedMessageObj["timeRead"]));

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
            if (header.needToDelete) await deleteStorage(currentMessage.id);
            currentMessage.message = decryptedMessage;
        }

        else if (currentMessage.type === MessageHandler.MESSAGETYPES.FILE) {
            if (header.needToDelete) await deleteStorage(currentMessage.id);
            currentMessage.message = JSON.parse(decryptedMessage);
        }

        currentMessage.timeSentFormated = formatDate(
            currentMessage.timeSent.toDate()
        );



        return currentMessage;
    }


    async #x3dh_r(user_a, data_a, data_b, salt, threadId) {
        const thread = (await getDoc(doc(firestore, "threads", threadId))).data();
        const ekPublic = thread.ekPublic;
        const opkIndex = parseInt(thread.opkIndex);

        if (data_b.publicKey != await getStoredKey(data_b.id)) {
            toast.error("Sender Key Mismatch. Ensure you are communicating with the correct person")
        }

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
        const nextHeaderKey = await importHKDFKeyRaw(expanded["chainKey2"]);
        const headerKey = await importHKDFKeyRaw(expanded["chainKey3"]);
        const nextHeaderKey_s = await importHKDFKeyRaw(expanded["chainKey4"]);
        const rootKey = expanded["rootKey"];

        return {
            [`chainKey_${threadId}_r`]: chainKey,
            [`chainKey_${threadId}_r_raw`]: expanded["chainKey"],
            [`nextHeaderKey_${threadId}_r`]: nextHeaderKey,
            [`nextHeaderKey_${threadId}_r_raw`]: expanded["chainKey2"],
            [`nextHeaderKey_${threadId}_s`]: nextHeaderKey_s,
            [`nextHeaderKey_${threadId}_s_raw`]: expanded["chainKey4"],
            [`headerKey_${threadId}_r`]: headerKey,
            [`headerKey_${threadId}_r_raw`]: expanded["chainKey3"],
            [`rootKey_${threadId}`]: rootKey,
            "opk": { user: user_a, data: data_a, opkIndex: opkIndex }
        };
    }


    async #cycleDHRachet(message, n, state, header, needToCycle) {
        if (needToCycle) {
            const { privateKey: newPrivateKey, publicKey: newPublicKey } =
                await generateX25519Keypair();
            const otherPublicKey_n = await importX25519PublicRaw(
                ub64(header.publicKey_n)
            );

            let privateKey;
            if (state[`privateKey_${this.threadId}_n`]) {
                privateKey = state[`privateKey_${this.threadId}_n`]
            }
            else {
                privateKey = await getStoredKey(`privateKey_${this.threadId}_n`);
            }
            const dh = await runDH(privateKey, otherPublicKey_n);
            const prk = await importHKDFKey(dh);

            let rootKey;
            if (state[`rootKey_${this.threadId}`]) {
                rootKey = state[`rootKey_${this.threadId}`]
            }
            else {
                rootKey = await getStoredKey(`rootKey_${this.threadId}`);
            }
            let {
                chainKey: chainKey_r,
                chainKey2: nextHeaderKey_r,
                rootKey: newRootKey,
                salt,
            } = await hkdfExpand(prk, rootKey);

            const nextHeaderKey_r_raw = nextHeaderKey_r;
            const chainKey_r_raw = chainKey_r;

            nextHeaderKey_r = await importHKDFKeyRaw(nextHeaderKey_r);
            chainKey_r = await importHKDFKeyRaw(chainKey_r);

            let ns;
            if (state[`nextN_${this.threadId}`]) {
                ns = state[`nextN_${this.threadId}`]
            }
            else {
                ns = await getStoredMetadata(`nextN_${this.threadId}`);
            }

            let currentHeaderKey;
            let currentHeaderKey_raw;
            if (state[`nextHeaderKey_${this.threadId}_r`]) {
                currentHeaderKey = state[`nextHeaderKey_${this.threadId}_r`]
            }
            else {
                currentHeaderKey = await getStoredKey(`nextHeaderKey_${this.threadId}_r`)
            }
            if (state[`nextHeaderKey_${this.threadId}_r_raw`]) {
                currentHeaderKey_raw = state[`nextHeaderKey_${this.threadId}_r_raw`]
            }
            else {
                currentHeaderKey_raw = await getStoredKey(`nextHeaderKey_${this.threadId}_r_raw`)
            }

            let _state = {
                [`nextN_${this.threadId}`]: 0,
                [`PN_${this.threadId}`]: ns,
                [`otherPublicKey_n_${this.threadId}`]: otherPublicKey_n,
                [`chainKey_${this.threadId}_r`]: chainKey_r,
                [`chainKey_${this.threadId}_r_raw`]: chainKey_r_raw,
                [`nextHeaderKey_${this.threadId}_r`]: nextHeaderKey_r,
                [`nextHeaderKey_${this.threadId}_r_raw`]: nextHeaderKey_r_raw,
                [`headerKey_${this.threadId}_r`]: currentHeaderKey,
                [`headerKey_${this.threadId}_r_raw`]: currentHeaderKey_raw,
                [`privateKey_${this.threadId}_n`]: newPrivateKey,
                [`publicKey_${this.threadId}_n`]: newPublicKey,
                [`rootKey_${this.threadId}`]: newRootKey,
            };

            if (n > 0) {
                if (n > 500) {
                    throw ("Skipping too many messages, stopping at 500")
                }
                for (let i = 0; i < n - 0; i++) {
                    _state = { ..._state, ...(await this.#bypassMissedMessage(0 + i, header.publicKey_n, _state)) };
                }
            }

            return _state;
        }

        return {}
    }


    #groupMessages(messages) {
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
                    callOpen: false,
                }
                if (lastCallMessage && messages[i].id == lastCallMessage.id) {
                    output.callOpen = true;
                }
                groupedMessages.push(output);
                continue
            }

            if (messages[i].sentBy.id == groupedMessages[groupedMessages.length - 1].sentBy.id && messages[i].type == groupedMessages[groupedMessages.length - 1].type && messages[i].read == groupedMessages[groupedMessages.length - 1].read && withinDistance(messages[i].timeSent, groupedMessages[groupedMessages.length - 1].timeSent) && MessageHandler.isGroupableType(messages[i].type)) {
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


    async #decryptFirstDRDM(message, thread) {
        let memberId = thread.members.filter((member) => member != this.user.uid)[0]
        let memberData = (
            await getDoc(doc(firestore, "users", memberId))
        ).data();
        memberData.id = memberId;
        const salt = thread.salt;

        const result = await this.#x3dh_r(this.user, this.data, memberData, salt, this.threadId);

        return result
    }


    async #decryptDRDM(message, n, pn, state, header, aad) {
        let chainKey

        if (state && state[`chainKey_${this.threadId}_r`]) {
            chainKey = state[`chainKey_${this.threadId}_r`];
        }
        else {
            chainKey = await getStoredKey(`chainKey_${this.threadId}_r`);
        }


        const decrypted = await decryptMessageDR(
            chainKey,
            message.message,
            message.nonce,
            aad,
            header
        );

        const otherPublicKey = await importX25519PublicRaw(
            ub64(header.publicKey_n)
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

    async #decryptMissedDRDM(message, n, header, aad) {
        const mk = await getMK(`mk_${this.threadId}_${n}_${header.publicKey_n}`);
        if (!mk) {
            return;
        } else {

        }

        try {
            const decrypted = await decryptMissedMessageDR(
                mk,
                aad,
                message.message,
                message.nonce,
            );

            await deleteMK(`mk_${this.threadId}_${n}_${header.publicKey_n}`);
            await deleteMK(`mk_${this.threadId}_${n}_${header.publicKey_n}_raw`);

            return decrypted.plaintext;
        }
        catch (e) {

            return;
        }
    }


    async #bypassMissedMessage(n, publicKey_n, state) {
        if (state && state[`mk_${this.threadId}_${n}_${publicKey_n}`]) return {};

        let mk = await getMK(`mk_${this.threadId}_${n}_${publicKey_n}`);
        if (!mk) {

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



    async #x3dh(user_a, data_a, data_b, threadId, uid_b) {
        const preKey = await getRecentOPK(uid_b);
        const opkIndex = parseInt(preKey.index);

        if (data_b.publicKey != await getStoredKey(uid_b)) {
            toast.error("Sender Key Mismatch. Ensure you are communicating with the correct person")
        }
        

        let privKey_a = data_a.privateKey;
        let EKpriv_a = await getStoredKey(`ekPrivate_${threadId}`);
        let pubKey_b = await importX25519PublicRaw(ub64(data_b.publicKey));
        let publicKeySK = await importEd25519PublicRaw(ub64(data_b.publicKeySK));
        const SPKBundle = data_b.SPKBundle;

        const verified = await verify(publicKeySK, ub64(SPKBundle.SPKPublicKey), ub64(SPKBundle.signature))
        if (!verified) {
            toast.error("Unverified Sender Key Mismatch. Ensure you are communicating with the correct person")
            return;
        }
        let SPKpub_b = await importX25519PublicRaw(ub64(SPKBundle.SPKPublicKey));

        let OPKpub_b = await importX25519PublicRaw(ub64(preKey.key));

        const dh1 = await runDH(privKey_a, SPKpub_b);
        const dh2 = await runDH(EKpriv_a, pubKey_b);
        const dh3 = await runDH(EKpriv_a, SPKpub_b);
        const dh4 = await runDH(EKpriv_a, OPKpub_b);

        const ikm = combineKeys(dh1, dh2, dh3, dh4);
        const prk = await importHKDFKey(ikm);

        const expanded = await hkdfExpand(prk);

        const chainKey = await importHKDFKeyRaw(expanded["chainKey"]);
        const nextHeaderKey = await importHKDFKeyRaw(expanded["chainKey2"]);
        const headerKey = await importHKDFKeyRaw(expanded["chainKey3"]);
        const nextHeaderKey_r = await importHKDFKeyRaw(expanded["chainKey4"]);
        const rootKey = expanded["rootKey"];

        await storeKey(chainKey, `chainKey_${threadId}_s`);
        await storeKey(expanded["chainKey"], `chainKey_${threadId}_s_raw`);
        await storeKey(nextHeaderKey, `nextHeaderKey_${threadId}_s`);
        await storeKey(expanded["chainKey2"], `nextHeaderKey_${threadId}_s_raw`);
        await storeKey(headerKey, `headerKey_${threadId}_s`);
        await storeKey(expanded["chainKey3"], `headerKey_${threadId}_s_raw`);
        await storeKey(nextHeaderKey_r, `nextHeaderKey_${threadId}_r`);
        await storeKey(expanded["chainKey4"], `nextHeaderKey_${threadId}_r_raw`);
        await storeKey(rootKey, `rootKey_${threadId}`);

        return { result: expanded, opkIndex };
    }


    async #sendWelcomeMessage(
        batch,
        ekPublic,
        ekPrivate
    ) {
        const message = te.encode("Welcome");
        const messageId = uuidv4();
        await this.#migrateKeys(ekPublic, ekPrivate);
        const publicKey_n = await getStoredKey(`publicKey_${this.threadId}_n`);
        const paddingAmount = nextPow2(message.byteLength + 16) - message.byteLength - 16

        const header = {
            from: this.user.uid,
            n: 0,
            pn: 0,
            publicKey_n: await exportKey(publicKey_n),
            type: MessageHandler.MESSAGETYPES.TEXT,
            paddingAmount: paddingAmount
        }

        const welcomeMessage = await this.#getWelcomeMessage(
            message,
            header
        );

        batch.set(doc(firestore, "threads", this.threadId, "messages", messageId), {
            message: welcomeMessage["ciphertext"],
            header: welcomeMessage["header"],
            nonce: welcomeMessage["nonce"],
            timeSent: new Date(),
        });

        batch.update(doc(firestore, "threads", this.threadId), {
            latestMessage: new Date(),
        });

        await storeMessage(this.threadId, messageId, "Welcome");
        await storeHeader(this.threadId, messageId, header);

    }

    async #migrateKeys(ekPublic, ekPrivate) {
        const privateKey = ekPrivate;
        const publicKey = ekPublic;

        await storeKey(privateKey, `privateKey_${this.threadId}_n`);
        await storeKey(publicKey, `publicKey_${this.threadId}_n`);
    }

    async #getWelcomeMessage(
        message,
        header
    ) {
        const chainKey = await getStoredKey(`chainKey_${this.threadId}_s`);
        const headerKey = await getStoredKey(`headerKey_${this.threadId}_s`);
        
        const encrypted = await encryptMessageDR(
            chainKey,
            message,
            headerKey,
            header
        );

        await storeMetadata(1, `nextN_${this.threadId}`);

        const nextChainKey = await importHKDFKeyRaw(encrypted["nextChainKey"]);

        await storeKey(nextChainKey, `chainKey_${this.threadId}_s`);
        await storeKey(encrypted["nextChainKey"], `chainKey_${this.threadId}_s_raw`);

        return {
            ciphertext: encrypted["ciphertext"],
            header: encrypted["header"],
            nonce: encrypted["nonce"],
        };
    }


    async #uploadMessage(chainKey, n, pn, publicKey_n, message, header, type = MessageHandler.MESSAGETYPES.TEXT, options = {}) {
        const messageId = uuidv4();

        const headerKey = await getStoredKey(`headerKey_${this.threadId}_s`)

        const encrypted = await encryptMessageDR(
            chainKey,
            message,
            headerKey,
            header
        );

        const nextChainKey = await importHKDFKeyRaw(encrypted["nextChainKey"]);

        const batch = writeBatch(firestore);

        let date;
        if (options.timeSent) {
            date = new Date(options.timeSent);
        } else {
            date = new Date();
        }

        batch.set(doc(firestore, "threads", this.threadId, "messages", messageId), {
            message: encrypted["ciphertext"],
            header: encrypted["header"],
            nonce: encrypted["nonce"],
            timeSent: date,
        });

        batch.update(doc(firestore, "threads", this.threadId), {
            latestMessage: new Date(),
        });

        await batch.commit();

        return { nextChainKey, messageId, encrypted }
    }


    async #sendDRDM(message, n = 0, pn = 0, type = MessageHandler.MESSAGETYPES.TEXT, options = {}) {
        const chainKey = await getStoredKey(`chainKey_${this.threadId}_s`);
        const publicKey_n = await getStoredKey(`publicKey_${this.threadId}_n`);
        const paddingAmount = nextPow2(message.byteLength + 16) - message.byteLength - 16

        const header = {
            from: this.user.uid,
            n: n,
            pn: pn,
            publicKey_n: await exportKey(publicKey_n),
            type: type,
            paddingAmount: paddingAmount
        }
        const { nextChainKey, messageId, encrypted } = await this.#uploadMessage(chainKey, n, pn, publicKey_n, message, header, type, options)
        await storeKey(nextChainKey, `chainKey_${this.threadId}_s`);
        await storeKey(encrypted["nextChainKey"], `chainKey_${this.threadId}_s_raw`);
        await storeMessage(this.threadId, messageId, td.decode(message));
        await storeMetadata(n + 1, `nextN_${this.threadId}`);
        await storeHeader(this.threadId, messageId, header)

        return {
            ciphertext: encrypted["ciphertext"],
            header: encrypted["header"],
            nonce: encrypted["nonce"],
            messageId,
        };
    }


    async #sendAndEncryptFile(message, n = 0, pn = 0, type = MessageHandler.MESSAGETYPES.TEXT) {
        const chainKey = await getStoredKey(`chainKey_${this.threadId}_s`);
        const publicKey_n = await getStoredKey(`publicKey_${this.threadId}_n`);

        const messageId = uuidv4();

        const headerKey = await getStoredKey(`headerKey_${this.threadId}_s`)
        const paddingAmount = nextPow2(message.byteLength + 16) - message.byteLength - 16

        const header = {
            from: this.user.uid,
            n: n,
            pn: pn,
            publicKey_n: await exportKey(publicKey_n),
            type: type,
            paddingAmount: paddingAmount
        }
        const encrypted = await encryptMessageDR(
            chainKey,
            message,
            headerKey,
            header
        );

        const nextChainKey = await importHKDFKeyRaw(encrypted["nextChainKey"]);
        const storageUrl = await uploadText(encrypted.ciphertext, messageId)

        const batch = writeBatch(firestore);

        batch.set(doc(firestore, "threads", this.threadId, "messages", messageId), {
            message: storageUrl,
            header: encrypted["header"],
            nonce: encrypted["nonce"],
            timeSent: new Date(),
        });

        batch.update(doc(firestore, "threads", this.threadId), {
            latestMessage: new Date(),
        });

        await batch.commit();

        await storeKey(nextChainKey, `chainKey_${this.threadId}_s`);
        await storeKey(encrypted["nextChainKey"], `chainKey_${this.threadId}_s_raw`);
        await storeFile(this.threadId, messageId, td.decode(message));
        await storeHeader(this.threadId, messageId, header)
        await storeMetadata(n + 1, `nextN_${this.threadId}`);

        return {
            ciphertext: storageUrl,
            header: encrypted["header"],
            nonce: encrypted["nonce"],
            messageId,
        };
    }

    async #deriveNewKeys() {
        const { privateKey, publicKey } = await generateX25519Keypair();
        const otherPublicKey_n = await getStoredKey(`otherPublicKey_n_${this.threadId}`);
        const rootKey = await getStoredKey(`rootKey_${this.threadId}`);

        const dh = await runDH(privateKey, otherPublicKey_n);
        const prk = await importHKDFKey(dh);

        const expanded = await hkdfExpand(prk, rootKey);
        return { publicKey, privateKey, ...expanded };
    }


    async #sendDRDMWithDHExchange(
        message,
        n = 0,
        pn = 0,
        type = MessageHandler.MESSAGETYPES.TEXT,
        restrict = false,
        options = {}
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
            chainKey2: nextHeaderKey_s,
            privateKey,
            publicKey,
            rootKey,
        } = await this.#deriveNewKeys();

        chainKey_s = await importHKDFKeyRaw(chainKey_s);
        const nextHeaderKey_s_raw = nextHeaderKey_s
        nextHeaderKey_s = await importHKDFKeyRaw(nextHeaderKey_s);

        const currentHeaderKey = await getStoredKey(`nextHeaderKey_${this.threadId}_s`)
        const currentHeaderKey_raw = await getStoredKey(`nextHeaderKey_${this.threadId}_s_raw`)

        await storeKey(nextHeaderKey_s, `nextHeaderKey_${this.threadId}_s`);
        await storeKey(nextHeaderKey_s_raw, `nextHeaderKey_${this.threadId}_s_raw`);
        await storeKey(currentHeaderKey, `headerKey_${this.threadId}_s`);
        await storeKey(currentHeaderKey_raw, `headerKey_${this.threadId}_s_raw`);
        const paddingAmount = nextPow2(message.byteLength + 16) - message.byteLength - 16
        

        const header = {
            from: this.user.uid,
            n: 0,
            pn: pn,
            publicKey_n: await exportKey(publicKey),
            type: type,
            paddingAmount: paddingAmount
        }

        const { nextChainKey, messageId, encrypted } = await this.#uploadMessage(chainKey_s, 0, pn, publicKey, message, header, type, options);

        await storeKey(nextChainKey, `chainKey_${this.threadId}_s`);
        await storeKey(encrypted["nextChainKey"], `chainKey_${this.threadId}_s_raw`);
        await storeMessage(this.threadId, messageId, td.decode(message));
        await storeHeader(this.threadId, messageId, header)
        await storeMetadata(1, `nextN_${this.threadId}`);
        if (!restrict) {
            await storeMetadata(0, `PN_${this.threadId}`);
        }

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

    async #sendFileWithDHExchange(
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
            chainKey2: nextHeaderKey,
            privateKey,
            publicKey,
            rootKey,
        } = await this.#deriveNewKeys();

        chainKey_s = await importHKDFKeyRaw(chainKey_s);
        const nextHeaderKey_raw = nextHeaderKey;
        nextHeaderKey = await importHKDFKeyRaw(nextHeaderKey);
        const currentHeaderKey = await getStoredKey(`nextHeaderKey_${this.threadId}_s`)
        const currentHeaderKey_raw = await getStoredKey(`nextHeaderKey_${this.threadId}_s_raw`)
        await storeKey(nextHeaderKey, `nextHeaderKey_${this.threadId}_s`);
        await storeKey(nextHeaderKey_raw, `nextHeaderKey_${this.threadId}_s_raw`);
        await storeKey(currentHeaderKey, `headerKey_${this.threadId}_s`);
        await storeKey(currentHeaderKey_raw, `headerKey_${this.threadId}_s_raw`);
        const messageId = uuidv4();

        const headerKey = await getStoredKey(`headerKey_${this.threadId}_s`)
        const paddingAmount = nextPow2(file.byteLength + 16) - file.byteLength - 16

        const header = {
            from: this.user.uid,
            n: 0,
            pn: pn,
            publicKey_n: await exportKey(publicKey),
            type: type,
            paddingAmount: paddingAmount
        }
        const encrypted = await encryptMessageDR(
            chainKey_s,
            file,
            headerKey,
            header
        );

        const storageUrl = await uploadText(encrypted.ciphertext, messageId)


        const nextChainKey = await importHKDFKeyRaw(encrypted["nextChainKey"]);

        const batch = writeBatch(firestore);

        batch.set(doc(firestore, "threads", this.threadId, "messages", messageId), {
            message: storageUrl,
            header: encrypted["header"],
            nonce: encrypted["nonce"],
            timeSent: new Date(),
        });

        batch.update(doc(firestore, "threads", this.threadId), {
            latestMessage: new Date(),
        });

        await batch.commit();

        await storeKey(nextChainKey, `chainKey_${this.threadId}_s`);
        await storeKey(encrypted["nextChainKey"], `chainKey_${this.threadId}_s_raw`);
        await storeFile(this.threadId, messageId, td.decode(file));
        await storeHeader(this.threadId, messageId, header)
        await storeMetadata(1, `nextN_${this.threadId}`);
        if (!restrict) {
            await storeMetadata(0, `PN_${this.threadId}`);
        }

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

}