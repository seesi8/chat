import { b64, deriveX25519Keypair, encryptMLS, encryptWithPublicKey, exportKey, getCryptoRandomValues, hkdfExpandWithLabels, importHKDFKeyRaw, importX25519PublicRaw, sha256Bytes, te, ub64 } from "./e2ee/e2ee";
import { deleteKey, storeKey, getStoredKey } from "./e2ee/indexDB";
import { depthEdgesFromLeaves, mlsChildren, stableStringify } from "./functions";
import { SecretTree } from "./SecretTree";

async function getPrivateKeyAtOrBeforeEpoch(index: number, epoch: number, threadId: string): Promise<CryptoKey | null> {
    const maxEpoch = Math.max(0, epoch)
    for (let currentEpoch = maxEpoch; currentEpoch >= 0; currentEpoch--) {
        const key = (await getStoredKey(`privateKey_${index}_${currentEpoch}_${threadId}`)) ?? null
        if (key) return key
    }
    return null
}

async function getSecretAtOrBeforeEpoch(prefix: "initSecret" | "encryptionSecret", epoch: number, threadId: string): Promise<Uint8Array | null> {
    const maxEpoch = Math.max(0, epoch)
    for (let currentEpoch = maxEpoch; currentEpoch >= 0; currentEpoch--) {
        const secret = (await getStoredKey(`${prefix}_${currentEpoch}_${threadId}`)) ?? null
        if (secret) return secret
    }
    return null
}

export class KEMTreeNode {
    public publicKey?: CryptoKey | null = null;
    public privateKey?: CryptoKey | null = null;
    public threadId: string;
    public index: number;
    public left: KEMTreeNode | null = null;
    public right: KEMTreeNode | null = null;
    public parent: KEMTreeNode | null = null;
    public credential?: { user: string, identityKey: string } | null = null;
    public epoch: number;

    constructor(args: {
        index: number;
        publicKey?: CryptoKey | null;
        privateKey?: CryptoKey | null;
        threadId: string;
        left?: KEMTreeNode | null;
        right?: KEMTreeNode | null;
        parent?: KEMTreeNode | null;
        credential?: { user: string, identityKey: string };
        epoch: number;
    }) {
        this.epoch = args.epoch
        this.index = args.index;
        this.publicKey = args.publicKey ?? null;
        this.privateKey = args.privateKey ?? null;
        this.threadId = args.threadId;
        this.left = args.left ?? null;
        this.right = args.right ?? null;
        this.parent = args.parent ?? null;
        this.credential = args.credential ?? null
    }

    static async create(args: {
        index: number;
        publicKey: CryptoKey;
        threadId: string;
        left?: KEMTreeNode | null;
        right?: KEMTreeNode | null;
        parent?: KEMTreeNode | null;
        credential?: { user: string, identityKey: string };
        epoch: number;
    }) {
        const privateKey = await getPrivateKeyAtOrBeforeEpoch(args.index, args.epoch, args.threadId)

        return new KEMTreeNode({ ...args, privateKey })
    }

    static async createFromJson(json: any, parent: KEMTreeNode | null = null): Promise<KEMTreeNode> {
        const index = json.index;
        const threadId = json.threadId;
        const privateKey = await getPrivateKeyAtOrBeforeEpoch(index, json.epoch, threadId)
        const publicKey = await importX25519PublicRaw(ub64(json.publicKey))
        const credential = json.credential ?? null;
        const kemTreeNode = new KEMTreeNode({ index, publicKey, privateKey, threadId, credential, epoch: json.epoch, parent: parent })
        kemTreeNode.left = json.left ? await KEMTreeNode.createFromJson(json.left, kemTreeNode) : null
        kemTreeNode.right = json.right ? await KEMTreeNode.createFromJson(json.right, kemTreeNode) : null
        return kemTreeNode
    }

    async setPrivateKey(privateKey: CryptoKey) {

        await storeKey(privateKey, `privateKey_${this.index}_${this.epoch}_${this.threadId}`) ?? null
        this.privateKey = privateKey

    }

