"use client";

import { useEffect, useRef, useState } from "react";

function flattenTree(nodes, excludeId, excludeDescendantIds, maxDepth = 6) {
  const out = [];
  function walk(nodes, depth) {
    if (depth > maxDepth) return;
    (nodes || []).forEach((node) => {
      if (node.id === excludeId || excludeDescendantIds.has(node.id)) return;
      out.push({ ...node, depth });
      walk(node.children, depth + 1);
    });
  }
  walk(nodes, 0);
  return out;
}

function collectDescendantIds(node) {
  const ids = new Set();
  function walk(n) {
    (n.children || []).forEach((c) => {
      ids.add(c.id);
      walk(c);
    });
  }
  walk(node);
  return ids;
}

export default function FolderContextMenu({
  x,
  y,
  folder,
  tree,
  onClose,
  onRename,
  onDelete,
  onMove,
  onCreateSubfolder,
  theme,
}) {
  const menuRef = useRef(null);
  const [renameValue, setRenameValue] = useState(folder?.name ?? "");
  const [showRename, setShowRename] = useState(false);
  const [showMove, setShowMove] = useState(false);
  const [showSubfolder, setShowSubfolder] = useState(false);
  const [subfolderName, setSubfolderName] = useState("");
  const accent = theme?.accent ?? "#00d4aa";
  const border = theme?.border ?? "#1e252d";
  const text = theme?.text ?? "#e6e9ef";
  const textMuted = theme?.textMuted ?? "#8b9298";
  const bgSidebar = theme?.bgSidebar ?? "#0d1117";

  useEffect(() => {
    const handleClick = () => onClose();
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [onClose]);

  useEffect(() => {
    if (folder) setRenameValue(folder.name);
  }, [folder]);

  const descendantIds = folder ? collectDescendantIds(folder) : new Set();
  const moveTargets = flattenTree(tree, folder?.id, descendantIds);

  async function parseJsonResponse(res) {
    const text = await res.text();
    if (text?.trim().startsWith("{")) {
      try {
        return JSON.parse(text);
      } catch {
        return {};
      }
    }
    return {};
  }

  const handleRename = async () => {
    if (!folder || !renameValue.trim()) return;
    try {
      const res = await fetch(`${window.location.origin}/api/knowledge-folders/${folder.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: renameValue.trim() }),
        credentials: "same-origin",
      });
      const data = await parseJsonResponse(res);
      if (!res.ok) throw new Error(data?.error || `Rename failed (${res.status})`);
      setShowRename(false);
      onRename?.(data);
      onClose();
    } catch (err) {
      alert(err?.message || "Rename failed");
    }
  };

  const handleDelete = async () => {
    if (!folder) return;
    if (!confirm("Move this folder to trash? Its subfolders will be trashed too.")) return;
    try {
      const res = await fetch(`${window.location.origin}/api/knowledge-folders/${folder.id}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      const data = await parseJsonResponse(res);
      if (!res.ok) throw new Error(data?.error || `Delete failed (${res.status})`);
      onDelete?.(folder.id);
      onClose();
    } catch (err) {
      alert(err?.message || "Delete failed");
    }
  };

  const handleMoveTo = async (parentId) => {
    if (!folder) return;
    try {
      const res = await fetch(`${window.location.origin}/api/knowledge-folders/${folder.id}/move`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parent_id: parentId }),
        credentials: "same-origin",
      });
      const data = await parseJsonResponse(res);
      if (!res.ok) throw new Error(data?.error || `Move failed (${res.status})`);
      setShowMove(false);
      onMove?.(data);
      onClose();
    } catch (err) {
      alert(err?.message || "Move failed");
    }
  };

  const handleCreateSubfolder = async () => {
    if (!folder || !subfolderName.trim()) return;
    if (folder.depth >= 6) {
      alert("Maximum folder depth (6) reached.");
      return;
    }
    try {
      const res = await fetch(`${window.location.origin}/api/knowledge-folders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: subfolderName.trim(), parent_id: folder.id }),
        credentials: "same-origin",
      });
      const data = await parseJsonResponse(res);
      if (!res.ok) throw new Error(data?.error || `Create failed (${res.status})`);
      setShowSubfolder(false);
      setSubfolderName("");
      onCreateSubfolder?.(data);
      onClose();
    } catch (err) {
      alert(err?.message || "Create failed");
    }
  };

  if (!folder) return null;

  return (
    <div
      ref={menuRef}
      style={{
        position: "fixed",
        left: x,
        top: y,
        zIndex: 10000,
        background: bgSidebar,
        border: `1px solid ${border}`,
        borderRadius: 4,
        boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
        minWidth: 180,
        padding: 4,
      }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {showRename ? (
        <div style={{ padding: 8 }}>
          <input
            type="text"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleRename();
              if (e.key === "Escape") setShowRename(false);
            }}
            autoFocus
            style={{
              width: "100%",
              padding: "6px 8px",
              border: `1px solid ${border}`,
              borderRadius: 4,
              background: "rgba(0,0,0,0.2)",
              color: text,
              fontSize: 14,
              boxSizing: "border-box",
            }}
          />
          <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
            <button type="button" onClick={handleRename} style={{ padding: "4px 8px", fontSize: 13, border: `1px solid ${accent}`, borderRadius: 4, background: accent, color: bgSidebar, cursor: "pointer" }}>Save</button>
            <button type="button" onClick={() => setShowRename(false)} style={{ padding: "4px 8px", fontSize: 13, border: `1px solid ${border}`, borderRadius: 4, background: "transparent", color: textMuted, cursor: "pointer" }}>Cancel</button>
          </div>
        </div>
      ) : showMove ? (
        <div style={{ maxHeight: 240, overflowY: "auto" }}>
          <button type="button" onClick={() => handleMoveTo(null)} style={{ display: "block", width: "100%", padding: "8px 12px", textAlign: "left", border: "none", background: "transparent", color: text, cursor: "pointer", fontSize: 14 }}>(Root)</button>
          {moveTargets.map((t) => (
            <button key={t.id} type="button" onClick={() => handleMoveTo(t.id)} style={{ display: "block", width: "100%", padding: "8px 12px", textAlign: "left", border: "none", background: "transparent", color: text, cursor: "pointer", fontSize: 14, paddingLeft: 12 + (t.depth || 0) * 12 }}>{t.name}</button>
          ))}
          <button type="button" onClick={() => setShowMove(false)} style={{ display: "block", width: "100%", padding: "8px 12px", textAlign: "left", border: "none", background: "transparent", color: textMuted, cursor: "pointer", fontSize: 13, marginTop: 4 }}>Cancel</button>
        </div>
      ) : showSubfolder ? (
        <div style={{ padding: 8 }}>
          <input
            type="text"
            value={subfolderName}
            onChange={(e) => setSubfolderName(e.target.value)}
            placeholder="New subfolder name"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreateSubfolder();
              if (e.key === "Escape") setShowSubfolder(false);
            }}
            autoFocus
            style={{
              width: "100%",
              padding: "6px 8px",
              border: `1px solid ${border}`,
              borderRadius: 4,
              background: "rgba(0,0,0,0.2)",
              color: text,
              fontSize: 14,
              boxSizing: "border-box",
            }}
          />
          <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
            <button type="button" onClick={handleCreateSubfolder} style={{ padding: "4px 8px", fontSize: 13, border: `1px solid ${accent}`, borderRadius: 4, background: accent, color: bgSidebar, cursor: "pointer" }}>Create</button>
            <button type="button" onClick={() => { setShowSubfolder(false); setSubfolderName(""); }} style={{ padding: "4px 8px", fontSize: 13, border: `1px solid ${border}`, borderRadius: 4, background: "transparent", color: textMuted, cursor: "pointer" }}>Cancel</button>
          </div>
        </div>
      ) : (
        <>
          <button type="button" onClick={() => setShowRename(true)} style={{ display: "block", width: "100%", padding: "8px 12px", textAlign: "left", border: "none", background: "transparent", color: text, cursor: "pointer", fontSize: 14 }}>Rename</button>
          <button type="button" onClick={() => setShowMove(true)} style={{ display: "block", width: "100%", padding: "8px 12px", textAlign: "left", border: "none", background: "transparent", color: text, cursor: "pointer", fontSize: 14 }}>Move to…</button>
          <button type="button" onClick={() => setShowSubfolder(true)} style={{ display: "block", width: "100%", padding: "8px 12px", textAlign: "left", border: "none", background: "transparent", color: text, cursor: "pointer", fontSize: 14 }}>New subfolder</button>
          <button type="button" onClick={handleDelete} style={{ display: "block", width: "100%", padding: "8px 12px", textAlign: "left", border: "none", background: "transparent", color: "#ff6b6b", cursor: "pointer", fontSize: 14 }}>Delete</button>
        </>
      )}
    </div>
  );
}
