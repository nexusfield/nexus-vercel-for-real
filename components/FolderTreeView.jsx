"use client";

import { useState, useEffect, useCallback } from "react";
import FolderTreeNode from "./FolderTreeNode";
import FolderContextMenu from "./FolderContextMenu";
import TrashView from "./TrashView";

const accent = "#00d4aa";
const bgSidebar = "#0d1117";
const border = "#1e252d";
const text = "#e6e9ef";
const textMuted = "#8b9298";

const theme = { accent, bgSidebar, border, text, textMuted };

export default function FolderTreeView() {
  const [tree, setTree] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedFolderId, setSelectedFolderId] = useState(null);
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [trashVisible, setTrashVisible] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);
  const [draggingId, setDraggingId] = useState(null);
  const [submittingFolder, setSubmittingFolder] = useState(false);

  const fetchTree = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch(`${window.location.origin}/api/knowledge-folders/tree`, { credentials: "same-origin" });
      const text = await res.text();
      if (!res.ok) {
        const msg = text?.trim().startsWith("<") ? `Server returned error page (${res.status})` : (() => { try { return JSON.parse(text)?.error || `Failed (${res.status})`; } catch { return `Failed (${res.status})`; } })();
        throw new Error(msg);
      }
      if (!text?.trim().startsWith("{")) {
        throw new Error("Server returned non-JSON response");
      }
      const data = JSON.parse(text);
      setTree(Array.isArray(data?.tree) ? data.tree : []);
    } catch (err) {
      setError(err?.message || "Failed to load folder tree");
      setTree([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTree();
  }, [fetchTree]);

  const handleToggleExpand = (id) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleContextMenu = (e, folder) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, folder });
  };

  const closeContextMenu = () => setContextMenu(null);

  const handleDrop = async (e, targetFolder, sourceId) => {
    setDraggingId(null);
    const newParentId = targetFolder.id;
    try {
      const res = await fetch(`${window.location.origin}/api/knowledge-folders/${sourceId}/move`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parent_id: newParentId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Move failed");
      await fetchTree();
    } catch (err) {
      setError(err?.message || "Move failed");
    }
  };

  const handleDragStart = (e, folder) => {
    setDraggingId(folder.id);
  };

  const handleDragEnd = () => {
    setDraggingId(null);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  async function createFolder(name = "New folder") {
    setError(null);
    setSubmittingFolder(true);
    try {
      const res = await fetch(`${window.location.origin}/api/knowledge-folders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: String(name).trim() || "New folder" }),
        credentials: "same-origin",
      });
      const text = await res.text();
      let data = {};
      if (text?.trim().startsWith("{")) {
        try {
          data = JSON.parse(text);
        } catch {
          throw new Error("Server returned invalid JSON");
        }
      }
      if (!res.ok) {
        const msg = text?.trim().startsWith("<") ? `Server error (${res.status})` : (data?.error || `Failed (${res.status})`);
        throw new Error(msg);
      }
      if (!data?.id) {
        throw new Error("Server did not return folder id");
      }
      // Add folder to tree immediately (don't rely on fetchTree)
      const newNode = {
        id: data.id,
        name: data.name,
        parent_id: data.parent_id,
        depth: data.depth,
        position: data.position,
        children: [],
        created_at: data.created_at,
        updated_at: data.updated_at,
      };
      setTree((prev) => [...prev, newNode].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)));
      setExpandedIds((prev) => new Set([...prev, data.id]));
      setSelectedFolderId(data.id);
    } catch (err) {
      setError(err?.message || "Create failed");
      console.error("[FolderTreeView] create folder failed:", err);
    } finally {
      setSubmittingFolder(false);
    }
  }

  function updateNodeInTree(nodes, id, updater) {
    return nodes.map((n) => {
      if (n.id === id) return updater(n);
      if (n.children?.length) return { ...n, children: updateNodeInTree(n.children, id, updater) };
      return n;
    });
  }

  function removeNodeFromTree(nodes, id) {
    return nodes
      .filter((n) => n.id !== id)
      .map((n) => (n.children?.length ? { ...n, children: removeNodeFromTree(n.children, id) } : n));
  }

  function addChildToTree(nodes, parentId, newChild) {
    const child = { ...newChild, children: newChild.children ?? [] };
    if (!parentId) return [...nodes, child].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    return nodes.map((n) => {
      if (n.id === parentId) return { ...n, children: [...(n.children || []), child].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)) };
      if (n.children?.length) return { ...n, children: addChildToTree(n.children, parentId, child) };
      return n;
    });
  }

  function handleContextRename(updated) {
    if (!updated?.id) return;
    setTree((prev) => updateNodeInTree(prev, updated.id, (old) => ({ ...old, ...updated, children: old.children ?? [] })));
  }

  function handleContextDelete(folderId) {
    setTree((prev) => removeNodeFromTree(prev, folderId));
    if (selectedFolderId === folderId) setSelectedFolderId(null);
    setContextMenu(null);
  }

  function findNodeInTree(nodes, id) {
    for (const n of nodes) {
      if (n.id === id) return n;
      if (n.children?.length) {
        const found = findNodeInTree(n.children, id);
        if (found) return found;
      }
    }
    return null;
  }

  function handleContextMove(updated) {
    if (!updated?.id) return;
    setTree((prev) => {
      const node = findNodeInTree(prev, updated.id);
      const withUpdates = node ? { ...node, ...updated } : updated;
      const without = removeNodeFromTree(prev, updated.id);
      return addChildToTree(without, updated.parent_id, withUpdates);
    });
  }

  function handleContextCreateSubfolder(newFolder) {
    if (!newFolder?.id) return;
    const parentId = contextMenu?.folder?.id ?? null;
    setTree((prev) => addChildToTree(prev, parentId, newFolder));
    setExpandedIds((prev) => new Set([...prev, parentId]));
    setSelectedFolderId(newFolder.id);
  }

  if (trashVisible) {
    return (
      <TrashView
        onClose={() => setTrashVisible(false)}
        onRestored={fetchTree}
        theme={theme}
      />
    );
  }

  return (
    <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
      {/* Left: tree */}
      <div
        style={{
          width: 260,
          minWidth: 260,
          borderRight: `1px solid ${border}`,
          display: "flex",
          flexDirection: "column",
          background: "rgba(0,0,0,0.2)",
        }}
      >
        {error && (
          <div
            style={{
              padding: "8px 12px",
              background: "rgba(255,107,107,0.15)",
              borderBottom: `1px solid #ff6b6b`,
              color: "#ff6b6b",
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}
        <div style={{ padding: "8px 12px", borderBottom: `1px solid ${border}` }}>
          <>
              <button
                type="button"
                disabled={submittingFolder}
                onClick={() => createFolder()}
                style={{
                  padding: "6px 12px",
                  fontSize: 14,
                  fontFamily: "var(--font-sans)",
                  border: `1px solid ${accent}`,
                  borderRadius: 4,
                  background: "transparent",
                  color: accent,
                  cursor: submittingFolder ? "not-allowed" : "pointer",
                }}
              >
                {submittingFolder ? "Creating…" : "New folder"}
              </button>
              <button
                type="button"
                onClick={() => setTrashVisible(true)}
                style={{
                  marginLeft: 8,
                  padding: "6px 12px",
                  fontSize: 14,
                  fontFamily: "var(--font-sans)",
                  border: `1px solid ${border}`,
                  borderRadius: 4,
                  background: "transparent",
                  color: textMuted,
                  cursor: "pointer",
                }}
              >
                Trash
              </button>
            </>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: 8 }}>
          {loading && <p style={{ color: textMuted, fontSize: 14 }}>Loading…</p>}
          {error && (
            <p
              style={{
                color: "#ff6b6b",
                fontSize: 14,
                margin: "0 0 8px 0",
                padding: 8,
                background: "rgba(255,107,107,0.1)",
                borderRadius: 4,
              }}
            >
              {error}
            </p>
          )}
          {!loading && !error && tree.length === 0 && (
            <p style={{ color: textMuted, fontSize: 14 }}>No folders. Create one above.</p>
          )}
          {!loading && tree.length > 0 && tree.map((node) => (
            <FolderTreeNode
              key={node.id}
              folder={node}
              expandedIds={expandedIds}
              onToggleExpand={handleToggleExpand}
              selectedFolderId={selectedFolderId}
              onSelect={setSelectedFolderId}
              onContextMenu={handleContextMenu}
              onDrop={handleDrop}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragEnd={handleDragEnd}
              isDragging={draggingId === node.id}
              theme={theme}
            />
          ))}
        </div>
      </div>
      {/* Right: folder contents placeholder */}
      <div
        style={{
          flex: 1,
          padding: 24,
          overflowY: "auto",
          border: `1px solid ${border}`,
          borderRadius: 4,
          marginLeft: 8,
          background: "rgba(0,0,0,0.2)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: textMuted,
          fontSize: 16,
        }}
      >
        <div style={{ textAlign: "center", maxWidth: 320 }}>
          {selectedFolderId ? (
            "Contents will appear here when chunks are linked to folders."
          ) : (
            <>
              <p style={{ margin: "0 0 8px 0" }}>Select a folder.</p>
              <p style={{ margin: 0, fontSize: 14, opacity: 0.9 }}>
                Folders are for organizing your thoughts. Linking knowledge chunks to folders will come in a later update.
              </p>
            </>
          )}
        </div>
      </div>
      {contextMenu && (
        <FolderContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          folder={contextMenu.folder}
          tree={tree}
          onClose={closeContextMenu}
          onRename={handleContextRename}
          onDelete={handleContextDelete}
          onMove={handleContextMove}
          onCreateSubfolder={handleContextCreateSubfolder}
          theme={theme}
        />
      )}
    </div>
  );
}
