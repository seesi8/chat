# Crypto & Security Problems / Improvements

Date: February 11, 2026  
Scope: Crypto, protocol security, key management, and authz controls in the current codebase.

This is a code-referenced, implementation-focused backlog. It is intentionally strict and prioritized.

## Critical (P0)

### P0-1. Keep signature verification fail-closed with regression coverage
- Problem: Signature checks are currently fail-closed, but this is a high-impact invariant that needs explicit regression protection.
- Evidence: `lib/GroupMessageHandler.ts:407`, `lib/GroupMessageHandler.ts:410`, `lib/GroupMessageHandler.ts:412`
- Impact: A future regression to fail-open would allow sender-auth bypass and forged control/data processing.
- Improvement:
  1. Add tests that assert invalid signatures are always rejected.
  2. Emit security telemetry on signature failures.

### P0-2. Formalize and freeze signed-envelope canonicalization
- Problem: Signing/verification now normalize payloads consistently, but the schema is implicit and unversioned.
- Evidence: Sign paths (`lib/GroupMessageHandler.ts:328`, `lib/GroupMessageHandler.ts:357`) and verify normalization (`lib/GroupMessageHandler.ts:405`, `lib/GroupMessageHandler.ts:407`).
- Impact: Future refactors can silently drift signed fields and break authentication guarantees.
- Improvement:
  1. Define a versioned canonical signed envelope schema.
  2. Add golden tests for canonical serialization parity.

### P0-3. Unencrypted control planes for group add/update
- Problem: Membership and epoch-control payloads are sent in unencrypted message types.
- Evidence: `lib/GroupMessageHandler.ts:292`, `lib/GroupMessageHandler.ts:646`, constants in `lib/MessageHandler.js:65`, `lib/MessageHandler.js:66`, `lib/MessageHandler.js:67`
- Impact: Sensitive control metadata is exposed and easier to tamper with.
- Improvement:
  1. Move add/update control messages to authenticated encrypted channel.
  2. If plaintext control is retained, add strict signature+context binding and replay protections.

### P0-4. OPK callable functions lack authz ownership checks
- Problem: Callable functions accept arbitrary `uid` and do not verify caller identity/authorization.
- Evidence: `functions/index.js:12`, `functions/index.js:19`, `functions/index.js:37`, `functions/index.js:56`, `functions/index.js:57`, `functions/index.js:62`
- Impact: OPK poisoning, OPK draining/deletion, and handshake disruption by other users.
- Improvement:
  1. Require `request.auth` and enforce `request.auth.uid === uid` for `addOPK`.
  2. Restrict `getOPK` issuance policy (authorized requesters only, abuse controls, rate limits).

### P0-5. Storage is globally readable/writable
- Problem: Storage rules allow unrestricted read/write on all paths.
- Evidence: `storage.rules:5`
- Impact: Arbitrary object overwrite, ciphertext replacement, and broad data exfiltration risk.
- Improvement:
  1. Lock storage paths to authenticated principals and thread membership.
  2. Use per-object ACL logic and strict naming scopes.

### P0-6. Firestore rules include unrestricted write surface
- Problem: Top-level `messages` collection allows any write.
- Evidence: `firestore.rules:43`
- Impact: Data poisoning / abuse path.
- Improvement:
  1. Remove or lock this rule to authenticated, narrowly-scoped writes.

### P0-7. Thread message write rule does not verify thread membership
- Problem: `canMessage()` validates sender uid field but not that sender is in thread members.
- Evidence: `firestore.rules:76`, `firestore.rules:79`
- Impact: Non-members can inject messages if payload schema matches rule conditions.
- Improvement:
  1. In `canMessage()`, assert `request.auth.uid in thread.members`.
  2. Validate schema for the actual encrypted envelope in use.

### P0-8. Any current member can rewrite thread membership/critical thread state
- Problem: `canThread()` checks only that auth user is in proposed members, not role or immutable invariants.
- Evidence: `firestore.rules:83`, `firestore.rules:85`, `firestore.rules:87`
- Impact: Unauthorized membership changes, forced joins/removals, protocol-state tampering.
- Improvement:
  1. Restrict sensitive updates to owner/leader or explicit governance policy.
  2. Split mutable vs immutable fields and enforce field-level invariants.

## High (P1)

### P1-1. Group update acceptance lacks state-auth checks
- Problem: Update processing does not enforce transcript or strict tree-hash validation before applying.
- Evidence: Tree hash produced (`lib/GroupMessageHandler.ts:99`, `lib/GroupMessageHandler.ts:284`, `lib/GroupMessageHandler.ts:630`) but receive path applies updates directly (`lib/GroupMessageHandler.ts:587`, `lib/GroupMessageHandler.ts:616`).
- Impact: Higher risk of state divergence/tampered epoch transitions.
- Improvement:
  1. Enforce monotonic epoch and expected tree hash before update apply.
  2. Add transcript/confirmation-style checks for commits.

