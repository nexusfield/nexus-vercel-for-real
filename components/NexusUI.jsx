"use client";

import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import ConfirmationPanel from "@/components/ConfirmationPanel";
import JournalTab from "@/components/JournalTab";

const CHAT_MODELS = [
  { id: "claude-haiku-4-5-20251001", label: "Haiku" },
  { id: "claude-sonnet-4-6", label: "Sonnet" },
  { id: "claude-opus-4-6", label: "Opus" },
  { id: "gemini-2.5-flash", label: "Gemini Flash" },
  { id: "gemini-2.5-pro", label: "Gemini Pro" },
];
const DEFAULT_MODEL = "claude-sonnet-4-6";
const STORAGE_KEY = "nexus-selected-model";
const SAVE_MARKER = "[SAVE_TO_KNOWLEDGE]";

const SAVE_REQUEST_PATTERNS = [
  /\bsave\b.*\bknowledge\b/i,
  /\bdump\b.*\bknowledge\b/i,
  /\bstore\b.*\bknowledge\b/i,
  /\badd\b.*\bknowledge\b/i,
  /\bremember\b.*\bknowledge\b/i,
  /\bknowledge\s*base\b/i,
  /\bmemory\b/i,
  /\bremember\b.*\bthis\b/i,
  /\badd\b.*\bmemory\b/i,
  /\bput\b.*\bknowledge\b/i,
  /\bsave\b.*\bthis\b/i,
  /\bdump\b.*\bthis\b/i,
  /\bstore\b.*\bthis\b/i,
  /\bsave\b.*\bconversation\b/i,
  /\bdump\b.*\bconversation\b/i,
  /\bstore\b.*\bconversation\b/i,
];

const PROFILE_CATEGORIES = [
  "identity",
  "communication",
  "working_on",
  "priorities",
  "thinking_style",
  "preferences",
  "context",
];

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