    async getExportable() {
        const publicKeyRaw = (await exportKey(this.publicKey)) ?? null

        let data: {
            index: number;
            publicKey: string,
            threadId: string
            credential: {
                user: string;
                identityKey: string;
            },
            epoch: number
        } = {
            index: this.index,
            publicKey: publicKeyRaw,
            threadId: this.threadId,
            credential: this.credential,
            epoch: this.epoch
        }
        const left = (await this.left?.getExportable()) ?? null
        const right = (await this.right?.getExportable()) ?? null

        return { ...data, left, right };
    }

    getOpenChildIndex(): number | null {
        //Leaf
        if (this.credential) return null;

        //Open
        if (!this.publicKey && !this.left && !this.right) return this.index;

        if (this.left) {
            const leftOpen = this.left.getOpenChildIndex();
            if (leftOpen != null) return leftOpen;
        }

        if (this.right) {
            const rightOpen = this.right.getOpenChildIndex();
            if (rightOpen != null) return rightOpen;
        }

        return null;
    }

    getCoChild() {
        let sibling: KEMTreeNode | undefined;

        if (!this.parent) return { nodes: [], sibiling: null };

        if (this.index > this.parent.index) {
            // I am right child
            sibling = this.parent.left;
        } else {
            // I am left child
            sibling = this.parent.right;
        }

        if (!sibling) return { nodes: [], sibiling: null };

        const collectCoverNodes = (node?: KEMTreeNode): KEMTreeNode[] => {
            if (!node) return [];

            // Stop this branch if this node already has a public key
            if (node.publicKey) return [node];

            // Otherwise, search children
            const leftHits = collectCoverNodes(node.left);
            const rightHits = collectCoverNodes(node.right);

            return [...leftHits, ...rightHits];
        };

        return { nodes: collectCoverNodes(sibling), sibiling: sibling.index };
    }


    async workUpPath(
        pathSecret: Uint8Array,
        updatePath = {},
        epoch = this.epoch + 1,
        directPathPublicKeys: { [key: string]: string } = {}
    ) {
        this.epoch = epoch
        const { privateKey, publicKey } = await deriveX25519Keypair(pathSecret)
        await storeKey(privateKey, `privateKey_${this.index}_${this.epoch}_${this.threadId}`)
        this.privateKey = privateKey
        this.publicKey = publicKey
        const publicKeyB64 = await exportKey(publicKey)
        directPathPublicKeys["" + this.index] = publicKeyB64

        const nextPathKey = await hkdfExpandWithLabels(pathSecret, "path", 32)

        if (this.parent) {
            const siblings = this.getCoChild();

            const payload = {
                nextPathKey: b64(nextPathKey),
                publicKey: publicKeyB64,
                for: siblings.sibiling,
                pathPublicKeys: { ...directPathPublicKeys }
            };
            for (const node of siblings.nodes) {
                const nodePublicKey = node.publicKey; // guaranteed by getCoChild()
                const encryptedPayload = await encryptWithPublicKey(
                    nodePublicKey,
                    te.encode(stableStringify(payload))
                );
                updatePath["" + node.index] = encryptedPayload;
            }

            return await this.parent.workUpPath(nextPathKey, updatePath, epoch, directPathPublicKeys);
        } else {
            return updatePath;
        }
    }

    updateEpoch(epoch: number) {
        this.epoch = epoch
        if (this.left) this.left.updateEpoch(epoch)
        if (this.right) this.right.updateEpoch(epoch)
    }

    findIndex(index: number): KEMTreeNode | null {
        if (index == this.index) return this;
        const left = this.left?.findIndex(index)
        if (left) return left;

        const right = this.right?.findIndex(index)
        if (right) return right;

        return null
    }

    async getPrivateKey(epoch: number = this.epoch) {
        const privateKey = await getPrivateKeyAtOrBeforeEpoch(this.index, epoch, this.threadId)
        if (privateKey) this.privateKey = privateKey
        return privateKey ?? this.privateKey ?? null
    }

