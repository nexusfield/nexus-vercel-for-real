"use client";

import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";

const CHAT_MODELS = [
  { id: "claude-haiku-4-5-20251001", label: "Haiku" },
  { id: "claude-sonnet-4-6", label: "Sonnet" },
  { id: "claude-opus-4-6", label: "Opus" },
  { id: "gemini-2.0-flash", label: "Gemini Flash" },
  { id: "gemini-2.0-pro", label: "Gemini Pro" },
];
const DEFAULT_MODEL = "claude-sonnet-4-6";
const STORAGE_KEY = "nexus-selected-model";

function getStoredModel() {
  if (typeof window === "undefined") return DEFAULT_MODEL;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && CHAT_MODELS.some((m) => m.id === stored)) return stored;
  } catch {}
  return DEFAULT_MODEL;
}

function formatUpdatedAt(updatedAt) {
  if (!updatedAt) return "";
  const d = new Date(updatedAt);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) {
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatCreatedAt(createdAt) {
  if (!createdAt) return "";
  const d = new Date(createdAt);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function getSummaryFromStructuredData(structuredData) {
  if (structuredData == null) return "";
  if (typeof structuredData === "string") return structuredData;
  if (typeof structuredData === "object") {
    if (structuredData.content) return String(structuredData.content);
    if (structuredData.summary) return String(structuredData.summary);
    if (structuredData.text) return String(structuredData.text);
  }
  return "";
}

export default function NexusUI() {
  const [dumpInput, setDumpInput] = useState("");
  const [dumpConfirmation, setDumpConfirmation] = useState("");
  const [dumpLoading, setDumpLoading] = useState(false);

  const [conversations, setConversations] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [conversationHistory, setConversationHistory] = useState([]);
  const [editingConversationId, setEditingConversationId] = useState(null);
  const [editingName, setEditingName] = useState("");

  const [chatInput, setChatInput] = useState("");
  const [streamingContent, setStreamingContent] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const searchDebounceRef = useRef(null);
  const initialLoadDoneRef = useRef(false);

  const [mainPanelMode, setMainPanelMode] = useState("chat");
  const [knowledgeFilter, setKnowledgeFilter] = useState("all");
  const [knowledgeRecords, setKnowledgeRecords] = useState([]);

  const [chatModel, setChatModel] = useState(DEFAULT_MODEL);
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const modelDropdownRef = useRef(null);
  const [deleteConfirmConversation, setDeleteConfirmConversation] = useState(null);

  useEffect(() => {
    setChatModel(getStoredModel());
  }, []);
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(STORAGE_KEY, chatModel);
      } catch {}
    }
  }, [chatModel]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(e.target)) {
        setModelDropdownOpen(false);
      }
    }
    if (modelDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [modelDropdownOpen]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [conversationHistory, streamingContent]);

  async function fetchConversations() {
    try {
      const res = await fetch(`${window.location.origin}/api/conversations`);
      const text = await res.text();
      let data = [];
      try {
        data = text && !text.trim().startsWith("<") ? JSON.parse(text) : [];
      } catch (parseErr) {
        console.error("[Nexus] fetchConversations parse error:", parseErr, "text:", text?.slice(0, 200));
        data = [];
      }
      if (!res.ok) {
        const msg = Array.isArray(data) ? "Failed to fetch" : data?.error || "Failed to fetch";
        console.error("[Nexus] fetchConversations failed:", res.status, msg);
        throw new Error(msg);
      }
      return data;
    } catch (err) {
      console.error("[Nexus] fetchConversations error:", err?.message);
      return [];
    }
  }

  async function fetchSearch(q) {
    try {
      const res = await fetch(`${window.location.origin}/api/conversations/search?q=${encodeURIComponent(q)}`);
      const text = await res.text();
      let data = [];
      try {
        data = text && !text.trim().startsWith("<") ? JSON.parse(text) : [];
      } catch {
        data = [];
      }
      if (!res.ok) {
        throw new Error(Array.isArray(data) ? "Search failed" : data?.error || "Search failed");
      }
      return data;
    } catch (err) {
      return [];
    }
  }

  async function fetchKnowledge() {
    try {
      const res = await fetch(`${window.location.origin}/api/knowledge`);
      const text = await res.text();
      let data = [];
      try {
        data = text && !text.trim().startsWith("<") ? JSON.parse(text) : [];
      } catch {
        data = [];
      }
      if (!res.ok) {
        throw new Error(Array.isArray(data) ? "Failed to fetch knowledge" : data?.error || "Failed to fetch knowledge");
      }
      return data;
    } catch (err) {
      return [];
    }
  }

  function loadConversation(conv) {
    setActiveConversationId(conv.id);
    setConversationHistory(conv.messages || []);
  }

  function handleNewChat() {
    setActiveConversationId(null);
    setConversationHistory([]);
  }

  function updateConversationName(id, name) {
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, name } : c))
    );
  }

  useEffect(() => {
    let mounted = true;
    (async () => {
      const list = await fetchConversations();
      if (!mounted) return;
      setConversations(list);
      if (!initialLoadDoneRef.current && list.length > 0) {
        loadConversation(list[0]);
        initialLoadDoneRef.current = true;
      }
    })();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (searchQuery.trim() === "") {
      fetchConversations().then(setConversations);
      return;
    }
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      fetchSearch(searchQuery.trim()).then(setConversations);
      searchDebounceRef.current = null;
    }, 300);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [searchQuery]);

  useEffect(() => {
    if (mainPanelMode === "knowledge") {
      fetchKnowledge().then(setKnowledgeRecords);
    }
  }, [mainPanelMode]);

  async function handleConversationClick(conv) {
    const list = searchQuery.trim()
      ? await fetchSearch(searchQuery.trim())
      : await fetchConversations();
    setConversations(list);
    const found = list.find((c) => c.id === conv.id);
    if (found) {
      loadConversation(found);
    }
  }

  function handleDeleteClick(e, conv) {
    e.stopPropagation();
    setDeleteConfirmConversation(conv);
  }

  async function handleConfirmDelete() {
    const conv = deleteConfirmConversation;
    if (!conv) return;
    setDeleteConfirmConversation(null);
    try {
      const res = await fetch(`${window.location.origin}/api/conversations/${conv.id}`, {
        method: "DELETE",
      });
      const text = await res.text();
      let data = {};
      try {
        data = text && !text.trim().startsWith("<") ? JSON.parse(text) : {};
      } catch {
        data = {};
      }
      if (!res.ok) {
        alert(data.error || "Failed to delete");
        return;
      }
      if (activeConversationId === conv.id) {
        handleNewChat();
      }
      setSearchQuery("");
      const list = await fetchConversations();
      setConversations(list);
    } catch (err) {
      alert(err?.message || "Failed to delete");
    }
  }

  function startRename(e, conv) {
    e.stopPropagation();
    setEditingConversationId(conv.id);
    setEditingName(conv.name);
  }

  async function submitRename() {
    if (editingConversationId == null) return;
    const name = editingName.trim() || "New Chat";
    try {
      const res = await fetch(`${window.location.origin}/api/conversations/${editingConversationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const text = await res.text();
      let data = {};
      try {
        data = text && !text.trim().startsWith("<") ? JSON.parse(text) : {};
      } catch {
        data = {};
      }
      if (!res.ok) {
        alert(data.error || "Failed to rename");
        return;
      }
      updateConversationName(editingConversationId, name);
    } catch (err) {
      alert(err?.message || "Failed to rename");
    } finally {
      setEditingConversationId(null);
      setEditingName("");
    }
  }

  function cancelRename() {
    setEditingConversationId(null);
    setEditingName("");
  }

  async function handleDeleteKnowledge(e, rec) {
    e.stopPropagation();
    if (!confirm("Delete this knowledge record?")) return;
    try {
      const res = await fetch(`${window.location.origin}/api/knowledge/${rec.id}`, {
        method: "DELETE",
      });
      const text = await res.text();
      let data = {};
      try {
        data = text && !text.trim().startsWith("<") ? JSON.parse(text) : {};
      } catch {
        data = {};
      }
      if (!res.ok) {
        alert(data.error || "Failed to delete");
        return;
      }
      setKnowledgeRecords((prev) => prev.filter((r) => r.id !== rec.id));
    } catch (err) {
      alert(err?.message || "Failed to delete");
    }
  }

  async function handleDump(e) {
    e.preventDefault();
    if (!dumpInput.trim() || dumpLoading) return;
    setDumpLoading(true);
    setDumpConfirmation("");
    try {
      const res = await fetch(`${window.location.origin}/api/intake`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawText: dumpInput.trim() }),
      });
      const text = await res.text();
      let data = {};
      try {
        data = text && !text.trim().startsWith("<") ? JSON.parse(text) : {};
      } catch {
        data = {};
      }
      if (!res.ok) {
        const msg = data.error || (res.status === 404 ? "API not found. Restart the dev server (npm run dev)." : "Intake failed");
        throw new Error(msg);
      }
      setDumpConfirmation(data.confirmation);
      setDumpInput("");
      if (mainPanelMode === "knowledge") {
        fetchKnowledge().then(setKnowledgeRecords);
      }
    } catch (err) {
      setDumpConfirmation(`Error: ${err.message}`);
    } finally {
      setDumpLoading(false);
    }
  }

  async function handleChat(e) {
    e.preventDefault();
    if (!chatInput.trim() || chatLoading) return;

    initialLoadDoneRef.current = true;

    const userMessage = chatInput.trim();
    setChatInput("");
    setConversationHistory((prev) => [...prev, { role: "user", content: userMessage }]);
    setStreamingContent("");
    setChatLoading(true);

    let currentConversationId = activeConversationId;
    const wasNewConversation = currentConversationId === null;

    if (wasNewConversation) {
      try {
        const createRes = await fetch(`${window.location.origin}/api/conversations`, {
          method: "POST",
        });
        const createText = await createRes.text();
        let createData = {};
        try {
          createData = createText && !createText.trim().startsWith("<") ? JSON.parse(createText) : {};
        } catch {
          createData = {};
        }
        if (!createRes.ok) {
          throw new Error(createData.error || "Failed to create conversation");
        }
        if (createData.id == null || createData.id === undefined) {
          throw new Error("Invalid response: no conversation id returned");
        }
        currentConversationId = createData.id;
        setActiveConversationId(currentConversationId);
        setSearchQuery("");
        const list = await fetchConversations();
        setConversations(list);
      } catch (err) {
        const errMsg = err?.message || "Failed to create conversation";
        setConversationHistory((prev) => [
          ...prev,
          { role: "assistant", content: `Error: ${errMsg}` },
        ]);
        setChatLoading(false);
        return;
      }
    }

    const historyForApi = conversationHistory;

    try {
      const res = await fetch(`${window.location.origin}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userMessage,
          conversationHistory: historyForApi,
          model: chatModel,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        let errData = {};
        try {
          errData = text && !text.trim().startsWith("<") ? JSON.parse(text) : {};
        } catch {
          errData = {};
        }
        const msg = errData.error || (res.status === 404 ? "API not found. Restart the dev server (npm run dev)." : "Chat failed");
        throw new Error(msg);
      }

      if (!res.body) {
        throw new Error("Chat API returned empty response");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        fullContent += chunk;
        setStreamingContent(fullContent);
      }

      const updatedMessages = [
        ...conversationHistory,
        { role: "user", content: userMessage },
        { role: "assistant", content: fullContent },
      ];
      setConversationHistory(updatedMessages);
      setStreamingContent("");

      await fetch(`${window.location.origin}/api/conversations/${currentConversationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: updatedMessages }),
      });

      if (wasNewConversation) {
        fetch(`${window.location.origin}/api/conversations/${currentConversationId}/name`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ firstMessage: userMessage }),
        })
          .then((r) => r.text())
          .then((text) => {
            let data = {};
            try {
              data = text && !text.trim().startsWith("<") ? JSON.parse(text) : {};
            } catch {
              data = {};
            }
            if (data.name) {
              updateConversationName(currentConversationId, data.name);
            }
          })
          .catch(() => {});
      }
    } catch (err) {
      const errorMessages = [
        ...conversationHistory,
        { role: "user", content: userMessage },
        { role: "assistant", content: `Error: ${err.message}` },
      ];
      setConversationHistory(errorMessages);
      setStreamingContent("");

      if (currentConversationId) {
        fetch(`${window.location.origin}/api/conversations/${currentConversationId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: errorMessages }),
        }).catch(() => {});
      }
    } finally {
      setChatLoading(false);
    }
  }

  const accent = "#00d4aa";
  const bgSidebar = "#0d1117";
  const bgMain = "#14181f";
  const border = "#1e252d";
  const text = "#e6e9ef";
  const textMuted = "#8b9298";

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", position: "relative", zIndex: 2 }}>
      {/* Left Sidebar */}
      <aside
        style={{
          width: 250,
          flexShrink: 0,
          background: bgSidebar,
          borderRight: `1px solid ${border}`,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <h2
          style={{
            margin: 0,
            padding: 16,
            fontSize: 13,
            fontWeight: 600,
            fontFamily: "var(--font-syne), system-ui, sans-serif",
            letterSpacing: "0.05em",
            color: textMuted,
            borderBottom: `1px solid ${border}`,
          }}
        >
          Chats
        </h2>
        <div style={{ padding: "8px 8px 0" }}>
          <button
            type="button"
            onClick={handleNewChat}
            style={{
              width: "100%",
              padding: "10px 12px",
              marginBottom: 8,
              border: `1px solid ${accent}`,
              borderRadius: 4,
              background: "transparent",
              color: accent,
              fontSize: 13,
              fontFamily: "var(--font-syne), system-ui, sans-serif",
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
            New Chat
          </button>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search conversations..."
            style={{
              width: "100%",
              padding: "8px 12px",
              border: `1px solid ${border}`,
              borderRadius: 4,
              fontSize: 13,
              boxSizing: "border-box",
              background: "rgba(0,0,0,0.2)",
              color: text,
            }}
          />
        </div>
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: 8,
          }}
        >
          {conversations.map((conv) => (
            <div
              key={conv.id}
              data-conv-item
              style={{
                marginBottom: 4,
                borderRadius: 4,
                background: activeConversationId === conv.id ? "rgba(0,212,170,0.12)" : "transparent",
                borderLeft: activeConversationId === conv.id ? `3px solid ${accent}` : "3px solid transparent",
                transition: "var(--nexus-transition)",
              }}
            >
              {editingConversationId === conv.id ? (
                <div
                  style={{ padding: "8px 12px" }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="text"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") submitRename();
                      if (e.key === "Escape") cancelRename();
                    }}
                    onBlur={submitRename}
                    autoFocus
                    style={{
                      width: "100%",
                      padding: "6px 8px",
                      marginBottom: 6,
                      border: `1px solid ${border}`,
                      borderRadius: 4,
                      fontSize: 13,
                      boxSizing: "border-box",
                      background: "rgba(0,0,0,0.2)",
                      color: text,
                    }}
                  />
                  <div style={{ display: "flex", gap: 4 }}>
                    <button
                      type="button"
                      onClick={submitRename}
                      style={{
                        padding: "4px 8px",
                        fontSize: 12,
                        border: `1px solid ${accent}`,
                        borderRadius: 4,
                        background: accent,
                        color: bgSidebar,
                        cursor: "pointer",
                        fontFamily: "var(--font-syne), system-ui, sans-serif",
                      }}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={cancelRename}
                      style={{
                        padding: "4px 8px",
                        fontSize: 12,
                        border: `1px solid ${border}`,
                        borderRadius: 4,
                        background: "transparent",
                        color: textMuted,
                        cursor: "pointer",
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => handleConversationClick(conv)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") handleConversationClick(conv);
                  }}
                  onMouseEnter={(e) => {
                    const el = e.currentTarget.closest("[data-conv-item]");
                    if (el && activeConversationId !== conv.id) el.style.background = "rgba(255,255,255,0.04)";
                  }}
                  onMouseLeave={(e) => {
                    const el = e.currentTarget.closest("[data-conv-item]");
                    if (el && activeConversationId !== conv.id) el.style.background = "transparent";
                  }}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 4,
                    padding: "10px 12px",
                    cursor: "pointer",
                    fontSize: 14,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500, marginBottom: 2, color: text }}>{conv.name}</div>
                    <div style={{ fontSize: 12, color: textMuted }}>
                      {formatUpdatedAt(conv.updated_at)}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
                    <button
                      type="button"
                      onClick={(e) => startRename(e, conv)}
                      title="Rename"
                      style={{
                        padding: "4px 6px",
                        fontSize: 11,
                        border: "none",
                        borderRadius: 4,
                        background: "transparent",
                        cursor: "pointer",
                        color: textMuted,
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "rgba(255,255,255,0.1)";
                        e.currentTarget.style.color = text;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "transparent";
                        e.currentTarget.style.color = textMuted;
                      }}
                    >
                      ✎
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handleDeleteClick(e, conv)}
                      title="Delete"
                      style={{
                        padding: "4px 6px",
                        fontSize: 11,
                        border: "none",
                        borderRadius: 4,
                        background: "transparent",
                        cursor: "pointer",
                        color: textMuted,
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "rgba(255,100,100,0.2)";
                        e.currentTarget.style.color = "#ff6b6b";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "transparent";
                        e.currentTarget.style.color = textMuted;
                      }}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </aside>

      {/* Right Main Panel */}
      <main
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          background: bgMain,
        }}
      >
        <div style={{ maxWidth: 720, margin: "0 auto", padding: 24, flex: 1, display: "flex", flexDirection: "column", width: "100%", minHeight: 0 }}>
          {/* Logo */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
            <svg width={20} height={20} viewBox="0 0 20 20" fill="none" style={{ flexShrink: 0 }}>
              <circle cx="10" cy="10" r="2" fill={accent} />
              <line x1="10" y1="4" x2="10" y2="8" stroke={accent} strokeWidth="1" />
              <line x1="10" y1="12" x2="10" y2="16" stroke={accent} strokeWidth="1" />
              <line x1="4" y1="10" x2="8" y2="10" stroke={accent} strokeWidth="1" />
              <line x1="12" y1="10" x2="16" y2="10" stroke={accent} strokeWidth="1" />
              <line x1="6" y1="6" x2="8" y2="8" stroke={accent} strokeWidth="0.8" opacity={0.7} />
              <line x1="12" y1="12" x2="14" y2="14" stroke={accent} strokeWidth="0.8" opacity={0.7} />
              <line x1="12" y1="6" x2="14" y2="8" stroke={accent} strokeWidth="0.8" opacity={0.7} />
              <line x1="6" y1="12" x2="8" y2="14" stroke={accent} strokeWidth="0.8" opacity={0.7} />
            </svg>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, fontFamily: "var(--font-syne), system-ui, sans-serif", letterSpacing: "0.08em", color: text }}>
              NEXUS
            </h1>
          </div>

          {/* Mode Toggle */}
          <div style={{ display: "flex", gap: 0, marginBottom: 24, borderBottom: `1px solid ${border}`, transition: "var(--nexus-transition)" }}>
            <button
              type="button"
              onClick={() => setMainPanelMode("chat")}
              style={{
                padding: "8px 16px",
                fontSize: 13,
                fontFamily: "var(--font-syne), system-ui, sans-serif",
                border: "none",
                borderBottom: mainPanelMode === "chat" ? `2px solid ${accent}` : "2px solid transparent",
                background: "transparent",
                cursor: "pointer",
                fontWeight: mainPanelMode === "chat" ? 600 : 400,
                color: mainPanelMode === "chat" ? accent : textMuted,
                transition: "var(--nexus-transition)",
              }}
            >
              Chat
            </button>
            <button
              type="button"
              onClick={() => setMainPanelMode("knowledge")}
              style={{
                padding: "8px 16px",
                fontSize: 13,
                fontFamily: "var(--font-syne), system-ui, sans-serif",
                border: "none",
                borderBottom: mainPanelMode === "knowledge" ? `2px solid ${accent}` : "2px solid transparent",
                background: "transparent",
                cursor: "pointer",
                fontWeight: mainPanelMode === "knowledge" ? 600 : 400,
                color: mainPanelMode === "knowledge" ? accent : textMuted,
                transition: "var(--nexus-transition)",
              }}
            >
              Knowledge
            </button>
          </div>

          {/* Dump Bar */}
          <section style={{ marginBottom: 32 }}>
            <form onSubmit={handleDump} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <input
                type="text"
                value={dumpInput}
                onChange={(e) => setDumpInput(e.target.value)}
                placeholder="Paste or type text to dump..."
                disabled={dumpLoading}
                style={{
                  flex: 1,
                  padding: "10px 12px",
                  border: `1px solid ${border}`,
                  borderRadius: 4,
                  fontSize: 14,
                  background: "rgba(0,0,0,0.2)",
                  color: text,
                }}
              />
              <button
                type="submit"
                disabled={dumpLoading || !dumpInput.trim()}
                style={{
                  padding: "10px 20px",
                  border: `1px solid ${accent}`,
                  borderRadius: 4,
                  background: dumpLoading || !dumpInput.trim() ? "transparent" : accent,
                  color: dumpLoading || !dumpInput.trim() ? textMuted : bgSidebar,
                  fontSize: 13,
                  fontFamily: "var(--font-syne), system-ui, sans-serif",
                  fontWeight: 600,
                  cursor: dumpLoading ? "not-allowed" : "pointer",
                  transition: "var(--nexus-transition)",
                }}
              >
                {dumpLoading ? "..." : "Dump"}
              </button>
            </form>
            {dumpConfirmation && (
              <p style={{ fontSize: 13, color: textMuted, margin: 0 }}>{dumpConfirmation}</p>
            )}
          </section>

          {/* Chat Panel */}
          {mainPanelMode === "chat" && (
            <section className="nexus-panel-enter" style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
              <div
                style={{
                  border: `1px solid ${border}`,
                  borderRadius: 4,
                  flex: 1,
                  minHeight: 360,
                  overflowY: "auto",
                  padding: 16,
                  marginBottom: 12,
                  background: "rgba(0,0,0,0.2)",
                }}
              >
                {conversationHistory.length === 0 && !streamingContent && (
                  <p style={{ color: textMuted, fontSize: 14, margin: 0 }}>
                    No messages yet. Ask a question.
                  </p>
                )}
                {conversationHistory.map((msg, i) => (
                  <div
                    key={i}
                    style={{
                      marginBottom: 12,
                      padding: 10,
                      borderRadius: 4,
                      background: msg.role === "user" ? "rgba(0,212,170,0.08)" : "rgba(255,255,255,0.03)",
                      borderLeft: msg.role === "assistant" ? `3px solid ${accent}` : "none",
                    }}
                  >
                    <strong style={{ fontSize: 12, color: textMuted, display: "block", marginBottom: 4 }}>
                      {msg.role === "user" ? "You" : "Nexus"}
                    </strong>
                    {msg.role === "assistant" ? (
                      <div style={{ fontSize: 14 }} className="markdown-body">
                        <ReactMarkdown>{String(msg.content || "")}</ReactMarkdown>
                      </div>
                    ) : (
                      <div style={{ fontSize: 14, whiteSpace: "pre-wrap", color: text }}>{msg.content}</div>
                    )}
                  </div>
                ))}
                {streamingContent && (
                  <div
                    style={{
                      marginBottom: 12,
                      padding: 10,
                      borderRadius: 4,
                      background: "rgba(255,255,255,0.03)",
                      borderLeft: `3px solid ${accent}`,
                    }}
                  >
                    <strong style={{ fontSize: 12, color: textMuted, display: "block", marginBottom: 4 }}>
                      Nexus
                    </strong>
                    <div style={{ fontSize: 14 }} className="markdown-body">
                      <ReactMarkdown>{streamingContent}</ReactMarkdown>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              <div ref={modelDropdownRef} style={{ position: "relative", marginBottom: 8 }}>
                <button
                  type="button"
                  onClick={() => setModelDropdownOpen((o) => !o)}
                  style={{
                    padding: "4px 8px",
                    fontSize: 11,
                    fontFamily: "var(--font-syne), system-ui, sans-serif",
                    border: `1px solid ${border}`,
                    borderRadius: 4,
                    background: "rgba(0,0,0,0.2)",
                    color: textMuted,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  {CHAT_MODELS.find((m) => m.id === chatModel)?.label ?? chatModel}
                  <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: modelDropdownOpen ? "rotate(180deg)" : "none", transition: "transform 150ms" }}>
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
                {modelDropdownOpen && (
                  <div
                    style={{
                      position: "absolute",
                      bottom: "100%",
                      left: 0,
                      marginBottom: 4,
                      minWidth: 140,
                      background: bgMain,
                      border: `1px solid ${border}`,
                      borderRadius: 4,
                      boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
                      zIndex: 50,
                      overflow: "hidden",
                    }}
                  >
                    {CHAT_MODELS.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          setChatModel(m.id);
                          setModelDropdownOpen(false);
                        }}
                        style={{
                          width: "100%",
                          padding: "6px 10px",
                          fontSize: 12,
                          textAlign: "left",
                          border: "none",
                          background: chatModel === m.id ? "rgba(0,212,170,0.15)" : "transparent",
                          color: chatModel === m.id ? accent : text,
                          cursor: "pointer",
                        }}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <form onSubmit={handleChat} style={{ display: "flex", gap: 8 }}>
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Ask a question..."
                  disabled={chatLoading}
                  style={{
                    flex: 1,
                    padding: "10px 12px",
                    border: `1px solid ${border}`,
                    borderRadius: 4,
                    fontSize: 14,
                    background: "rgba(0,0,0,0.2)",
                    color: text,
                  }}
                />
                <button
                  type="submit"
                  disabled={chatLoading || !chatInput.trim()}
                  title="Send"
                  style={{
                    padding: "10px 14px",
                    border: `1px solid ${chatLoading || !chatInput.trim() ? border : accent}`,
                    borderRadius: 4,
                    background: chatLoading || !chatInput.trim() ? "transparent" : accent,
                    color: chatLoading || !chatInput.trim() ? textMuted : bgSidebar,
                    cursor: chatLoading ? "not-allowed" : "pointer",
                    transition: "var(--nexus-transition)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                  onMouseEnter={(e) => {
                    if (!chatLoading && chatInput.trim()) {
                      e.currentTarget.style.background = "#00f5c4";
                      e.currentTarget.style.borderColor = "#00f5c4";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!chatLoading && chatInput.trim()) {
                      e.currentTarget.style.background = accent;
                      e.currentTarget.style.borderColor = accent;
                    }
                  }}
                >
                  {chatLoading ? (
                    <span style={{ fontSize: 12 }}>...</span>
                  ) : (
                    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="22" y1="2" x2="11" y2="13" />
                      <polygon points="22 2 15 22 11 13 2 9 22 2" />
                    </svg>
                  )}
                </button>
              </form>
            </section>
          )}

          {/* Knowledge Panel */}
          {mainPanelMode === "knowledge" && (
            <section className="nexus-panel-enter" style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
              <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
                {["all", "people", "projects", "notes", "external"].map((mod) => (
                  <button
                    key={mod}
                    type="button"
                    onClick={() => setKnowledgeFilter(mod)}
                    style={{
                      padding: "6px 12px",
                      fontSize: 13,
                      fontFamily: "var(--font-syne), system-ui, sans-serif",
                      border: `1px solid ${knowledgeFilter === mod ? accent : border}`,
                      borderRadius: 4,
                      background: knowledgeFilter === mod ? accent : "transparent",
                      color: knowledgeFilter === mod ? bgSidebar : textMuted,
                      cursor: "pointer",
                      textTransform: "capitalize",
                      transition: "var(--nexus-transition)",
                    }}
                  >
                    {mod}
                  </button>
                ))}
              </div>
              <div
                style={{
                  flex: 1,
                  overflowY: "auto",
                  border: `1px solid ${border}`,
                  borderRadius: 4,
                  padding: 16,
                  background: "rgba(0,0,0,0.2)",
                  minHeight: 360,
                }}
              >
                {knowledgeRecords
                  .filter((r) => knowledgeFilter === "all" || r.module === knowledgeFilter)
                  .map((rec) => {
                    const summary = getSummaryFromStructuredData(rec.structured_data);
                    return (
                      <div
                        key={rec.id}
                        style={{
                          marginBottom: 16,
                          padding: 12,
                          borderRadius: 4,
                          background: "rgba(255,255,255,0.03)",
                          border: `1px solid ${border}`,
                        }}
                      >
                        <div style={{ fontSize: 14, marginBottom: 8, whiteSpace: "pre-wrap", color: text }}>
                          {summary || "(No content)"}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <span
                            style={{
                              fontSize: 11,
                              padding: "2px 6px",
                              borderRadius: 4,
                              background: "rgba(0,212,170,0.15)",
                              color: accent,
                              textTransform: "capitalize",
                              fontFamily: "var(--font-syne), system-ui, sans-serif",
                            }}
                          >
                            {rec.module}
                          </span>
                          {(rec.tags || []).map((tag) => (
                            <span
                              key={tag}
                              style={{
                                fontSize: 11,
                                padding: "2px 6px",
                                borderRadius: 4,
                                background: "rgba(255,255,255,0.08)",
                                color: textMuted,
                              }}
                            >
                              {tag}
                            </span>
                          ))}
                          <span style={{ fontSize: 12, color: textMuted, marginLeft: "auto" }}>
                            {formatCreatedAt(rec.created_at)}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => handleDeleteKnowledge(e, rec)}
                            title="Delete"
                            style={{
                              padding: "4px 6px",
                              fontSize: 11,
                              border: "none",
                              borderRadius: 4,
                              background: "transparent",
                              cursor: "pointer",
                              color: textMuted,
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = "rgba(255,100,100,0.2)";
                              e.currentTarget.style.color = "#ff6b6b";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = "transparent";
                              e.currentTarget.style.color = textMuted;
                            }}
                          >
                            🗑
                          </button>
                        </div>
                      </div>
                    );
                  })}
                {knowledgeRecords.filter((r) => knowledgeFilter === "all" || r.module === knowledgeFilter).length === 0 && (
                  <p style={{ color: textMuted, fontSize: 14, margin: 0 }}>
                    No knowledge records{knowledgeFilter !== "all" ? ` in ${knowledgeFilter}` : ""}.
                  </p>
                )}
              </div>
            </section>
          )}
        </div>
      </main>

      {/* Delete confirmation modal */}
      {deleteConfirmConversation && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => setDeleteConfirmConversation(null)}
        >
          <div
            style={{
              background: bgMain,
              border: `1px solid ${border}`,
              borderRadius: 8,
              padding: 24,
              maxWidth: 360,
              width: "90%",
              boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <p style={{ margin: "0 0 20px", color: text, fontSize: 15, lineHeight: 1.5 }}>
              Are you sure you want to delete &quot;{deleteConfirmConversation.name || "this conversation"}&quot;? This cannot be undone.
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => setDeleteConfirmConversation(null)}
                style={{
                  padding: "8px 16px",
                  fontSize: 13,
                  border: `1px solid ${border}`,
                  borderRadius: 4,
                  background: "transparent",
                  color: text,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                style={{
                  padding: "8px 16px",
                  fontSize: 13,
                  border: "none",
                  borderRadius: 4,
                  background: "#e53935",
                  color: "#fff",
                  cursor: "pointer",
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
