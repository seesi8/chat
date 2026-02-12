import { deleteKey, getStoredKey, hkdfExpandWithLabels, xorBytes, storeKey, importHKDFKey, getStoredMetadata, b64, importAesGcmKey, storeMetadata } from "./e2ee/e2ee";
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
        const secretTreeNode = new SecretTreeNode({ ...args })

        return secretTreeNode
    }
    async deriveChildrenNodeSecrets() {
        let nodeSecret = await getStoredKey(`nodeSecret_${this.index}_${this.epoch}_${this.threadId}`)

        // If we don't have our secret yet, we need to get it from our parent chain
        if (!nodeSecret) {
            if (!this.parent) {
                // We're the root - use encryption secret
                nodeSecret = await getStoredKey(`encryptionSecret_${this.epoch}_${this.threadId}`)
            } else {
                // Ensure parent has derived its secrets first
                await this.parent.deriveChildrenNodeSecrets()

                // Parent should now have its nodeSecret (or applicationSecret if it was derived)
                let parentSecret = await getStoredKey(`nodeSecret_${this.parent.index}_${this.epoch}_${this.threadId}`)

                // If parent's nodeSecret was deleted (has both children), we need to re-derive from grandparent
                if (!parentSecret) {
                    if (!this.parent.parent) {
                        parentSecret = await getStoredKey(`encryptionSecret_${this.epoch}_${this.threadId}`)
                    } else {
                        // Recursively get parent's secret by going up the chain
                        parentSecret = await this.getAncestorSecret(this.parent)
                    }
                }

                const label = (this.index < this.parent.index) ? "left" : "right"
                nodeSecret = await hkdfExpandWithLabels(parentSecret, label)
                await storeKey(nodeSecret, `nodeSecret_${this.index}_${this.epoch}_${this.threadId}`)
            }
        }

        // Now derive children and own secrets
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
    }

    // Helper to walk up the tree and derive down to get a node's secret
    private async getAncestorSecret(node: SecretTreeNode): Promise<Uint8Array> {
        // Walk up to find an ancestor with a stored secret or the root
        const path: SecretTreeNode[] = []
        let current: SecretTreeNode | null = node

        while (current) {
            const secret = await getStoredKey(`nodeSecret_${current.index}_${current.epoch}_${current.threadId}`)
            if (secret) {
                // Found a stored secret, now derive down the path
                return this.deriveDownPath(secret, path)
            }
            path.unshift(current)
            current = current.parent
        }

        // Reached root with no secret found - start from encryption secret
        const encryptionSecret = await getStoredKey(`encryptionSecret_${this.epoch}_${this.threadId}`)
        return this.deriveDownPath(encryptionSecret, path)
    }

    private async deriveDownPath(startSecret: Uint8Array, path: SecretTreeNode[]): Promise<Uint8Array> {
        let secret = startSecret

        for (let i = 0; i < path.length; i++) {
            const node = path[i]
            const parent = i === 0 ? null : path[i - 1]

            if (parent) {
                const label = (node.index < parent.index) ? "left" : "right"
                secret = await hkdfExpandWithLabels(secret, label)
                await storeKey(secret, `nodeSecret_${node.index}_${node.epoch}_${node.threadId}`)
            }
        }

        return secret
    }

    static async rebuild(kemTreeNode: KEMTreeNode, parent: SecretTreeNode) {
        const secretTreeNode = await SecretTreeNode.create({ index: kemTreeNode.index, threadId: kemTreeNode.threadId, epoch: kemTreeNode.epoch, parent: parent })
        const left = kemTreeNode.left ? await SecretTreeNode.rebuild(kemTreeNode.left, secretTreeNode) : null
        const right = kemTreeNode.right ? await SecretTreeNode.rebuild(kemTreeNode.right, secretTreeNode) : null
        secretTreeNode.left = left
        secretTreeNode.right = right

        return secretTreeNode;
    }

    async setupKeys() {
        let applicationSecret: Uint8Array | null = await getStoredKey(`applicationSecret_${this.index}_${this.epoch}_${this.threadId}`);
        let handshakeSecret: Uint8Array | null = await getStoredKey(`handshakeSecret_${this.index}_${this.epoch}_${this.threadId}`);
        if (applicationSecret == null || handshakeSecret == null) {
            await this.deriveChildrenNodeSecrets()

            applicationSecret = await getStoredKey(`applicationSecret_${this.index}_${this.epoch}_${this.threadId}`);
            handshakeSecret = await getStoredKey(`handshakeSecret_${this.index}_${this.epoch}_${this.threadId}`);
        }

        this.applicationSecret = applicationSecret
        this.handshakeSecret = handshakeSecret
    }

    async getSendingKey() {

        await this.setupKeys()

        const n = (await getStoredMetadata(`n_${this.epoch}_${this.threadId}`)) ?? 0
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
        await storeMetadata(n + 1, `n_${this.epoch}_${this.threadId}`)

        
        
        return {
            nonce: outNonce,
            reuseGuard: b64(reuse),
            sendingKey: await importAesGcmKey(sendingKey),
            n
        }
    }

    async getReceivingKey(reuse: Uint8Array, n: number) {
        await this.setupKeys()

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
            receivingKey: await importAesGcmKey(sendingKey)
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

        const secretTreeNode = new SecretTreeRoot({ ...args })

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
