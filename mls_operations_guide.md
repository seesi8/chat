# MLS Operations Guide

**A Visual Guide to Messaging Layer Security Protocol Operations**

Version 1.0 | January 2026

---

## Table of Contents

1. [Group Creation](#1-group-creation)
2. [Adding a Member](#2-adding-a-member)
3. [Removing a Member](#3-removing-a-member)
4. [Updating Keys (Post-Compromise Security)](#4-updating-keys)
5. [External Join](#5-external-join)
6. [Sending an Encrypted Message](#6-sending-an-encrypted-message)
7. [Receiving and Decrypting a Message](#7-receiving-and-decrypting-a-message)
8. [Processing a Commit](#8-processing-a-commit)
9. [Ratchet Tree Evolution](#9-ratchet-tree-evolution)
10. [Key Schedule Operations](#10-key-schedule-operations)
11. [Welcome Message Processing](#11-welcome-message-processing)

---

## 1. Group Creation

### Overview

A group is created by a single member (the "creator") who initializes all cryptographic state. The creator starts with a one-member group and then adds other members through the normal Add/Commit flow.

### Diagram: Initial Group State

```
┌─────────────────────────────────────────────────────────────────┐
│                      GROUP CREATION                              │
└─────────────────────────────────────────────────────────────────┘

                    Creator (Alice)
                          │
                          ▼
              ┌───────────────────────┐
              │   Generate Key Pair   │
              │   Create Credential   │
              └───────────────────────┘
                          │
                          ▼
              ┌───────────────────────┐
              │   Initialize Tree     │
              │   (Single Leaf)       │
              └───────────────────────┘
                          │
                          ▼
                    ┌─────────┐
                    │    A    │  ◄── Leaf 0: Alice's public key + credential
                    └─────────┘

              ┌───────────────────────┐
              │   Generate Random     │
              │   epoch_secret        │
              └───────────────────────┘
                          │
                          ▼
              ┌───────────────────────┐
              │   Derive All Epoch    │
              │   Secrets             │
              └───────────────────────┘
                          │
                          ▼
              ┌───────────────────────┐
              │   Group Ready!        │
              │   Epoch = 0           │
              └───────────────────────┘
```

### Step-by-Step Process

```
Step 1: Generate Cryptographic Material
├── Generate HPKE key pair (encryption_key)
├── Generate signature key pair (signature_key)
└── Create credential binding identity to signature key

Step 2: Create Leaf Node
├── leaf_node = {
│     encryption_key: <HPKE public key>,
│     signature_key: <signature public key>,
│     credential: <identity credential>,
│     capabilities: <supported features>,
│     leaf_node_source: key_package
│   }
└── Sign leaf node

Step 3: Initialize Ratchet Tree
└── tree = single-node tree containing leaf_node at index 0

Step 4: Create Group Context
├── group_id = random_bytes(32)  // or application-defined
├── epoch = 0
├── tree_hash = hash(tree)
├── confirmed_transcript_hash = ""  // empty for epoch 0
└── extensions = []

Step 5: Initialize Key Schedule
├── epoch_secret = random_bytes(KDF.Nh)
├── Derive all epoch secrets:
│   ├── sender_data_secret
│   ├── encryption_secret
│   ├── exporter_secret
│   ├── confirmation_key
│   ├── membership_key
│   ├── resumption_psk
│   └── init_secret (for next epoch)
└── Compute confirmation_tag and interim_transcript_hash

Step 6: Group is Ready
└── Creator can now add members or publish GroupInfo for external joins
```

### Initial State Summary

```
┌────────────────────────────────────────┐
│           INITIAL GROUP STATE          │
├────────────────────────────────────────┤
│  Group ID:    0x7a3f...                │
│  Epoch:       0                        │
│  Members:     1 (Creator only)         │
│  Tree Size:   1 leaf                   │
├────────────────────────────────────────┤
│  Secrets Derived:                      │
│  ├── encryption_secret ✓              │
│  ├── confirmation_key ✓               │
│  ├── membership_key ✓                 │
│  └── init_secret (for epoch 1) ✓      │
└────────────────────────────────────────┘
```

---

## 2. Adding a Member

### Overview

Adding a member involves: (1) obtaining their KeyPackage, (2) creating an Add proposal, (3) committing the proposal, and (4) sending a Welcome message to the new member.

### Message Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         ADDING A MEMBER                                  │
└─────────────────────────────────────────────────────────────────────────┘

     Alice                    Delivery                    Bob
   (existing)                 Service                  (joining)
       │                         │                         │
       │                         │    KeyPackage           │
       │                         │◄────────────────────────┤
       │                         │    (pre-published)      │
       │    Fetch KeyPackage     │                         │
       │────────────────────────►│                         │
       │                         │                         │
       │    KeyPackage(Bob)      │                         │
       │◄────────────────────────│                         │
       │                         │                         │
       ├─────────────────────────┼─────────────────────────┤
       │  Create Add Proposal    │                         │
       │  Create Commit          │                         │
       │  Create Welcome         │                         │
       ├─────────────────────────┼─────────────────────────┤
       │                         │                         │
       │     Commit              │                         │
       │────────────────────────►│                         │
       │                         │                         │
       │     Welcome             │                         │
       │─────────────────────────┼────────────────────────►│
       │                         │                         │
       │                         │     Commit              │
       │◄────────────────────────│ (echoed back)           │
       │                         │                         │
       ├─────────────────────────┼─────────────────────────┤
       │  Process own Commit     │   Process Welcome       │
       │  Advance to Epoch N+1   │   Initialize state      │
       ├─────────────────────────┼─────────────────────────┤
       │                         │                         │
       │              ┌──────────┴──────────┐              │
       │              │  Both now in same   │              │
       │              │  Epoch N+1          │              │
       │              └─────────────────────┘              │
```

### Tree Evolution

```
BEFORE (Epoch N):                    AFTER (Epoch N+1):
                                     
     ┌───┐                                ┌───────┐
     │ A │                                │  Root │
     └───┘                                └───┬───┘
                                              │
                              ┌───────────────┴───────────────┐
                              │                               │
                          ┌───┴───┐                       ┌───┴───┐
                          │   A   │                       │   B   │
                          └───────┘                       └───────┘
                          (updated)                       (new member)

Tree extension: When no empty leaf exists, tree doubles in size
```

### Adding to a Larger Group

```
BEFORE (4 members, adding E):

           ┌───────────┐
           │   Root    │
           └─────┬─────┘
                 │
       ┌─────────┴─────────┐
       │                   │
   ┌───┴───┐           ┌───┴───┐
   │  AB   │           │  CD   │
   └───┬───┘           └───┬───┘
       │                   │
   ┌───┴───┐           ┌───┴───┐
   │   │   │           │   │   │
 ┌─┴─┬─┴─┐ │         ┌─┴─┬─┴─┐ │
 │ A │ B │           │ C │ D │
 └───┴───┘           └───┴───┘


AFTER (5 members):

                 ┌───────────────┐
                 │   New Root    │
                 └───────┬───────┘
                         │
           ┌─────────────┴─────────────┐
           │                           │
     ┌─────┴─────┐               ┌─────┴─────┐
     │   ABCD    │               │   (new)   │
     └─────┬─────┘               └─────┬─────┘
           │                           │
     ┌─────┴─────┐               ┌─────┴─────┐
     │           │               │           │
 ┌───┴───┐   ┌───┴───┐       ┌───┴───┐   ┌───┴───┐
 │  AB   │   │  CD   │       │   E   │   │   _   │
 └───┬───┘   └───┬───┘       └───────┘   └───────┘
     │           │           (new)       (blank)
 ┌───┴───┐   ┌───┴───┐
 │ A │ B │   │ C │ D │
 └───────┘   └───────┘
```

### Step-by-Step Process

```
ADDER (Alice) SIDE:

Step 1: Obtain KeyPackage
├── Fetch Bob's KeyPackage from Delivery Service
└── Validate KeyPackage:
    ├── Check signature
    ├── Verify cipher suite matches group
    └── Validate leaf node

Step 2: Create Add Proposal
└── add_proposal = Proposal(ADD, Add(bob_key_package))

Step 3: Prepare Tree Update
├── Find insertion point (leftmost blank leaf, or extend tree)
├── Create new leaf from KeyPackage.leaf_node
└── Add new leaf index to unmerged_leaves of all ancestors

Step 4: Generate UpdatePath (optional but recommended)
├── Generate fresh key pairs for filtered direct path
├── Encrypt path secrets to resolution of each copath node
└── This provides post-compromise security for the add

Step 5: Create Commit
├── commit = Commit(proposals=[add_proposal], path=update_path)
├── Compute new tree_hash
├── Derive new epoch secrets
├── Compute confirmation_tag
└── Sign commit

Step 6: Create Welcome Message
├── Gather group secrets:
│   ├── joiner_secret
│   ├── path_secret (if UpdatePath was used)
│   └── any PSKs
├── Create GroupInfo (signed)
├── Encrypt GroupInfo with welcome_key
└── Encrypt group_secrets to Bob's init_key

Step 7: Send Messages
├── Broadcast Commit to group
└── Send Welcome to Bob


NEW MEMBER (Bob) SIDE:

Step 1: Receive Welcome
└── Decrypt using private key for KeyPackage.init_key

Step 2: Extract Secrets
├── Decrypt group_secrets
├── Derive welcome_key from joiner_secret
└── Decrypt GroupInfo

Step 3: Verify GroupInfo
├── Check signature
├── Validate group parameters
└── Verify confirmation_tag

Step 4: Initialize Tree
├── Download or receive ratchet tree
├── Find own position in tree
└── If path_secret provided, derive keys up the tree

Step 5: Derive Epoch Secrets
├── Compute commit_secret from tree root
├── Run key schedule
└── Initialize secret tree for message encryption

Step 6: Ready
└── Bob can now send and receive messages in the group
```

---

## 3. Removing a Member

### Overview

Any group member can propose removing another member. The Commit must include an UpdatePath to ensure the removed member cannot compute the new epoch's secrets.

### Message Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        REMOVING A MEMBER                                 │
└─────────────────────────────────────────────────────────────────────────┘

     Alice                  Delivery                Bob              Carol
   (remover)                Service              (removed)         (remaining)
       │                       │                     │                  │
       │   Remove Proposal     │                     │                  │
       │   + Commit            │                     │                  │
       │──────────────────────►│                     │                  │
       │                       │                     │                  │
       │                       │    Commit           │    Commit        │
       │                       │────────────────────►│─────────────────►│
       │                       │                     │                  │
       │     Commit (echo)     │                     │                  │
       │◄──────────────────────│                     │                  │
       │                       │                     │                  │
       ├───────────────────────┼─────────────────────┼──────────────────┤
       │  Process Commit       │                     │  Process Commit  │
       │  Advance to Epoch N+1 │      ┌──────────┐   │  Advance Epoch   │
       │                       │      │ REJECTED │   │                  │
       │                       │      │ (removed)│   │                  │
       ├───────────────────────┴──────┴──────────┴───┴──────────────────┤
       │                                                                 │
       │  Bob cannot decrypt new epoch secrets                           │
       │  Bob's leaf is blanked in the tree                             │
       │                                                                 │
       └─────────────────────────────────────────────────────────────────┘
```

### Tree Evolution

```
BEFORE (Epoch N):                      AFTER (Epoch N+1):

        ┌─────────┐                          ┌─────────┐
        │  Root   │                          │  Root'  │ ◄── New keys
        └────┬────┘                          └────┬────┘
             │                                    │
    ┌────────┴────────┐               ┌──────────┴──────────┐
    │                 │               │                     │
┌───┴───┐         ┌───┴───┐       ┌───┴───┐            ┌────┴────┐
│  AB   │         │  CD   │       │  A'   │            │   CD'   │
└───┬───┘         └───┬───┘       └───┬───┘            └────┬────┘
    │                 │               │                     │
┌───┴───┐         ┌───┴───┐       ┌───┴───┐            ┌────┴────┐
│ A │ B │         │ C │ D │       │ A │ _ │            │  C │ D  │
└───────┘         └───────┘       └───────┘            └─────────┘
                                      ▲                     │
                                      │                ┌────┴────┐
                        Bob's leaf blanked ────────────┤ REMOVED │
                                                       │   (B)   │
                                                       └─────────┘

Note: All nodes on Bob's path are blanked
      Committer (A) provides UpdatePath with fresh keys
      C and D decrypt path secrets, compute new tree root
      B cannot decrypt anything - excluded from new epoch
```

### Tree Truncation (When Right Subtree Becomes Empty)

```
BEFORE (removing D):                   AFTER (tree truncated):

        ┌─────────┐                          
        │  Root   │                          ┌─────────┐
        └────┬────┘                          │  Root'  │
             │                               └────┬────┘
    ┌────────┴────────┐                           │
    │                 │                   ┌───────┴───────┐
┌───┴───┐         ┌───┴───┐               │               │
│  AB   │         │  CD   │           ┌───┴───┐       ┌───┴───┐
└───┬───┘         └───┬───┘           │   A   │       │   B   │
    │                 │               └───────┘       └───────┘
┌───┴───┐         ┌───┴───┐           
│ A │ B │         │ C │ _ │           Right subtree was entirely blank
└───────┘         └───────┘           after C was removed earlier,
      ▲               ▲               so tree shrinks by half
      │               │               
    (Remaining)    D removed,         
                   C already gone     
```

### Step-by-Step Process

```
REMOVER SIDE:

Step 1: Create Remove Proposal
└── remove_proposal = Proposal(REMOVE, Remove(bob_leaf_index))

Step 2: Apply Proposal to Tree
├── Blank Bob's leaf node
└── Blank all nodes on Bob's direct path

Step 3: Generate UpdatePath (REQUIRED for removes)
├── Generate fresh keys for own filtered direct path
├── Path secrets encrypted only to remaining members
└── Bob's resolution is excluded from all encryptions

Step 4: Compute New Secrets
├── commit_secret from new tree root
├── New init_secret feeds into key schedule
└── Bob cannot derive any of these (lacks path secrets)

Step 5: Create and Sign Commit
├── Include UpdatePath (required)
├── Compute confirmation_tag with new confirmation_key
└── Sign with own signature key

Step 6: Broadcast
└── Send Commit to all members (including Bob - he just can't use it)


REMAINING MEMBER SIDE:

Step 1: Receive Commit
└── Validate signature and epoch

Step 2: Apply Proposal
├── Blank removed member's leaf
└── Blank their direct path nodes

Step 3: Process UpdatePath
├── Find decryption point (where own path intersects committer's path)
├── Decrypt path_secret
└── Derive keys for nodes above intersection

Step 4: Derive New Epoch Secrets
├── commit_secret = tree root secret
├── Run full key schedule
└── Initialize new secret tree

Step 5: Verify Confirmation
└── Check confirmation_tag matches


REMOVED MEMBER SIDE:

Step 1: Receive Commit
└── Can parse the message structure

Step 2: Cannot Process
├── Own leaf_index is in the Remove proposal
├── UpdatePath doesn't encrypt to own resolution
└── Cannot derive commit_secret or any epoch keys

Step 3: Evicted
└── Member must leave the group or rejoin externally
```

---

## 4. Updating Keys

### Overview

Members update their keys to achieve post-compromise security. After an Update, any attacker who had compromised the member's previous keys loses access to future messages.

### Message Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          KEY UPDATE                                      │
└─────────────────────────────────────────────────────────────────────────┘

     Alice                    Delivery                 Bob
   (updating)                 Service               (receiving)
       │                         │                      │
       │                         │                      │
       │  Option A: Update + Commit (self-commit)       │
       │  ═══════════════════════════════════════       │
       │                         │                      │
       │    Commit(Update)       │                      │
       │────────────────────────►│                      │
       │                         │     Commit           │
       │                         │─────────────────────►│
       │      Commit (echo)      │                      │
       │◄────────────────────────│                      │
       │                         │                      │
       ├─────────────────────────┴──────────────────────┤
       │                                                │
       │                                                │
       │  Option B: Update proposed, Bob commits        │
       │  ═══════════════════════════════════════       │
       │                         │                      │
       │    Update Proposal      │                      │
       │────────────────────────►│                      │
       │                         │   Update Proposal    │
       │                         │─────────────────────►│
       │                         │                      │
       │                         │   Commit(Update)     │
       │                         │◄─────────────────────│
       │    Commit               │                      │
       │◄────────────────────────│                      │
       │                         │                      │
       └─────────────────────────┴──────────────────────┘
```

### Tree State Changes

```
BEFORE UPDATE:

              ┌───────────────┐
              │     Root      │  ◄── Old root key (possibly compromised)
              └───────┬───────┘
                      │
          ┌───────────┴───────────┐
          │                       │
      ┌───┴───┐               ┌───┴───┐
      │  AB   │               │  CD   │
      └───┬───┘               └───┬───┘
          │                       │
      ┌───┴───┐               ┌───┴───┐
      │ A │ B │               │ C │ D │
      └───────┘               └───────┘
        ▲
        │
    Alice's keys 
    (compromised?)


AFTER ALICE UPDATES:

              ┌───────────────┐
              │    Root'      │  ◄── Fresh root key
              └───────┬───────┘
                      │
          ┌───────────┴───────────┐
          │                       │
      ┌───┴───┐               ┌───┴───┐
      │  AB'  │               │  CD   │
      └───┬───┘               └───┬───┘
          │                       │
      ┌───┴───┐               ┌───┴───┐
      │ A'│ B │               │ C │ D │
      └───────┘               └───────┘
        ▲
        │
    Fresh keys!
    Attacker locked out


PATH SECRET DISTRIBUTION:

    Alice generates: leaf_secret → path_secret_AB → path_secret_Root
    
    Encrypts path_secret_AB to: B (resolution of sibling)
    Encrypts path_secret_Root to: CD's resolution (C and D)
    
    Result: All members derive new root secret
            Attacker (without access to A's new leaf_secret) cannot
```

### UpdatePath Structure

```
┌─────────────────────────────────────────────────────────────────┐
│                        UpdatePath                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  leaf_node: {                                                    │
│    encryption_key: <new HPKE public key>,                       │
│    signature_key: <same signature key>,                         │
│    credential: <same credential>,                               │
│    parent_hash: <hash of parent node AB'>                       │
│  }                                                               │
│                                                                  │
│  nodes: [                                                        │
│    {                                                             │
│      public_key: <new HPKE key for AB>,                         │
│      encrypted_path_secret: [                                   │
│        encrypt(B.encryption_key, path_secret_AB)                │
│      ]                                                           │
│    },                                                            │
│    {                                                             │
│      public_key: <new HPKE key for Root>,                       │
│      encrypted_path_secret: [                                   │
│        encrypt(C.encryption_key, path_secret_Root),             │
│        encrypt(D.encryption_key, path_secret_Root)              │
│      ]                                                           │
│    }                                                             │
│  ]                                                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 5. External Join

### Overview

External joins allow new members to join without an existing member explicitly adding them. This is useful for "open" groups. The joiner uses a published GroupInfo to create an external Commit.

### Message Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         EXTERNAL JOIN                                    │
└─────────────────────────────────────────────────────────────────────────┘

     Alice                    Delivery                    Eve
   (existing)                 Service                  (joining)
       │                         │                         │
       │                         │                         │
       │    Publish GroupInfo    │                         │
       │────────────────────────►│                         │
       │                         │                         │
       │                         │    Request GroupInfo    │
       │                         │◄────────────────────────│
       │                         │                         │
       │                         │    GroupInfo            │
       │                         │────────────────────────►│
       │                         │                         │
       │                         │                         │
       ├─────────────────────────┼─────────────────────────┤
       │                         │    Eve creates:         │
       │                         │    - ExternalInit       │
       │                         │    - External Commit    │
       │                         │    - UpdatePath         │
       ├─────────────────────────┼─────────────────────────┤
       │                         │                         │
       │                         │    External Commit      │
       │                         │◄────────────────────────│
       │                         │                         │
       │    External Commit      │                         │
       │◄────────────────────────│                         │
       │                         │                         │
       ├─────────────────────────┼─────────────────────────┤
       │  Process Commit         │                         │
       │  - Apply ExternalInit   │   Eve derives epoch     │
       │  - Add Eve to tree      │   secrets from her      │
       │  - Process UpdatePath   │   own init_secret +     │
       │  - Advance epoch        │   commit_secret         │
       ├─────────────────────────┼─────────────────────────┤
       │                         │                         │
       │              ┌──────────┴──────────┐              │
       │              │  Both now in same   │              │
       │              │  Epoch N+1          │              │
       │              └─────────────────────┘              │
```

### GroupInfo Structure

```
┌─────────────────────────────────────────────────────────────────┐
│                         GroupInfo                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  group_context: {                                                │
│    group_id: 0x7a3f...,                                         │
│    epoch: 5,                                                     │
│    tree_hash: 0xab12...,                                        │
│    confirmed_transcript_hash: 0xcd34...,                        │
│    ...                                                           │
│  }                                                               │
│                                                                  │
│  extensions: [                                                   │
│    { type: ratchet_tree, data: <serialized tree> }              │  ◄── Optional
│  ]                                                               │
│                                                                  │
│  confirmation_tag: 0xef56...                                     │
│                                                                  │
│  signer: 0  (leaf index of signer)                              │
│                                                                  │
│  signature: 0x1234...                                            │
│                                                                  │
│  ─────────────────────────────────────────────────               │
│  PUBLIC SECTION (for external joiners):                          │
│                                                                  │
│  external_pub: <HPKE public key>                                │  ◄── Derived from
│                                                                  │      external_secret
└─────────────────────────────────────────────────────────────────┘
```

### External Init Process

```
┌─────────────────────────────────────────────────────────────────┐
│                    EXTERNAL INIT FLOW                            │
└─────────────────────────────────────────────────────────────────┘

JOINER (Eve):

    external_pub (from GroupInfo)
            │
            ▼
    ┌───────────────────────────┐
    │  HPKE.SetupBaseS          │
    │  (encapsulate to          │
    │   external_pub)           │
    └─────────────┬─────────────┘
                  │
          ┌───────┴───────┐
          │               │
          ▼               ▼
    kem_output      HPKE context
                          │
                          ▼
                  ┌───────────────────────────┐
                  │  context.export(          │
                  │    "MLS 1.0 external      │
                  │     init secret")         │
                  └─────────────┬─────────────┘
                                │
                                ▼
                          init_secret ────────────► Key Schedule
                                                    (epoch N+1)

    Eve sends: ExternalInit { kem_output }


EXISTING MEMBERS:

    kem_output (from ExternalInit proposal)
            │
            ▼
    external_priv (derived from external_secret of epoch N)
            │
            ▼
    ┌───────────────────────────┐
    │  HPKE.SetupBaseR          │
    │  (decapsulate using       │
    │   external_priv)          │
    └─────────────┬─────────────┘
                  │
                  ▼
            HPKE context
                  │
                  ▼
          ┌───────────────────────────┐
          │  context.export(          │
          │    "MLS 1.0 external      │
          │     init secret")         │
          └─────────────┬─────────────┘
                        │
                        ▼
                  init_secret ────────────► Same init_secret!
                                            Both sides agree
```

---

## 6. Sending an Encrypted Message

### Overview

Application messages are encrypted using keys derived from the sender's application ratchet. Each message uses a unique key/nonce pair that is deleted immediately after use.

### Encryption Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    SENDING AN ENCRYPTED MESSAGE                          │
└─────────────────────────────────────────────────────────────────────────┘

                    SENDER (Alice at leaf index 0)

    plaintext: "Hello, group!"
            │
            ▼
    ┌───────────────────────────────────────────────────────┐
    │  Step 1: Get Current Ratchet State                    │
    │                                                        │
    │  application_ratchet[0] = {                           │
    │    secret: 0xab12...,                                 │
    │    generation: 3                                       │
    │  }                                                     │
    └───────────────────────────────────────────────────────┘
            │
            ▼
    ┌───────────────────────────────────────────────────────┐
    │  Step 2: Derive Key and Nonce                         │
    │                                                        │
    │  key = ExpandWithLabel(secret, "key", 3, AEAD.Nk)     │
    │  nonce = ExpandWithLabel(secret, "nonce", 3, AEAD.Nn) │
    │  next_secret = ExpandWithLabel(secret, "secret", 3)   │
    └───────────────────────────────────────────────────────┘
            │
            ▼
    ┌───────────────────────────────────────────────────────┐
    │  Step 3: Build FramedContent                          │
    │                                                        │
    │  content = {                                           │
    │    group_id: 0x7a3f...,                               │
    │    epoch: 5,                                           │
    │    sender: { sender_type: member, leaf_index: 0 },    │
    │    content_type: application,                         │
    │    application_data: "Hello, group!"                  │
    │  }                                                     │
    └───────────────────────────────────────────────────────┘
            │
            ▼
    ┌───────────────────────────────────────────────────────┐
    │  Step 4: Sign Content                                  │
    │                                                        │
    │  tbs = FramedContentTBS(content, context)             │
    │  signature = Sign(signature_key, tbs)                 │
    └───────────────────────────────────────────────────────┘
            │
            ▼
    ┌───────────────────────────────────────────────────────┐
    │  Step 5: Build Authenticated Content                   │
    │                                                        │
    │  auth_content = content + signature                   │
    │  aad = PrivateContentAAD(group_id, epoch, content_type)│
    └───────────────────────────────────────────────────────┘
            │
            ▼
    ┌───────────────────────────────────────────────────────┐
    │  Step 6: Encrypt Content                               │
    │                                                        │
    │  ciphertext = AEAD.Encrypt(key, nonce, aad,           │
    │                            auth_content)               │
    └───────────────────────────────────────────────────────┘
            │
            ▼
    ┌───────────────────────────────────────────────────────┐
    │  Step 7: Encrypt Sender Data                           │
    │                                                        │
    │  sender_data = { leaf_index: 0, generation: 3 }       │
    │                                                        │
    │  sample = ciphertext[0:KDF.Nh]                        │
    │  sd_key = ExpandWithLabel(sender_data_secret,         │
    │                           "key", sample)               │
    │  sd_nonce = ExpandWithLabel(sender_data_secret,       │
    │                             "nonce", sample)           │
    │                                                        │
    │  encrypted_sender_data = AEAD.Encrypt(sd_key,         │
    │                                        sd_nonce,       │
    │                                        sender_data)    │
    └───────────────────────────────────────────────────────┘
            │
            ▼
    ┌───────────────────────────────────────────────────────┐
    │  Step 8: Advance Ratchet & Delete Key                  │
    │                                                        │
    │  application_ratchet[0].secret = next_secret          │
    │  application_ratchet[0].generation = 4                │
    │                                                        │
    │  SECURE_DELETE(key, nonce, old_secret)                │
    └───────────────────────────────────────────────────────┘
            │
            ▼
    ┌───────────────────────────────────────────────────────┐
    │  Step 9: Construct PrivateMessage                      │
    │                                                        │
    │  message = PrivateMessage {                           │
    │    group_id: 0x7a3f...,                               │
    │    epoch: 5,                                           │
    │    content_type: application,                         │
    │    encrypted_sender_data: <encrypted>,                │
    │    ciphertext: <encrypted>                            │
    │  }                                                     │
    └───────────────────────────────────────────────────────┘
            │
            ▼
        Send to Delivery Service
```

### Sender Ratchet Visualization

```
                    SECRET TREE (epoch 5)
                    
                         ┌────────────────┐
                         │ encryption_sec │
                         └───────┬────────┘
                                 │
                    ┌────────────┴────────────┐
                    │                         │
               ┌────┴────┐               ┌────┴────┐
               │  left   │               │  right  │
               └────┬────┘               └─────────┘
                    │
           ┌────────┴────────┐
           │                 │
      ┌────┴────┐       ┌────┴────┐
      │ Alice   │       │  Bob    │
      └────┬────┘       └─────────┘
           │
           ▼
    ┌─────────────────────────────────────────────────────┐
    │              ALICE'S APPLICATION RATCHET             │
    ├─────────────────────────────────────────────────────┤
    │                                                      │
    │  Generation 0    Generation 1    Generation 2       │
    │  ──────────────  ──────────────  ──────────────     │
    │                                                      │
    │  secret_0 ────► secret_1 ────► secret_2 ────► ...   │
    │     │              │              │                  │
    │     ▼              ▼              ▼                  │
    │  key_0          key_1          key_2                │
    │  nonce_0        nonce_1        nonce_2              │
    │     │              │              │                  │
    │     ▼              ▼              ▼                  │
    │  [DELETED]     [DELETED]      [CURRENT]             │
    │                                                      │
    │  Used for       Used for       Next message         │
    │  message 0      message 1      uses these           │
    │                                                      │
    └─────────────────────────────────────────────────────┘
```

---

## 7. Receiving and Decrypting a Message

### Overview

Receivers decrypt the sender data to learn who sent the message, then derive (or retrieve cached) keys for that sender's generation.

### Decryption Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    RECEIVING AN ENCRYPTED MESSAGE                        │
└─────────────────────────────────────────────────────────────────────────┘

                    RECEIVER (Bob at leaf index 1)

    PrivateMessage received
            │
            ▼
    ┌───────────────────────────────────────────────────────┐
    │  Step 1: Validate Message Metadata                     │
    │                                                        │
    │  Check: group_id matches our group                    │
    │  Check: epoch matches our current epoch               │
    │         (or is a past epoch we still have keys for)   │
    └───────────────────────────────────────────────────────┘
            │
            ▼
    ┌───────────────────────────────────────────────────────┐
    │  Step 2: Decrypt Sender Data                           │
    │                                                        │
    │  sample = ciphertext[0:KDF.Nh]                        │
    │  sd_key = ExpandWithLabel(sender_data_secret,         │
    │                           "key", sample)               │
    │  sd_nonce = ExpandWithLabel(sender_data_secret,       │
    │                             "nonce", sample)           │
    │                                                        │
    │  sender_data = AEAD.Decrypt(sd_key, sd_nonce,         │
    │                             encrypted_sender_data)     │
    │                                                        │
    │  Result: { leaf_index: 0, generation: 3 }             │
    │          (Message is from Alice, her 4th message)      │
    └───────────────────────────────────────────────────────┘
            │
            ▼
    ┌───────────────────────────────────────────────────────┐
    │  Step 3: Get Decryption Key                            │
    │                                                        │
    │  our_ratchet = application_ratchets[sender=0]         │
    │                                                        │
    │  IF generation == our_ratchet.generation:             │
    │      // Current message - derive key                   │
    │      key, nonce = derive_key(our_ratchet, generation) │
    │      advance_ratchet(our_ratchet)                     │
    │                                                        │
    │  ELIF generation < our_ratchet.generation:            │
    │      // Old message - check skipped keys cache        │
    │      key, nonce = skipped_keys[sender][generation]    │
    │      DELETE skipped_keys[sender][generation]          │
    │                                                        │
    │  ELIF generation > our_ratchet.generation:            │
    │      // Future message - advance ratchet, cache keys  │
    │      FOR g in [our_generation..generation-1]:         │
    │          k, n = derive_key(our_ratchet, g)            │
    │          skipped_keys[sender][g] = (k, n)             │
    │          advance_ratchet(our_ratchet)                 │
    │      key, nonce = derive_key(our_ratchet, generation) │
    │      advance_ratchet(our_ratchet)                     │
    └───────────────────────────────────────────────────────┘
            │
            ▼
    ┌───────────────────────────────────────────────────────┐
    │  Step 4: Decrypt Content                               │
    │                                                        │
    │  aad = PrivateContentAAD(group_id, epoch, content_type)│
    │  auth_content = AEAD.Decrypt(key, nonce, aad,         │
    │                              ciphertext)               │
    └───────────────────────────────────────────────────────┘
            │
            ▼
    ┌───────────────────────────────────────────────────────┐
    │  Step 5: Verify Signature                              │
    │                                                        │
    │  sender_leaf = tree.get_leaf(sender_data.leaf_index)  │
    │  sender_signature_key = sender_leaf.signature_key     │
    │                                                        │
    │  tbs = FramedContentTBS(auth_content.content, context)│
    │  Verify(sender_signature_key, tbs, signature)         │
    └───────────────────────────────────────────────────────┘
            │
            ▼
    ┌───────────────────────────────────────────────────────┐
    │  Step 6: Delete Key and Return Plaintext               │
    │                                                        │
    │  SECURE_DELETE(key, nonce)                            │
    │                                                        │
    │  Return: "Hello, group!"                              │
    └───────────────────────────────────────────────────────┘
```

### Out-of-Order Message Handling

```
                    HANDLING OUT-OF-ORDER MESSAGES

    Alice sends messages with generations: 0, 1, 2, 3, 4

    Bob receives them in order: 0, 1, 3, 4, 2
                                         ▲
                                         │
                                    Out of order!


    BOB'S RATCHET STATE EVOLUTION:
    ════════════════════════════════════════════════════════════

    After receiving gen 0:
    ┌─────────────────────────────────────────────────────────┐
    │  current_generation: 1                                   │
    │  skipped_keys: {}                                        │
    └─────────────────────────────────────────────────────────┘

    After receiving gen 1:
    ┌─────────────────────────────────────────────────────────┐
    │  current_generation: 2                                   │
    │  skipped_keys: {}                                        │
    └─────────────────────────────────────────────────────────┘

    After receiving gen 3 (skipping 2):
    ┌─────────────────────────────────────────────────────────┐
    │  current_generation: 4                                   │
    │  skipped_keys: { 2: (key_2, nonce_2) }   ◄── Cached!    │
    └─────────────────────────────────────────────────────────┘

    After receiving gen 4:
    ┌─────────────────────────────────────────────────────────┐
    │  current_generation: 5                                   │
    │  skipped_keys: { 2: (key_2, nonce_2) }                  │
    └─────────────────────────────────────────────────────────┘

    After receiving gen 2 (finally arrived):
    ┌─────────────────────────────────────────────────────────┐
    │  current_generation: 5                                   │
    │  skipped_keys: {}   ◄── key_2 used and deleted          │
    └─────────────────────────────────────────────────────────┘
```

---

## 8. Processing a Commit

### Overview

Processing a Commit updates the group state to a new epoch. This involves applying proposals, processing any UpdatePath, and deriving new epoch secrets.

### Commit Processing Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        PROCESSING A COMMIT                               │
└─────────────────────────────────────────────────────────────────────────┘

    Commit message received
            │
            ▼
    ┌───────────────────────────────────────────────────────┐
    │  Step 1: Validate Commit                               │
    │                                                        │
    │  ├── Check epoch matches current epoch                │
    │  ├── Verify sender signature                          │
    │  ├── Verify membership_tag (for PublicMessage)        │
    │  └── Validate proposal list (no conflicts, etc.)      │
    └───────────────────────────────────────────────────────┘
            │
            ▼
    ┌───────────────────────────────────────────────────────┐
    │  Step 2: Resolve Proposals                             │
    │                                                        │
    │  FOR each ProposalOrRef in commit.proposals:          │
    │      IF reference:                                     │
    │          proposal = lookup_cached_proposal(ref)       │
    │      ELSE:                                             │
    │          proposal = inline_proposal                   │
    │      proposals.append(proposal)                       │
    └───────────────────────────────────────────────────────┘
            │
            ▼
    ┌───────────────────────────────────────────────────────┐
    │  Step 3: Apply Proposals to Tree                       │
    │                                                        │
    │  FOR each proposal in order:                          │
    │      SWITCH proposal.type:                            │
    │          ADD:    insert leaf at next blank position   │
    │          REMOVE: blank leaf and direct path           │
    │          UPDATE: replace sender's leaf node           │
    │          PSK:    record PSK for key schedule          │
    │          ...                                           │
    └───────────────────────────────────────────────────────┘
            │
            ▼
    ┌───────────────────────────────────────────────────────┐
    │  Step 4: Process UpdatePath (if present)               │
    │                                                        │
    │  IF commit.path is not None:                          │
    │      // Find where our path intersects committer's    │
    │      intersection = find_intersection(my_leaf,        │
    │                                       committer_leaf) │
    │                                                        │
    │      // Decrypt path secret at intersection           │
    │      encrypted = path.nodes[intersection].secret      │
    │      path_secret = HPKE.Decrypt(my_priv, encrypted)   │
    │                                                        │
    │      // Derive keys up to root                        │
    │      FOR each node from intersection to root:         │
    │          node_secret = derive(path_secret)            │
    │          node.public_key = derive_public(node_secret) │
    │          node.private_key = derive_private(node_secret)│
    │          path_secret = derive_next(path_secret)       │
    │                                                        │
    │      commit_secret = root_secret                      │
    │  ELSE:                                                 │
    │      commit_secret = zero_bytes(KDF.Nh)               │
    └───────────────────────────────────────────────────────┘
            │
            ▼
    ┌───────────────────────────────────────────────────────┐
    │  Step 5: Update Group Context                          │
    │                                                        │
    │  new_context = {                                       │
    │      group_id: same,                                   │
    │      epoch: current_epoch + 1,                        │
    │      tree_hash: hash(updated_tree),                   │
    │      confirmed_transcript_hash: hash(                 │
    │          interim_hash || commit_content || signature  │
    │      ),                                                │
    │      extensions: (updated if GCE proposal)            │
    │  }                                                     │
    └───────────────────────────────────────────────────────┘
            │
            ▼
    ┌───────────────────────────────────────────────────────┐
    │  Step 6: Derive New Epoch Secrets                      │
    │                                                        │
    │  joiner_secret = ExpandWithLabel(                     │
    │      KDF.Extract(init_secret, commit_secret),         │
    │      "joiner", new_context                            │
    │  )                                                     │
    │                                                        │
    │  psk_secret = compute_psk_secret(psk_proposals)       │
    │                                                        │
    │  epoch_secret = ExpandWithLabel(                      │
    │      KDF.Extract(joiner_secret, psk_secret),          │
    │      "epoch", new_context                             │
    │  )                                                     │
    │                                                        │
    │  // Derive all epoch secrets                          │
    │  encryption_secret = DeriveSecret(epoch_secret, "enc")│
    │  confirmation_key = DeriveSecret(epoch_secret, "conf")│
    │  // ... etc                                            │
    └───────────────────────────────────────────────────────┘
            │
            ▼
    ┌───────────────────────────────────────────────────────┐
    │  Step 7: Verify Confirmation Tag                       │
    │                                                        │
    │  expected_tag = MAC(confirmation_key,                 │
    │                     confirmed_transcript_hash)         │
    │  ASSERT commit.confirmation_tag == expected_tag       │
    └───────────────────────────────────────────────────────┘
            │
            ▼
    ┌───────────────────────────────────────────────────────┐
    │  Step 8: Initialize New Epoch State                    │
    │                                                        │
    │  ├── Build new secret tree from encryption_secret     │
    │  ├── Initialize sender ratchets for all members       │
    │  ├── Update interim_transcript_hash                   │
    │  └── Store init_secret for next epoch                 │
    └───────────────────────────────────────────────────────┘
            │
            ▼
    ┌───────────────────────────────────────────────────────┐
    │  Step 9: Clean Up                                      │
    │                                                        │
    │  ├── Delete old epoch secrets (with grace period      │
    │  │   for out-of-order messages)                       │
    │  └── Clear cached proposals                           │
    └───────────────────────────────────────────────────────┘
```

### UpdatePath Decryption Points

```
                    UPDATEPATH DECRYPTION EXAMPLE

    Committer: Alice (leaf 0)        Receiver: Carol (leaf 2)
    
                      ┌───────┐
                      │ Root' │  ◄── Both derive this
                      └───┬───┘
                          │
              ┌───────────┴───────────┐
              │                       │
          ┌───┴───┐               ┌───┴───┐
          │ AB'   │               │ CD    │  ◄── Carol decrypts here!
          └───┬───┘               └───┬───┘
              │                       │
          ┌───┴───┐               ┌───┴───┐
          │ A'│ B │               │ C │ D │
          └───────┘               └───────┘
    
    
    ALICE'S UPDATEPATH:
    ┌────────────────────────────────────────────────────────────┐
    │  nodes[0]: { public_key: AB', encrypted_to: [B] }         │
    │  nodes[1]: { public_key: Root', encrypted_to: [CD] }      │
    │                                                            │
    │  Note: CD is the resolution of Alice's copath at Root     │
    │        Since CD is non-blank, it's just [CD]              │
    └────────────────────────────────────────────────────────────┘
    
    CAROL'S DECRYPTION:
    ┌────────────────────────────────────────────────────────────┐
    │  1. Find intersection: Root (both paths go through Root)  │
    │                                                            │
    │  2. Carol is in CD's subtree                              │
    │     Carol's key is in CD's resolution                     │
    │                                                            │
    │  3. Decrypt path_secret_Root from nodes[1]                │
    │     using CD's private key (which Carol knows)            │
    │                                                            │
    │  4. Derive Root' key pair from path_secret_Root           │
    │                                                            │
    │  5. commit_secret = Root' secret                          │
    └────────────────────────────────────────────────────────────┘
```

---

## 9. Ratchet Tree Evolution

### Tree Growth Pattern

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      TREE GROWTH PATTERNS                                │
└─────────────────────────────────────────────────────────────────────────┘


1 MEMBER:                    2 MEMBERS:

    ┌───┐                        ┌─────┐
    │ A │                        │ AB  │
    └───┘                        └──┬──┘
                                    │
                              ┌─────┴─────┐
                              │           │
                            ┌─┴─┐       ┌─┴─┐
                            │ A │       │ B │
                            └───┘       └───┘


3 MEMBERS:                   4 MEMBERS:

        ┌───────┐                    ┌───────┐
        │ ABCD  │                    │ ABCD  │
        └───┬───┘                    └───┬───┘
            │                            │
    ┌───────┴───────┐            ┌───────┴───────┐
    │               │            │               │
  ┌─┴─┐          ┌──┴──┐       ┌─┴─┐          ┌──┴──┐
  │AB │          │ _   │       │AB │          │ CD  │
  └─┬─┘          └──┬──┘       └─┬─┘          └──┬──┘
    │               │            │               │
 ┌──┴──┐        ┌───┴───┐     ┌──┴──┐        ┌───┴───┐
 │  │  │        │   │   │     │  │  │        │   │   │
 A  B           C   _         A  B           C   D


5 MEMBERS (tree doubles):

                    ┌─────────────┐
                    │   Root      │
                    └──────┬──────┘
                           │
           ┌───────────────┴───────────────┐
           │                               │
     ┌─────┴─────┐                   ┌─────┴─────┐
     │   ABCD    │                   │    _      │
     └─────┬─────┘                   └─────┬─────┘
           │                               │
     ┌─────┴─────┐                   ┌─────┴─────┐
     │           │                   │           │
  ┌──┴──┐     ┌──┴──┐             ┌──┴──┐     ┌──┴──┐
  │ AB  │     │ CD  │             │ E   │     │  _  │
  └──┬──┘     └──┬──┘             └─────┘     └─────┘
     │           │                (new)       (blank)
  ┌──┴──┐     ┌──┴──┐
  A     B     C     D
```

### Tree Shrinking (After Removes)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      TREE SHRINKING                                      │
└─────────────────────────────────────────────────────────────────────────┘

BEFORE (D is last member on right side):

                    ┌─────────────┐
                    │   Root      │
                    └──────┬──────┘
                           │
           ┌───────────────┴───────────────┐
           │                               │
     ┌─────┴─────┐                   ┌─────┴─────┐
     │    AB     │                   │    CD     │
     └─────┬─────┘                   └─────┬─────┘
           │                               │
     ┌─────┴─────┐                   ┌─────┴─────┐
     │           │                   │           │
     A           B                   _           D
                                  (blank)


AFTER REMOVING D (right subtree entirely blank):

                    ┌─────────────┐
                    │   Root      │  ◄── This becomes new root
                    └──────┬──────┘
                           │
           ┌───────────────┴───────────────┐
           │                               │
     ┌─────┴─────┐                   ╳ (removed)
     │    AB     │
     └─────┬─────┘
           │
     ┌─────┴─────┐
     │           │
     A           B


RESULT (tree halved):

     ┌─────────────┐
     │    AB       │  ◄── Now the root
     └──────┬──────┘
            │
      ┌─────┴─────┐
      │           │
      A           B
```

### Blank Node Resolution

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     RESOLUTION OF BLANK NODES                            │
└─────────────────────────────────────────────────────────────────────────┘

    Tree with blanks (members B and F removed):

                         ┌─────────┐
                         │  Root   │
                         └────┬────┘
                              │
              ┌───────────────┴───────────────┐
              │                               │
         ┌────┴────┐                     ┌────┴────┐
         │   _     │  (blank)            │   Y     │
         └────┬────┘                     └────┬────┘
              │                               │
        ┌─────┴─────┐                   ┌─────┴─────┐
        │           │                   │           │
        A           _                   E           _
                  (blank)                         (blank)


    RESOLUTION OF EACH NODE:
    ════════════════════════════════════════════════════════════

    resolution(A) = [A]           // Non-blank leaf
    
    resolution(_B) = []           // Blank leaf
    
    resolution(_AB) = [A]         // Blank parent: concat children
                                  // = resolution(A) + resolution(_B)
                                  // = [A] + [] = [A]
    
    resolution(E) = [E]           // Non-blank leaf
    
    resolution(_F) = []           // Blank leaf
    
    resolution(Y) = [Y, ...]      // Non-blank with unmerged_leaves
                                  // = [Y] + unmerged_leaves
    
    resolution(Root) = [A] + resolution(Y)
                     = [A, Y, ...]  // Whatever Y's resolution is


    ENCRYPTING TO ROOT'S RESOLUTION:
    ════════════════════════════════════════════════════════════

    To encrypt a path secret to all members:
    
    encrypt(A.encryption_key, path_secret)  // For member A
    encrypt(Y.public_key, path_secret)      // For members in Y's subtree
                                            // (E knows Y's private key,
                                            //  or it's in Y's unmerged_leaves)
```

---

## 10. Key Schedule Operations

### Full Epoch Derivation

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    KEY SCHEDULE - FULL DERIVATION                        │
└─────────────────────────────────────────────────────────────────────────┘


                    ┌──────────────────┐
                    │ init_secret[n-1] │  From previous epoch
                    └────────┬─────────┘
                             │
                             ▼
         commit_secret ─────►⊕ KDF.Extract
         (from tree)         │
                             │
                             ▼
                    ┌────────────────────────────────────┐
                    │ ExpandWithLabel("joiner", context) │
                    └────────────────────┬───────────────┘
                                         │
                                         ▼
                                 ┌───────────────┐
                                 │ joiner_secret │
                                 └───────┬───────┘
                                         │
                                         ▼
          psk_secret ───────────────────►⊕ KDF.Extract
          (or zeros if no PSK)           │
                                         │
              ┌──────────────────────────┴──────────────────────────┐
              │                                                      │
              ▼                                                      ▼
    ┌─────────────────────────┐                    ┌─────────────────────────────────┐
    │ DeriveSecret("welcome") │                    │ ExpandWithLabel("epoch", ctx)   │
    └────────────┬────────────┘                    └────────────────┬────────────────┘
                 │                                                   │
                 ▼                                                   ▼
         welcome_secret                                        epoch_secret
         (for Welcome msg)                                          │
                                      ┌──────────────────────────────┤
                                      │                              │
              ┌───────────────────────┼───────────────────────┐      │
              │                       │                       │      │
              ▼                       ▼                       ▼      ▼
    DeriveSecret          DeriveSecret          DeriveSecret    DeriveSecret
    ("sender data")       ("encryption")        ("exporter")    ("confirm")
              │                       │                   │          │
              ▼                       ▼                   ▼          ▼
    sender_data_secret    encryption_secret    exporter_secret   confirmation_key
              │                       │                   │          │
              │                       │                   │          │
              ▼                       ▼                   │          │
    (for encrypting        (seeds secret tree)           │          │
     sender data)                                         │          │
                                                          ▼          ▼
              ┌───────────────────────┐            (for app     (for commit
              │                       │             exports)     verification)
              ▼                       ▼
    DeriveSecret          DeriveSecret
    ("membership")        ("resumption")
              │                       │
              ▼                       ▼
    membership_key        resumption_psk
    (for PublicMessage    (for future PSK
     authentication)       injection)

                                         │
                                         │
              ┌──────────────────────────┘
              │
              ▼
    DeriveSecret("init")
              │
              ▼
    init_secret[n]  ─────────► Stored for next epoch
```

### Transcript Hash Evolution

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    TRANSCRIPT HASH EVOLUTION                             │
└─────────────────────────────────────────────────────────────────────────┘


    Epoch N-1                     Epoch N                      Epoch N+1
    ═════════                     ═══════                      ═════════

                            ┌─────────────────┐
                            │ Commit for      │
                            │ Epoch N         │
                            │                 │
    interim_hash[N-1] ─────►│ wire_format     │
            │               │ content         │
            │               │ signature       │
            │               │ confirmation_tag│
            │               └───────┬─────────┘
            │                       │
            │                       ├──────────────────────┐
            │                       │                      │
            ▼                       ▼                      ▼
    ┌───────────────┐    ┌──────────────────┐    ┌──────────────────┐
    │               │    │                  │    │                  │
    │ interim_hash  │───►│ confirmed_hash   │───►│ interim_hash[N]  │
    │    [N-1]      │    │     [N]          │    │                  │
    │               │    │                  │    │                  │
    └───────────────┘    └──────────────────┘    └──────────────────┘
                                  │
                                  │
                                  ▼
                         Used in GroupContext[N]
                         for key derivation



    FORMULAS:
    ═════════

    confirmed_transcript_hash[N] = Hash(
        interim_transcript_hash[N-1] ||
        ConfirmedTranscriptHashInput[N]
            // = wire_format || content || signature
    )

    interim_transcript_hash[N] = Hash(
        confirmed_transcript_hash[N] ||
        InterimTranscriptHashInput[N]
            // = confirmation_tag
    )
```

---

## 11. Welcome Message Processing

### Welcome Message Structure

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      WELCOME MESSAGE STRUCTURE                           │
└─────────────────────────────────────────────────────────────────────────┘


    ┌─────────────────────────────────────────────────────────────────┐
    │                        WELCOME                                   │
    ├─────────────────────────────────────────────────────────────────┤
    │                                                                  │
    │  cipher_suite: MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519     │
    │                                                                  │
    │  secrets: [                                                      │
    │    {                                                             │
    │      new_member: <hash of KeyPackage 1>,                        │
    │      encrypted_group_secrets: <HPKE ciphertext>                 │
    │    },                                                            │
    │    {                                                             │
    │      new_member: <hash of KeyPackage 2>,                        │  Multiple
    │      encrypted_group_secrets: <HPKE ciphertext>                 │  if batch add
    │    },                                                            │
    │    ...                                                           │
    │  ]                                                               │
    │                                                                  │
    │  encrypted_group_info: <ciphertext>                             │
    │                                                                  │
    └─────────────────────────────────────────────────────────────────┘


    ENCRYPTED GROUP SECRETS (per new member):
    ──────────────────────────────────────────

    Encrypted to: KeyPackage.init_key

    ┌─────────────────────────────────────────┐
    │  joiner_secret: <32 bytes>              │  ◄── Key schedule input
    │                                          │
    │  path_secret: <optional, 32 bytes>      │  ◄── If UpdatePath was used
    │                                          │      (decrypt point for new member)
    │  psks: [                                 │
    │    { psk_type, psk_id, psk_nonce },     │  ◄── PSKs used in Commit
    │    ...                                   │
    │  ]                                       │
    └─────────────────────────────────────────┘


    ENCRYPTED GROUP INFO:
    ──────────────────────

    Encrypted with: welcome_key (derived from joiner_secret)

    ┌─────────────────────────────────────────┐
    │  group_context: {                       │
    │    group_id,                            │
    │    epoch,                               │
    │    tree_hash,                           │
    │    confirmed_transcript_hash,           │
    │    extensions                           │
    │  }                                       │
    │                                          │
    │  extensions: [                          │
    │    { type: ratchet_tree, ... },         │  ◄── Optional: full tree
    │    ...                                   │
    │  ]                                       │
    │                                          │
    │  confirmation_tag: <MAC>                │  ◄── Verify epoch
    │                                          │
    │  signer: <leaf index>                   │  ◄── Who created this
    │  signature: <signature>                 │  ◄── Authenticity
    └─────────────────────────────────────────┘
```

### Welcome Processing Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    PROCESSING A WELCOME MESSAGE                          │
└─────────────────────────────────────────────────────────────────────────┘


    NEW MEMBER (Bob) receives Welcome
            │
            ▼
    ┌───────────────────────────────────────────────────────┐
    │  Step 1: Find My Entry                                 │
    │                                                        │
    │  my_kp_hash = hash(my_key_package)                    │
    │  FOR entry in welcome.secrets:                        │
    │      IF entry.new_member == my_kp_hash:               │
    │          my_entry = entry                             │
    │          BREAK                                         │
    └───────────────────────────────────────────────────────┘
            │
            ▼
    ┌───────────────────────────────────────────────────────┐
    │  Step 2: Decrypt Group Secrets                         │
    │                                                        │
    │  // Use private key corresponding to KeyPackage.init_key│
    │  group_secrets = HPKE.Decrypt(                        │
    │      my_init_private,                                 │
    │      my_entry.encrypted_group_secrets                 │
    │  )                                                     │
    │                                                        │
    │  // Extract:                                           │
    │  joiner_secret = group_secrets.joiner_secret          │
    │  path_secret = group_secrets.path_secret  // optional │
    │  psks = group_secrets.psks                            │
    └───────────────────────────────────────────────────────┘
            │
            ▼
    ┌───────────────────────────────────────────────────────┐
    │  Step 3: Derive Welcome Key and Decrypt GroupInfo      │
    │                                                        │
    │  welcome_secret = DeriveSecret(joiner_secret,"welcome")│
    │  welcome_key = ExpandWithLabel(welcome_secret,        │
    │                                "key", "", AEAD.Nk)     │
    │  welcome_nonce = ExpandWithLabel(welcome_secret,      │
    │                                  "nonce", "", AEAD.Nn) │
    │                                                        │
    │  group_info = AEAD.Decrypt(                           │
    │      welcome_key,                                     │
    │      welcome_nonce,                                   │
    │      welcome.encrypted_group_info                     │
    │  )                                                     │
    └───────────────────────────────────────────────────────┘
            │
            ▼
    ┌───────────────────────────────────────────────────────┐
    │  Step 4: Verify GroupInfo                              │
    │                                                        │
    │  // Get signer's public key from tree                 │
    │  signer_leaf = tree.get_leaf(group_info.signer)       │
    │  signer_key = signer_leaf.signature_key               │
    │                                                        │
    │  // Verify signature                                   │
    │  Verify(signer_key, group_info.tbs, group_info.sig)   │
    └───────────────────────────────────────────────────────┘
            │
            ▼
    ┌───────────────────────────────────────────────────────┐
    │  Step 5: Initialize Ratchet Tree                       │
    │                                                        │
    │  IF ratchet_tree extension present:                   │
    │      tree = deserialize(group_info.ratchet_tree)      │
    │  ELSE:                                                 │
    │      tree = fetch_from_delivery_service()             │
    │                                                        │
    │  // Verify tree matches context                        │
    │  ASSERT hash(tree) == group_info.tree_hash            │
    │                                                        │
    │  // Find my position                                   │
    │  my_leaf_index = find_leaf_matching(my_key_package)   │
    └───────────────────────────────────────────────────────┘
            │
            ▼
    ┌───────────────────────────────────────────────────────┐
    │  Step 6: Process Path Secret (if present)              │
    │                                                        │
    │  IF path_secret is not None:                          │
    │      // I can derive keys up from my decryption point │
    │      current_secret = path_secret                     │
    │                                                        │
    │      FOR node in path_from_my_decrypt_point_to_root:  │
    │          node_secret = derive(current_secret)         │
    │          store_private_key(node, node_secret)         │
    │          current_secret = next(current_secret)        │
    │                                                        │
    │      commit_secret = root_secret                      │
    │  ELSE:                                                 │
    │      // No UpdatePath, commit_secret is zeros         │
    │      commit_secret = zero_bytes(KDF.Nh)               │
    └───────────────────────────────────────────────────────┘
            │
            ▼
    ┌───────────────────────────────────────────────────────┐
    │  Step 7: Run Key Schedule                              │
    │                                                        │
    │  // Derive init_secret from joiner_secret             │
    │  // (Different path than existing members use)        │
    │                                                        │
    │  psk_secret = compute_psk_secret(psks)                │
    │                                                        │
    │  epoch_secret = KDF.Extract(                          │
    │      ExpandWithLabel(                                 │
    │          KDF.Extract(joiner_secret, psk_secret),      │
    │          "epoch", context                             │
    │      ),                                                │
    │      commit_secret                                    │
    │  )                                                     │
    │                                                        │
    │  // Derive all epoch secrets                          │
    │  encryption_secret = DeriveSecret("encryption")       │
    │  confirmation_key = DeriveSecret("confirm")           │
    │  // ... etc                                            │
    └───────────────────────────────────────────────────────┘
            │
            ▼
    ┌───────────────────────────────────────────────────────┐
    │  Step 8: Verify Confirmation Tag                       │
    │                                                        │
    │  expected_tag = MAC(                                  │
    │      confirmation_key,                                │
    │      group_info.confirmed_transcript_hash             │
    │  )                                                     │
    │                                                        │
    │  ASSERT group_info.confirmation_tag == expected_tag   │
    └───────────────────────────────────────────────────────┘
            │
            ▼
    ┌───────────────────────────────────────────────────────┐
    │  Step 9: Initialize Message Encryption State           │
    │                                                        │
    │  // Build secret tree                                  │
    │  secret_tree = build_tree(encryption_secret)          │
    │                                                        │
    │  // Initialize ratchets for all members               │
    │  FOR leaf in tree.leaves:                             │
    │      leaf_secret = secret_tree[leaf]                  │
    │      handshake_ratchet[leaf] = init(leaf_secret)      │
    │      application_ratchet[leaf] = init(leaf_secret)    │
    └───────────────────────────────────────────────────────┘
            │
            ▼
    ┌───────────────────────────────────────────────────────┐
    │  Step 10: Ready!                                       │
    │                                                        │
    │  Bob can now:                                          │
    │  ├── Send encrypted messages                          │
    │  ├── Receive encrypted messages                       │
    │  ├── Process Commits                                  │
    │  └── Create proposals                                  │
    └───────────────────────────────────────────────────────┘
```

---

## Quick Reference: Operation Summary

| Operation | Initiator | Messages Sent | Tree Change | Epoch Change |
|-----------|-----------|---------------|-------------|--------------|
| Create Group | Creator | None | Single leaf | Epoch 0 |
| Add Member | Existing member | Commit, Welcome | Add leaf | +1 |
| Remove Member | Any member | Commit (w/ UpdatePath) | Blank leaf + path | +1 |
| Update Keys | Any member | Commit (w/ UpdatePath) | Replace leaf + path | +1 |
| External Join | New member | External Commit | Add leaf | +1 |
| Send Message | Any member | PrivateMessage | None | None |
| Receive Message | Any member | None | None | None |

---

*This guide provides visual representations of MLS protocol operations. For complete technical details, refer to RFC 9420.*
