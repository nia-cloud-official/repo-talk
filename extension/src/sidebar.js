// Sidebar — uses our own JWT (fetched from background) for socket auth.
// No Clerk needed here.

import { io } from "socket.io-client";

const BACKEND_URL = process.env.BACKEND_URL;

// ── URL params ────────────────────────────────────────────────────────────────
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
const minimizeBtn = document.getElementById("minimize-btn");
const inputArea = document.getElementById("input-area");
const floatingButton = document.getElementById("floating-button");
const sidebarHeader = document.querySelector(".sidebar-header");

// ── State ─────────────────────────────────────────────────────────────────────
let socket = null;
let isConnected = false;
let currentUser = null;
let isMinimized = false;

// ── Helpers ───────────────────────────────────────────────────────────────────
function escapeHtml(text) {
  const d = document.createElement("div");
  d.textContent = text;
  return d.innerHTML;
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

function updateOnlineCount(n) {
  onlineCountEl.innerHTML = `${n} online<span class="online-indicator"></span>`;
}

function updateRoomTitle() {
  const label = type === "pr" ? "PR" : type === "issue" ? "Issue" : "Repo";
  roomTitle.textContent = `${label}: ${owner}/${repo}`;
}

function getGitHubAvatarUrl(username) {
  return `https://github.com/${username}.png`;
}

// ── Minimize/Maximize ─────────────────────────────────────────────────────────
function toggleMinimize() {
  isMinimized = !isMinimized;
  
  if (isMinimized) {
    document.body.classList.add("minimized");
    floatingButton.style.display = "flex";
  } else {
    document.body.classList.remove("minimized");
    floatingButton.style.display = "none";
    scrollToBottom();
  }
}

minimizeBtn.addEventListener("click", toggleMinimize);
floatingButton.addEventListener("click", toggleMinimize);

// ── Message rendering ─────────────────────────────────────────────────────────
function addMessageToUI(msg) {
  messagesContainer.querySelector(".status-message.empty")?.remove();
  const el = document.createElement("div");
  const isOwn = msg.username === currentUser?.username;
  el.className = `message-container ${isOwn ? "own" : ""}`;
  el.dataset.messageId = msg.id;
  
  const avatarUrl = getGitHubAvatarUrl(msg.username);
  const time = new Date(msg.created_at).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  
  el.innerHTML = `
    <div class="message-avatar">
      <img src="${avatarUrl}" alt="${escapeHtml(msg.username)}" onerror="this.parentElement.classList.add('fallback');this.remove();this.parentElement.textContent='${escapeHtml(msg.username.charAt(0).toUpperCase())}'" />
    </div>
    <div class="message-context">
      <div class="message-bubble">${escapeHtml(msg.content)}</div>
      <div class="message-time">${time}</div>
      <div class="message-reactions" id="reactions-${msg.id}"></div>
    </div>
    <div class="message-options">
      <button class="option-item" title="React" onclick="toggleReactionPicker(${msg.id})">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <path d="M8 14s1.5 2 4 2 4-2 4-2"></path>
          <line x1="9" y1="9" x2="9.01" y2="9"></line>
          <line x1="15" y1="9" x2="15.01" y2="9"></line>
        </svg>
      </button>
    </div>
    <div class="reaction-picker" id="reaction-picker-${msg.id}">
      <span class="reaction-btn" onclick="addReaction(${msg.id}, '👍')">👍</span>
      <span class="reaction-btn" onclick="addReaction(${msg.id}, '❤️')">❤️</span>
      <span class="reaction-btn" onclick="addReaction(${msg.id}, '😂')">😂</span>
      <span class="reaction-btn" onclick="addReaction(${msg.id}, '🎉')">🎉</span>
      <span class="reaction-btn" onclick="addReaction(${msg.id}, '🔥')">🔥</span>
    </div>`;
  messagesContainer.appendChild(el);
  scrollToBottom();
}

function toggleReactionPicker(messageId) {
  const picker = document.getElementById(`reaction-picker-${messageId}`);
  if (picker) {
    picker.classList.toggle("show");
  }
}

function addReaction(messageId, emoji) {
  const picker = document.getElementById(`reaction-picker-${messageId}`);
  if (picker) {
    picker.classList.remove("show");
  }
  
  if (socket && isConnected) {
    socket.emit("add_reaction", { message_id: messageId, emoji });
  }
}

function updateMessageReactions(messageId, reactions) {
  const reactionsContainer = document.getElementById(`reactions-${messageId}`);
  if (!reactionsContainer) return;
  
  reactionsContainer.innerHTML = "";
  
  const reactionCounts = {};
  reactions.forEach(r => {
    if (!reactionCounts[r.emoji]) {
      reactionCounts[r.emoji] = { count: 0, users: [] };
    }
    reactionCounts[r.emoji].count++;
    reactionCounts[r.emoji].users.push(r.username);
  });
  
  Object.entries(reactionCounts).forEach(([emoji, data]) => {
    const reactionEl = document.createElement("div");
    const hasReacted = data.users.includes(currentUser?.username);
    reactionEl.className = `reaction ${hasReacted ? 'reacted' : ''}`;
    reactionEl.textContent = `${emoji} ${data.count}`;
    reactionEl.onclick = () => addReaction(messageId, emoji);
    reactionsContainer.appendChild(reactionEl);
  });
}

function addStatusMessage(text) {
  const el = document.createElement("div");
  el.className = "status-message";
  el.textContent = text;
  messagesContainer.appendChild(el);
  scrollToBottom();
}

function showTypingIndicator(username) {
  messagesContainer.querySelector(".typing-indicator")?.remove();
  const el = document.createElement("div");
  el.className = "typing-indicator";
  el.innerHTML = `<span>${escapeHtml(username)} is typing</span>
    <div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>`;
  messagesContainer.appendChild(el);
  scrollToBottom();
  setTimeout(() => el.parentElement && el.remove(), 3000);
}

// ── Auth gate ─────────────────────────────────────────────────────────────────
function showNotAuthenticated() {
  messagesContainer.innerHTML = `
    <div class="status-message" style="padding:24px;text-align:center;line-height:1.7">
      <div style="font-size:28px;margin-bottom:10px">🔐</div>
      <strong>Sign in to chat</strong><br>
      <span style="font-size:12px;color:#8b949e">
        Open the Repo Talk extension popup and sign in with GitHub.
      </span>
    </div>`;
  messageInput.disabled = true;
  sendBtn.disabled = true;
  updateOnlineCount(0);
}

// ── Token retrieval via background ────────────────────────────────────────────
function getToken() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: "getToken" }, (response) => {
      resolve(response?.token || null);
    });
  });
}