    findUser(userId: string): KEMTreeNode | null {
        if (userId == this.credential?.user) return this;
        const left = this.left?.findUser(userId)
        if (left) return left;

        const right = this.right?.findUser(userId)
        if (right) return right;

        return null
    }

    getSibiling() {
        let sibiling: KEMTreeNode;
        if (this.index > this.parent.index) {
            // I am right child
            sibiling = this.parent.left
        }
        else {
            // I am left child
            sibiling = this.parent.right
        }
        return sibiling
    }

    getNumberOfDecendants() {
        let decendants = 0;
        if (this.left) {
            decendants++;
            decendants += this.left.getNumberOfDecendants()
        }
        if (this.right) {
            decendants++;
            decendants += this.right.getNumberOfDecendants()
        }
        return decendants
    }

    getNumberOfLeafs() {
        let leafs = 0;
        if (this.credential) {
            leafs++;
        }
        if (this.left) {
            leafs += this.left.getNumberOfLeafs()
        }
        if (this.right) {
            leafs += this.right.getNumberOfLeafs()
        }
        return leafs
    }

    async moveToIndex(newIndex: number) {

        const privateKey = await getStoredKey(`privateKey_${this.index}_${this.epoch}_${this.threadId}`)
        const applicationSecret = await getStoredKey(`applicationSecret_${this.index}_${this.epoch}_${this.threadId}`)
        const handshakeSecret = await getStoredKey(`handshakeSecret_${this.index}_${this.epoch}_${this.threadId}`)
        const nodeSecret = await getStoredKey(`nodeSecret_${this.index}_${this.epoch}_${this.threadId}`)

        await deleteKey(`privateKey_${this.index}_${this.epoch}_${this.threadId}`)
        await deleteKey(`applicationSecret_${this.index}_${this.epoch}_${this.threadId}`)
        await deleteKey(`handshakeSecret_${this.index}_${this.epoch}_${this.threadId}`)
        await deleteKey(`nodeSecret_${this.index}_${this.epoch}_${this.threadId}`)

        await storeKey(privateKey, `privateKey_${newIndex}_${this.epoch}_${this.threadId}`)
        await storeKey(applicationSecret, `applicationSecret_${privateKey}_${this.epoch}_${this.threadId}`)
        await storeKey(handshakeSecret, `handshakeSecret_${privateKey}_${this.epoch}_${this.threadId}`)
        await storeKey(nodeSecret, `nodeSecret_${this.index}_${this.epoch}_${this.threadId}`)

        this.index = newIndex

    }

    async fillOutTree(depth: number) {
        const { left, right } = mlsChildren(depth, this.index);

        if (left != null && this.left == null) {
            this.left = new KEMTreeNode({ index: left, threadId: this.threadId, epoch: this.epoch, parent: this });
        }
        if (right != null && this.right == null) {
            this.right = new KEMTreeNode({ index: right, threadId: this.threadId, epoch: this.epoch, parent: this });
        }

        if (left == null && right == null) return;

        await Promise.all([
            this.left ? this.left.fillOutTree(depth) : Promise.resolve(),
            this.right ? this.right.fillOutTree(depth) : Promise.resolve(),
        ]);
    }

    async removePathToRoot() {
        this.credential = null
        this.privateKey = null
        this.publicKey = null
        await deleteKey(`privateKey_${this.index}_${this.epoch}_${this.threadId}`)
        await deleteKey(`publicKey_${this.index}_${this.epoch}_${this.threadId}`)

        if (this.parent) {
            await this.parent.removePathToRoot()
        }
    }
}

export class KEMTreeRoot extends KEMTreeNode {
    public initSecret: Uint8Array<ArrayBuffer>;
    public encryptionSecret: Uint8Array<ArrayBuffer>;

    // Constructor is sync; we pass keys in
    constructor(args: {
        index: number;
        publicKey: CryptoKey;
        privateKey?: CryptoKey;
        threadId: string;
        left?: KEMTreeNode | null;
        right?: KEMTreeNode | null;
        credential?: { user: string, identityKey: string };
        epoch: number;
    }) {
        super({ ...args })
    }

