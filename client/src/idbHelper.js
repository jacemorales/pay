import { openDB } from 'idb';

const DB_NAME = 'PaystackPaymentDB';
const STORE_NAME = 'PaymentRef';
const KEY = 'current_reference';

let dbPromise;
let inMemoryFallback = null;

const getDb = () => {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      },
    }).catch(err => {
      console.error('IndexedDB setup failed:', err);
      // Fallback to in-memory storage if IndexedDB cannot be opened.
      return null;
    });
  }
  return dbPromise;
};

export const saveRef = async (reference) => {
  try {
    const db = await getDb();
    if (!db) {
      // Fallback to in-memory storage
      inMemoryFallback = reference;
      return;
    }
    await db.put(STORE_NAME, reference, KEY);
  } catch (error) {
    console.error('Failed to save reference to IndexedDB:', error);
    // Fallback to in-memory storage on error
    inMemoryFallback = reference;
  }
};

export const loadRef = async () => {
  try {
    const db = await getDb();
    if (!db) {
      // Fallback to in-memory storage
      return inMemoryFallback;
    }
    const ref = await db.get(STORE_NAME, KEY);
    return ref;
  } catch (error) {
    console.error('Failed to load reference from IndexedDB:', error);
    // Fallback to in-memory storage on error
    return inMemoryFallback;
  }
};

export const clearRef = async () => {
  try {
    const db = await getDb();
    if (!db) {
      // Fallback to in-memory storage
      inMemoryFallback = null;
      return;
    }
    await db.delete(STORE_NAME, KEY);
  } catch (error) {
    console.error('Failed to clear reference from IndexedDB:', error);
    // Fallback to in-memory storage on error
    inMemoryFallback = null;
  }
};