function formatProfileCategory(category) {
  return String(category || "")
    .replace(/[_-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function isExplicitSaveRequest(message) {
  const text = String(message || "").trim();
  if (!text) return false;
  return SAVE_REQUEST_PATTERNS.some((pattern) => pattern.test(text));
}

function parseSavePayload(fullContent) {
  const trimmed = String(fullContent || "").trim();
  const markerIndex = trimmed.indexOf(SAVE_MARKER);
  if (markerIndex === -1) return null;
  const withoutMarker = trimmed.slice(markerIndex + SAVE_MARKER.length).trim();
  if (!withoutMarker) return null;

  const separatorMatch = withoutMarker.match(/\n\s*---\s*\n/);
  const separatorIdx = separatorMatch ? separatorMatch.index : -1;
  const separatorLength = separatorMatch ? separatorMatch[0].length : 0;
  const synthesis =
    separatorIdx === -1
      ? withoutMarker
      : withoutMarker.slice(0, separatorIdx).trim();
  const question =
    separatorIdx === -1
      ? "How should this be stored?"
      : withoutMarker.slice(separatorIdx + separatorLength).trim() ||
        "How should this be stored?";

  if (!synthesis) return null;
  return { synthesis, question, markerAtStart: markerIndex === 0 };
}

export default function NexusUI() {
  const [dumpInput, setDumpInput] = useState("");
  const [dumpConfirmation, setDumpConfirmation] = useState("");
  const [dumpLoading, setDumpLoading] = useState(false);
  const [dumpContextQuestion, setDumpContextQuestion] = useState(null);
  const [dumpPendingRawText, setDumpPendingRawText] = useState(null);
  const [dumpSimilarRecord, setDumpSimilarRecord] = useState(null);
  const [dumpPendingTextToSubmit, setDumpPendingTextToSubmit] = useState(null);

  const [conversations, setConversations] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [conversationHistory, setConversationHistory] = useState([]);
  const [editingConversationId, setEditingConversationId] = useState(null);
  const [editingName, setEditingName] = useState("");

  const [chatInput, setChatInput] = useState("");
  const [streamingContent, setStreamingContent] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [streamingByConversation, setStreamingByConversation] = useState({});
  const [activeStreamIds, setActiveStreamIds] = useState(new Set());
  const [inProgressMessages, setInProgressMessages] = useState({});
  const messagesEndRef = useRef(null);
  const searchDebounceRef = useRef(null);
  const initialLoadDoneRef = useRef(false);

  const [mainPanelMode, setMainPanelMode] = useState("chat");
  const [knowledgeFilter, setKnowledgeFilter] = useState("all");
  const [knowledgeRecords, setKnowledgeRecords] = useState([]);
  const [profileFacets, setProfileFacets] = useState([]);
  const [profileCategory, setProfileCategory] = useState(PROFILE_CATEGORIES[0]);
  const [profileContent, setProfileContent] = useState("");
  const [profileMessage, setProfileMessage] = useState("");
  const [editingProfileId, setEditingProfileId] = useState(null);
  const [editingProfileContent, setEditingProfileContent] = useState("");

  const [modes, setModes] = useState([]);
  const [editingModeId, setEditingModeId] = useState(null);
  const [modeFormVisible, setModeFormVisible] = useState(false);
  const [activeMode, setActiveMode] = useState(null);
  const [modeFormName, setModeFormName] = useState("");
  const [modeFormTriggerPhrase, setModeFormTriggerPhrase] = useState("");
  const [modeFormInstruction, setModeFormInstruction] = useState("");

  const [chatModel, setChatModel] = useState(DEFAULT_MODEL);
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const modelDropdownRef = useRef(null);
  const folderMenuRef = useRef(null);
  const threadMenuRef = useRef(null);
  const chatInputRef = useRef(null);
  const dumpInputRef = useRef(null);
  const [deleteConfirmConversation, setDeleteConfirmConversation] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [folders, setFolders] = useState([]);
  const [expandedFolders, setExpandedFolders] = useState(new Set());
  const [editingFolderId, setEditingFolderId] = useState(null);
  const [editingFolderName, setEditingFolderName] = useState("");
  const [folderMenuOpenId, setFolderMenuOpenId] = useState(null);
  const [threadMenuOpenId, setThreadMenuOpenId] = useState(null);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [draggedConvId, setDraggedConvId] = useState(null);
  const [dragOverTarget, setDragOverTarget] = useState(null);

  const [chatSaveQuestion, setChatSaveQuestion] = useState(null);
  const [chatSavePendingText, setChatSavePendingText] = useState(null);
  const [chatSaveSimilarRecord, setChatSaveSimilarRecord] = useState(null);
  const [chatSavePendingTextToSubmit, setChatSavePendingTextToSubmit] = useState(null);

  function cancelDumpSaveFlow() {
    setDumpContextQuestion(null);
    setDumpPendingRawText(null);
    setDumpSimilarRecord(null);
    setDumpPendingTextToSubmit(null);
    setDumpLoading(false);
  }

  function cancelChatSaveFlow() {
    setChatSaveQuestion(null);
    setChatSavePendingText(null);
    setChatSaveSimilarRecord(null);
    setChatSavePendingTextToSubmit(null);
    setChatLoading(false);
  }

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
    if (draggedConvId) {
      document.body.style.cursor = "grabbing";
      return () => { document.body.style.cursor = ""; };
    }
  }, [draggedConvId]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(e.target)) {
        setModelDropdownOpen(false);
      }
      if (folderMenuRef.current && !folderMenuRef.current.contains(e.target)) {
        setFolderMenuOpenId(null);
      }
      if (threadMenuRef.current && !threadMenuRef.current.contains(e.target)) {
        setThreadMenuOpenId(null);
      }
    }
    if (modelDropdownOpen || folderMenuOpenId || threadMenuOpenId) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [modelDropdownOpen, folderMenuOpenId, threadMenuOpenId]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const resizeTextarea = (ref, maxHeight = 120) => {
    const el = ref?.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  };

  const isViewingStreamingChat = activeConversationId != null && activeStreamIds.has(activeConversationId);
  const streamingContentForActive = isViewingStreamingChat ? (streamingByConversation[activeConversationId] ?? "") : "";
  const displayMessages =
    isViewingStreamingChat && streamingContentForActive !== ""
      ? [...conversationHistory, { role: "assistant", content: streamingContentForActive }]
      : conversationHistory;
  const showTypingIndicator = isViewingStreamingChat && streamingContentForActive === "";

  useEffect(() => {
    scrollToBottom();
  }, [conversationHistory, streamingByConversation, activeConversationId]);

  useEffect(() => {
    if (!chatInput) resizeTextarea(chatInputRef, 120);
  }, [chatInput]);
  useEffect(() => {
    if (!dumpInput) resizeTextarea(dumpInputRef, 120);
  }, [dumpInput]);

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
      const res = await fetch(`${window.location.origin}/api/knowledge`, {
        cache: "no-store",
      });
      const text = await res.text();
      if (text.trim().startsWith("<")) {
        throw new Error("Session expired. Please sign in again.");
      }
      let data = [];
      try {
        data = text ? JSON.parse(text) : [];
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

  async function fetchModes() {
    try {
      const res = await fetch(`${window.location.origin}/api/modes`);
      const text = await res.text();
      let data = [];
      try {
        data = text && !text.trim().startsWith("<") ? JSON.parse(text) : [];
      } catch {
        data = [];
      }
      if (!res.ok) {
        throw new Error(Array.isArray(data) ? "Failed to fetch modes" : data?.error || "Failed to fetch modes");
      }
      return data;
    } catch (err) {
      return [];
    }
  }

  async function fetchProfile() {
    try {
      const res = await fetch(`${window.location.origin}/api/profile`, {
        cache: "no-store",
      });
      const text = await res.text();
      let data = [];
      try {
        data = text && !text.trim().startsWith("<") ? JSON.parse(text) : [];
      } catch {
        data = [];
      }
      if (!res.ok) {
        throw new Error(Array.isArray(data) ? "Failed to fetch profile" : data?.error || "Failed to fetch profile");
      }
      return data;
    } catch (err) {
      return [];
    }
  }

  async function fetchFolders() {
    try {
      const res = await fetch(`${window.location.origin}/api/folders`);
      const text = await res.text();
      let data = [];
      try {
        data = text && !text.trim().startsWith("<") ? JSON.parse(text) : [];
      } catch {
        data = [];
      }
      if (!res.ok) {
        throw new Error(Array.isArray(data) ? "Failed to fetch folders" : data?.error || "Failed to fetch folders");
      }
      return data;
    } catch (err) {
      return [];
    }
  }

  function loadConversation(conv) {
    setActiveConversationId(conv.id);
    const messages = activeStreamIds.has(conv.id)
      ? (inProgressMessages[conv.id] ?? conv.messages ?? [])
      : (conv.messages ?? []);
    setConversationHistory(messages);
    setActiveMode(null);
  }

  function handleNewChat() {
    setActiveConversationId(null);
    setConversationHistory([]);
    setActiveMode(null);
    setSidebarOpen(false);
    setMainPanelMode("chat");
  }

  function updateConversationName(id, name) {
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, name } : c))
    );
  }

  function updateConversationFolder(id, folder_id) {
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, folder_id } : c))
    );
  }

  function toggleFolderExpanded(folderId) {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  }

  function startCreateFolder() {
    setCreatingFolder(true);
    setNewFolderName("");
  }

  function cancelCreateFolder() {
    setCreatingFolder(false);
    setNewFolderName("");
  }

  async function submitCreateFolder() {
    const name = newFolderName.trim();
    if (!name) return;
    setCreatingFolder(false);
    setNewFolderName("");
    try {
      const res = await fetch(`${window.location.origin}/api/folders`, {
        method: "POST",
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
        alert(data.error || "Failed to create folder");
        return;
      }
      setFolders((prev) => [...prev, data]);
      setExpandedFolders((prev) => new Set([...prev, data.id]));
    } catch (err) {
      alert(err?.message || "Failed to create folder");
    }
  }

  function startRenameFolder(folder) {
    setFolderMenuOpenId(null);
    setEditingFolderId(folder.id);
    setEditingFolderName(folder.name);
  }

  async function submitRenameFolder() {
    if (editingFolderId == null) return;
    const name = editingFolderName.trim() || "New Folder";
    try {
      const res = await fetch(`${window.location.origin}/api/folders/${editingFolderId}`, {
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
        alert(data.error || "Failed to rename folder");
        return;
      }
      setFolders((prev) => prev.map((f) => (f.id === editingFolderId ? data : f)));
    } catch (err) {
      alert(err?.message || "Failed to rename folder");
    } finally {
      setEditingFolderId(null);
      setEditingFolderName("");
    }
  }

  function cancelRenameFolder() {
    setEditingFolderId(null);
    setEditingFolderName("");
  }

  async function handleDeleteFolder(folder) {
    setFolderMenuOpenId(null);
    if (!confirm(`Delete folder "${folder.name}"? Threads inside will become ungrouped.`)) return;
    try {
      const res = await fetch(`${window.location.origin}/api/folders/${folder.id}`, {
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
        alert(data.error || "Failed to delete folder");
        return;
      }
      setFolders((prev) => prev.filter((f) => f.id !== folder.id));
      setConversations((prev) =>
        prev.map((c) => (c.folder_id === folder.id ? { ...c, folder_id: null } : c))
      );
    } catch (err) {
      alert(err?.message || "Failed to delete folder");
    }
  }

  async function handleMoveToFolder(convId, folderId) {
    setThreadMenuOpenId(null);
    try {
      const res = await fetch(`${window.location.origin}/api/conversations/${convId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder_id: folderId }),
      });
      const text = await res.text();
      let data = {};
      try {
        data = text && !text.trim().startsWith("<") ? JSON.parse(text) : {};
      } catch {
        data = {};
      }
      if (!res.ok) {
        alert(data.error || "Failed to move");
        return;
      }
      updateConversationFolder(convId, folderId);
    } catch (err) {
      alert(err?.message || "Failed to move");
    }
  }

  async function handleRemoveFromFolder(convId) {
    setThreadMenuOpenId(null);
    try {
      const res = await fetch(`${window.location.origin}/api/conversations/${convId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder_id: null }),
      });
      const text = await res.text();
      let data = {};
      try {
        data = text && !text.trim().startsWith("<") ? JSON.parse(text) : {};
      } catch {
        data = {};
      }
      if (!res.ok) {
        alert(data.error || "Failed to remove from folder");
        return;
      }
      updateConversationFolder(convId, null);
    } catch (err) {
      alert(err?.message || "Failed to remove from folder");
    }
  }

  function handleDragStart(e, convId) {
    setDraggedConvId(convId);
    e.dataTransfer.setData("text/plain", String(convId));
    e.dataTransfer.effectAllowed = "move";
  }

  function handleDragEnd() {
    setDraggedConvId(null);
    setDragOverTarget(null);
  }

  function handleDropOnFolder(e, folderId) {
    e.preventDefault();
    setDragOverTarget(null);
    const convId = e.dataTransfer.getData("text/plain");
    if (!convId) return;
    const id = parseInt(convId, 10);
    if (isNaN(id)) return;
    handleMoveToFolder(id, folderId);
  }

  function handleDropOnUngrouped(e) {
    e.preventDefault();
    setDragOverTarget(null);
    const convId = e.dataTransfer.getData("text/plain");
    if (!convId) return;
    const id = parseInt(convId, 10);
    if (isNaN(id)) return;
    handleRemoveFromFolder(id);
  }

  useEffect(() => {
    let mounted = true;
    (async () => {
      const [list, folderList] = await Promise.all([fetchConversations(), fetchFolders()]);
      if (!mounted) return;
      setConversations(list);
      setFolders(folderList);
      if (!initialLoadDoneRef.current && list.length > 0) {
        loadConversation(list[0]);
        initialLoadDoneRef.current = true;
      }
    })();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (searchQuery.trim() === "") {
      fetchConversations().then((list) => {
        setConversations((prev) => {
          if (!activeConversationId || prev.length === 0) return list;
          const current = prev.find((c) => c.id === activeConversationId);
          if (!current?.messages?.length) return list;
          return list.map((c) => {
            if (c.id !== activeConversationId) return c;
            const fetched = c.messages?.length ?? 0;
            if (current.messages.length > fetched) return current;
            return c;
          });
        });
      });
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

  useEffect(() => {
    if (mainPanelMode === "modes") {
      fetchModes().then(setModes);
    }
  }, [mainPanelMode]);

  useEffect(() => {
    if (mainPanelMode === "profile") {
      fetchProfile().then(setProfileFacets);
    }
  }, [mainPanelMode]);

  async function handleConversationClick(conv) {
    const list = searchQuery.trim()
      ? await fetchSearch(searchQuery.trim())
      : await fetchConversations();
    const mergedList = list.map((c) => {
      if (!activeStreamIds.has(c.id)) return c;
      const base = inProgressMessages[c.id] ?? c.messages ?? [];
      const streaming = streamingByConversation[c.id] ?? "";
      const messages =
        streaming !== ""
          ? [...base, { role: "assistant", content: streaming }]
          : base;
      return { ...c, messages };
    });
    setConversations(mergedList);
    const found = mergedList.find((c) => c.id === conv.id);
    if (found) {
      loadConversation(found);
      setSidebarOpen(false);
    }
  }

  function handleActivateMode(mode) {
    setActiveMode(mode);
  }

  function handleClearActiveMode() {
    setActiveMode(null);
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

  function startCreateMode() {
    setEditingModeId(null);
    setModeFormVisible(true);
    setModeFormName("");
    setModeFormTriggerPhrase("");
    setModeFormInstruction("");
  }

  function startEditMode(mode) {
    setEditingModeId(mode.id);
    setModeFormVisible(true);
    setModeFormName(mode.name || "");
    setModeFormTriggerPhrase(mode.trigger_phrase || "");
    setModeFormInstruction(mode.instruction || "");
  }

  function cancelModeForm() {
    setEditingModeId(null);
    setModeFormVisible(false);
    setModeFormName("");
    setModeFormTriggerPhrase("");
    setModeFormInstruction("");
  }

  async function submitModeForm() {
    const name = modeFormName.trim();
    const instruction = modeFormInstruction.trim();
    if (!name || !instruction) {
      alert("Name and instruction are required");
      return;
    }
    const isEdit = editingModeId != null;
    try {
      if (isEdit) {
        const res = await fetch(`${window.location.origin}/api/modes/${editingModeId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            trigger_phrase: modeFormTriggerPhrase.trim() || null,
            instruction,
          }),
        });
        const text = await res.text();
        let data = {};
        try {
          data = text && !text.trim().startsWith("<") ? JSON.parse(text) : {};
        } catch {
          data = {};
        }
        if (!res.ok) {
          alert(data.error || "Failed to update mode");
          return;
        }
        setModes((prev) => prev.map((m) => (m.id === editingModeId ? data : m)));
      } else {
        const res = await fetch(`${window.location.origin}/api/modes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            trigger_phrase: modeFormTriggerPhrase.trim() || null,
            instruction,
          }),
        });
        const text = await res.text();
        let data = {};
        try {
          data = text && !text.trim().startsWith("<") ? JSON.parse(text) : {};
        } catch {
          data = {};
        }
        if (!res.ok) {
          alert(data.error || "Failed to create mode");
          return;
        }
        setModes((prev) => [data, ...prev]);
      }
      cancelModeForm();
    } catch (err) {
      alert(err?.message || (isEdit ? "Failed to update mode" : "Failed to create mode"));
    }
  }

  async function handleDeleteMode(e, mode) {
    e.stopPropagation();
    if (!confirm(`Delete mode "${mode.name}"?`)) return;
    try {
      const res = await fetch(`${window.location.origin}/api/modes/${mode.id}`, {
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
      setModes((prev) => prev.filter((m) => m.id !== mode.id));
      if (editingModeId === mode.id) cancelModeForm();
    } catch (err) {
      alert(err?.message || "Failed to delete");
    }
  }

  function startEditProfileFacet(facet) {
    setEditingProfileId(facet.id);
    setEditingProfileContent(facet.content || "");
  }

  function cancelEditProfileFacet() {
    setEditingProfileId(null);
    setEditingProfileContent("");
  }

  async function handleCreateProfileFacet(e) {
    e.preventDefault();
    setProfileMessage("");
    const category = profileCategory.trim();
    const content = profileContent.trim();
    if (!category) {
      setProfileMessage("Error: Category is required.");
      return;
    }
    if (!content) {
      setProfileMessage("Error: Content is required.");
      return;
    }
    try {
      const res = await fetch(`${window.location.origin}/api/profile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, content }),
      });
      const text = await res.text();
      let data = {};
      try {
        data = text && !text.trim().startsWith("<") ? JSON.parse(text) : {};
      } catch {
        data = {};
      }
      if (!res.ok) {
        const msg = text.trim().startsWith("<")
          ? "Session expired. Please sign in again."
          : data.error || "Failed to create profile facet";
        setProfileMessage(`Error: ${msg}`);
        return;
      }
      setProfileFacets((prev) =>
        [...prev, data].sort(
          (a, b) =>
            String(a.category || "").localeCompare(String(b.category || "")) ||
            String(a.created_at || "").localeCompare(String(b.created_at || ""))
        )
      );
      setProfileContent("");
      setProfileCategory(category);
      setProfileMessage("Saved profile facet.");
    } catch (err) {
      setProfileMessage(`Error: ${err?.message || "Failed to create profile facet"}`);
    }
  }

  async function handleSaveProfileFacet(id) {
    const content = editingProfileContent.trim();
    if (!content) return;
    try {
      const res = await fetch(`${window.location.origin}/api/profile/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const text = await res.text();
      let data = {};
      try {
        data = text && !text.trim().startsWith("<") ? JSON.parse(text) : {};
      } catch {
        data = {};
      }
      if (!res.ok) {
        alert(data.error || "Failed to update profile facet");
        return;
      }
      setProfileFacets((prev) => prev.map((facet) => (facet.id === id ? data : facet)));
      cancelEditProfileFacet();
    } catch (err) {
      alert(err?.message || "Failed to update profile facet");
    }
  }

  async function handleDeactivateProfileFacet(id) {
    if (!confirm("Deactivate this profile facet?")) return;
    try {
      const res = await fetch(`${window.location.origin}/api/profile/${id}`, {
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
        alert(data.error || "Failed to deactivate profile facet");
        return;
      }
      setProfileFacets((prev) => prev.filter((facet) => facet.id !== id));
      if (editingProfileId === id) cancelEditProfileFacet();
    } catch (err) {
      alert(err?.message || "Failed to deactivate profile facet");
    }
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
    const rawText = dumpInput.trim();
    setDumpLoading(true);
    setDumpConfirmation("");
    try {
      const res = await fetch(`${window.location.origin}/api/intake/context-question`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawText }),
      });
      const text = await res.text();
      let data = {};
      try {
        data = text && !text.trim().startsWith("<") ? JSON.parse(text) : {};
      } catch {
        data = {};
      }
      if (!res.ok) {
        const msg = data.error || (res.status === 404 ? "API not found. Restart the dev server (npm run dev)." : "Failed to get context question");
        throw new Error(msg);
      }
      setDumpContextQuestion(data.question || "How should this be stored?");
      setDumpPendingRawText(rawText);
      setDumpInput("");
    } catch (err) {
      setDumpConfirmation(`Error: ${err.message}`);
    } finally {
      setDumpLoading(false);
    }
  }

  async function handleDumpContextSubmit(answer, action) {
    const rawText = dumpPendingRawText;
    if (!rawText) return;
    const textToSubmit = action === "save" && answer.trim() ? `${answer.trim()}\n\n${rawText}` : rawText;
    setDumpContextQuestion(null);
    setDumpPendingRawText(null);
    setDumpLoading(true);
    setDumpConfirmation("");
    try {
      const simRes = await fetch(`${window.location.origin}/api/intake/similarity-check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawText: textToSubmit }),
      });
      const simText = await simRes.text();
      let simData = {};
      try {
        simData = simText && !simText.trim().startsWith("<") ? JSON.parse(simText) : {};
      } catch {
        simData = {};
      }
      if (!simRes.ok) {
        throw new Error(simData.error || "Similarity check failed");
      }
      if (simData.similar && simData.record) {
        setDumpSimilarRecord(simData.record);
        setDumpPendingTextToSubmit(textToSubmit);
        setDumpLoading(false);
        return;
      }
      const res = await fetch(`${window.location.origin}/api/intake`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawText: textToSubmit }),
      });
      const resText = await res.text();
      let data = {};
      try {
        data = resText && !resText.trim().startsWith("<") ? JSON.parse(resText) : {};
      } catch {
        data = {};
      }
      if (!res.ok) {
        const msg = data.error || (res.status === 404 ? "API not found. Restart the dev server (npm run dev)." : "Intake failed");
        throw new Error(msg);
      }
      setDumpConfirmation(data.confirmation);
      if (mainPanelMode === "knowledge") {
        fetchKnowledge().then(setKnowledgeRecords);
      }
    } catch (err) {
      setDumpConfirmation(`Error: ${err.message}`);
      setDumpInput(rawText);
    } finally {
      setDumpLoading(false);
    }
  }

  async function handleDumpSimilaritySubmit(_answer, action) {
    const record = dumpSimilarRecord;
    const textToSubmit = dumpPendingTextToSubmit;
    if (!record || !textToSubmit) return;
    setDumpSimilarRecord(null);
    setDumpPendingTextToSubmit(null);
    setDumpLoading(true);
    setDumpConfirmation("");
    try {
      if (action === "replace") {
        const res = await fetch(`${window.location.origin}/api/intake/replace`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: record.id, rawText: textToSubmit }),
        });
        const resText = await res.text();
        let data = {};
        try {
          data = resText && !resText.trim().startsWith("<") ? JSON.parse(resText) : {};
        } catch {
          data = {};
        }
        if (!res.ok) {
          throw new Error(data.error || "Replace failed");
        }
        setDumpConfirmation(data.confirmation);
      } else if (action === "add_alongside" || action === "keep_both") {
        const res = await fetch(`${window.location.origin}/api/intake`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rawText: textToSubmit }),
        });
        const resText = await res.text();
        let data = {};
        try {
          data = resText && !resText.trim().startsWith("<") ? JSON.parse(resText) : {};
        } catch {
          data = {};
        }
        if (!res.ok) {
          const msg = data.error || (res.status === 404 ? "API not found. Restart the dev server (npm run dev)." : "Intake failed");
          throw new Error(msg);
        }
        if (action === "keep_both" && data.ids?.length > 0) {
          await fetch(`${window.location.origin}/api/knowledge/link`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ids: [record.id, ...data.ids] }),
          });
        }
        setDumpConfirmation(data.confirmation);
      }
      if (mainPanelMode === "knowledge") {
        fetchKnowledge().then(setKnowledgeRecords);
      }
    } catch (err) {
      setDumpConfirmation(`Error: ${err.message}`);
      setDumpInput(textToSubmit);
    } finally {
      setDumpLoading(false);
    }
  }

  function appendChatSaveConfirmation(confirmation) {
    setConversationHistory((prev) => {
      const updated = [...prev, { role: "assistant", content: confirmation }];
      if (activeConversationId) {
        fetch(`${window.location.origin}/api/conversations/${activeConversationId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: updated }),
        }).catch(() => {});
      }
      return updated;
    });
  }

  const chatSaveActive = !!chatSaveQuestion || !!chatSaveSimilarRecord;

  async function handleChatSaveContextSubmit(answer, action) {
    const rawText = chatSavePendingText;
    if (!rawText) return;
    const textToSubmit = action === "save" && answer.trim() ? `${answer.trim()}\n\n${rawText}` : rawText;
    setChatSaveQuestion(null);
    setChatSavePendingText(null);
    setChatLoading(true);
    try {
      const simRes = await fetch(`${window.location.origin}/api/intake/similarity-check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawText: textToSubmit }),
      });
      const simText = await simRes.text();
      let simData = {};
      try {
        simData = simText && !simText.trim().startsWith("<") ? JSON.parse(simText) : {};
      } catch {
        simData = {};
      }
      if (!simRes.ok) {
        throw new Error(simData.error || "Similarity check failed");
      }
      if (simData.similar && simData.record) {
        setChatSaveSimilarRecord(simData.record);
        setChatSavePendingTextToSubmit(textToSubmit);
        setChatLoading(false);
        return;
      }
      const res = await fetch(`${window.location.origin}/api/intake`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawText: textToSubmit }),
      });
      const resText = await res.text();
      let data = {};
      try {
        data = resText && !resText.trim().startsWith("<") ? JSON.parse(resText) : {};
      } catch {
        data = {};
      }
      if (!res.ok) {
        throw new Error(data.error || "Intake failed");
      }
      setChatSaveQuestion(null);
      appendChatSaveConfirmation(data.confirmation);
      if (mainPanelMode === "knowledge") {
        fetchKnowledge().then(setKnowledgeRecords);
      }
    } catch (err) {
      appendChatSaveConfirmation(`Error: ${err.message}`);
    } finally {
      setChatLoading(false);
    }
  }

  async function handleChatSaveSimilaritySubmit(_answer, action) {
    const record = chatSaveSimilarRecord;
    const textToSubmit = chatSavePendingTextToSubmit;
    if (!record || !textToSubmit) return;
    setChatSaveSimilarRecord(null);
    setChatSavePendingTextToSubmit(null);
    setChatLoading(true);
    try {
      if (action === "replace") {
        const res = await fetch(`${window.location.origin}/api/intake/replace`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: record.id, rawText: textToSubmit }),
        });
        const resText = await res.text();
        let data = {};
        try {
          data = resText && !resText.trim().startsWith("<") ? JSON.parse(resText) : {};
        } catch {
          data = {};
        }
        if (!res.ok) {
          throw new Error(data.error || "Replace failed");
        }
        appendChatSaveConfirmation(data.confirmation);
      } else if (action === "add_alongside" || action === "keep_both") {
        const res = await fetch(`${window.location.origin}/api/intake`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rawText: textToSubmit }),
        });
        const resText = await res.text();
        let data = {};
        try {
          data = resText && !resText.trim().startsWith("<") ? JSON.parse(resText) : {};
        } catch {
          data = {};
        }
        if (!res.ok) {
          throw new Error(data.error || "Intake failed");
        }
        if (action === "keep_both" && data.ids?.length > 0) {
          await fetch(`${window.location.origin}/api/knowledge/link`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ids: [record.id, ...data.ids] }),
          });
        }
        appendChatSaveConfirmation(data.confirmation);
      }
      if (mainPanelMode === "knowledge") {
        fetchKnowledge().then(setKnowledgeRecords);
      }
    } catch (err) {
      appendChatSaveConfirmation(`Error: ${err.message}`);
    } finally {
      setChatLoading(false);
    }
  }

  async function handleChat(e) {
    e.preventDefault();
    if (!chatInput.trim() || activeStreamIds.has(activeConversationId) || chatSaveActive) return;

    initialLoadDoneRef.current = true;

    const userMessage = chatInput.trim();
    setChatInput("");
    const historyForApi = conversationHistory;
    const baseMessages = [...historyForApi, { role: "user", content: userMessage }];
    setConversationHistory(baseMessages);
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

    setInProgressMessages((prev) => ({ ...prev, [currentConversationId]: baseMessages }));
    setActiveStreamIds((prev) => new Set([...prev, currentConversationId]));
    setStreamingByConversation((prev) => ({ ...prev, [currentConversationId]: "" }));

    try {
      const res = await fetch(`${window.location.origin}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userMessage,
          conversationHistory: historyForApi,
          model: chatModel,
          ...(activeMode?.instruction && { activeModeInstruction: activeMode.instruction }),
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
        setStreamingByConversation((prev) => ({ ...prev, [currentConversationId]: fullContent }));
      }

      const parsedSavePayload = parseSavePayload(fullContent);
      const saveRequested = isExplicitSaveRequest(userMessage);
      const shouldOpenSaveFlow =
        parsedSavePayload &&
        (saveRequested || parsedSavePayload.markerAtStart);
      if (shouldOpenSaveFlow) {
        const { synthesis, question } = parsedSavePayload;
        setChatSaveQuestion(question);
        setChatSavePendingText(synthesis);
        const savePromptMsg = `### Proposed memory\n\n${synthesis}`;
        const baseForSave = inProgressMessages[currentConversationId] ?? baseMessages;
        const updatedMessages = [
          ...baseForSave,
          { role: "assistant", content: savePromptMsg },
        ];
        setActiveStreamIds((prev) => {
          const next = new Set(prev);
          next.delete(currentConversationId);
          return next;
        });
        setStreamingByConversation((prev) => {
          const next = { ...prev };
          delete next[currentConversationId];
          return next;
        });
        setInProgressMessages((prev) => {
          const next = { ...prev };
          delete next[currentConversationId];
          return next;
        });
        setConversations((prev) =>
          prev.map((c) => (c.id === currentConversationId ? { ...c, messages: updatedMessages } : c))
        );
        if (activeConversationId === currentConversationId) {
          setConversationHistory(updatedMessages);
        }
        setStreamingContent("");
        if (currentConversationId) {
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
        }
        setChatLoading(false);
        return;
      }

      const baseForComplete = inProgressMessages[currentConversationId] ?? baseMessages;
      const updatedMessages = [
        ...baseForComplete,
        { role: "assistant", content: fullContent },
      ];
      // Update history and list first so the UI has the message before we leave streaming mode
      setConversations((prev) =>
        prev.map((c) => (c.id === currentConversationId ? { ...c, messages: updatedMessages } : c))
      );
      if (activeConversationId === currentConversationId) {
        setConversationHistory(updatedMessages);
      }
      setStreamingContent("");
      setActiveStreamIds((prev) => {
        const next = new Set(prev);
        next.delete(currentConversationId);
        return next;
      });
      setStreamingByConversation((prev) => {
        const next = { ...prev };
        delete next[currentConversationId];
        return next;
      });
      setInProgressMessages((prev) => {
        const next = { ...prev };
        delete next[currentConversationId];
        return next;
      });

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
      const baseForError = inProgressMessages[currentConversationId] ?? baseMessages;
      const errorMessages = [
        ...baseForError,
        { role: "assistant", content: `Error: ${err.message}` },
      ];
      alert(err.message);
      setActiveStreamIds((prev) => {
        const next = new Set(prev);
        if (currentConversationId != null) next.delete(currentConversationId);
        return next;
      });
      setStreamingByConversation((prev) => {
        const next = { ...prev };
        if (currentConversationId != null) delete next[currentConversationId];
        return next;
      });
      setInProgressMessages((prev) => {
        const next = { ...prev };
        if (currentConversationId != null) delete next[currentConversationId];
        return next;
      });
      setConversations((prev) =>
        prev.map((c) => (c.id === currentConversationId ? { ...c, messages: errorMessages } : c))
      );
      if (activeConversationId === currentConversationId) {
        setConversationHistory(errorMessages);
      }
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

  function handleChatInputKeyDown(e) {
    if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
    e.preventDefault();
    e.currentTarget.form?.requestSubmit();
  }

  function renderConversationItem(conv) {
    const accent = "#00d4aa";
    const bgSidebar = "#0d1117";
    const border = "#1e252d";
    const text = "#e6e9ef";
    const textMuted = "#8b9298";
    const bgMain = "#14181f";
    const isMenuOpen = threadMenuOpenId === conv.id;
    return (
      <div
        key={conv.id}
        data-conv-item
        style={{
          marginBottom: 2,
          borderRadius: 4,
          position: "relative",
          background: activeConversationId === conv.id ? "rgba(0,212,170,0.12)" : "transparent",
          borderLeft: activeConversationId === conv.id ? `3px solid ${accent}` : "3px solid transparent",
          transition: "var(--nexus-transition)",
        }}
      >
        {activeStreamIds.has(conv.id) && (
          <div
            className="nexus-stream-indicator"
            title="Streaming..."
          />
        )}
        {editingConversationId === conv.id ? (
          <div
            style={{ padding: "6px 10px" }}
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
                padding: "4px 6px",
                marginBottom: 4,
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
                        padding: "2px 6px",
                        fontSize: 13,
                  border: `1px solid ${accent}`,
                  borderRadius: 4,
                  background: accent,
                  color: bgSidebar,
                  cursor: "pointer",
                  fontFamily: "var(--font-sans)",
                }}
              >
                Save
              </button>
                    <button
                      type="button"
                      onClick={cancelRename}
                      style={{
                        padding: "2px 6px",
                        fontSize: 13,
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
            draggable
            onDragStart={(e) => handleDragStart(e, conv.id)}
            onDragEnd={handleDragEnd}
            onClick={() => handleConversationClick(conv)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") handleConversationClick(conv);
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              setThreadMenuOpenId(isMenuOpen ? null : conv.id);
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
              padding: "6px 10px",
              cursor: "grab",
              fontSize: 13,
              opacity: draggedConvId === conv.id ? 0.5 : 1,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 500, marginBottom: 1, color: text, fontSize: 13 }}>{conv.name}</div>
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
                        padding: "2px 4px",
                        fontSize: 14,
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
              <div ref={isMenuOpen ? threadMenuRef : null} style={{ position: "relative" }}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setThreadMenuOpenId(isMenuOpen ? null : conv.id);
                  }}
                  title="Move to folder"
                  style={{
                    padding: "2px 4px",
                    fontSize: 14,
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
                  ⋮
                </button>
                {isMenuOpen && (
                  <div
                    style={{
                      position: "absolute",
                      top: "100%",
                      right: 0,
                      marginTop: 2,
                      minWidth: 140,
                      maxHeight: 200,
                      overflowY: "auto",
                      background: bgMain,
                      border: `1px solid ${border}`,
                      borderRadius: 4,
                      boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
                      zIndex: 100,
                      overflow: "hidden",
                    }}
                  >
                    <div style={{ padding: "6px 10px", fontSize: 12, color: textMuted, borderBottom: `1px solid ${border}` }}>
                      Move to folder
                    </div>
                    {conv.folder_id && (
                      <button
                        type="button"
                        onClick={() => handleRemoveFromFolder(conv.id)}
                        style={{
                          width: "100%",
                          padding: "6px 10px",
                          fontSize: 14,
                          textAlign: "left",
                          border: "none",
                          background: "transparent",
                          color: text,
                          cursor: "pointer",
                        }}
                      >
                        Remove from folder
                      </button>
                    )}
                    {folders.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => handleMoveToFolder(conv.id, f.id)}
                        style={{
                          width: "100%",
                          padding: "6px 10px",
                          fontSize: 14,
                          textAlign: "left",
                          border: "none",
                          background: conv.folder_id === f.id ? "rgba(0,212,170,0.15)" : "transparent",
                          color: conv.folder_id === f.id ? accent : text,
                          cursor: "pointer",
                        }}
                      >
                        {f.name}
                      </button>
                    ))}
                    {folders.length === 0 && !conv.folder_id && (
                      <div style={{ padding: "6px 10px", fontSize: 14, color: textMuted }}>No folders yet</div>
                    )}
                  </div>
                )}
              </div>
                    <button
                      type="button"
                      onClick={(e) => handleDeleteClick(e, conv)}
                      title="Delete"
                      style={{
                        padding: "2px 4px",
                        fontSize: 14,
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
    );
  }

  const accent = "#00d4aa";
  const bgSidebar = "#0d1117";
  const bgMain = "#14181f";
  const border = "#1e252d";
  const text = "#e6e9ef";
  const textMuted = "#8b9298";
  const profileByCategory = profileFacets.reduce((acc, facet) => {
    const key = facet.category || "other";
    if (!acc[key]) acc[key] = [];
    acc[key].push(facet);
    return acc;
  }, {});

  return (
    <div className="nexus-layout" style={{ display: "flex", height: "100vh", overflow: "hidden", position: "relative", zIndex: 2 }}>
      {/* Sidebar overlay - mobile only, closes sidebar when clicked */}
      {sidebarOpen && (
        <div
          className="nexus-sidebar-overlay"
          onClick={() => setSidebarOpen(false)}
          onKeyDown={(e) => e.key === "Escape" && setSidebarOpen(false)}
          role="button"
          tabIndex={0}
          aria-label="Close sidebar"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            zIndex: 90,
          }}
        />
      )}
      {/* Left Sidebar */}
      <aside
        className={`nexus-sidebar ${sidebarOpen ? "nexus-sidebar-open" : ""}`}
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
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${border}` }}>
          <h2
            style={{
              margin: 0,
              padding: 16,
              fontSize: 17,
              fontWeight: 600,
              fontFamily: "var(--font-sans)",
              letterSpacing: "0.05em",
              color: textMuted,
            }}
          >
            Chats
          </h2>
          <button
            type="button"
            className="nexus-sidebar-close"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close sidebar"
            style={{
              display: "none",
              marginRight: 12,
              padding: 8,
              border: "none",
              background: "transparent",
              color: textMuted,
              cursor: "pointer",
              fontSize: 20,
            }}
          >
            ✕
          </button>
        </div>
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
              fontSize: 17,
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
              fontSize: 17,
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
          {/* Folder section */}
          <div style={{ marginBottom: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 6 }}>
              {creatingFolder ? (
                <div style={{ display: "flex", alignItems: "center", gap: 4, flex: 1, minWidth: 0 }}>
                  <input
                    type="text"
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") submitCreateFolder();
                      if (e.key === "Escape") cancelCreateFolder();
                    }}
                    placeholder="Folder name"
                    autoFocus
                    style={{
                      flex: 1,
                      padding: "4px 8px",
                      border: `1px solid ${border}`,
                      borderRadius: 4,
                      fontSize: 13,
                      boxSizing: "border-box",
                      background: "rgba(0,0,0,0.2)",
                      color: text,
                    }}
                  />
                  <button
                    type="button"
                    onClick={cancelCreateFolder}
                    title="Cancel"
                    style={{
                      padding: "6px 8px",
                      border: "none",
                      borderRadius: 4,
                      background: "transparent",
                      color: textMuted,
                      cursor: "pointer",
                      fontSize: 14,
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
              ) : (
                <button
                  type="button"
                  onClick={startCreateFolder}
                  title="New Folder"
                  style={{
                    padding: "4px 8px",
                    fontSize: 14,
                    border: `1px solid ${border}`,
                    borderRadius: 4,
                    background: "transparent",
                    color: textMuted,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "rgba(255,255,255,0.06)";
                    e.currentTarget.style.color = text;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.color = textMuted;
                  }}
                >
                  + New Folder
                </button>
              )}
            </div>
            {folders.map((folder) => {
              const folderThreads = conversations.filter((c) => c.folder_id === folder.id);
              const isExpanded = expandedFolders.has(folder.id);
              return (
                <div key={folder.id} style={{ marginBottom: 4 }}>
                  {editingFolderId === folder.id ? (
                    <div style={{ padding: "6px 8px" }} onClick={(e) => e.stopPropagation()}>
                      <input
                        type="text"
                        value={editingFolderName}
                        onChange={(e) => setEditingFolderName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") submitRenameFolder();
                          if (e.key === "Escape") cancelRenameFolder();
                        }}
                        onBlur={submitRenameFolder}
                        autoFocus
                        style={{
                          width: "100%",
                          padding: "4px 8px",
                          border: `1px solid ${border}`,
                          borderRadius: 4,
                          fontSize: 14,
                          boxSizing: "border-box",
                          background: "rgba(0,0,0,0.2)",
                          color: text,
                        }}
                      />
                    </div>
                  ) : (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                        padding: "6px 8px",
                        borderRadius: 4,
                        cursor: "pointer",
                        background: dragOverTarget === folder.id ? "rgba(0,212,170,0.15)" : undefined,
                        border: dragOverTarget === folder.id ? `1px dashed ${accent}` : "1px solid transparent",
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "move";
                        if (draggedConvId) setDragOverTarget(folder.id);
                      }}
                      onDragLeave={() => {
                        setDragOverTarget((prev) => (prev === folder.id ? null : prev));
                      }}
                      onDrop={(e) => handleDropOnFolder(e, folder.id)}
                      onMouseEnter={(e) => {
                        if (!draggedConvId) e.currentTarget.style.background = "rgba(255,255,255,0.04)";
                      }}
                      onMouseLeave={(e) => {
                        if (!draggedConvId) e.currentTarget.style.background = "transparent";
                      }}
                    >
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); toggleFolderExpanded(folder.id); }}
                        style={{
                          padding: 0,
                          border: "none",
                          background: "transparent",
                          color: textMuted,
                          cursor: "pointer",
                          fontSize: 12,
                          width: 16,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {isExpanded ? "▼" : "▶"}
                      </button>
                      <div
                        style={{ flex: 1, minWidth: 0, fontSize: 14, color: text }}
                        onClick={(e) => { e.stopPropagation(); toggleFolderExpanded(folder.id); }}
                      >
                        {folder.name}
                      </div>
                      <div ref={folderMenuOpenId === folder.id ? folderMenuRef : null} style={{ position: "relative" }}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setFolderMenuOpenId(folderMenuOpenId === folder.id ? null : folder.id);
                          }}
                          title="Folder options"
                          style={{
                            padding: "2px 4px",
                            fontSize: 14,
                            border: "none",
                            borderRadius: 4,
                            background: "transparent",
                            cursor: "pointer",
                            color: textMuted,
                            opacity: folderMenuOpenId === folder.id ? 1 : 0.6,
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.opacity = 1; e.currentTarget.style.background = "rgba(255,255,255,0.1)"; }}
                          onMouseLeave={(e) => { if (folderMenuOpenId !== folder.id) e.currentTarget.style.opacity = 0.6; e.currentTarget.style.background = "transparent"; }}
                        >
                          ⋮
                        </button>
                        {folderMenuOpenId === folder.id && (
                          <div
                            style={{
                              position: "absolute",
                              top: "100%",
                              right: 0,
                              marginTop: 2,
                              minWidth: 120,
                              background: bgMain,
                              border: `1px solid ${border}`,
                              borderRadius: 4,
                              boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
                              zIndex: 100,
                              overflow: "hidden",
                            }}
                          >
                            <button
                              type="button"
                              onClick={() => startRenameFolder(folder)}
                              style={{
                                width: "100%",
                                padding: "6px 10px",
                                fontSize: 14,
                                textAlign: "left",
                                border: "none",
                                background: "transparent",
                                color: text,
                                cursor: "pointer",
                              }}
                            >
                              Rename
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteFolder(folder)}
                              style={{
                                width: "100%",
                                padding: "6px 10px",
                                fontSize: 14,
                                textAlign: "left",
                                border: "none",
                                background: "transparent",
                                color: "#ff6b6b",
                                cursor: "pointer",
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  {isExpanded && (
                    <div
                      style={{ marginLeft: 16, marginTop: 2 }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "move";
                        if (draggedConvId) setDragOverTarget(folder.id);
                      }}
                      onDragLeave={() => {
                        setDragOverTarget((prev) => (prev === folder.id ? null : prev));
                      }}
                      onDrop={(e) => handleDropOnFolder(e, folder.id)}
                    >
                      {folderThreads.map((conv) => renderConversationItem(conv))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Divider / Ungrouped drop zone */}
          {folders.length > 0 && (
            <div
              style={{
                minHeight: 24,
                padding: "8px 0",
                margin: "4px 0",
                borderRadius: 4,
                borderTop: `1px solid ${border}`,
                background: dragOverTarget === "ungrouped" ? "rgba(0,212,170,0.1)" : undefined,
                outline: dragOverTarget === "ungrouped" ? `1px dashed ${accent}` : "none",
                outlineOffset: -1,
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (draggedConvId) setDragOverTarget("ungrouped");
              }}
              onDragLeave={() => {
                setDragOverTarget((prev) => (prev === "ungrouped" ? null : prev));
              }}
              onDrop={(e) => handleDropOnUngrouped(e)}
            />
          )}

          {/* Ungrouped threads */}
          {conversations.filter((c) => !c.folder_id).map((conv) => renderConversationItem(conv))}
        </div>
      </aside>

      {/* Right Main Panel */}
      <main
        className="nexus-main"
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          background: bgMain,
        }}
      >
        <div className="nexus-main-content" style={{ margin: "0 auto", padding: 24, flex: 1, display: "flex", flexDirection: "column", width: "100%", minHeight: 0 }}>
          {/* Logo + hamburger (hamburger visible on mobile only) */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
            <button
              type="button"
              className="nexus-sidebar-toggle"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open chats"
              style={{
                display: "none",
                padding: 10,
                border: "none",
                borderRadius: 4,
                background: "rgba(0,0,0,0.2)",
                color: text,
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
            <div
              aria-hidden
              style={{
                width: 40,
                height: 36,
                flexShrink: 0,
                overflow: "hidden",
                display: "flex",
                alignItems: "center",
                borderRadius: 6,
              }}
            >
              <img
                src="/nexus-logo.png"
                alt=""
                width={1376}
                height={768}
                style={{ height: 36, width: "auto", maxWidth: "none", display: "block" }}
              />
            </div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, fontFamily: "var(--font-sans)", letterSpacing: "0.08em", color: text }}>
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
                fontSize: 17,
                fontFamily: "var(--font-sans)",
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
                fontSize: 17,
                fontFamily: "var(--font-sans)",
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
            <button
              type="button"
              onClick={() => setMainPanelMode("modes")}
              style={{
                padding: "8px 16px",
                fontSize: 17,
                fontFamily: "var(--font-sans)",
                border: "none",
                borderBottom: mainPanelMode === "modes" ? `2px solid ${accent}` : "2px solid transparent",
                background: "transparent",
                cursor: "pointer",
                fontWeight: mainPanelMode === "modes" ? 600 : 400,
                color: mainPanelMode === "modes" ? accent : textMuted,
                transition: "var(--nexus-transition)",
              }}
            >
              Modes
            </button>
            <button
              type="button"
              onClick={() => setMainPanelMode("profile")}
              style={{
                padding: "8px 16px",
                fontSize: 17,
                fontFamily: "var(--font-sans)",
                border: "none",
                borderBottom: mainPanelMode === "profile" ? `2px solid ${accent}` : "2px solid transparent",
                background: "transparent",
                cursor: "pointer",
                fontWeight: mainPanelMode === "profile" ? 600 : 400,
                color: mainPanelMode === "profile" ? accent : textMuted,
                transition: "var(--nexus-transition)",
              }}
            >
              Profile
            </button>
            <button
              type="button"
              onClick={() => setMainPanelMode("journal")}
              style={{
                padding: "8px 16px",
                fontSize: 17,
                fontFamily: "var(--font-sans)",
                border: "none",
                borderBottom: mainPanelMode === "journal" ? `2px solid ${accent}` : "2px solid transparent",
                background: "transparent",
                cursor: "pointer",
                fontWeight: mainPanelMode === "journal" ? 600 : 400,
                color: mainPanelMode === "journal" ? accent : textMuted,
                transition: "var(--nexus-transition)",
              }}
            >
              Journal
            </button>
          </div>

          {/* Chat Panel */}
          {mainPanelMode === "chat" && (
            <section className="nexus-panel-enter nexus-chat-panel" style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
              <div
                style={{
                  flex: 1,
                  minHeight: 360,
                  overflowY: "auto",
                  padding: "24px 0",
                  marginBottom: 12,
                  background: "transparent",
                }}
              >
                {displayMessages.length === 0 && (
                  <p style={{ color: textMuted, fontSize: 16, margin: 0 }}>
                    No messages yet. Ask a question.
                  </p>
                )}
                {displayMessages.map((msg, i) => (
                  <div
                    key={i}
                    style={{
                      marginBottom: 20,
                      padding: 0,
                    }}
                  >
                    <strong style={{ fontSize: 16, color: textMuted, display: "block", marginBottom: 6 }}>
                      {msg.role === "user" ? "You" : "Nexus"}
                    </strong>
                    {msg.role === "assistant" ? (
                      <div style={{ fontSize: 16 }} className="markdown-body">
                        <ReactMarkdown>{String(msg.content || "")}</ReactMarkdown>
                      </div>
                    ) : (
                      <div
                        style={{
                          fontSize: 16,
                          whiteSpace: "pre-wrap",
                          color: text,
                          background: "#0f0f0f",
                          padding: "10px 14px",
                          borderRadius: 12,
                          display: "inline-block",
                          maxWidth: "100%",
                        }}
                      >
                        {msg.content}
                      </div>
                    )}
                  </div>
                ))}
                {showTypingIndicator && (
                  <div
                    style={{
                      marginBottom: 20,
                      padding: 0,
                    }}
                  >
                    <strong style={{ fontSize: 16, color: textMuted, display: "block", marginBottom: 4 }}>
                      Nexus
                    </strong>
                    <div className="nexus-typing-indicator" aria-label="Nexus is thinking" role="status">
                      <span className="nexus-typing-dot" />
                      <span className="nexus-typing-dot" />
                      <span className="nexus-typing-dot" />
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {chatSaveQuestion && (
                <div style={{ marginBottom: 12 }}>
                  <ConfirmationPanel
                    question={chatSaveQuestion}
                    mode="context"
                    onSubmit={handleChatSaveContextSubmit}
                    onClose={cancelChatSaveFlow}
                    newContentPreview={chatSavePendingText?.slice(0, 300)}
                  />
                </div>
              )}
              {chatSaveSimilarRecord && chatSavePendingTextToSubmit && (
                <div style={{ marginBottom: 12 }}>
                  <ConfirmationPanel
                    question="A similar record already exists. What would you like to do?"
                    mode="similarity"
                    onSubmit={handleChatSaveSimilaritySubmit}
                    onClose={cancelChatSaveFlow}
                    existingSummary={getSummaryFromStructuredData(chatSaveSimilarRecord.structured_data) || chatSaveSimilarRecord.raw_text?.slice(0, 300)}
                    newContentPreview={chatSavePendingTextToSubmit.slice(0, 300)}
                  />
                </div>
              )}

              {activeMode && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 8,
                    padding: "6px 10px",
                    borderRadius: 4,
                    background: "rgba(0,212,170,0.1)",
                    border: `1px solid ${accent}`,
                    fontSize: 16,
                  }}
                >
                  <span style={{ color: textMuted }}>Mode:</span>
                  <span style={{ color: accent, fontWeight: 500 }}>{activeMode.name}</span>
                  <button
                    type="button"
                    onClick={handleClearActiveMode}
                    title="Clear mode"
                    style={{
                      marginLeft: "auto",
                      padding: "2px 6px",
                      fontSize: 17,
                      border: "none",
                      borderRadius: 4,
                      background: "transparent",
                      color: textMuted,
                      cursor: "pointer",
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
                    Clear
                  </button>
                </div>
              )}
              <div ref={modelDropdownRef} style={{ position: "relative", marginBottom: 8 }}>
                <button
                  type="button"
                  onClick={() => setModelDropdownOpen((o) => !o)}
                  style={{
                    padding: "4px 8px",
                    fontSize: 17,
                    fontFamily: "var(--font-sans)",
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
                          fontSize: 16,
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

              <form className="nexus-chat-form" onSubmit={handleChat} style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                <textarea
                  ref={chatInputRef}
                  className="nexus-chat-input"
                  value={chatInput}
                  onChange={(e) => {
                    setChatInput(e.target.value);
                    resizeTextarea(chatInputRef, 120);
                  }}
                  onKeyDown={handleChatInputKeyDown}
                  placeholder="Ask a question..."
                  disabled={activeStreamIds.has(activeConversationId) || chatSaveActive}
                  rows={1}
                  style={{
                    flex: 1,
                    minHeight: 44,
                    maxHeight: 120,
                    padding: "10px 12px",
                    border: `1px solid ${border}`,
                    borderRadius: 4,
                    fontSize: 16,
                    background: "rgba(0,0,0,0.2)",
                    color: text,
                    resize: "none",
                    overflowY: "auto",
                    boxSizing: "border-box",
                  }}
                />
                <button
                  type="submit"
                  className="nexus-chat-send-btn"
                  disabled={activeStreamIds.has(activeConversationId) || !chatInput.trim() || chatSaveActive}
                  title="Send"
                  style={{
                    padding: "10px 14px",
                    border: `1px solid ${activeStreamIds.has(activeConversationId) || !chatInput.trim() || chatSaveActive ? border : accent}`,
                    borderRadius: 4,
                    background: activeStreamIds.has(activeConversationId) || !chatInput.trim() || chatSaveActive ? "transparent" : accent,
                    color: activeStreamIds.has(activeConversationId) || !chatInput.trim() || chatSaveActive ? textMuted : bgSidebar,
                    cursor: activeStreamIds.has(activeConversationId) || chatSaveActive ? "not-allowed" : "pointer",
                    transition: "var(--nexus-transition)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                  onMouseEnter={(e) => {
                    if (!activeStreamIds.has(activeConversationId) && !chatSaveActive && chatInput.trim()) {
                      e.currentTarget.style.background = "#00f5c4";
                      e.currentTarget.style.borderColor = "#00f5c4";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!activeStreamIds.has(activeConversationId) && !chatSaveActive && chatInput.trim()) {
                      e.currentTarget.style.background = accent;
                      e.currentTarget.style.borderColor = accent;
                    }
                  }}
                >
                  {activeStreamIds.has(activeConversationId) ? (
                    <span style={{ fontSize: 16 }}>...</span>
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
              {/* Dump Bar - at top of Knowledge tab */}
              <section style={{ marginBottom: 24 }}>
                <form className="nexus-dump-form" onSubmit={handleDump} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "flex-end" }}>
                  <textarea
                    ref={dumpInputRef}
                    className="nexus-dump-input"
                    value={dumpInput}
                    onChange={(e) => {
                      setDumpInput(e.target.value);
                      resizeTextarea(dumpInputRef, 120);
                    }}
                    placeholder="Paste or type text to dump..."
                    disabled={dumpLoading || !!dumpContextQuestion || !!dumpSimilarRecord}
                    rows={1}
                    style={{
                      flex: 1,
                      minHeight: 44,
                      maxHeight: 120,
                      padding: "10px 12px",
                      border: `1px solid ${border}`,
                      borderRadius: 4,
                      fontSize: 16,
                      background: "rgba(0,0,0,0.2)",
                      color: text,
                      resize: "none",
                      overflowY: "auto",
                      boxSizing: "border-box",
                    }}
                  />
                  <button
                    type="submit"
                    className="nexus-dump-btn"
                    disabled={dumpLoading || !dumpInput.trim() || !!dumpContextQuestion || !!dumpSimilarRecord}
                    style={{
                      padding: "10px 20px",
                      border: `1px solid ${accent}`,
                      borderRadius: 4,
                      background: dumpLoading || !dumpInput.trim() || dumpContextQuestion || dumpSimilarRecord ? "transparent" : accent,
                      color: dumpLoading || !dumpInput.trim() || dumpContextQuestion || dumpSimilarRecord ? textMuted : bgSidebar,
                      fontSize: 17,
                      fontFamily: "var(--font-sans)",
                      fontWeight: 600,
                      cursor: dumpLoading ? "not-allowed" : "pointer",
                      transition: "var(--nexus-transition)",
                    }}
                  >
                    {dumpLoading ? "..." : "Dump"}
                  </button>
                </form>
                {dumpConfirmation && (
                  <p style={{ fontSize: 17, color: textMuted, margin: 0 }}>{dumpConfirmation}</p>
                )}
                {dumpContextQuestion && (
                  <div style={{ marginTop: 12 }}>
                    <ConfirmationPanel
                      question={dumpContextQuestion}
                      mode="context"
                      onSubmit={handleDumpContextSubmit}
                      onClose={cancelDumpSaveFlow}
                      newContentPreview={dumpPendingRawText?.slice(0, 300)}
                    />
                  </div>
                )}
                {dumpSimilarRecord && dumpPendingTextToSubmit && (
                  <div style={{ marginTop: 12 }}>
                    <ConfirmationPanel
                      question="A similar record already exists. What would you like to do?"
                      mode="similarity"
                      onSubmit={handleDumpSimilaritySubmit}
                      onClose={cancelDumpSaveFlow}
                      existingSummary={getSummaryFromStructuredData(dumpSimilarRecord.structured_data) || dumpSimilarRecord.raw_text?.slice(0, 300)}
                      newContentPreview={dumpPendingTextToSubmit.slice(0, 300)}
                    />
                  </div>
                )}
              </section>

              {/* Browse - filter + list */}
              <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
                {["all", "people", "projects", "notes", "external"].map((mod) => (
                  <button
                    key={mod}
                    type="button"
                    onClick={() => setKnowledgeFilter(mod)}
                    style={{
                      padding: "6px 12px",
                      fontSize: 17,
                      fontFamily: "var(--font-sans)",
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
                    const summary = getSummaryFromStructuredData(rec.structured_data) || rec.raw_text;
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
                        <div style={{ fontSize: 16, marginBottom: 8, whiteSpace: "pre-wrap", color: text }}>
                          {summary || "(No content)"}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <span
                            style={{
                              fontSize: 17,
                              padding: "2px 6px",
                              borderRadius: 4,
                              background: "rgba(0,212,170,0.15)",
                              color: accent,
                              textTransform: "capitalize",
                              fontFamily: "var(--font-sans)",
                            }}
                          >
                            {rec.module}
                          </span>
                          {(rec.tags || []).map((tag) => (
                            <span
                              key={tag}
                              style={{
                                fontSize: 17,
                                padding: "2px 6px",
                                borderRadius: 4,
                                background: "rgba(255,255,255,0.08)",
                                color: textMuted,
                              }}
                            >
                              {tag}
                            </span>
                          ))}
                          <span style={{ fontSize: 16, color: textMuted, marginLeft: "auto" }}>
                            {formatCreatedAt(rec.created_at)}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => handleDeleteKnowledge(e, rec)}
                            title="Delete"
                            style={{
                              padding: "4px 6px",
                              fontSize: 17,
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
                  <p style={{ color: textMuted, fontSize: 16, margin: 0 }}>
                    No knowledge records{knowledgeFilter !== "all" ? ` in ${knowledgeFilter}` : ""}.
                  </p>
                )}
              </div>
            </section>
          )}

          {/* Modes Panel */}
          {mainPanelMode === "modes" && (
            <section className="nexus-panel-enter" style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
              <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
                <button
                  type="button"
                  onClick={startCreateMode}
                  style={{
                    padding: "8px 16px",
                    fontSize: 17,
                    fontFamily: "var(--font-sans)",
                    border: `1px solid ${accent}`,
                    borderRadius: 4,
                    background: accent,
                    color: bgSidebar,
                    cursor: "pointer",
                    fontWeight: 600,
                    transition: "var(--nexus-transition)",
                  }}
                >
                  Create new mode
                </button>
              </div>

              {modeFormVisible && (
                <div
                  style={{
                    marginBottom: 16,
                    padding: 16,
                    borderRadius: 4,
                    border: `1px solid ${border}`,
                    background: "rgba(0,0,0,0.2)",
                  }}
                >
                  <h3 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 600, color: text }}>
                    {editingModeId != null ? "Edit mode" : "New mode"}
                  </h3>
                  <input
                    type="text"
                    value={modeFormName}
                    onChange={(e) => setModeFormName(e.target.value)}
                    placeholder="Name"
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      marginBottom: 8,
                      border: `1px solid ${border}`,
                      borderRadius: 4,
                      fontSize: 16,
                      boxSizing: "border-box",
                      background: "rgba(0,0,0,0.2)",
                      color: text,
                    }}
                  />
                  <input
                    type="text"
                    value={modeFormTriggerPhrase}
                    onChange={(e) => setModeFormTriggerPhrase(e.target.value)}
                    placeholder="Trigger phrase (optional)"
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      marginBottom: 8,
                      border: `1px solid ${border}`,
                      borderRadius: 4,
                      fontSize: 16,
                      boxSizing: "border-box",
                      background: "rgba(0,0,0,0.2)",
                      color: text,
                    }}
                  />
                  <textarea
                    value={modeFormInstruction}
                    onChange={(e) => setModeFormInstruction(e.target.value)}
                    placeholder="Instruction"
                    rows={4}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      marginBottom: 12,
                      border: `1px solid ${border}`,
                      borderRadius: 4,
                      fontSize: 16,
                      boxSizing: "border-box",
                      background: "rgba(0,0,0,0.2)",
                      color: text,
                      resize: "vertical",
                    }}
                  />
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      onClick={submitModeForm}
                      style={{
                        padding: "8px 16px",
                        fontSize: 17,
                        border: `1px solid ${accent}`,
                        borderRadius: 4,
                        background: accent,
                        color: bgSidebar,
                        cursor: "pointer",
                        fontFamily: "var(--font-sans)",
                        fontWeight: 600,
                      }}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={cancelModeForm}
                      style={{
                        padding: "8px 16px",
                        fontSize: 17,
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
              )}

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
                {modes.map((mode) => (
                  <div
                    key={mode.id}
                    style={{
                      marginBottom: 16,
                      padding: 12,
                      borderRadius: 4,
                      background: "rgba(255,255,255,0.03)",
                      border: `1px solid ${border}`,
                    }}
                  >
                    <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4, color: text }}>{mode.name}</div>
                    {mode.trigger_phrase && (
                      <div style={{ fontSize: 16, marginBottom: 6, color: accent }}>
                        Trigger: {mode.trigger_phrase}
                      </div>
                    )}
                    <div style={{ fontSize: 16, marginBottom: 8, whiteSpace: "pre-wrap", color: text }}>
                      {mode.instruction || "(No instruction)"}
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <button
                        type="button"
                        onClick={() => handleActivateMode(mode)}
                        style={{
                          padding: "4px 10px",
                          fontSize: 16,
                          border: `1px solid ${accent}`,
                          borderRadius: 4,
                          background: activeMode?.id === mode.id ? accent : "transparent",
                          color: activeMode?.id === mode.id ? bgSidebar : accent,
                          cursor: "pointer",
                        }}
                      >
                        Activate
                      </button>
                      <button
                        type="button"
                        onClick={() => startEditMode(mode)}
                        style={{
                          padding: "4px 10px",
                          fontSize: 16,
                          border: `1px solid ${accent}`,
                          borderRadius: 4,
                          background: "transparent",
                          color: accent,
                          cursor: "pointer",
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleDeleteMode(e, mode)}
                        style={{
                          padding: "4px 10px",
                          fontSize: 16,
                          border: "none",
                          borderRadius: 4,
                          background: "transparent",
                          color: textMuted,
                          cursor: "pointer",
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
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
                {modes.length === 0 && (
                  <p style={{ color: textMuted, fontSize: 16, margin: 0 }}>No modes yet. Create one to get started.</p>
                )}
              </div>
            </section>
          )}

          {mainPanelMode === "journal" && (
            <JournalTab
              theme={{
                accent,
                bgMain,
                border,
                text,
                textMuted,
              }}
            />
          )}
          {mainPanelMode === "profile" && (
            <section className="nexus-panel-enter nexus-profile-panel" style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
              <form
                onSubmit={handleCreateProfileFacet}
                style={{
                  marginBottom: 16,
                  display: "grid",
                  gridTemplateColumns: "180px 1fr auto",
                  gap: 8,
                  alignItems: "center",
                }}
              >
                <select
                  value={profileCategory}
                  onChange={(e) => setProfileCategory(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    border: `1px solid ${border}`,
                    borderRadius: 4,
                    background: "rgba(0,0,0,0.2)",
                    color: text,
                    fontSize: 16,
                  }}
                >
                  {PROFILE_CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {formatProfileCategory(category)}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={profileContent}
                  onChange={(e) => setProfileContent(e.target.value)}
                  placeholder="Add a profile facet..."
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    border: `1px solid ${border}`,
                    borderRadius: 4,
                    background: "rgba(0,0,0,0.2)",
                    color: text,
                    fontSize: 16,
                  }}
                />
                <button
                  type="submit"
                  style={{
                    padding: "8px 14px",
                    fontSize: 16,
                    border: `1px solid ${accent}`,
                    borderRadius: 4,
                    background: "transparent",
                    color: accent,
                    cursor: "pointer",
                    fontWeight: 600,
                  }}
                >
                  Add
                </button>
              </form>
              {profileMessage && (
                <p style={{ margin: "0 0 12px", color: profileMessage.startsWith("Error:") ? "#ff6b6b" : textMuted, fontSize: 15 }}>
                  {profileMessage}
                </p>
              )}
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
                {Object.keys(profileByCategory).length === 0 && (
                  <p style={{ margin: 0, color: textMuted, fontSize: 16 }}>
                    No active profile facets yet.
                  </p>
                )}
                {Object.entries(profileByCategory).map(([category, facets]) => (
                  <div key={category} style={{ marginBottom: 20 }}>
                    <h3 style={{ margin: "0 0 10px", fontSize: 16, color: accent }}>
                      {formatProfileCategory(category)}
                    </h3>
                    {facets.map((facet) => (
                      <div
                        key={facet.id}
                        style={{
                          marginBottom: 10,
                          padding: 12,
                          borderRadius: 4,
                          background: "rgba(255,255,255,0.03)",
                          border: `1px solid ${border}`,
                        }}
                      >
                        {editingProfileId === facet.id ? (
                          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <input
                              type="text"
                              value={editingProfileContent}
                              onChange={(e) => setEditingProfileContent(e.target.value)}
                              style={{
                                flex: 1,
                                padding: "8px 10px",
                                border: `1px solid ${border}`,
                                borderRadius: 4,
                                background: "rgba(0,0,0,0.2)",
                                color: text,
                                fontSize: 15,
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => handleSaveProfileFacet(facet.id)}
                              style={{
                                padding: "6px 10px",
                                fontSize: 14,
                                border: `1px solid ${accent}`,
                                borderRadius: 4,
                                background: "transparent",
                                color: accent,
                                cursor: "pointer",
                              }}
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={cancelEditProfileFacet}
                              style={{
                                padding: "6px 10px",
                                fontSize: 14,
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
                        ) : (
                          <>
                            <div style={{ fontSize: 16, color: text, whiteSpace: "pre-wrap", marginBottom: 8 }}>
                              {facet.content}
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                              <span
                                style={{
                                  fontSize: 12,
                                  padding: "2px 6px",
                                  borderRadius: 999,
                                  background: "rgba(0,212,170,0.18)",
                                  color: accent,
                                  textTransform: "capitalize",
                                }}
                              >
                                {facet.confidence || "established"}
                              </span>
                              <span
                                style={{
                                  fontSize: 12,
                                  padding: "2px 6px",
                                  borderRadius: 999,
                                  background: "rgba(255,255,255,0.08)",
                                  color: textMuted,
                                  textTransform: "capitalize",
                                }}
                              >
                                {facet.source || "manual"}
                              </span>
                              <button
                                type="button"
                                onClick={() => startEditProfileFacet(facet)}
                                style={{
                                  marginLeft: "auto",
                                  padding: "4px 8px",
                                  fontSize: 14,
                                  border: `1px solid ${accent}`,
                                  borderRadius: 4,
                                  background: "transparent",
                                  color: accent,
                                  cursor: "pointer",
                                }}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeactivateProfileFacet(facet.id)}
                                style={{
                                  padding: "4px 8px",
                                  fontSize: 14,
                                  border: "none",
                                  borderRadius: 4,
                                  background: "transparent",
                                  color: textMuted,
                                  cursor: "pointer",
                                }}
                              >
                                Deactivate
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
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
            <p style={{ margin: "0 0 20px", color: text, fontSize: 17, lineHeight: 1.5 }}>
              Are you sure you want to delete &quot;{deleteConfirmConversation.name || "this conversation"}&quot;? This cannot be undone.
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => setDeleteConfirmConversation(null)}
                style={{
                  padding: "8px 16px",
                  fontSize: 17,
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
                  fontSize: 17,
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