### P1-2. Update payload origin metadata is not validated
- Problem: `originIndex` is parsed but not validated against sender identity or path constraints.
- Evidence: `lib/GroupMessageHandler.ts:600`, `lib/GroupMessageHandler.ts:601`, `lib/GroupMessageHandler.ts:616`
- Impact: Malformed or adversarial update payloads may be accepted too broadly.
- Improvement:
  1. Validate `originIndex` against `header.from` and expected direct-path semantics.
  2. Reject updates that do not match epoch/tree invariants.

### P1-3. Group replay/order robustness is weak
- Problem: Receiving key progression is stateful but does not enforce strict replay/out-of-order windows.
- Evidence: `lib/SecretTree.ts:194`, `lib/SecretTree.ts:211`
- Impact: Replays/out-of-order traffic can desync state or cause controlled DoS.
- Improvement:
  1. Track `(sender, epoch, n)` windows.
  2. Add duplicate suppression and skipped-key cache policy.

### P1-4. Group control/update path still triggered in unencrypted mode
- Problem: Membership add path explicitly invokes `startUpdate(false)`.
- Evidence: `lib/GroupMessageHandler.ts:294`
- Impact: Epoch transition metadata exposed and easier to tamper with.
- Improvement:
  1. Default to encrypted update commits.
  2. Remove plaintext fallback in production.

### P1-5. Key package selection is first-doc only and not consumed
- Problem: Add flow fetches `limit(1)` key package with no order/consumption semantics.
- Evidence: `lib/GroupMessageHandler.ts:253`
- Impact: Potential key-package reuse and weaker one-time assumptions.
- Improvement:
  1. Deterministic ordering + atomic consume/delete on use.
  2. Add key-package freshness metadata and exhaustion handling.

### P1-6. DM header AAD binding bug (`Object` encoded instead of canonical bytes)
- Problem: `te.encode(encryptedHeader)` is applied to an object, producing non-canonical AAD semantics.
- Evidence: `lib/e2ee/e2ee.js:930`; decrypt uses `te.encode(aad)` at `lib/e2ee/e2ee.js:1020`
- Impact: Intended payload-header binding is weaker than expected.
- Improvement:
  1. Serialize AAD canonically (e.g., stable JSON string bytes).
  2. Include explicit context fields (`threadId`, `n`, `pn`, key id).

### P1-7. DM identity mismatch warnings do not abort handshake
- Problem: Identity mismatch checks toast warnings but continue.
- Evidence: `lib/MessageHandler.js:682`, `lib/MessageHandler.js:683`, `lib/MessageHandler.js:980`, `lib/MessageHandler.js:981`
- Impact: Unknown-key-share / MITM resistance reduced under key-substitution scenarios.
- Improvement:
  1. Abort handshake on identity mismatch.
  2. Require explicit user verification step for key changes.

### P1-8. Sensitive key material logged to console
- Problem: Path secrets and derived secrets are logged.
- Evidence: `lib/KEMTree.ts:140`, `lib/KEMTree.ts:356`, `lib/KEMTree.ts:373`, `lib/KEMTree.ts:374`, plus payload logs in `lib/GroupMessageHandler.ts:326`, `lib/GroupMessageHandler.ts:406`, `lib/GroupMessageHandler.ts:474`, `lib/GroupMessageHandler.ts:604`, `lib/GroupMessageHandler.ts:612`
- Impact: Secret leakage in logs/devtools/telemetry.
- Improvement:
  1. Remove secret-bearing logs.
  2. Gate debug logging behind secure redaction controls.

### P1-9. Raw ECDH output is used directly as AEAD key in update-path encryption helper
- Problem: `encryptWithPublicKey`/`decryptWithPrivateKey` import shared bits directly as AES key.
- Evidence: `lib/e2ee/e2ee.js:569`, `lib/e2ee/e2ee.js:583`, `lib/e2ee/e2ee.js:610`, `lib/e2ee/e2ee.js:627`
- Impact: Reduced domain-separation hygiene and protocol composability.
- Improvement:
  1. Derive AEAD key with HKDF and explicit context labels.
  2. Bind AAD to epoch/tree/update metadata.

## Medium (P2)

### P2-1. Group AEAD nonce is 64-bit (not 96-bit standard profile)
- Problem: Group send/receive paths use 8-byte nonces.
- Evidence: `lib/SecretTree.ts:167`, `lib/SecretTree.ts:175`, `lib/SecretTree.ts:200`, `lib/SecretTree.ts:207`
- Impact: Lower nonce-space margin; interoperability/analysis expectations differ from common 96-bit profile.
- Improvement:
  1. Move to 12-byte nonce derivation scheme.
  2. Keep strict anti-reuse guarantees and sender counters.

