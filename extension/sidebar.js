const BACKEND_URL = 'http://localhost:3000';

// Get query parameters
const params = new URLSearchParams(window.location.search);
const roomId = params.get('roomId');
const owner = params.get('owner');
const repo = params.get('repo');
const type = params.get('type');

// DOM elements
const messagesContainer = document.getElementById('messages-container');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const roomTitle = document.getElementById('room-title');
const onlineCount = document.getElementById('online-count');
const errorDisplay = document.getElementById('error-display');

let socket = null;
let isConnected = false;
let currentUser = null;
let onlineUsers = 0;
let typingTimeout = null;

// Get token from parent window
async function getToken() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['token'], (result) => {
      resolve(result.token);
    });
  });
}

// Get user from storage
async function getUser() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['user'], (result) => {
      resolve(result.user);
    });
  });
}

// Initialize Socket.io connection
async function initializeSocket() {
  const token = await getToken();

  if (!token) {
    showError('Not authenticated. Please log in.');
    return;
  }

  socket = io(BACKEND_URL, {
    auth: {
      token,
    },
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: 5,
  });

  // Connection events
  socket.on('connect', () => {
    console.log('Connected to chat server');
    isConnected = true;
    sendBtn.disabled = false;

    // Join room
    socket.emit('join_room', { room_id: roomId });
  });

  socket.on('disconnect', () => {
    console.log('Disconnected from chat server');
    isConnected = false;
    sendBtn.disabled = true;
    onlineUsers = 0;
    updateOnlineCount();
  });

  socket.on('connect_error', (error) => {
    console.error('Connection error:', error);
    showError('Connection error. Retrying...');
  });

  // Room events
  socket.on('room_joined', (data) => {
    console.log('Joined room:', roomId);
    clearError();
    messagesContainer.innerHTML = '';
    
    // Load initial messages
    if (data.messages && data.messages.length > 0) {
      data.messages.forEach(msg => addMessageToUI(msg));
    } else {
      messagesContainer.innerHTML = '<div class="status-message">No messages yet. Start the conversation!</div>';
    }

    // Request online user count
    socket.emit('get_online_users');
  });

  socket.on('error', (data) => {
    console.error('Socket error:', data);
    showError(data.message || 'An error occurred');
  });

  // Message events
  socket.on('receive_message', (message) => {
    addMessageToUI(message);
    scrollToBottom();
  });

  socket.on('user_joined', (data) => {
    onlineUsers = data.user_count || 0;
    updateOnlineCount();
    addStatusMessage(`${data.username} joined the chat`);
  });

  socket.on('user_left', (data) => {
    onlineUsers = data.user_count || 0;
    updateOnlineCount();
    addStatusMessage(`${data.username} left the chat`);
  });

  socket.on('user_typing', (data) => {
    showTypingIndicator(data.username);
  });

  socket.on('online_users', (data) => {
    onlineUsers = data.count || 0;
    updateOnlineCount();
  });
}

// Add message to UI
function addMessageToUI(message) {
  if (!messagesContainer.querySelector('.status-message')) {
    // Remove "no messages" message if it exists
    const statusMsg = messagesContainer.querySelector('.status-message');
    if (statusMsg && statusMsg.textContent.includes('No messages')) {
      statusMsg.remove();
    }
  }

  const messageEl = document.createElement('div');
  messageEl.className = 'message';
  
  const timestamp = new Date(message.created_at);
  const timeStr = timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const avatarLetter = message.username.charAt(0).toUpperCase();

  messageEl.innerHTML = `
    <div class="message-avatar" title="${message.username}">
      ${avatarLetter}
    </div>
    <div class="message-content">
      <div class="message-header">
        <span class="message-author">${escapeHtml(message.username)}</span>
        <span class="message-time">${timeStr}</span>
      </div>
      <div class="message-text">${escapeHtml(message.content)}</div>
    </div>
  `;

  messagesContainer.appendChild(messageEl);
  scrollToBottom();
}

// Add status message
function addStatusMessage(text) {
  const statusEl = document.createElement('div');
  statusEl.className = 'status-message';
  statusEl.textContent = text;
  messagesContainer.appendChild(statusEl);
  scrollToBottom();
}

// Show typing indicator
function showTypingIndicator(username) {
  // Remove existing typing indicator
  const existing = messagesContainer.querySelector('.typing-indicator');
  if (existing) {
    existing.remove();
  }

  const typingEl = document.createElement('div');
  typingEl.className = 'typing-indicator';
  typingEl.innerHTML = `
    <span>${username} is typing</span>
    <div class="typing-dot"></div>
    <div class="typing-dot"></div>
    <div class="typing-dot"></div>
  `;

  messagesContainer.appendChild(typingEl);
  scrollToBottom();

  // Remove after 3 seconds
  setTimeout(() => {
    if (typingEl.parentElement) {
      typingEl.remove();
    }
  }, 3000);
}

// Scroll to bottom
function scrollToBottom() {
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Update online count
function updateOnlineCount() {
  onlineCount.innerHTML = `${onlineUsers} online<span class="online-indicator"></span>`;
}

// Update room title
function updateRoomTitle() {
  const typeStr = type === 'pr' ? 'PR' : type === 'issue' ? 'Issue' : 'Repo';
  roomTitle.textContent = `${typeStr}: ${owner}/${repo}`;
}

// Show error
function showError(message) {
  const errorEl = document.createElement('div');
  errorEl.className = 'error-message';
  errorEl.textContent = message;
  errorDisplay.innerHTML = '';
  errorDisplay.appendChild(errorEl);
}

// Clear error
function clearError() {
  errorDisplay.innerHTML = '';
}

// Escape HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Auto-resize textarea
messageInput.addEventListener('input', () => {
  messageInput.style.height = 'auto';
  messageInput.style.height = Math.min(messageInput.scrollHeight, 80) + 'px';

  // Send typing indicator
  if (socket && isConnected) {
    socket.emit('typing', {});
  }

  // Clear typing timeout
  if (typingTimeout) {
    clearTimeout(typingTimeout);
  }
});

// Send message
async function sendMessage() {
  const content = messageInput.value.trim();

  if (!content) return;
  if (!socket || !isConnected) {
    showError('Not connected to chat server');
    return;
  }

  messageInput.value = '';
  messageInput.style.height = 'auto';
  sendBtn.disabled = true;

  try {
    socket.emit('send_message', { content });
    
    // Re-enable button after response
    setTimeout(() => {
      if (isConnected) {
        sendBtn.disabled = false;
      }
    }, 100);
  } catch (error) {
    console.error('Send error:', error);
    showError('Failed to send message');
    sendBtn.disabled = false;
  }
}

// Send button click
sendBtn.addEventListener('click', sendMessage);

// Enter to send (Shift+Enter for newline)
messageInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

// Initialize
async function initialize() {
  currentUser = await getUser();
  updateRoomTitle();
  await initializeSocket();
}

// Start
initialize();
