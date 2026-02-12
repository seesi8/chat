/** @jest-environment jsdom */
import './setup/crypto-polyfills';

import {
  decryptHeader,
  decryptMessageDR,
  decryptMissedMessageDR,
  encryptMessageDR,
  importHKDFKeyRaw,
  importMessageKey,
  skipMessageDR,
  te,
} from '../../lib/e2ee/e2ee';

type EncryptedPacket = {
  ciphertext: string;
  nonce: string;
  header: { ciphertext: string; nonce: string };
};

type SendResult = {
  packet: EncryptedPacket;
  nextChainKey: CryptoKey;
};

const randomHkdfKey = async () =>
  importHKDFKeyRaw(crypto.getRandomValues(new Uint8Array(32)));

async function sendPacket(
  chainKey: CryptoKey,
  headerKey: CryptoKey,
  message: string,
  n: number,
  pn = 0,
  from = 'user-a'
): Promise<SendResult> {
  const encrypted = await encryptMessageDR(chainKey, te.encode(message), headerKey, {
    from,
    n,
    pn,
    publicKey_n: `${from}-public-key`,
    type: 0x01,
    paddingAmount: 0,
  });

  return {
    packet: {
      ciphertext: encrypted.ciphertext,
      nonce: encrypted.nonce,
      header: encrypted.header,
    },
    nextChainKey: await importHKDFKeyRaw(encrypted.nextChainKey),
  };
}

async function decryptCurrentPacket(
  chainKey: CryptoKey,
  headerKey: CryptoKey,
  packet: EncryptedPacket
) {
  const headerDecrypted = await decryptHeader(
    headerKey,
    packet.header.ciphertext,
    packet.header.nonce
  );
  const parsedHeader = JSON.parse(headerDecrypted.plaintext);

  const decrypted = await decryptMessageDR(
    chainKey,
    packet.ciphertext,
    packet.nonce,
    packet.header,
    parsedHeader
  );

  return {
    text: decrypted.plaintext,
    nextChainKey: await importHKDFKeyRaw(decrypted.nextChainKey),
    header: parsedHeader,
  };
}

describe('dm ratchet ordering', () => {
  test('out_of_order_decrypt_succeeds', async () => {
    const sharedRaw = crypto.getRandomValues(new Uint8Array(32));

    const sendHeaderKey = await randomHkdfKey();
    let senderChain = await importHKDFKeyRaw(sharedRaw);
    let receiverChain = await importHKDFKeyRaw(sharedRaw);

    const packets: EncryptedPacket[] = [];
    for (let n = 0; n < 3; n += 1) {
      const result = await sendPacket(
        senderChain,
        sendHeaderKey,
        `message-${n}`,
        n,
        0,
        'user-a'
      );
      packets.push(result.packet);
      senderChain = result.nextChainKey;
    }

    const latest = packets[2];
    const latestHeader = JSON.parse(
      (await decryptHeader(sendHeaderKey, latest.header.ciphertext, latest.header.nonce)).plaintext
    );

    const skippedMessageKeys = new Map<number, Uint8Array>();

    for (let i = 0; i < latestHeader.n; i += 1) {
      const skipped = await skipMessageDR(receiverChain);
      skippedMessageKeys.set(i, skipped.mkBytes);
      receiverChain = await importHKDFKeyRaw(skipped.nextChainKey);
    }

    const latestDecrypted = await decryptMessageDR(
      receiverChain,
      latest.ciphertext,
      latest.nonce,
      latest.header,
      latestHeader
    );

    expect(latestDecrypted.plaintext).toBe('message-2');

    const mk0 = await importMessageKey(skippedMessageKeys.get(0) as Uint8Array);
    const mk1 = await importMessageKey(skippedMessageKeys.get(1) as Uint8Array);

    const msg0 = await decryptMissedMessageDR(
      mk0,
      packets[0].header,
      packets[0].ciphertext,
      packets[0].nonce
    );
    const msg1 = await decryptMissedMessageDR(
      mk1,
      packets[1].header,
      packets[1].ciphertext,
      packets[1].nonce
    );

    expect(msg0.plaintext).toBe('message-0');
    expect(msg1.plaintext).toBe('message-1');
  });

  test('simultaneous_cross_send_succeeds', async () => {
    const aToBChainRaw = crypto.getRandomValues(new Uint8Array(32));
    const bToAChainRaw = crypto.getRandomValues(new Uint8Array(32));

    let aSend = await importHKDFKeyRaw(aToBChainRaw);
    let bReceive = await importHKDFKeyRaw(aToBChainRaw);

    let bSend = await importHKDFKeyRaw(bToAChainRaw);
    let aReceive = await importHKDFKeyRaw(bToAChainRaw);

    const aHeaderKey = await randomHkdfKey();
    const bHeaderKey = await randomHkdfKey();

    const [round1A, round1B] = await Promise.all([
      sendPacket(aSend, aHeaderKey, 'A->B #1', 0, 0, 'user-a'),
      sendPacket(bSend, bHeaderKey, 'B->A #1', 0, 0, 'user-b'),
    ]);

    aSend = round1A.nextChainKey;
    bSend = round1B.nextChainKey;

    const [receivedAtB1, receivedAtA1] = await Promise.all([
      decryptCurrentPacket(bReceive, aHeaderKey, round1A.packet),
      decryptCurrentPacket(aReceive, bHeaderKey, round1B.packet),
    ]);

    bReceive = receivedAtB1.nextChainKey;
    aReceive = receivedAtA1.nextChainKey;

    expect(receivedAtB1.text).toBe('A->B #1');
    expect(receivedAtA1.text).toBe('B->A #1');

    const [round2A, round2B] = await Promise.all([
      sendPacket(aSend, aHeaderKey, 'A->B #2', 1, 0, 'user-a'),
      sendPacket(bSend, bHeaderKey, 'B->A #2', 1, 0, 'user-b'),
    ]);

    const [receivedAtB2, receivedAtA2] = await Promise.all([
      decryptCurrentPacket(bReceive, aHeaderKey, round2A.packet),
      decryptCurrentPacket(aReceive, bHeaderKey, round2B.packet),
    ]);

    expect(receivedAtB2.text).toBe('A->B #2');
    expect(receivedAtA2.text).toBe('B->A #2');
  });
});
