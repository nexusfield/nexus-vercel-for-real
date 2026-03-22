"use client";

const DB_NAME = "nexus-journal-db";
const DB_VERSION = 1;
const STORE_NAME = "entries";

let dbPromise = null;

function ensureIndexedDb() {
  if (typeof window === "undefined" || !window.indexedDB) {
    throw new Error("IndexedDB is not available in this environment.");
  }
}

function openDb() {
  ensureIndexedDb();
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("parentId", "parentId", { unique: false });
        store.createIndex("updatedAt", "updatedAt", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Failed to open IndexedDB"));
  });

  return dbPromise;
}

function runTransaction(mode, executor) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, mode);
        const store = tx.objectStore(STORE_NAME);
        const result = executor(store);

        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error || new Error("IndexedDB transaction failed"));
        tx.onabort = () => reject(tx.error || new Error("IndexedDB transaction aborted"));
      })
  );
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB request failed"));
  });
}

export async function listJournalEntries() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : []);
    request.onerror = () => reject(request.error || new Error("Failed to read journal entries"));
  });
}

export async function upsertJournalEntry(entry) {
  return runTransaction("readwrite", (store) => {
    store.put(entry);
    return entry;
  });
}

export async function upsertJournalEntries(entries) {
  return runTransaction("readwrite", (store) => {
    for (const entry of entries) {
      store.put(entry);
    }
    return entries;
  });
}

export async function deleteJournalEntries(ids) {
  return runTransaction("readwrite", (store) => {
    for (const id of ids) {
      store.delete(id);
    }
    return ids;
  });
}

export async function getJournalEntry(id) {
  const db = await openDb();
  const tx = db.transaction(STORE_NAME, "readonly");
  const store = tx.objectStore(STORE_NAME);
  return requestToPromise(store.get(id));
}

export function makeJournalId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `journal-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