    async getExportable() {
        const publicKeyRaw = await exportKey(this.publicKey)

        return {
            index: this.index,
            publicKey: publicKeyRaw,
            threadId: this.threadId,
            left: await this.left?.getExportable() ?? null,
            right: await this.right?.getExportable() ?? null,
            epoch: this.epoch,
            credential: this.credential
        }
    }

    async removePathToRoot() {
        this.credential = null
        this.privateKey = null
        this.publicKey = null

        // this.initSecret = null
        // this.encryptionSecret = null
        await deleteKey(`privateKey_${this.index}_${this.epoch}_${this.threadId}`)
        await deleteKey(`publicKey_${this.index}_${this.epoch}_${this.threadId}`)
        // await deleteKey(`encryptionSecret_${this.epoch}_${this.threadId}`)
        // await deleteKey(`initSecret_${this.epoch}_${this.threadId}`)
    }

    async generateFirstTimeSecrets() {
        const old_init = new Uint8Array(16)
        const commit_secret = getCryptoRandomValues(new Uint8Array(32))
        const tree = await this.getExportable()
        const treeHash = await sha256Bytes(te.encode(stableStringify(tree)))
        const groupContext = {
            epoch: 0,
            treeHash: b64(treeHash),
        }
        const groupContextStringified = stableStringify(groupContext)
        const epoch_secret = await hkdfExpandWithLabels(commit_secret, `epoch:${groupContextStringified}`, 32, old_init)

        const init_secret = await hkdfExpandWithLabels(commit_secret, `init:${groupContextStringified}`, 16, old_init)
        const encryption_secret = await hkdfExpandWithLabels(epoch_secret, `encryption`)

        await storeKey(encryption_secret, `encryptionSecret_${this.epoch}_${this.threadId}`)
        await storeKey(init_secret, `initSecret_${this.epoch}_${this.threadId}`)

        this.encryptionSecret = encryption_secret
        this.initSecret = init_secret
    }

    static async createFromJson(json: any): Promise<KEMTreeRoot> {
        const index = json.index;
        const publicKey = await importX25519PublicRaw(ub64(json.publicKey));
        const threadId = json.threadId;
        const initSecret = await getSecretAtOrBeforeEpoch("initSecret", json.epoch, threadId)
        const encryptionSecret = await getSecretAtOrBeforeEpoch("encryptionSecret", json.epoch, threadId)
        const privateKey = await getPrivateKeyAtOrBeforeEpoch(index, json.epoch, threadId)

        const kemTreeRoot = new KEMTreeRoot({ index, publicKey, privateKey, threadId, epoch: json.epoch, credential: json.credential })

        const left = json.left ? await KEMTreeNode.createFromJson(json.left, kemTreeRoot) : null
        const right = json.right ? await KEMTreeNode.createFromJson(json.right, kemTreeRoot) : null

        kemTreeRoot.left = left
        kemTreeRoot.right = right
        kemTreeRoot.initSecret = initSecret;
        kemTreeRoot.encryptionSecret = encryptionSecret;
        return kemTreeRoot
    }

    async workUpPath(pathSecret: Uint8Array, updatePath = {}, epoch = this.epoch + 1, _directPathPublicKeys: { [key: string]: string } = {}) {

        const previousEpoch = this.epoch
        const old_init = await this.getInitSecret(epoch);
        if (!old_init) {
            throw Error(`Missing init secret for epoch ${previousEpoch}`)
        }

        this.updateEpoch(epoch)

        const { privateKey, publicKey } = await deriveX25519Keypair(pathSecret)
        await storeKey(privateKey, `privateKey_${this.index}_${this.epoch}_${this.threadId}`)
        this.privateKey = privateKey
        this.publicKey = publicKey
        const commit_secret = pathSecret;
        const tree = await this.getExportable()
        console.log("tree", tree)
        const treeHash = await sha256Bytes(te.encode(stableStringify(tree)))
        const groupContext = {
            epoch: this.epoch,
            treeHash: b64(treeHash),
        }
        const groupContextStringified = stableStringify(groupContext)
        console.log("commit_secret", commit_secret)
        console.log(groupContextStringified)
        console.log("old_init", old_init)
        const epoch_secret = await hkdfExpandWithLabels(commit_secret, `epoch:${groupContextStringified}`, 32, old_init)
        console.log("epoch_secret", epoch_secret)
        const init_secret = await hkdfExpandWithLabels(commit_secret, `init:${groupContextStringified}`, 16, old_init)
        const encryption_secret = await hkdfExpandWithLabels(epoch_secret, `encryption`)
        await storeKey(encryption_secret, `encryptionSecret_${this.epoch}_${this.threadId}`)
        await storeKey(init_secret, `initSecret_${this.epoch}_${this.threadId}`)
        this.encryptionSecret = encryption_secret
        this.initSecret = init_secret
        return updatePath
    }

