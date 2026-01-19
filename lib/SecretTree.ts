import { deleteKey, getStoredKey, hkdfExpandWithLabels, xorBytes, storeKey, importHKDFKey, getStoredMetadata, b64, importAesGcmKey } from "./e2ee/e2ee";
import { KEMTreeNode, KEMTreeRoot } from "./KEMTree";

export class SecretTreeNode {
    public index: number;
    public left: SecretTreeNode | null = null;
    public right: SecretTreeNode | null = null;
    public parent?: SecretTreeNode | null = null;
    public epoch: number
    public applicationSecret: Uint8Array | null = null;
    public handshakeSecret: Uint8Array | null = null;
    public threadId: string;

    constructor(args: {
        index: number;
        threadId: string;
        parent: SecretTreeNode | null
        left?: SecretTreeNode | null;
        right?: SecretTreeNode | null;
        epoch: number;
    }) {
        this.epoch = args.epoch;
        this.parent = args.parent;
        this.index = args.index;
        this.threadId = args.threadId;
        this.left = args.left ?? null;
        this.right = args.right ?? null;
    }

    static async create(args: {
        index: number;
        threadId: string;
        parent: SecretTreeNode | null;
        left?: SecretTreeNode | null;
        right?: SecretTreeNode | null;
        epoch: number;
    }) {
        let applicationSecret: Uint8Array | null = await getStoredKey(`applicationSecret_${args.index}_${args.epoch}_${args.threadId}`);
        let handshakeSecret: Uint8Array | null = await getStoredKey(`handshakeSecret_${args.index}_${args.epoch}_${args.threadId}`);

        const secretTreeNode = new SecretTreeNode({ ...args })

        if (applicationSecret == null || handshakeSecret == null) {
            await secretTreeNode.deriveChildrenNodeSecrets()

            applicationSecret = await getStoredKey(`applicationSecret_${args.index}_${args.epoch}_${args.threadId}`);
            handshakeSecret = await getStoredKey(`handshakeSecret_${args.index}_${args.epoch}_${args.threadId}`);
        }

        secretTreeNode.applicationSecret = applicationSecret
        secretTreeNode.handshakeSecret = handshakeSecret

        return secretTreeNode
    }

