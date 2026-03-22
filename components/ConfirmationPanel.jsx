"use client";

import { useState } from "react";

const CONTEXT_ACTIONS = [
  { id: "save", label: "Save" },
  { id: "skip", label: "Skip" },
];

const SIMILARITY_ACTIONS = [
  { id: "replace", label: "Replace" },
  { id: "add_alongside", label: "Add alongside" },
  { id: "keep_both", label: "Keep both" },
];

export default function ConfirmationPanel({
  question,
  mode,
  onSubmit,
  onClose,
  initialAnswer = "",
  existingSummary,
  newContentPreview,
}) {
  const [answer, setAnswer] = useState(initialAnswer);

  const actions = mode === "context" ? CONTEXT_ACTIONS : SIMILARITY_ACTIONS;
  const isSimilarityMode = mode === "similarity";

  const handleAction = (actionId) => {
    onSubmit(isSimilarityMode ? "" : answer, actionId);
  };

  const border = "var(--nexus-border)";
  const accent = "var(--nexus-accent)";
  const text = "var(--nexus-text)";
  const textMuted = "var(--nexus-text-muted)";
  const bgElevated = "var(--nexus-bg-elevated)";
  const bgSidebar = "var(--nexus-bg-sidebar)";

  return (
    <div
      className="nexus-confirmation-panel"
      style={{
        position: "relative",
        padding: 16,
        borderRadius: 8,
        background: bgElevated,
        border: `1px solid ${border}`,
        maxWidth: 400,
      }}
    >
      {typeof onClose === "function" && (
        <button
          type="button"
          onClick={onClose}
          title="Cancel save"
          aria-label="Cancel save"
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            border: "none",
            background: "transparent",
            color: textMuted,
            cursor: "pointer",
            fontSize: 16,
            lineHeight: 1,
            padding: 2,
          }}
        >
          ✕
        </button>
      )}
      <p
        style={{
          margin: "0 0 12px 0",
          fontSize: 16,
          color: text,
          lineHeight: 1.4,
          paddingRight: typeof onClose === "function" ? 18 : 0,
        }}
      >
        {question}
      </p>
      {(existingSummary || newContentPreview) && (
        <div style={{ marginBottom: 12 }}>
          {existingSummary && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 16, color: textMuted, marginBottom: 4 }}>Existing:</div>
              <div
                style={{
                  padding: 8,
                  borderRadius: 4,
                  background: "rgba(0,0,0,0.2)",
                  fontSize: 15,
                  color: text,
                  maxHeight: 80,
                  overflowY: "auto",
                }}
              >
                {existingSummary}
              </div>
            </div>
          )}
          {newContentPreview && (
            <div>
              <div style={{ fontSize: 16, color: textMuted, marginBottom: 4 }}>New:</div>
              <div
                style={{
                  padding: 8,
                  borderRadius: 4,
                  background: "rgba(0,212,170,0.08)",
                  fontSize: 15,
                  color: text,
                  maxHeight: 80,
                  overflowY: "auto",
                }}
              >
                {newContentPreview}
              </div>
            </div>
          )}
        </div>
      )}
      {!isSimilarityMode && (
        <input
          type="text"
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder="Your answer..."
          className="nexus-confirmation-input"
          style={{
            width: "100%",
            padding: "10px 12px",
            marginBottom: 12,
            border: `1px solid ${border}`,
            borderRadius: 4,
            fontSize: 15,
            boxSizing: "border-box",
            background: "rgba(0,0,0,0.2)",
            color: text,
          }}
        />
      )}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {actions.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            className="nexus-confirmation-btn"
            onClick={() => handleAction(id)}
            style={{
              padding: "8px 14px",
              border: `1px solid ${accent}`,
              borderRadius: 4,
              background: "transparent",
              color: accent,
              fontSize: 15,
              fontFamily: "var(--font-sans)",
              fontWeight: 600,
              cursor: "pointer",
              transition: "var(--nexus-transition)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = accent;
              e.currentTarget.style.color = bgSidebar;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = accent;
            }}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