### P2-2. Group AEAD AAD is minimal
- Problem: AAD is only sender UID for group MLS wrapper.
- Evidence: `lib/GroupMessageHandler.ts:307`, `lib/e2ee/e2ee.js:647`
- Impact: Weaker context binding across thread/epoch/type/counter dimensions.
- Improvement:
  1. Bind AAD to `{threadId, epoch, n, type, from}`.

### P2-3. HKDF helper defaults to zero salt in many paths
- Problem: `hkdfExpandWithLabels` default salt is all-zero 16 bytes.
- Evidence: `lib/e2ee/e2ee.js:823`
- Impact: Domain separation depends entirely on labels/callers; fragile if labels collide.
- Improvement:
  1. Require caller-provided salt/context for protocol-critical derivations.

### P2-4. OPK generation fan-out is not awaited
- Problem: `generateOPKS()` calls async `generateOPK()` without await.
- Evidence: `lib/functions.js:1152`, `lib/functions.js:1154`
- Impact: Non-deterministic OPK inventory and possible handshake failures.
- Improvement:
  1. Await each call or `Promise.all` with error handling.

### P2-5. `createThread()` launches `addUser()` without awaiting
- Problem: Membership adds execute concurrently without sequencing.
- Evidence: `lib/GroupMessageHandler.ts:138`
- Impact: Race conditions in epoch updates and ratchet-tree consistency.
- Improvement:
  1. Serialize add/commit operations.

### P2-6. KEMTree `moveToIndex()` stores secrets under wrong key names
- Problem: Storage keys use wrong interpolants (`privateKey` object and old index).
- Evidence: `lib/KEMTree.ts:241`, `lib/KEMTree.ts:242`, `lib/KEMTree.ts:243`
- Impact: Broken key migration and key-erasure guarantees if function is used.
- Improvement:
  1. Correct key naming to `newIndex` and fixed prefixes.
  2. Add tests for migration + erasure invariants.

### P2-7. Client-side access guard bug always sets valid state true
- Problem: Non-member branch still sets valid true.
- Evidence: `lib/functions.js:505`, `lib/functions.js:507`, `lib/functions.js:510`
- Impact: UI-level access control bypass (server rules must carry all security weight).
- Improvement:
  1. Fix branch logic and fail closed in UI.

### P2-8. Debug/test trigger for unencrypted group update is exposed in thread UI
- Problem: UI button invokes `messageHandler.test()` which performs unencrypted update.
- Evidence: `pages/[thread]/index.jsx:234`, `lib/GroupMessageHandler.ts:675`, `lib/GroupMessageHandler.ts:677`
- Impact: Accidental or malicious state churn in production clients.
- Improvement:
  1. Remove test entrypoint from production build.

### P2-9. Backup KDF profile is relatively weak for 2026 threat models
- Problem: Backup encryption uses PBKDF2-SHA256 at 200k iterations.
- Evidence: `lib/e2ee/e2ee.js:239`, `lib/e2ee/e2ee.js:285`, `lib/e2ee/e2ee.js:327`
- Impact: Lower resistance against modern offline guessing vs memory-hard KDFs.
- Improvement:
  1. Move to Argon2id/scrypt profile with versioned params.

## Hardening Backlog (P3)

### P3-1. Add strict key-package canonicalization consistency
- Problem: Key package signing and verification use different serialization functions.
- Evidence: Sign with `JSON.stringify` (`lib/e2ee/e2ee.js:1679`), verify with `stableStringify` (`lib/GroupMessageHandler.ts:272`).
- Improvement:
  1. Use one canonical serializer everywhere.

### P3-2. Expand protocol-level negative tests
- Problem: Security invariants lack dedicated regression tests (signature failure, replay, forged update paths, authz abuse).
- Evidence: Rules/tests are DM-centric schema checks (`test/rules/messages.test.js:3`).
- Improvement:
  1. Add adversarial tests per invariant.

### P3-3. Threat-model-driven telemetry
- Problem: Security failures are often silently swallowed or reduced to UI toast.
- Evidence: Multiple `catch`/warning-only branches in message processing and handshake paths.
- Improvement:
  1. Add structured security event reporting and circuit breakers.

## Suggested Remediation Order

1. Lock infrastructure controls first: storage rules, callable authz, Firestore write predicates.  
2. Enforce and regression-test group signature invariants.  
3. Encrypt/authenticate group control messages and add strict state-acceptance checks.  
4. Fix DM AAD binding and handshake abort behavior on identity mismatch.  
5. Address replay/order robustness and key-management race conditions.