    async deriveChildrenNodeSecrets() {
        let nodeSecret = await getStoredKey(`nodeSecret_${this.index}_${this.epoch}_${this.threadId}`)

        if (nodeSecret) {
            if (this.left) {
                const leftNodeSecret = await hkdfExpandWithLabels(nodeSecret, "left")
                await storeKey(leftNodeSecret, `nodeSecret_${this.left.index}_${this.epoch}_${this.threadId}`)
            }

            if (this.right) {
                const rightNodeSecret = await hkdfExpandWithLabels(nodeSecret, "right")
                await storeKey(rightNodeSecret, `nodeSecret_${this.right.index}_${this.epoch}_${this.threadId}`)
            }

            const applicationSecret = await hkdfExpandWithLabels(nodeSecret, "application")
            const handshakeSecret = await hkdfExpandWithLabels(nodeSecret, "handshake")

            await storeKey(applicationSecret, `applicationSecret_${this.index}_${this.epoch}_${this.threadId}`)
            await storeKey(handshakeSecret, `handshakeSecret_${this.index}_${this.epoch}_${this.threadId}`)
            this.applicationSecret = applicationSecret
            this.handshakeSecret = handshakeSecret

            if (this.left && this.right) {
                await deleteKey(`nodeSecret_${this.index}_${this.epoch}_${this.threadId}`)
            }

            return;
        }

        if (!this.parent) {
            const encryption_secret = await getStoredKey(`encryptionSecret_${this.epoch}_${this.threadId}`)

            if (this.left) {
                const leftNodeSecret = await hkdfExpandWithLabels(encryption_secret, "left")
                await storeKey(leftNodeSecret, `nodeSecret_${this.left.index}_${this.epoch}_${this.threadId}`)
            }

            if (this.right) {
                const rightNodeSecret = await hkdfExpandWithLabels(encryption_secret, "right")
                await storeKey(rightNodeSecret, `nodeSecret_${this.right.index}_${this.epoch}_${this.threadId}`)
            }

            const applicationSecret = await hkdfExpandWithLabels(encryption_secret, "application")
            const handshakeSecret = await hkdfExpandWithLabels(encryption_secret, "handshake")

            await storeKey(applicationSecret, `applicationSecret_${this.index}_${this.epoch}_${this.threadId}`)
            await storeKey(handshakeSecret, `handshakeSecret_${this.index}_${this.epoch}_${this.threadId}`)
            this.applicationSecret = applicationSecret
            this.handshakeSecret = handshakeSecret

            return;
        }

        await this.parent.deriveChildrenNodeSecrets()

        nodeSecret = await getStoredKey(`nodeSecret_${this.index}_${this.epoch}_${this.threadId}`)

        if (this.left) {
            const leftNodeSecret = await hkdfExpandWithLabels(nodeSecret, "left")
            await storeKey(leftNodeSecret, `nodeSecret_${this.left.index}_${this.epoch}_${this.threadId}`)
        }

        if (this.right) {
            const rightNodeSecret = await hkdfExpandWithLabels(nodeSecret, "right")
            await storeKey(rightNodeSecret, `nodeSecret_${this.right.index}_${this.epoch}_${this.threadId}`)
        }

        const applicationSecret = await hkdfExpandWithLabels(nodeSecret, "application")
        const handshakeSecret = await hkdfExpandWithLabels(nodeSecret, "handshake")

        await storeKey(applicationSecret, `applicationSecret_${this.index}_${this.epoch}_${this.threadId}`)
        await storeKey(handshakeSecret, `handshakeSecret_${this.index}_${this.epoch}_${this.threadId}`)
        this.applicationSecret = applicationSecret
        this.handshakeSecret = handshakeSecret

        if (this.left && this.right) {
            await deleteKey(`nodeSecret_${this.index}_${this.epoch}_${this.threadId}`)
        }

        return;
    }

    static async rebuild(kemTreeNode: KEMTreeNode, parent: SecretTreeNode) {
        const secretTreeNode = await SecretTreeNode.create({ index: kemTreeNode.index, threadId: kemTreeNode.threadId, epoch: kemTreeNode.epoch, parent: parent })
        const left = kemTreeNode.left ? await SecretTreeNode.rebuild(kemTreeNode.left, secretTreeNode) : null
        const right = kemTreeNode.right ? await SecretTreeNode.rebuild(kemTreeNode.right, secretTreeNode) : null
        secretTreeNode.left = left
        secretTreeNode.right = right

        return secretTreeNode;
    }

    async getSendingKey() {
        const n = await getStoredMetadata(`n_${this.epoch}_${this.threadId}`)
        const sendingKey = await hkdfExpandWithLabels(this.applicationSecret, "send")
        let nonce = await hkdfExpandWithLabels(this.applicationSecret, `nonce:${n}`, 8)
        const nextApplicationSecret = await hkdfExpandWithLabels(this.applicationSecret, "application")
        let nonceFirstFour = nonce.slice(0, 4)
        const reuse = crypto.getRandomValues(new Uint8Array(4))
        nonceFirstFour = xorBytes(nonceFirstFour, reuse)
        const outNonce = new Uint8Array(8)
        outNonce.set(nonceFirstFour, 0)
        outNonce.set(nonce.slice(4), 4)

        this.applicationSecret = nextApplicationSecret
        await storeKey(nextApplicationSecret, `applicationSecret_${this.index}_${this.epoch}_${this.threadId}`)

        return {
            nonce: outNonce,
            reuseGuard: b64(reuse),
            sendingKey: await importAesGcmKey(sendingKey)
        }
    }

