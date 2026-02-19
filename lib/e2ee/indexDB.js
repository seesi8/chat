
// ============================================================================
// INDEXEDDB - FIXED IMPLEMENTATION
// ============================================================================

const DB_CONFIG = {
  keys: { version: 1, stores: { keys: { outOfLine: true } } },
  metadata: { version: 1, stores: { metadata: { outOfLine: true } } },
  crypto: { version: 1, stores: { opks: { outOfLine: true } } },
  mk: { version: 1, stores: { mks: { outOfLine: true } } },
  messages: {
    version: 2,
    stores: {
      messageStore: { keyPath: ["threadId", "key"], indexes: ["threadId"] },
    },
  },
  files: {
    version: 2,
    stores: {
      fileStore: { keyPath: ["threadId", "key"], indexes: ["threadId"] },
    },
  },
  headers: {
    version: 2,
    stores: {
      headerStore: { keyPath: ["threadId", "key"], indexes: ["threadId"] },
    },
  },
};

// FIX #1: Use a promise-based singleton to prevent race conditions
let initPromise = null;

export async function initDatabases() {
  // Return existing promise if initialization is in progress or complete
  if (initPromise !== null) {
    return initPromise;
  }

  // Create and cache the initialization promise
  initPromise = Promise.all(
    Object.entries(DB_CONFIG).map(([dbName, config]) =>
      initDB(dbName, config.stores, config.version)
    )
  );

  try {
    await initPromise;
  } catch (error) {
    // Reset on failure so retry is possible
    initPromise = null;
    throw error;
  }

  return initPromise;
}

export function initDB(dbName, stores, version) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, version);

    req.onupgradeneeded = (event) => {
      const db = req.result;

      for (const [storeName, storeConfig] of Object.entries(stores)) {
        // Delete existing store if it exists (to fix corrupted schema)
        if (db.objectStoreNames.contains(storeName)) {
          db.deleteObjectStore(storeName);
        }

        let store;
        if (storeConfig.outOfLine) {
          // Simple key-value store: store.put(value, key)
          store = db.createObjectStore(storeName);
        } else if (storeConfig.keyPath) {
          // Composite key store: store.put({ threadId, key, data })
          store = db.createObjectStore(storeName, {
            keyPath: storeConfig.keyPath,
          });

          if (storeConfig.indexes) {
            for (const indexName of storeConfig.indexes) {
              store.createIndex(indexName, indexName, { unique: false });
            }
          }
        }
      }
    };

    // FIX #2: Handle blocked event (another connection is open with old version)
    req.onblocked = () => {
      console.warn(
        `Database "${dbName}" upgrade blocked. Close other tabs using this database.`
      );
    };

    req.onsuccess = () => {
      req.result.close();
      resolve();
    };

    req.onerror = () => reject(req.error);
  });
}

