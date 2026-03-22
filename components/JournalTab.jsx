"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Editor from "react-simple-code-editor";
import { highlight, languages } from "prismjs/components/prism-core";
import "prismjs/components/prism-clike";
import "prismjs/components/prism-markup";
import "prismjs/components/prism-markdown";
import {
  deleteJournalEntries,
  listJournalEntries,
  makeJournalId,
  upsertJournalEntry,
} from "@/lib/journalDb";

function sortEntries(entries) {
  return [...entries].sort((a, b) => {
    const orderA = Number.isFinite(a.sortOrder) ? a.sortOrder : 0;
    const orderB = Number.isFinite(b.sortOrder) ? b.sortOrder : 0;
    if (orderA !== orderB) return orderA - orderB;
    const timeA = new Date(a.updatedAt || a.createdAt || 0).getTime();
    const timeB = new Date(b.updatedAt || b.createdAt || 0).getTime();
    return timeB - timeA;
  });
}

function getDescendantIds(entriesByParent, rootId) {
  const ids = [];
  const queue = [rootId];

  while (queue.length > 0) {
    const current = queue.shift();
    ids.push(current);
    const children = entriesByParent.get(current) || [];
    for (const child of children) {
      queue.push(child.id);
    }
  }

  return ids;
}

function buildSnippet(content, query) {
  const body = String(content || "");
  if (!body.trim()) return "No content";
  const q = query.trim().toLowerCase();
  if (!q) return body.slice(0, 120).replace(/\s+/g, " ").trim();
  const idx = body.toLowerCase().indexOf(q);
  if (idx === -1) return body.slice(0, 120).replace(/\s+/g, " ").trim();

  const start = Math.max(0, idx - 35);
  const end = Math.min(body.length, idx + q.length + 70);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < body.length ? "..." : "";
  return `${prefix}${body.slice(start, end).replace(/\s+/g, " ").trim()}${suffix}`;
}

