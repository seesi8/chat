import { webcrypto } from 'crypto';
import { TextDecoder, TextEncoder } from 'util';

if (!globalThis.crypto || !globalThis.crypto.subtle) {
  Object.defineProperty(globalThis, 'crypto', {
    value: webcrypto,
    configurable: true,
  });
}

if (!globalThis.TextEncoder) {
  // @ts-ignore
  globalThis.TextEncoder = TextEncoder;
}

if (!globalThis.TextDecoder) {
  // @ts-ignore
  globalThis.TextDecoder = TextDecoder;
}

if (!globalThis.atob) {
  // @ts-ignore
  globalThis.atob = (value: string) => Buffer.from(value, 'base64').toString('binary');
}

if (!globalThis.btoa) {
  // @ts-ignore
  globalThis.btoa = (value: string) => Buffer.from(value, 'binary').toString('base64');
}

export {};
