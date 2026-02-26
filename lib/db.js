const Database = require("better-sqlite3");
const path = require("path");
const sqliteVec = require("sqlite-vec");

const dbPath = path.join(process.cwd(), "nexus.db");
const db = new Database(dbPath);

sqliteVec.load(db);

db.exec(`
  CREATE TABLE IF NOT EXISTS knowledge (
    id TEXT PRIMARY KEY,
    module TEXT NOT NULL CHECK(module IN ('people', 'projects', 'notes', 'external')),
    entity_links TEXT NOT NULL,
    tags TEXT NOT NULL,
    source TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    embedding BLOB,  /* nomic-embed-text: 768 dimensions */
    raw_text TEXT NOT NULL,
    structured_data TEXT NOT NULL
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL DEFAULT 'New Chat',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    messages TEXT NOT NULL DEFAULT '[]'
  )
`);

db.exec(`
  CREATE VIRTUAL TABLE IF NOT EXISTS conversations_fts
  USING fts5(name, messages, content=conversations, content_rowid=id)
`);

db.exec(`
  CREATE TRIGGER IF NOT EXISTS conversations_ai AFTER INSERT ON conversations BEGIN
    INSERT INTO conversations_fts(rowid, name, messages) VALUES (new.id, new.name, new.messages);
  END
`);
db.exec(`
  CREATE TRIGGER IF NOT EXISTS conversations_ad AFTER DELETE ON conversations BEGIN
    INSERT INTO conversations_fts(conversations_fts, rowid, name, messages) VALUES ('delete', old.id, old.name, old.messages);
  END
`);
db.exec(`
  CREATE TRIGGER IF NOT EXISTS conversations_au AFTER UPDATE ON conversations BEGIN
    INSERT INTO conversations_fts(conversations_fts, rowid, name, messages) VALUES ('delete', old.id, old.name, old.messages);
    INSERT INTO conversations_fts(rowid, name, messages) VALUES (new.id, new.name, new.messages);
  END
`);

module.exports = db;
