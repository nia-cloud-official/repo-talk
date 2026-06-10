import { Clerk } from "@clerk/clerk-js";
import { io } from "socket.io-client";

const BACKEND_URL = process.env.BACKEND_URL;
const PUBLISHABLE_KEY = process.env.CLERK_PUBLISHABLE_KEY;
const EXTENSION_URL = chrome.runtime.getURL(".");
const SIDEBAR_URL = `${EXTENSION_URL}sidebar.html`;

// ── URL params from content.js ────────────────────────────────────────────────
const params = new URLSearchParams(window.location.search);
const roomId = params.get("roomId");
const owner = params.get("owner");
const repo = params.get("repo");
const type = params.get("type");

// ── DOM refs ──────────────────────────────────────────────────────────────────
const messagesContainer = document.getElementById("messages-container");
const messageInput = document.getElementById("message-input");
const sendBtn = document.getElementById("send-btn");
const roomTitle = document.getElementById("room-title");
const onlineCountEl = document.getElementById("online-count");
const errorDisplay = document.getElementById("error-display");

// ── State ─────────────────────────────────────────────────────────────────────
let socket = null;
let isConnected = false;

// ── Clerk ─────────────────────────────────────────────────────────────────────
const clerk = new Clerk(PUBLISHABLE_KEY);

// ── Utilities ─────────────────────────────────────────────────────────────────
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function scrollToBottom() {
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function showError(msg) {
  errorDisplay.innerHTML = `<div class="error-message">${escapeHtml(msg)}</div>`;
}

function clearError() {
  errorDisplay.innerHTML = "";
}

function updateOnlineCount(count) {
  onlineCountEl.innerHTML = `${count} online<span class="online-indicator"></span>`;
}

function updateRoomTitle() {
  const label = type === "pr" ? "PR" : type === "issue" ? "Issue" : "Repo";
  roomTitle.textContent = `${label}: ${owner}/${repo}`;
}

// ── Message UI ────────────────────────────────────────────────────────────────
function addMessageToUI(message) {
  // Clear placeholder if present
  const placeholder = messagesContainer.querySelector(".status-message.empty");
  if (placeholder) placeholder.remove();

  const el = document.createElement("div");
  el.className = "message";
  const timestamp = new Date(message.created_at);
  const timeStr = timestamp.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  const letter = message.username.charAt(0).toUpperCase();

  el.innerHTML = `
    <div class="message-avatar" title="${escapeHtml(message.username)}">${letter}</div>
    <div class="message-content">
      <div class="message-header">
        <span class="message-author">${escapeHtml(message.username)}</span>
        <span class="message-time">${timeStr}</span>
      </div>
      <div class="message-text">${escapeHtml(message.content)}</div>
    </div>
  `;

  messagesContainer.appendChild(el);
  scrollToBottom();
}

function addStatusMessage(text) {
  const el = document.createElement("div");
  el.className = "status-message";
  el.textContent = text;
  messagesContainer.appendChild(el);
  scrollToBottom();
}

function showTypingIndicator(username) {
  const existing = messagesContainer.querySelector(".typing-indicator");
  if (existing) existing.remove();

  const el = document.createElement("div");
  el.className = "typing-indicator";
  el.innerHTML = `
    <span>${escapeHtml(username)} is typing</span>
    <div class="typing-dot"></div>
    <div class="typing-dot"></div>
    <div class="typing-dot"></div>
  `;

  messagesContainer.appendChild(el);
  scrollToBottom();
  setTimeout(() => {
    if (el.parentElement) el.remove();
  }, 3000);
}

// ── Auth gate UI ──────────────────────────────────────────────────────────────
function showNotAuthenticated() {
  messagesContainer.innerHTML = `
    <div class="status-message" style="padding:24px;text-align:center;line-height:1.7">
      <div style="font-size:28px;margin-bottom:10px">🔐</div>
      <strong>Sign in to chat</strong><br>
      <span style="font-size:12px;color:#888">
        Open the Repo Talk extension popup and sign in with GitHub.
      </span>
    </div>
  `;
  messageInput.disabled = true;
  sendBtn.disabled = true;
  updateOnlineCount(0);
}

// ── Socket connection ─────────────────────────────────────────────────────────
async function connectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
    isConnected = false;
  }

  const token = await clerk.session?.getToken();
  if (!token) {
    showNotAuthenticated();
    return;
  }

  messagesContainer.innerHTML = `
    <div class="loading-state">
      <div class="spinner"></div>
      <span>Connecting to chat...</span>
    </div>
  `;
  messageInput.disabled = false;
  sendBtn.disabled = true;

  socket = io(BACKEND_URL, {
    auth: { token },
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: 5,
  });

  socket.on("connect", () => {
    isConnected = true;
    socket.emit("join_room", { room_id: roomId });
  });

  socket.on("disconnect", () => {
    isConnected = false;
    sendBtn.disabled = true;
    updateOnlineCount(0);
  });

  socket.on("connect_error", () => {
    showError("Connection error. Retrying...");
  });

  socket.on("room_joined", (data) => {
    clearError();
    messagesContainer.innerHTML = "";
    sendBtn.disabled = false;

    if (data.messages?.length > 0) {
      data.messages.forEach((msg) => addMessageToUI(msg));
    } else {
      const empty = document.createElement("div");
      empty.className = "status-message empty";
      empty.textContent = "No messages yet. Start the conversation!";
      messagesContainer.appendChild(empty);
    }

    socket.emit("get_online_users");
  });

  socket.on("error", (data) => {
    showError(data.message || "An error occurred");
  });

  socket.on("receive_message", (message) => {
    addMessageToUI(message);
  });

  socket.on("user_joined", (data) => {
    updateOnlineCount(data.user_count || 0);
    addStatusMessage(`${data.username} joined the chat`);
  });

  socket.on("user_left", (data) => {
    updateOnlineCount(data.user_count || 0);
    addStatusMessage(`${data.username} left the chat`);
  });

  socket.on("user_typing", (data) => {
    showTypingIndicator(data.username);
  });

  socket.on("online_users", (data) => {
    updateOnlineCount(data.count || 0);
  });
}

// ── Send message ──────────────────────────────────────────────────────────────
async function sendMessage() {
  const content = messageInput.value.trim();
  if (!content || !socket || !isConnected) return;

  messageInput.value = "";
  messageInput.style.height = "auto";
  sendBtn.disabled = true;
  socket.emit("send_message", { content });
  setTimeout(() => {
    if (isConnected) sendBtn.disabled = false;
  }, 100);
}

messageInput.addEventListener("input", () => {
  messageInput.style.height = "auto";
  messageInput.style.height = Math.min(messageInput.scrollHeight, 80) + "px";
  if (socket && isConnected) socket.emit("typing", {});
});

messageInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

sendBtn.addEventListener("click", sendMessage);

// ── Render (called on auth state changes) ─────────────────────────────────────
async function render() {
  updateRoomTitle();

  if (clerk.user) {
    await connectSocket();
  } else {
    if (socket) {
      socket.disconnect();
      socket = null;
      isConnected = false;
    }
    showNotAuthenticated();
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────
clerk
  .load({
    afterSignOutUrl: SIDEBAR_URL,
    signInForceRedirectUrl: SIDEBAR_URL,
    signUpForceRedirectUrl: SIDEBAR_URL,
    allowedRedirectProtocols: ["chrome-extension:"],
  })
  .then(() => {
    clerk.addListener(render); // re-render on sign-in / sign-out
    render();
  });