export async function openDB(dbName) {
  // Ensure all databases are initialized first
  await initDatabases();

  return new Promise((resolve, reject) => {
    const config = DB_CONFIG[dbName];
    if (!config) {
      reject(new Error(`Unknown database: ${dbName}`));
      return;
    }

    const req = indexedDB.open(dbName, config.version);

    // FIX #3: Handle upgrade in openDB (shouldn't happen after init, but safety)
    req.onupgradeneeded = (event) => {
      // This shouldn't happen if initDatabases() ran correctly
      // But handle it gracefully
      const db = req.result;
      const stores = config.stores;

      for (const [storeName, storeConfig] of Object.entries(stores)) {
        if (!db.objectStoreNames.contains(storeName)) {
          let store;
          if (storeConfig.outOfLine) {
            store = db.createObjectStore(storeName);
          } else if (storeConfig.keyPath) {
            store = db.createObjectStore(storeName, {
              keyPath: storeConfig.keyPath,
            });
            if (storeConfig.indexes) {
              for (const indexName of storeConfig.indexes) {
                store.createIndex(indexName, indexName, { unique: false });
              }
            }
          }
        }
      }
    };

    req.onblocked = () => {
      console.warn(`Database "${dbName}" open blocked.`);
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getStoredKey(keyName) {
  const result = await dbOperation("keys", "keys", "readonly", (store) =>
    store.get(keyName)
  );
  return result || null;
}


// FIX #4: Completely rewritten dbOperation with proper request handling
export async function dbOperation(dbName, storeName, mode, operation) {
  const db = await openDB(dbName);

  return new Promise((resolve, reject) => {
    let tx;
    try {
      tx = db.transaction(storeName, mode);
    } catch (error) {
      db.close();
      reject(error);
      return;
    }

    const store = tx.objectStore(storeName);

    let result;
    let operationError = null;

    try {
      result = operation(store);
    } catch (error) {
      operationError = error;
    }

    // FIX #5: Proper IDBRequest detection using instanceof
    const isRequest = result instanceof IDBRequest;

    if (isRequest) {
      result.onsuccess = () => {
        // Don't resolve here - wait for transaction to complete
      };
      result.onerror = () => {
        operationError = result.error;
      };
    }

    tx.oncomplete = () => {
      db.close();
      if (operationError) {
        reject(operationError);
      } else if (isRequest) {
        resolve(result.result);
      } else {
        resolve(result);
      }
    };

    tx.onerror = () => {
      db.close();
      reject(tx.error || operationError);
    };

    tx.onabort = () => {
      db.close();
      reject(tx.error || new Error("Transaction aborted"));
    };

    // If operation threw synchronously, abort the transaction
    if (operationError && !isRequest) {
      try {
        tx.abort();
      } catch (e) {
        // Transaction may have already completed
      }
    }
  });
}

// FIX #6: Rewritten to use dbOperation pattern consistently
async function dbGetAllWithKeys(dbName, storeName) {
  const db = await openDB(dbName);

  return new Promise((resolve, reject) => {
    let tx;
    try {
      tx = db.transaction(storeName, "readonly");
    } catch (error) {
      db.close();
      reject(error);
      return;
    }

    const store = tx.objectStore(storeName);

    const valuesReq = store.getAll();
    const keysReq = store.getAllKeys();

    let values, keys;
    let requestError = null;

    valuesReq.onsuccess = () => {
      values = valuesReq.result;
    };
    valuesReq.onerror = () => {
      requestError = valuesReq.error;
    };

    keysReq.onsuccess = () => {
      keys = keysReq.result;
    };
    keysReq.onerror = () => {
      requestError = keysReq.error;
    };

    tx.oncomplete = () => {
      db.close();
      if (requestError) {
        reject(requestError);
      } else {
        resolve({ keys, values });
      }
    };

    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };

    tx.onabort = () => {
      db.close();
      reject(tx.error || new Error("Transaction aborted"));
    };
  });
}

// ============================================================================
// KEY STORAGE OPERATIONS
// ============================================================================

export async function storeKey(key, storeKey) {
  await dbOperation("keys", "keys", "readwrite", (store) => {
    store.put(key, storeKey);
  });
}

export async function deleteKey(storeKey) {
  await dbOperation("keys", "keys", "readwrite", (store) => {
    store.delete(storeKey);
  });
}

// ============================================================================
// OPK (One-time Pre-Key) OPERATIONS
// ============================================================================

export async function storeOPK(key, storeKey) {
  await dbOperation("crypto", "opks", "readwrite", (store) => {
    store.put(key, storeKey);
  });
}

export async function getOPK(storeKey) {
  return dbOperation("crypto", "opks", "readonly", (store) =>
    store.get(storeKey)
  );
}

export async function getAllOPKsWithKeys() {
  const { keys, values } = await dbGetAllWithKeys("crypto", "opks");
  return keys.map((key, i) => ({ storeKey: key, opk: values[i] }));
}

// ============================================================================
// MK (Message Key) OPERATIONS
// ============================================================================

export async function storeMK(key, storeKey) {
  await dbOperation("mk", "mks", "readwrite", (store) => {
    store.put(key, storeKey);
  });
}

export async function getMK(storeKey) {
  return dbOperation("mk", "mks", "readonly", (store) => store.get(storeKey));
}

export async function deleteMK(storeKey) {
  await dbOperation("mk", "mks", "readwrite", (store) => {
    store.delete(storeKey);
  });
}

export async function getAllMKsWithKeys() {
  const { keys, values } = await dbGetAllWithKeys("mk", "mks");
  return keys.map((key, i) => ({ storeKey: key, mk: values[i] }));
}

// ============================================================================
// METADATA OPERATIONS
// ============================================================================

export async function storeMetadata(value, storeKey) {
  await dbOperation("metadata", "metadata", "readwrite", (store) => {
    store.put(value, storeKey);
  });
}

export async function getStoredMetadata(keyName) {
  return dbOperation("metadata", "metadata", "readonly", (store) =>
    store.get(keyName)
  );
}

// ============================================================================
// MESSAGE OPERATIONS
// ============================================================================

export async function storeMessage(threadId, key, data) {
  await dbOperation("messages", "messageStore", "readwrite", (store) => {
    store.put({ threadId, key, data });
  });
}

export async function getStoredMessage(threadId, key) {
  const result = await dbOperation(
    "messages",
    "messageStore",
    "readonly",
    (store) => store.get([threadId, key])
  );

  return result?.data;
}

// FIX #7: Use getAll with index for consistency (matches getStoredFiles pattern)
export async function getStoredMessages(threadId) {
  const db = await openDB("messages");

  return new Promise((resolve, reject) => {
    let tx;
    try {
      tx = db.transaction("messageStore", "readonly");
    } catch (error) {
      db.close();
      reject(error);
      return;
    }

    const store = tx.objectStore("messageStore");
    const index = store.index("threadId");
    const req = index.getAll(IDBKeyRange.only(threadId));

    let result = null;
    let requestError = null;

    req.onsuccess = () => {
      result = req.result.map((item) => ({
        messageId: item.key,
        message: item.data,
      }));
    };

    req.onerror = () => {
      requestError = req.error;
    };

    tx.oncomplete = () => {
      db.close();
      if (requestError) {
        reject(requestError);
      } else {
        resolve(result || []);
      }
    };

    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };

    tx.onabort = () => {
      db.close();
      reject(tx.error || new Error("Transaction aborted"));
    };
  });
}

// ============================================================================
// HEADER OPERATIONS
// ============================================================================

export async function storeHeader(threadId, key, data) {
  await dbOperation("headers", "headerStore", "readwrite", (store) => {
    store.put({ threadId, key, data });
  });
}

export async function getStoredHeader(threadId, key) {
  const result = await dbOperation(
    "headers",
    "headerStore",
    "readonly",
    (store) => store.get([threadId, key])
  );

  return result?.data;
}

// ============================================================================
// FILE OPERATIONS
// ============================================================================

export async function storeFile(threadId, key, data) {
  await dbOperation("files", "fileStore", "readwrite", (store) => {
    store.put({ threadId, key, data });
  });
}

export async function getStoredFile(threadId, key) {
  const result = await dbOperation("files", "fileStore", "readonly", (store) =>
    store.get([threadId, key])
  );

  return result?.data;
}

export async function getStoredFiles(threadId) {
  const db = await openDB("files");

  return new Promise((resolve, reject) => {
    let tx;
    try {
      tx = db.transaction("fileStore", "readonly");
    } catch (error) {
      db.close();
      reject(error);
      return;
    }

    const store = tx.objectStore("fileStore");
    const index = store.index("threadId");
    const req = index.getAll(IDBKeyRange.only(threadId));

    let result = null;
    let requestError = null;

    req.onsuccess = () => {
      result = req.result.map((item) => ({
        fileId: item.key,
        file: item.data,
      }));
    };

    req.onerror = () => {
      requestError = req.error;
    };

    tx.oncomplete = () => {
      db.close();
      if (requestError) {
        reject(requestError);
      } else {
        resolve(result || []);
      }
    };

    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };

    tx.onabort = () => {
      db.close();
      reject(tx.error || new Error("Transaction aborted"));
    };
  });
}

// ============================================================================
// UTILITY: Clear all databases (useful for testing/logout)
// ============================================================================

export async function clearAllDatabases() {
  const dbNames = Object.keys(DB_CONFIG);

  await Promise.all(
    dbNames.map(
      (dbName) =>
        new Promise((resolve, reject) => {
          const req = indexedDB.deleteDatabase(dbName);
          req.onsuccess = () => resolve();
          req.onerror = () => reject(req.error);
          req.onblocked = () => {
            console.warn(`Delete of "${dbName}" blocked`);
            // Still resolve - the delete will complete when connections close
            resolve();
          };
        })
    )
  );

  // Reset init state so databases will be recreated on next use
  initPromise = null;
}
