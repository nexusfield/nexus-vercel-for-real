"use client";

import { useState, useEffect } from "react";

const accent = "#00d4aa";
const border = "#1e252d";
const text = "#e6e9ef";
const textMuted = "#8b9298";
const bgSidebar = "#0d1117";

export default function TrashView({ onClose, onRestored, theme }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [busy, setBusy] = useState(false);
  const colors = theme ?? { accent, border, text, textMuted, bgSidebar };

  const fetchTrash = async () => {
    try {
      const res = await fetch(`${window.location.origin}/api/knowledge-folders/trash`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to load trash");
      setItems(data.items ?? []);
    } catch (err) {
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTrash();
  }, []);

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === items.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(items.map((i) => i.id)));
  };

  const handleRestore = async () => {
    if (selectedIds.size === 0) return;
    setBusy(true);
    try {
      const res = await fetch(`${window.location.origin}/api/knowledge-folders/trash/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selectedIds] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Restore failed");
      setSelectedIds(new Set());
      await fetchTrash();
      onRestored?.();
    } catch (err) {
      alert(err?.message || "Restore failed");
    } finally {
      setBusy(false);
    }
  };

  const handleEmptyTrash = async () => {
    if (!confirm("Permanently delete all items in trash? This cannot be undone.")) return;
    setBusy(true);
    try {
      const res = await fetch(`${window.location.origin}/api/knowledge-folders/trash/empty`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Empty trash failed");
      setItems([]);
      setSelectedIds(new Set());
      onRestored?.();
    } catch (err) {
      alert(err?.message || "Empty trash failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <button
          type="button"
          onClick={onClose}
          style={{
            padding: "6px 12px",
            fontSize: 14,
            fontFamily: "var(--font-sans)",
            border: `1px solid ${colors.border}`,
            borderRadius: 4,
            background: "transparent",
            color: colors.textMuted,
            cursor: "pointer",
          }}
        >
          ← Back to folders
        </button>
        <span style={{ color: colors.textMuted, fontSize: 14 }}>Trash</span>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button
          type="button"
          onClick={handleRestore}
          disabled={selectedIds.size === 0 || busy}
          style={{
            padding: "6px 12px",
            fontSize: 14,
            fontFamily: "var(--font-sans)",
            border: `1px solid ${colors.accent}`,
            borderRadius: 4,
            background: selectedIds.size === 0 || busy ? "transparent" : colors.accent,
            color: selectedIds.size === 0 || busy ? colors.textMuted : colors.bgSidebar,
            cursor: selectedIds.size === 0 || busy ? "not-allowed" : "pointer",
          }}
        >
          Restore selected
        </button>
        <button
          type="button"
          onClick={handleEmptyTrash}
          disabled={items.length === 0 || busy}
          style={{
            padding: "6px 12px",
            fontSize: 14,
            fontFamily: "var(--font-sans)",
            border: "1px solid #ff6b6b",
            borderRadius: 4,
            background: "transparent",
            color: "#ff6b6b",
            cursor: items.length === 0 || busy ? "not-allowed" : "pointer",
          }}
        >
          Empty trash
        </button>
      </div>
      {items.length > 0 && (
        <button
          type="button"
          onClick={selectAll}
          style={{
            padding: "4px 8px",
            fontSize: 13,
            border: "none",
            background: "transparent",
            color: colors.textMuted,
            cursor: "pointer",
            marginBottom: 8,
          }}
        >
          {selectedIds.size === items.length ? "Deselect all" : "Select all"}
        </button>
      )}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          border: `1px solid ${colors.border}`,
          borderRadius: 4,
          padding: 12,
          background: "rgba(0,0,0,0.2)",
        }}
      >
        {loading && <p style={{ color: colors.textMuted }}>Loading…</p>}
        {!loading && items.length === 0 && <p style={{ color: colors.textMuted }}>Trash is empty.</p>}
        {!loading && items.length > 0 && items.map((item) => (
          <label
            key={item.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 0",
              borderBottom: `1px solid ${colors.border}`,
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={selectedIds.has(item.id)}
              onChange={() => toggleSelect(item.id)}
            />
            <span style={{ color: colors.text }}>{item.name}</span>
            <span style={{ color: colors.textMuted, fontSize: 13 }}>
              {item.updated_at ? new Date(item.updated_at).toLocaleString() : ""}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