    async getReceivingKey(reuse: Uint8Array) {
        const n = await getStoredMetadata(`n_${this.epoch}_${this.threadId}`)

        const sendingKey = await hkdfExpandWithLabels(this.applicationSecret, "send")
        let nonce = await hkdfExpandWithLabels(this.applicationSecret, `nonce:${n}`, 8)
        const nextApplicationSecret = await hkdfExpandWithLabels(this.applicationSecret, "application")
        let nonceFirstFour = nonce.slice(0, 4)
        nonceFirstFour = xorBytes(nonceFirstFour, reuse)
        const outNonce = new Uint8Array(8)
        outNonce.set(nonceFirstFour, 0)
        outNonce.set(nonce.slice(4), 4)

        this.applicationSecret = nextApplicationSecret
        await storeKey(nextApplicationSecret, `applicationSecret_${this.index}_${this.epoch}_${this.threadId}`)

        return {
            nonce: outNonce,
            receivingKey: await importHKDFKey(sendingKey)
        }
    }

    findIndex(index: number): SecretTreeNode | null {
        if (index == this.index) return this;
        const left = this.left?.findIndex(index)
        if (left) return left;

        const right = this.right?.findIndex(index)
        if (right) return right;

        return null
    }
}

export class SecretTreeRoot extends SecretTreeNode {
    public initSecret: Uint8Array;
    public encryptionSecret: Uint8Array;
    public left: SecretTreeNode | null = null;
    public right: SecretTreeNode | null = null;
    public index: number;
    public threadId: string;
    public epoch: number;

    constructor(args: {
        kemTreeRoot: KEMTreeRoot;
        left?: SecretTreeNode | null;
        right?: SecretTreeNode | null;
    }) {
        super({ index: args.kemTreeRoot.index, threadId: args.kemTreeRoot.threadId, epoch: args.kemTreeRoot.epoch, parent: null })

        this.initSecret = args.kemTreeRoot.initSecret
        this.encryptionSecret = args.kemTreeRoot.encryptionSecret
        this.index = args.kemTreeRoot.index;
        this.threadId = args.kemTreeRoot.threadId
        this.epoch = args.kemTreeRoot.epoch
        this.left = args.left ?? null
        this.right = args.right ?? null
    }


    static async createRoot(args: {
        kemTreeRoot: KEMTreeRoot;
        left?: SecretTreeNode | null;
        right?: SecretTreeNode | null;
    }) {
        let applicationSecret: Uint8Array | null = await getStoredKey(`applicationSecret_${args.kemTreeRoot.index}_${args.kemTreeRoot.epoch}_${args.kemTreeRoot.threadId}`);
        let handshakeSecret: Uint8Array | null = await getStoredKey(`handshakeSecret_${args.kemTreeRoot.index}_${args.kemTreeRoot.epoch}_${args.kemTreeRoot.threadId}`);

        const secretTreeNode = new SecretTreeRoot({ ...args })

        if (applicationSecret == null || handshakeSecret == null) {
            await secretTreeNode.deriveChildrenNodeSecrets()

            applicationSecret = await getStoredKey(`applicationSecret_${args.kemTreeRoot.index}_${args.kemTreeRoot.epoch}_${args.kemTreeRoot.threadId}`);
            handshakeSecret = await getStoredKey(`handshakeSecret_${args.kemTreeRoot.index}_${args.kemTreeRoot.epoch}_${args.kemTreeRoot.threadId}`);
        }

        secretTreeNode.applicationSecret = applicationSecret
        secretTreeNode.handshakeSecret = handshakeSecret

        return secretTreeNode
    }

    static async rebuildTree(kemTreeRoot: KEMTreeRoot) {
        const secretTreeRoot = await SecretTreeRoot.createRoot({ kemTreeRoot })

        const left = kemTreeRoot.left ? await SecretTreeNode.rebuild(kemTreeRoot.left, secretTreeRoot) : null
        const right = kemTreeRoot.right ? await SecretTreeNode.rebuild(kemTreeRoot.right, secretTreeRoot) : null

        secretTreeRoot.left = left
        secretTreeRoot.right = right

        return secretTreeRoot;
    }
}

export class SecretTree {
    public root: SecretTreeRoot;

    private constructor(root: SecretTreeRoot) {
        this.root = root;
    }

    static async initiate(args: {
        kemTreeRoot: KEMTreeRoot;
    }) {
        const secretTreeRoot = await SecretTreeRoot.rebuildTree(args.kemTreeRoot)
        const secretTree = new SecretTree(secretTreeRoot)
        return secretTree
    }
}