    async getInitSecret(epoch: number = this.epoch) {
        let initSecret = await getStoredKey(`initSecret_${epoch}_${this.threadId}`)
        if (!initSecret) {
            initSecret = await getSecretAtOrBeforeEpoch("initSecret", epoch, this.threadId)
        }
        if (initSecret) {
            if (initSecret != this.initSecret) {
                this.initSecret = initSecret
            }
        } else if (this.initSecret) {
            await storeKey(this.initSecret, `initSecret_${epoch}_${this.threadId}`)
            initSecret = this.initSecret
        }
        return initSecret
    }

    async asNode() {
        const exportable = await this.getExportable();
        return await KEMTreeNode.createFromJson(exportable, null);
    }

    async shiftTree() {
        const numLeaves = this.getNumberOfLeafs()
        const width = 2 * (numLeaves) + 1
        const index = (1 << Math.log2(width)) - 1
        const newRoot = new KEMTreeRoot({ index: index, publicKey: null, privateKey: null, threadId: this.threadId, epoch: this.epoch })
        newRoot.initSecret = this.initSecret
        newRoot.encryptionSecret = this.encryptionSecret
        newRoot.left = await this.asNode()
        newRoot.left.parent = newRoot
        const depth = depthEdgesFromLeaves(numLeaves * 2)

        await newRoot.fillOutTree(depth)
        return newRoot;
    }

}

export class KEMTree {
    public root: KEMTreeRoot;

    private constructor(root: KEMTreeRoot) {
        this.root = root;
    }

    static async initiate(args: {
        publicKey: CryptoKey;
        privateKey: CryptoKey;
        threadId: string;
        credential: { user: string, identityKey: string };
    }) {
        await storeKey(args.privateKey, `privateKey_${0}_${0}_${args.threadId}`)
        const root = new KEMTreeRoot({ index: 0, publicKey: args.publicKey, privateKey: args.privateKey, threadId: args.threadId, epoch: 0, credential: args.credential })
        await root.generateFirstTimeSecrets()
        return new KEMTree(root)
    }

    static async createFromJson(json: any): Promise<KEMTree> {
        const root = await KEMTreeRoot.createFromJson(json);
        return new KEMTree(root);
    }

    async exportJson() {
        return await this.root.getExportable()
    }

    async addNode(payload: any) {
        const leftMostOpenIndex = this.root.getOpenChildIndex()
        if (leftMostOpenIndex != null) {
            await this.addNodeToOpenIndex(leftMostOpenIndex, payload)
        }
        else {
            await this.shiftTree()
            await this.addNode(payload)
        }
    }

    async getUpdatePayload(index: number) {
        const node = this.root.findIndex(index)
        const pathSecret = getCryptoRandomValues(new Uint8Array(32))


        const updatePath = await node.workUpPath(pathSecret)

        const messagePayload = {
            epoch: this.root.epoch,
            updatePath: updatePath,
            index: index
        }

        return messagePayload
    }

    private async addNodeToOpenIndex(index: number, payload: any) {
        const node = this.root.findIndex(index)


        const credential = payload.credential
        const publicKey = await importX25519PublicRaw(ub64(payload.init_key))
        node.credential = credential
        node.publicKey = publicKey
    }

    async shiftTree() {
        this.root = await this.root.shiftTree()
    }
}
