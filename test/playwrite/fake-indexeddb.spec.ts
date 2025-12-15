import { test, expect } from '@playwright/test';
import 'fake-indexeddb/auto';

const DB_NAME = 'playwrite-demo';
const STORE_NAME = 'messages';

type MessageRecord = {
  id: number;
  text: string;
};

const getIndexedDB = () => {
  const factory = (globalThis as any).indexedDB;
  if (!factory) {
    throw new Error('fake-indexeddb failed to install the global indexedDB factory');
  }
  return factory;
};

const openDatabase = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = getIndexedDB().open(DB_NAME, 1);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open fake IndexedDB'));
  });

const seedMessage = async (record: MessageRecord) => {
  const db = await openDatabase();

  return new Promise<MessageRecord>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(record);

    tx.oncomplete = () => {
      db.close();
      resolve(record);
    };

    tx.onerror = () => {
      db.close();
      reject(tx.error ?? new Error('Failed to persist message'));
    };
  });
};

const readMessage = async (id: number) => {
  const db = await openDatabase();

  return new Promise<MessageRecord | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).get(id);

    request.onsuccess = () => {
      db.close();
      resolve(request.result as MessageRecord | undefined);
    };

    request.onerror = () => {
      db.close();
      reject(request.error ?? new Error('Failed to read message'));
    };
  });
};

test.describe('fake-indexeddb demo', () => {
  test('renders a seeded message using fake-indexeddb', async ({ page }) => {
    const seeded = await seedMessage({
      id: Date.now(),
      text: 'Hello from fake IndexedDB!',
    });

    const storedMessage = await readMessage(seeded.id);
    expect(storedMessage?.text).toBe(seeded.text);

    await page.goto('about:blank');
    await page.setContent('<main><p id="message"></p></main>');
    await page.locator('#message').evaluate((element, text) => {
      element.textContent = text ?? '';
    }, storedMessage?.text);

    await expect(page.locator('#message')).toHaveText(seeded.text);
  });
});