export default function JournalTab({ theme }) {
  const colors = theme ?? {
    accent: "#00d4aa",
    bgMain: "#14181f",
    border: "#1e252d",
    text: "#e6e9ef",
    textMuted: "#8b9298",
  };

  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedNoteId, setSelectedNoteId] = useState(null);
  const [expandedFolderIds, setExpandedFolderIds] = useState(new Set());
  const [editorTitle, setEditorTitle] = useState("");
  const [editorContent, setEditorContent] = useState("");
  const [contextMenu, setContextMenu] = useState(null);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [renameDialog, setRenameDialog] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [draggingEntryId, setDraggingEntryId] = useState(null);
  const [dragOverFolderId, setDragOverFolderId] = useState(null);
  const autosaveRef = useRef(null);
  const createMenuWrapRef = useRef(null);
  const contextMenuRef = useRef(null);

  useEffect(() => {
    let mounted = true;
    listJournalEntries()
      .then((data) => {
        if (!mounted) return;
        setEntries(Array.isArray(data) ? data : []);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    function onWindowMouseDown(event) {
      const target = event.target;
      if (createMenuWrapRef.current?.contains(target)) return;
      if (contextMenuRef.current?.contains(target)) return;
      setContextMenu(null);
      setCreateMenuOpen(false);
    }
    window.addEventListener("mousedown", onWindowMouseDown);
    return () => window.removeEventListener("mousedown", onWindowMouseDown);
  }, []);

  const entryById = useMemo(() => {
    const map = new Map();
    for (const entry of entries) {
      map.set(entry.id, entry);
    }
    return map;
  }, [entries]);

  const entriesByParent = useMemo(() => {
    const map = new Map();
    for (const entry of entries) {
      const key = entry.parentId ?? null;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(entry);
    }
    for (const [key, grouped] of map.entries()) {
      map.set(key, sortEntries(grouped));
    }
    return map;
  }, [entries]);

  const selectedNote = useMemo(() => {
    const selected = entryById.get(selectedNoteId);
    if (!selected || selected.type !== "note") return null;
    return selected;
  }, [entryById, selectedNoteId]);

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return entries
      .filter((entry) => {
        if (entry.type !== "note") return false;
        const title = String(entry.title || "").toLowerCase();
        const content = String(entry.content || "").toLowerCase();
        return title.includes(q) || content.includes(q);
      })
      .sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());
  }, [entries, searchQuery]);

  useEffect(() => {
    if (!selectedNote) {
      setEditorTitle("");
      setEditorContent("");
      return;
    }
    setEditorTitle(selectedNote.title || "");
    setEditorContent(selectedNote.content || "");
  }, [selectedNote]);

  useEffect(() => {
    if (!selectedNote) return;
    if (editorTitle === selectedNote.title && editorContent === selectedNote.content) return;

    if (autosaveRef.current) clearTimeout(autosaveRef.current);
    autosaveRef.current = setTimeout(async () => {
      const now = new Date().toISOString();
      const next = {
        ...selectedNote,
        title: editorTitle.trim() || "Untitled note",
        content: editorContent,
        updatedAt: now,
      };

      await upsertJournalEntry(next);
      setEntries((prev) => prev.map((entry) => (entry.id === next.id ? next : entry)));
      autosaveRef.current = null;
    }, 400);

    return () => {
      if (autosaveRef.current) clearTimeout(autosaveRef.current);
    };
  }, [editorTitle, editorContent, selectedNote]);

  function getNextSortOrder(parentId) {
    const siblings = entriesByParent.get(parentId ?? null) || [];
    if (siblings.length === 0) return 0;
    const max = siblings.reduce((acc, sibling) => Math.max(acc, Number(sibling.sortOrder) || 0), 0);
    return max + 1;
  }

  async function createEntry(type, parentId = null) {
    const now = new Date().toISOString();
    const entry = {
      id: makeJournalId(),
      title: type === "note" ? "Untitled note" : "New folder",
      content: "",
      parentId,
      type,
      createdAt: now,
      updatedAt: now,
      sortOrder: getNextSortOrder(parentId),
    };

    await upsertJournalEntry(entry);
    setEntries((prev) => [...prev, entry]);
    if (type === "folder") {
      setExpandedFolderIds((prev) => {
        const next = new Set(prev);
        next.add(entry.id);
        return next;
      });
    } else {
      setSelectedNoteId(entry.id);
    }
  }

  async function renameEntry(entry, nextTitle) {
    const trimmed = String(nextTitle || "").trim();
    if (!trimmed) return;

    const updated = { ...entry, title: trimmed, updatedAt: new Date().toISOString() };
    await upsertJournalEntry(updated);
    setEntries((prev) => prev.map((item) => (item.id === entry.id ? updated : item)));
  }

  function openRenameDialog(entry) {
    setRenameDialog(entry);
    setRenameValue(entry.title || "");
  }

  async function submitRename() {
    if (!renameDialog) return;
    const trimmed = renameValue.trim();
    if (!trimmed) return;
    await renameEntry(renameDialog, trimmed);
    setRenameDialog(null);
    setRenameValue("");
  }

  async function removeEntry(entry) {
    if (entry.type === "folder") {
      const childCount = getDescendantIds(entriesByParent, entry.id).length - 1;
      const ok = window.confirm(
        `Delete folder "${entry.title || "Untitled folder"}" and ${childCount} child item(s)? This cannot be undone.`
      );
      if (!ok) return;
      const idsToDelete = getDescendantIds(entriesByParent, entry.id);
      await deleteJournalEntries(idsToDelete);
      setEntries((prev) => prev.filter((item) => !idsToDelete.includes(item.id)));
      setExpandedFolderIds((prev) => {
        const next = new Set(prev);
        for (const id of idsToDelete) next.delete(id);
        return next;
      });
      if (idsToDelete.includes(selectedNoteId)) setSelectedNoteId(null);
      return;
    }

    const ok = window.confirm(`Delete note "${entry.title || "Untitled note"}"?`);
    if (!ok) return;
    await deleteJournalEntries([entry.id]);
    setEntries((prev) => prev.filter((item) => item.id !== entry.id));
    if (selectedNoteId === entry.id) setSelectedNoteId(null);
  }

  function openContextMenu(event, entry) {
    event.preventDefault();
    event.stopPropagation();
    setCreateMenuOpen(false);
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      entry,
    });
  }

  function toggleFolder(folderId) {
    setExpandedFolderIds((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  }

  function openNoteAndReveal(noteId) {
    const lineage = [];
    let parentId = entryById.get(noteId)?.parentId ?? null;
    while (parentId) {
      lineage.push(parentId);
      parentId = entryById.get(parentId)?.parentId ?? null;
    }
    if (lineage.length > 0) {
      setExpandedFolderIds((prev) => {
        const next = new Set(prev);
        for (const id of lineage) next.add(id);
        return next;
      });
    }
    setSelectedNoteId(noteId);
  }

  function isFolderDescendant(folderId, potentialDescendantId) {
    if (!folderId || !potentialDescendantId) return false;
    const descendants = getDescendantIds(entriesByParent, folderId);
    return descendants.includes(potentialDescendantId);
  }

  async function moveEntryIntoFolder(entryId, targetFolderId) {
    if (!entryId || !targetFolderId) return;
    const moving = entryById.get(entryId);
    const targetFolder = entryById.get(targetFolderId);
    if (!moving || !targetFolder || targetFolder.type !== "folder") return;

    if (moving.id === targetFolder.id) return;
    if (moving.type === "folder" && isFolderDescendant(moving.id, targetFolder.id)) return;
    if ((moving.parentId ?? null) === targetFolder.id) return;

    const siblings = entriesByParent.get(targetFolder.id) || [];
    const nextSortOrder =
      siblings.length === 0
        ? 0
        : siblings.reduce((max, sibling) => Math.max(max, Number(sibling.sortOrder) || 0), 0) + 1;

    const updated = {
      ...moving,
      parentId: targetFolder.id,
      sortOrder: nextSortOrder,
      updatedAt: new Date().toISOString(),
    };

    await upsertJournalEntry(updated);
    setEntries((prev) => prev.map((entry) => (entry.id === updated.id ? updated : entry)));
    setExpandedFolderIds((prev) => {
      const next = new Set(prev);
      next.add(targetFolder.id);
      return next;
    });
  }

  function renderTree(parentId = null, depth = 0) {
    const children = entriesByParent.get(parentId) || [];
    return children.map((entry) => {
      const isFolder = entry.type === "folder";
      const isExpanded = isFolder ? expandedFolderIds.has(entry.id) : false;
      const isSelected = !isFolder && selectedNoteId === entry.id;

      return (
        <div key={entry.id}>
          <div
            role="button"
            tabIndex={0}
            draggable
            onClick={() => {
              if (isFolder) toggleFolder(entry.id);
              else openNoteAndReveal(entry.id);
            }}
            onDragStart={(event) => {
              event.stopPropagation();
              setDraggingEntryId(entry.id);
              setDragOverFolderId(null);
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", entry.id);
            }}
            onDragEnd={() => {
              setDraggingEntryId(null);
              setDragOverFolderId(null);
            }}
            onDragOver={(event) => {
              if (!isFolder) return;
              const movingId = draggingEntryId || event.dataTransfer.getData("text/plain");
              const movingEntry = entryById.get(movingId);
              if (!movingEntry) return;
              if (movingEntry.id === entry.id) return;
              if (movingEntry.type === "folder" && isFolderDescendant(movingEntry.id, entry.id)) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
              setDragOverFolderId(entry.id);
            }}
            onDragLeave={() => {
              if (dragOverFolderId === entry.id) {
                setDragOverFolderId(null);
              }
            }}
            onDrop={async (event) => {
              if (!isFolder) return;
              event.preventDefault();
              event.stopPropagation();
              const droppedId = event.dataTransfer.getData("text/plain") || draggingEntryId;
              setDragOverFolderId(null);
              await moveEntryIntoFolder(droppedId, entry.id);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                if (isFolder) toggleFolder(entry.id);
                else openNoteAndReveal(entry.id);
              }
            }}
            onContextMenu={(event) => openContextMenu(event, entry)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 8px",
              marginLeft: depth * 12,
              borderRadius: 6,
              cursor: "pointer",
              background: isSelected ? "rgba(0,212,170,0.14)" : "transparent",
              borderLeft: isSelected ? `3px solid ${colors.accent}` : "3px solid transparent",
              outline: dragOverFolderId === entry.id ? `1px dashed ${colors.accent}` : "none",
              opacity: draggingEntryId === entry.id ? 0.5 : 1,
            }}
          >
            <span style={{ color: isFolder ? colors.textMuted : colors.text, width: 18, textAlign: "center" }}>
              {isFolder ? (isExpanded ? "📂" : "📁") : "📝"}
            </span>
            <span
              style={{
                flex: 1,
                color: isSelected ? colors.text : colors.textMuted,
                fontSize: 15,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
              title={entry.title}
            >
              {entry.title || (isFolder ? "Untitled folder" : "Untitled note")}
            </span>
            <button
              type="button"
              onClick={(event) => openContextMenu(event, entry)}
              title="More"
              style={{
                border: "none",
                background: "transparent",
                color: colors.textMuted,
                cursor: "pointer",
                fontSize: 16,
                padding: "0 4px",
              }}
            >
              ...
            </button>
          </div>
          {isFolder && isExpanded && renderTree(entry.id, depth + 1)}
        </div>
      );
    });
  }

  async function handleContextAction(action, entry) {
    setContextMenu(null);
    if (action === "rename") {
      openRenameDialog(entry);
      return;
    }
    if (action === "delete") {
      await removeEntry(entry);
      return;
    }
    if (action === "new-note") {
      await createEntry("note", entry.type === "folder" ? entry.id : entry.parentId ?? null);
      return;
    }
    if (action === "new-folder") {
      await createEntry("folder", entry.type === "folder" ? entry.id : entry.parentId ?? null);
    }
  }

  useEffect(() => {
    if (!selectedNote || !entryById.has(selectedNote.id)) {
      if (selectedNoteId != null && !entryById.has(selectedNoteId)) {
        setSelectedNoteId(null);
      }
    }
  }, [selectedNote, selectedNoteId, entryById]);

  const showSearch = searchQuery.trim().length > 0;

  return (
    <section className="nexus-panel-enter" style={{ flex: 1, display: "flex", minHeight: 0, gap: 14 }}>
      <aside
        style={{
          width: 320,
          maxWidth: "38%",
          minWidth: 260,
          border: `1px solid ${colors.border}`,
          borderRadius: 6,
          background: "rgba(0,0,0,0.18)",
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
          position: "relative",
        }}
      >
        <div style={{ borderBottom: `1px solid ${colors.border}`, padding: 10, display: "flex", gap: 8 }}>
          <input
            type="text"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search notes..."
            style={{
              flex: 1,
              border: `1px solid ${colors.border}`,
              borderRadius: 4,
              background: "rgba(0,0,0,0.2)",
              color: colors.text,
              fontSize: 15,
              padding: "8px 10px",
              outline: "none",
            }}
          />
          <div ref={createMenuWrapRef} style={{ position: "relative" }}>
            <button
              type="button"
              title="New"
              onClick={(event) => {
                event.stopPropagation();
                setContextMenu(null);
                setCreateMenuOpen((prev) => !prev);
              }}
              style={{
                width: 34,
                height: 34,
                border: `1px solid ${colors.accent}`,
                borderRadius: 4,
                background: "transparent",
                color: colors.accent,
                cursor: "pointer",
                fontSize: 19,
                lineHeight: "1",
              }}
            >
              +
            </button>
            {createMenuOpen && (
              <div
                onClick={(event) => event.stopPropagation()}
                style={{
                  position: "absolute",
                  top: "110%",
                  right: 0,
                  minWidth: 150,
                  background: colors.bgMain,
                  border: `1px solid ${colors.border}`,
                  borderRadius: 6,
                  zIndex: 30,
                  overflow: "hidden",
                }}
              >
                <button
                  type="button"
                  onClick={async () => {
                    setCreateMenuOpen(false);
                    await createEntry("note", null);
                  }}
                  className="nexus-journal-menu-item"
                >
                  New note
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    setCreateMenuOpen(false);
                    await createEntry("folder", null);
                  }}
                  className="nexus-journal-menu-item"
                >
                  New folder
                </button>
              </div>
            )}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 8 }}>
          {loading && <p style={{ margin: 0, color: colors.textMuted }}>Loading journal...</p>}
          {!loading && showSearch && (
            <>
              {searchResults.length === 0 && (
                <p style={{ margin: 0, color: colors.textMuted, fontSize: 15 }}>No matching notes.</p>
              )}
              {searchResults.map((note) => (
                <button
                  key={note.id}
                  type="button"
                  onClick={() => {
                    openNoteAndReveal(note.id);
                    setSearchQuery("");
                  }}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    border: `1px solid ${colors.border}`,
                    borderRadius: 6,
                    background: selectedNoteId === note.id ? "rgba(0,212,170,0.12)" : "transparent",
                    color: colors.text,
                    padding: 10,
                    marginBottom: 8,
                    cursor: "pointer",
                  }}
                >
                  <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>{note.title || "Untitled note"}</div>
                  <div style={{ fontSize: 13, color: colors.textMuted }}>{buildSnippet(note.content, searchQuery)}</div>
                </button>
              ))}
            </>
          )}
          {!loading && !showSearch && (
            <>
              {renderTree(null, 0)}
              {entries.length === 0 && (
                <p style={{ margin: "8px 4px", color: colors.textMuted, fontSize: 15 }}>
                  No journal entries yet. Use + to create your first note.
                </p>
              )}
            </>
          )}
        </div>

        {contextMenu && (
          <div
            ref={contextMenuRef}
            onClick={(event) => event.stopPropagation()}
            style={{
              position: "fixed",
              left: contextMenu.x,
              top: contextMenu.y,
              background: colors.bgMain,
              border: `1px solid ${colors.border}`,
              borderRadius: 6,
              minWidth: 170,
              zIndex: 50,
              overflow: "hidden",
            }}
          >
            <button type="button" className="nexus-journal-menu-item" onClick={() => handleContextAction("rename", contextMenu.entry)}>
              Rename
            </button>
            <button type="button" className="nexus-journal-menu-item" onClick={() => handleContextAction("delete", contextMenu.entry)}>
              Delete
            </button>
            <button type="button" className="nexus-journal-menu-item" onClick={() => handleContextAction("new-note", contextMenu.entry)}>
              New Note
            </button>
            <button type="button" className="nexus-journal-menu-item" onClick={() => handleContextAction("new-folder", contextMenu.entry)}>
              New Folder
            </button>
          </div>
        )}
      </aside>

      <div
        style={{
          flex: 1,
          border: `1px solid ${colors.border}`,
          borderRadius: 6,
          background: "rgba(0,0,0,0.2)",
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
          overflow: "hidden",
        }}
      >
        {!selectedNote ? (
          <div style={{ margin: "auto", color: colors.textMuted, fontSize: 18 }}>Select or create a note</div>
        ) : (
          <>
            <div style={{ padding: 14, borderBottom: `1px solid ${colors.border}` }}>
              <input
                type="text"
                value={editorTitle}
                onChange={(event) => setEditorTitle(event.target.value)}
                placeholder="Note title"
                style={{
                  width: "100%",
                  border: `1px solid ${colors.border}`,
                  borderRadius: 4,
                  background: "rgba(0,0,0,0.22)",
                  color: colors.text,
                  fontSize: 17,
                  fontWeight: 600,
                  padding: "10px 12px",
                  outline: "none",
                }}
              />
            </div>
            <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: 14 }}>
              <Editor
                value={editorContent}
                onValueChange={setEditorContent}
                highlight={(code) => highlight(code, languages.markdown, "markdown")}
                padding={12}
                className="nexus-journal-editor"
                style={{
                  fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace',
                  fontSize: 14,
                  minHeight: "100%",
                  background: "rgba(0,0,0,0.28)",
                  border: `1px solid ${colors.border}`,
                  borderRadius: 6,
                  color: colors.text,
                }}
                textareaId="journal-markdown-editor"
                textareaClassName="nexus-journal-editor-input"
                placeholder="Write markdown..."
              />
            </div>
          </>
        )}
      </div>

      {renameDialog && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 80,
          }}
          onClick={() => {
            setRenameDialog(null);
            setRenameValue("");
          }}
        >
          <div
            style={{
              width: "min(90vw, 420px)",
              border: `1px solid ${colors.border}`,
              borderRadius: 8,
              background: colors.bgMain,
              padding: 16,
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <h3 style={{ margin: "0 0 10px", color: colors.text, fontSize: 17 }}>
              Rename {renameDialog.type === "folder" ? "folder" : "note"}
            </h3>
            <input
              type="text"
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") submitRename();
              }}
              autoFocus
              style={{
                width: "100%",
                border: `1px solid ${colors.border}`,
                borderRadius: 4,
                background: "rgba(0,0,0,0.2)",
                color: colors.text,
                fontSize: 15,
                padding: "9px 10px",
                marginBottom: 12,
                outline: "none",
                boxSizing: "border-box",
              }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                type="button"
                onClick={() => {
                  setRenameDialog(null);
                  setRenameValue("");
                }}
                style={{
                  padding: "8px 12px",
                  border: `1px solid ${colors.border}`,
                  borderRadius: 4,
                  background: "transparent",
                  color: colors.textMuted,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitRename}
                style={{
                  padding: "8px 12px",
                  border: `1px solid ${colors.accent}`,
                  borderRadius: 4,
                  background: colors.accent,
                  color: "#0d1117",
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                Rename
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