function getCurrentUser() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["user"], (result) => {
      resolve(result.user || null);
    });
  });
}

// ── Socket connection ─────────────────────────────────────────────────────────
async function connectSocket() {
  socket?.disconnect();
  socket = null;
  isConnected = false;

  const token = await getToken();
  currentUser = await getCurrentUser();
  
  if (!token) {
    showNotAuthenticated();
    return;
  }

  messagesContainer.innerHTML = `
    <div class="loading-state"><div class="spinner"></div><span>Connecting…</span></div>`;
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
  socket.on("connect_error", () => showError("Connection error. Retrying…"));

  socket.on("room_joined", (data) => {
    clearError();
    messagesContainer.innerHTML = "";
    sendBtn.disabled = false;
    if (data.messages?.length) {
      data.messages.forEach(addMessageToUI);
    } else {
      const e = document.createElement("div");
      e.className = "status-message empty";
      e.textContent = "No messages yet. Start the conversation!";
      messagesContainer.appendChild(e);
    }
    socket.emit("get_online_users");
  });

  socket.on("error", (d) => showError(d.message || "An error occurred"));
  socket.on("receive_message", (m) => addMessageToUI(m));
  socket.on("user_joined", (d) => {
    updateOnlineCount(d.user_count || 0);
    addStatusMessage(`${d.username} joined`);
  });
  socket.on("user_left", (d) => {
    updateOnlineCount(d.user_count || 0);
    addStatusMessage(`${d.username} left`);
  });
  socket.on("user_typing", (d) => showTypingIndicator(d.username));
  socket.on("online_users", (d) => updateOnlineCount(d.count || 0));
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

// Re-connect if the token changes (user signs in/out while sidebar is open)
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && "token" in changes) {
    if (changes.token.newValue) {
      connectSocket();
    } else {
      socket?.disconnect();
      showNotAuthenticated();
    }
  }
  if (area === "local" && "user" in changes) {
    currentUser = changes.user.newValue;
  }
});

// ── Init ──────────────────────────────────────────────────────────────────────
updateRoomTitle();
connectSocket();
