"use client";

import { useState } from "react";

const accent = "#00d4aa";
const border = "#1e252d";
const text = "#e6e9ef";
const textMuted = "#8b9298";

export default function FolderTreeNode({
  folder,
  expandedIds,
  onToggleExpand,
  selectedFolderId,
  onSelect,
  onContextMenu,
  onDrop,
  onDragStart,
  onDragOver,
  onDragEnd,
  depth = 0,
  isDragging,
  theme,
}) {
  const hasChildren = folder.children && folder.children.length > 0;
  const isExpanded = expandedIds.has(folder.id);
  const isSelected = selectedFolderId === folder.id;
  const colors = theme ?? { accent, border, text, textMuted };

  const handleToggle = (e) => {
    e.stopPropagation();
    onToggleExpand(folder.id);
  };

  const handleClick = () => {
    onSelect?.(folder.id);
  };

  const handleContextMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onContextMenu?.(e, folder);
  };

  const handleDragStart = (e) => {
    e.stopPropagation();
    e.dataTransfer.setData("text/plain", String(folder.id));
    e.dataTransfer.effectAllowed = "move";
    onDragStart?.(e, folder);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    onDragOver?.(e, folder);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const sourceId = e.dataTransfer.getData("text/plain");
    if (sourceId && Number(sourceId) !== folder.id) {
      onDrop?.(e, folder, Number(sourceId));
    }
    onDragEnd?.();
  };

  const handleDragEnd = () => {
    onDragEnd?.();
  };

  return (
    <div style={{ marginLeft: depth * 12 }}>
      <div
        role="button"
        tabIndex={0}
        draggable
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onDragEnd={handleDragEnd}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          padding: "4px 8px",
          borderRadius: 4,
          cursor: "pointer",
          background: isSelected ? "rgba(0,212,170,0.12)" : "transparent",
          borderLeft: isSelected ? `3px solid ${colors.accent}` : "3px solid transparent",
          opacity: isDragging ? 0.5 : 1,
          transition: "var(--nexus-transition, 0.15s ease)",
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleClick();
          }
        }}
      >
        <button
          type="button"
          aria-label={isExpanded ? "Collapse" : "Expand"}
          onClick={handleToggle}
          style={{
            width: 20,
            height: 20,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "none",
            background: "transparent",
            color: hasChildren ? colors.text : colors.textMuted,
            cursor: hasChildren ? "pointer" : "default",
            fontSize: 12,
            padding: 0,
          }}
        >
          {hasChildren ? (isExpanded ? "▼" : "▶") : "·"}
        </button>
        <span style={{ fontSize: 14, color: colors.text, flex: 1 }}>{folder.name}</span>
      </div>
      {hasChildren && isExpanded && (
        <div>
          {folder.children.map((child) => (
            <FolderTreeNode
              key={child.id}
              folder={child}
              expandedIds={expandedIds}
              onToggleExpand={onToggleExpand}
              selectedFolderId={selectedFolderId}
              onSelect={onSelect}
              onContextMenu={onContextMenu}
              onDrop={onDrop}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDragEnd={onDragEnd}
              depth={depth + 1}
              isDragging={isDragging}
              theme={colors}
            />
          ))}
        </div>
      )}
    </div>
  );
}
