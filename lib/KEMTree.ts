import { b64, deriveX25519Keypair, encryptMLS, encryptWithPublicKey, exportKey, getStoredKey, hkdfExpandWithLabels, importX25519PublicRaw, sha256Bytes, storeKey, te, ub64 } from "./e2ee/e2ee";
import { SecretTree } from "./SecretTree";

export class KEMTreeNode {
    public publicKey?: CryptoKey | null = null;
    public privateKey?: CryptoKey;
    public threadId: string;
    public index: number;
    public left: KEMTreeNode | null = null;
    public right: KEMTreeNode | null = null;
    public parent: KEMTreeNode | null = null;
    public credential?: { user: string, identityKey: string } | null = null;
    public epoch: number;

    constructor(args: {
        index: number;
        publicKey: CryptoKey | null;
        privateKey?: CryptoKey;
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
        const privateKey = await getStoredKey(`privateKey_${args.index}_${args.epoch}_${args.threadId}`) ?? null

        return new KEMTreeNode({ ...args, privateKey })
    }

    static async createFromJson(json: any, parent: KEMTreeNode | null = null): Promise<KEMTreeNode> {
        const index = json.index;
        const threadId = json.threadId;
        const privateKey = await getStoredKey(`privateKey_${index}_${json.epoch}_${threadId}`)
        const publicKey = await importX25519PublicRaw(json.publicKey)
        const credential = json.credential ?? null;
        const kemTreeNode = new KEMTreeNode({ index, publicKey, privateKey, threadId, credential, epoch: json.epoch, parent: parent })
        kemTreeNode.left = json.left ? await KEMTreeNode.createFromJson(json.left, kemTreeNode) : null
        kemTreeNode.right = json.right ? await KEMTreeNode.createFromJson(json.right, kemTreeNode) : null
        return kemTreeNode
    }
    async getExportable() {
        const publicKeyRaw = await exportKey(this.publicKey)

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
        const left = await this.left?.getExportable()
        const right = await this.right?.getExportable()

        return { ...data, left, right };
    }

    getOpenChildIndex(): number | null {
        //Leaf
        if (this.credential) return null;

        //Open
        if (!this.publicKey) return this.index;

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


    async workUpPath(pathSecret: Uint8Array, updatePath = {}) {
        this.epoch += 1

        const { privateKey, publicKey } = await deriveX25519Keypair(pathSecret)
        await storeKey(privateKey, `privateKey_${this.index}_${this.epoch}_${this.threadId}`)
        this.privateKey = privateKey
        this.publicKey = publicKey
        const nextPathKey = await hkdfExpandWithLabels(pathSecret, "path", 32)

        if (this.parent) {
            let sibiling: KEMTreeNode;
            if (this.index > this.parent.index) {
                // I am right child
                sibiling = this.parent.left
            }
            else {
                // I am left child
                sibiling = this.parent.right
            }

            const sibilingPublicKey = sibiling.publicKey
            const payload = { nextPathKey, publicKey: await exportKey(publicKey) }

            const encryptedPayload = await encryptWithPublicKey(sibilingPublicKey, payload)

            updatePath["" + sibiling.index] = encryptedPayload

            return await this.parent.workUpPath(nextPathKey, updatePath)
        }
        else {
            return updatePath
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

    async generateFirstTimeSecrets() {
        const old_init = new Uint8Array(16)
        const commit_secret = crypto.getRandomValues(new Uint8Array(32))
        const tree = await this.getExportable()
        const treeHash = await sha256Bytes(te.encode(JSON.stringify(tree)))
        const groupContext = {
            epoch: 0,
            treeHash: b64(treeHash),
        }
        const groupContextStringified = JSON.stringify(groupContext)
        const epoch_secret = await hkdfExpandWithLabels(commit_secret, `epoch:${groupContextStringified}`, 32, old_init)
        console.log("done")
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
        const initSecret = await getStoredKey(`initSecret_${json.epoch}_${threadId}`)
        const encryptionSecret = await getStoredKey(`encryptionSecret_${json.epoch}_${threadId}`)
        const privateKey = await getStoredKey(`privateKey_${index}_${json.epoch}_${threadId}`)

        const kemTreeRoot = new KEMTreeRoot({ index, publicKey, privateKey, threadId, epoch: json.epoch, credential: json.credential })

        const left = json.left ? await KEMTreeNode.createFromJson(json.left, kemTreeRoot) : null
        const right = json.right ? await KEMTreeNode.createFromJson(json.right, kemTreeRoot) : null

        kemTreeRoot.left = left
        kemTreeRoot.right = right
        kemTreeRoot.initSecret = initSecret;
        kemTreeRoot.encryptionSecret = encryptionSecret;
        return kemTreeRoot
    }

    async workUpPath(pathSecret: Uint8Array, updatePath = {}) {
        this.updateEpoch(this.epoch + 1)

        const { privateKey, publicKey } = await deriveX25519Keypair(pathSecret)
        await storeKey(privateKey, `privateKey_${this.index}_${this.epoch}_${this.threadId}`)
        this.privateKey = privateKey
        this.publicKey = publicKey
        const commit_secret = pathSecret;
        const old_init = this.initSecret;
        const tree = await this.getExportable()
        const treeHash = await sha256Bytes(te.encode(JSON.stringify(tree)))
        const groupContext = {
            epoch: this.epoch,
            treeHash: b64(treeHash),
        }
        const groupContextStringified = JSON.stringify(groupContext)
        const epoch_secret = await hkdfExpandWithLabels(commit_secret, `epoch:${groupContextStringified}`, 32, old_init)
        const init_secret = await hkdfExpandWithLabels(commit_secret, `init:${groupContextStringified}`, 16, old_init)
        const encryption_secret = await hkdfExpandWithLabels(epoch_secret, `encryption`)

        await storeKey(encryption_secret, `encryptionSecret_${this.epoch}_${this.threadId}`)
        await storeKey(init_secret, `initSecret_${this.epoch}_${this.threadId}`)

        this.encryptionSecret = encryption_secret
        this.initSecret = init_secret

        return updatePath
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

    async addNode() {
        const leftMostOpenIndex = this.root.getOpenChildIndex()
        if (leftMostOpenIndex != null) {
            this.addNodeToOpenIndex(leftMostOpenIndex)
        }
    }

    async getUpdatePayload(index: number) {
        const node = this.root.findIndex(index)
        const pathSecret = crypto.getRandomValues(new Uint8Array(32))
        const updatePath = await node.workUpPath(pathSecret)

        const messagePayload = {
            epoch: this.root.epoch,
            updatePath: updatePath,
            index: index
        }

        return messagePayload
    }

    private async addNodeToOpenIndex(index: number) {
        const node = this.root.findIndex(index)
    }
}
