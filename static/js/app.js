/**
 * app.js — BT Chat Frontend Application
 * Connects to Flask + Socket.IO backend.
 *
 * Configure BACKEND_URL below to point to your server.
 */

/* ─────────────────── CONFIG ─────────────────── */
const BACKEND_URL = window.location.origin; // change if backend is on a different host/port
const MSG_PAGE_SIZE = 40;

/* ─────────────────── STATE ─────────────────── */
const State = {
  user: null,           // { btid }
  socket: null,
  currentPeer: null,    // btid of open chat
  friends: [],          // [{btid, online, lastMsg, lastTime, unread}]
  pendingRequests: [],  // [{sender, timestamp}]
  messages: {},         // { btid: [msg, ...] }
  msgOffsets: {},       // { btid: offset } for pagination
  typingTimers: {},
  unreadCounts: {},     // { btid: n }
  searchDebounce: null,
  chatSearchMatches: [],
  chatSearchIdx: 0,
};

/* ─────────────────── DOM HELPERS ─────────────────── */
const $ = id => document.getElementById(id);
const qs = (sel, ctx = document) => ctx.querySelector(sel);
const qsa = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

function escHtml(s) {
  return String(s)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}

function makeAvatar(btid) {
  return btid ? btid[0].toUpperCase() : '?';
}

function relativeTime(ts) {
  if (!ts) return '';
  const d = new Date(typeof ts === 'number' ? ts * 1000 : ts);
  const diff = (Date.now() - d) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return d.toLocaleDateString();
}

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(typeof ts === 'number' ? ts * 1000 : ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDate(ts) {
  if (!ts) return '';
  const d = new Date(typeof ts === 'number' ? ts * 1000 : ts);
  const today = new Date();
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
}

/* ─────────────────── TOAST ─────────────────── */
function toast(type, title, msg = '', duration = 3500) {
  const icons = { success: 'fa-circle-check', error: 'fa-circle-xmark', info: 'fa-circle-info', warning: 'fa-triangle-exclamation' };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `
    <i class="fa-solid ${icons[type] || icons.info} toast-icon"></i>
    <div class="toast-body">
      <div class="toast-title">${escHtml(title)}</div>
      ${msg ? `<div class="toast-msg">${escHtml(msg)}</div>` : ''}
    </div>
    <span class="toast-close"><i class="fa-solid fa-xmark"></i></span>`;
  const container = $('toast-container');
  container.appendChild(el);
  const close = () => {
    el.classList.add('leaving');
    setTimeout(() => el.remove(), 300);
  };
  qs('.toast-close', el).addEventListener('click', close);
  setTimeout(close, duration);
}

/* ─────────────────── CONFIRM DIALOG ─────────────────── */
function confirm(title, message) {
  return new Promise(resolve => {
    $('confirm-title').textContent = title;
    $('confirm-message').textContent = message;
    const modal = $('confirm-modal');
    modal.classList.remove('hidden');
    const ok = $('confirm-ok');
    const cancel = $('confirm-cancel');
    function cleanup(val) {
      modal.classList.add('hidden');
      ok.replaceWith(ok.cloneNode(true));
      cancel.replaceWith(cancel.cloneNode(true));
      resolve(val);
    }
    $('confirm-ok').addEventListener('click', () => cleanup(true), { once: true });
    $('confirm-cancel').addEventListener('click', () => cleanup(false), { once: true });
  });
}

/* ─────────────────── CONNECTION BAR ─────────────────── */
let connBar = null;
function showConnBar(msg) {
  if (!connBar) {
    connBar = document.createElement('div');
    connBar.className = 'conn-bar';
    document.body.appendChild(connBar);
  }
  connBar.textContent = msg;
  setTimeout(() => connBar.classList.add('visible'), 10);
}
function hideConnBar() {
  if (connBar) connBar.classList.remove('visible');
}

/* ─────────────────── SESSION / LOCAL STORAGE ─────────────────── */
function saveSession(btid) {
  try { localStorage.setItem('btchat_user', btid); } catch (_) {}
}
function loadSession() {
  try { return localStorage.getItem('btchat_user'); } catch (_) { return null; }
}
function clearSession() {
  try { localStorage.removeItem('btchat_user'); } catch (_) {}
}
function saveDraft(btid, text) {
  try { localStorage.setItem(`btchat_draft_${btid}`, text); } catch (_) {}
}
function loadDraft(btid) {
  try { return localStorage.getItem(`btchat_draft_${btid}`) || ''; } catch (_) { return ''; }
}

/* ─────────────────── API ─────────────────── */
async function api(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);
  try {
    const res = await fetch(`${BACKEND_URL}${path}`, opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || data.error || `HTTP ${res.status}`);
    return data;
  } catch (err) {
    if (err.name === 'TypeError') throw new Error('Network error — is the server running?');
    throw err;
  }
}

/* ─────────────────── AUTH SCREEN ─────────────────── */
function initAuth() {
  // Tab switching
  qsa('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Toggle password visibility
  qsa('.toggle-pass').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = btn.previousElementSibling;
      const isText = input.type === 'text';
      input.type = isText ? 'password' : 'text';
      btn.innerHTML = `<i class="fa-regular fa-eye${isText ? '' : '-slash'}"></i>`;
    });
  });

  // Login
  $('login-btn').addEventListener('click', doLogin);
  $('login-pass').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });

  // Register
  $('register-btn').addEventListener('click', doRegister);
  $('reg-pass2').addEventListener('keydown', e => { if (e.key === 'Enter') doRegister(); });

  // Real-time validation
  $('reg-btid').addEventListener('input', debounce(validateBtid, 400));
  $('reg-pass').addEventListener('input', () => {
    const v = $('reg-pass').value;
    showFieldError('reg-pass-err', v.length > 0 && v.length < 6 ? 'At least 6 characters' : '');
  });
  $('reg-pass2').addEventListener('input', () => {
    const match = $('reg-pass').value === $('reg-pass2').value;
    showFieldError('reg-pass2-err', $('reg-pass2').value && !match ? 'Passwords do not match' : '');
  });
}

function switchTab(tab) {
  qsa('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  qsa('.auth-form').forEach(f => f.classList.toggle('active', f.id === `tab-${tab}`));
  const indicator = qs('.tab-indicator');
  indicator.classList.toggle('right', tab === 'register');
  clearAuthErrors();
}

function showFieldError(id, msg) {
  const el = $(id);
  if (el) el.textContent = msg;
}

function clearAuthErrors() {
  qsa('.field-error').forEach(e => e.textContent = '');
  qsa('.availability-indicator').forEach(e => { e.textContent = ''; });
}

async function validateBtid() {
  const btid = $('reg-btid').value.trim();
  const avail = $('btid-avail');
  if (!btid) { avail.textContent = ''; return; }
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(btid)) {
    avail.innerHTML = '<i class="fa-solid fa-xmark" style="color:var(--danger)"></i>';
    showFieldError('reg-btid-err', '3-20 chars: letters, numbers, underscore');
    return;
  }
  showFieldError('reg-btid-err', '');
  avail.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin" style="color:var(--text-muted)"></i>';
  try {
    const data = await api('GET', `/api/search?q=${encodeURIComponent(btid)}&current_user=__none__`);
    const taken = (data.users || []).some(u => u.btid === btid);
    avail.innerHTML = taken
      ? '<i class="fa-solid fa-xmark" style="color:var(--danger)"></i>'
      : '<i class="fa-solid fa-check" style="color:var(--success)"></i>';
  } catch (_) { avail.textContent = ''; }
}

function setBtnLoading(btnId, loading) {
  const btn = $(btnId);
  qs('.btn-label', btn)?.classList.toggle('hidden', loading);
  qs('.btn-spinner', btn)?.classList.toggle('hidden', !loading);
  btn.disabled = loading;
}

async function doLogin() {
  const btid = $('login-btid').value.trim();
  const pass = $('login-pass').value;
  clearAuthErrors();
  if (!btid) { showFieldError('login-btid-err', 'BT ID required'); return; }
  if (!pass) { showFieldError('login-pass-err', 'Password required'); return; }
  setBtnLoading('login-btn', true);
  try {
    await api('POST', '/api/login', { btid, password: pass });
    onLoginSuccess(btid);
  } catch (err) {
    showFieldError('login-pass-err', err.message);
  } finally {
    setBtnLoading('login-btn', false);
  }
}

async function doRegister() {
  const btid = $('reg-btid').value.trim();
  const pass = $('reg-pass').value;
  const pass2 = $('reg-pass2').value;
  clearAuthErrors();
  if (!btid) { showFieldError('reg-btid-err', 'BT ID required'); return; }
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(btid)) { showFieldError('reg-btid-err', 'Invalid format'); return; }
  if (pass.length < 6) { showFieldError('reg-pass-err', 'At least 6 characters'); return; }
  if (pass !== pass2) { showFieldError('reg-pass2-err', 'Passwords do not match'); return; }
  setBtnLoading('register-btn', true);
  try {
    await api('POST', '/api/createuser', { btid, password: pass });
    toast('success', 'Account created!', 'You can now sign in.');
    switchTab('login');
    $('login-btid').value = btid;
  } catch (err) {
    showFieldError('reg-btid-err', err.message);
  } finally {
    setBtnLoading('register-btn', false);
  }
}

/* ─────────────────── LOGIN SUCCESS ─────────────────── */
function onLoginSuccess(btid) {
  State.user = { btid };
  saveSession(btid);
  $('auth-screen').classList.add('hidden');
  $('app-screen').classList.remove('hidden');
  $('my-btid-label').textContent = btid;
  $('my-avatar').textContent = makeAvatar(btid);
  initSocket();
  loadFriends();
  initEmojiPicker();
}

/* ─────────────────── LOGOUT ─────────────────── */
async function doLogout() {
  try {
    await api('PUT', `/api/user/${State.user.btid}/status`, { status: 'offline' });
  } catch (_) {}
  if (State.socket) State.socket.disconnect();
  State.user = null;
  State.currentPeer = null;
  State.friends = [];
  State.messages = {};
  State.pendingRequests = [];
  clearSession();
  $('app-screen').classList.add('hidden');
  $('auth-screen').classList.remove('hidden');
  $('login-btid').value = '';
  $('login-pass').value = '';
  $('friends-list').innerHTML = '<li class="empty-state"><i class="fa-regular fa-comment-dots"></i><span>No conversations yet</span></li>';
}

/* ─────────────────── SOCKET.IO ─────────────────── */
function initSocket() {
  const socket = io(BACKEND_URL, { transports: ['websocket', 'polling'], reconnectionAttempts: 10, reconnectionDelay: 1500 });
  State.socket = socket;

  socket.on('connect', () => {
    hideConnBar();
    socket.emit('identify', { btid: State.user.btid });
  });
  socket.on('disconnect', () => {
    showConnBar('⚠ Disconnected — reconnecting…');
  });
  socket.on('connect_error', () => {
    showConnBar('⚠ Cannot reach server');
  });

  socket.on('authenticated', data => {
    if (data.status === 'ok') {
      console.log('[Socket] Authenticated as', data.user);
    }
  });

  socket.on('receive_private_message', data => {
    const { msg_id, sender, msg, timestamp } = data;
    addMessage(sender, { id: msg_id, sender, msg, timestamp, read: false });
    // Send read receipt if chat is open
    if (State.currentPeer === sender) {
      socket.emit('message_read', { reader: State.user.btid, sender, msg_id });
    } else {
      incrementUnread(sender);
    }
    updateFriendLastMsg(sender, msg, timestamp);
    AudioManager.playReceive();
    if (State.currentPeer !== sender) {
      toast('info', sender, msg.length > 60 ? msg.slice(0, 60) + '…' : msg, 4000);
    }
  });

  socket.on('message_sent', ({ msg_id, status }) => {
    if (status === 'sent') markMsgDelivered(msg_id);
  });

  socket.on('message_read_receipt', ({ msg_id, reader, timestamp }) => {
    markMsgRead(msg_id, reader);
  });

  socket.on('chat_history', ({ user1, user2, messages }) => {
    const peer = user1 === State.user.btid ? user2 : user1;
    const msgs = messages || [];
    if (!State.messages[peer]) State.messages[peer] = [];
    // Prepend (older) messages
    State.messages[peer] = [...msgs, ...State.messages[peer].filter(m => !msgs.find(h => h.id === m.id || h.msg_id === m.msg_id))];
    State.msgOffsets[peer] = (State.msgOffsets[peer] || 0) + msgs.length;
    if (State.currentPeer === peer) renderMessages(peer, true);
  });

  socket.on('friend_online', ({ btid }) => {
    updateFriendStatus(btid, true);
    if (State.currentPeer === btid) {
      $('chat-peer-status').textContent = 'Online';
      $('chat-peer-status').className = 'peer-status online-text';
      $('chat-peer-status-dot').className = 'status-dot online';
    }
  });

  socket.on('friend_offline', ({ btid }) => {
    updateFriendStatus(btid, false);
    if (State.currentPeer === btid) {
      $('chat-peer-status').textContent = 'Offline';
      $('chat-peer-status').className = 'peer-status';
      $('chat-peer-status-dot').className = 'status-dot';
    }
  });

  socket.on('friend_request_received', ({ sender, timestamp }) => {
    State.pendingRequests.push({ sender, timestamp });
    renderPendingBanner();
    AudioManager.playFriendRequest();
    toast('info', 'Friend Request', `${sender} sent you a friend request.`);
  });

  socket.on('friend_accepted', ({ friend, timestamp }) => {
    toast('success', 'Friend Added', `${friend} accepted your request!`);
    loadFriends();
  });

  socket.on('friend_typing_start', ({ sender }) => {
    if (State.currentPeer === sender) showTyping();
  });
  socket.on('friend_typing_stop', ({ sender }) => {
    if (State.currentPeer === sender) hideTyping();
  });

  socket.on('error', ({ message }) => {
    toast('error', 'Error', message);
  });
}

/* ─────────────────── FRIENDS ─────────────────── */
async function loadFriends() {
  try {
    const data = await api('GET', `/api/friends/${State.user.btid}`);
    State.friends = (data.friends || []).map(f => ({
      btid: f.btid,
      online: f.status === 'online',
      lastMsg: f.last_message || '',
      lastTime: f.last_message_time || null,
      unread: State.unreadCounts[f.btid] || 0,
    }));
    State.pendingRequests = (data.pending_requests || []);
    renderFriendsList();
    renderPendingBanner();
    // Join chat rooms
    State.friends.forEach(f => {
      State.socket?.emit('join_chat_room', { user: State.user.btid, friend: f.btid });
    });
  } catch (err) {
    toast('error', 'Failed to load friends', err.message);
  }
}

function renderFriendsList() {
  const list = $('friends-list');
  if (!State.friends.length) {
    list.innerHTML = '<li class="empty-state"><i class="fa-regular fa-comment-dots"></i><span>No conversations yet</span></li>';
    return;
  }
  // Sort: unread first, then by last message time
  const sorted = [...State.friends].sort((a, b) => {
    if (b.unread !== a.unread) return b.unread - a.unread;
    if (b.lastTime && a.lastTime) return new Date(b.lastTime) - new Date(a.lastTime);
    return 0;
  });
  list.innerHTML = sorted.map(f => friendItemHTML(f)).join('');
  qsa('.friend-item', list).forEach(item => {
    item.addEventListener('click', () => openChat(item.dataset.btid));
  });
}

function friendItemHTML(f) {
  const unread = State.unreadCounts[f.btid] || 0;
  return `
  <li class="friend-item${State.currentPeer === f.btid ? ' active' : ''}" data-btid="${escHtml(f.btid)}">
    <div class="avatar-wrap">
      <div class="avatar">${makeAvatar(f.btid)}</div>
      <span class="status-dot${f.online ? ' online' : ''}"></span>
    </div>
    <div class="friend-meta">
      <span class="friend-btid">${escHtml(f.btid)}</span>
      <span class="friend-last-msg">${escHtml(f.lastMsg || '')}</span>
    </div>
    <div class="friend-right">
      <span class="friend-time">${relativeTime(f.lastTime)}</span>
      ${unread ? `<span class="unread-badge">${unread > 99 ? '99+' : unread}</span>` : ''}
    </div>
  </li>`;
}

function updateFriendStatus(btid, online) {
  const f = State.friends.find(x => x.btid === btid);
  if (f) { f.online = online; renderFriendsList(); }
}

function updateFriendLastMsg(btid, msg, timestamp) {
  let f = State.friends.find(x => x.btid === btid);
  if (!f) { State.friends.push({ btid, online: false, lastMsg: msg, lastTime: timestamp, unread: 0 }); }
  else { f.lastMsg = msg; f.lastTime = timestamp; }
  renderFriendsList();
}

function incrementUnread(btid) {
  State.unreadCounts[btid] = (State.unreadCounts[btid] || 0) + 1;
  renderFriendsList();
}

function clearUnread(btid) {
  State.unreadCounts[btid] = 0;
  renderFriendsList();
}

/* ─────────────────── PENDING REQUESTS ─────────────────── */
function renderPendingBanner() {
  const n = State.pendingRequests.length;
  if (n) {
    $('pending-banner').classList.remove('hidden');
    $('pending-count-text').textContent = `${n} pending request${n > 1 ? 's' : ''}`;
  } else {
    $('pending-banner').classList.add('hidden');
    $('requests-panel').classList.add('hidden');
  }
}

function renderRequestsList() {
  const list = $('requests-list');
  list.innerHTML = State.pendingRequests.map(r => `
    <div class="request-item" data-sender="${escHtml(r.sender)}">
      <div class="avatar">${makeAvatar(r.sender)}</div>
      <span class="request-btid">${escHtml(r.sender)}</span>
      <div class="request-actions">
        <button class="req-accept-btn"><i class="fa-solid fa-check"></i></button>
        <button class="req-reject-btn"><i class="fa-solid fa-xmark"></i></button>
      </div>
    </div>`).join('');

  qsa('.req-accept-btn', list).forEach(btn => {
    const sender = btn.closest('.request-item').dataset.sender;
    btn.addEventListener('click', () => acceptRequest(sender));
  });
  qsa('.req-reject-btn', list).forEach(btn => {
    const sender = btn.closest('.request-item').dataset.sender;
    btn.addEventListener('click', () => rejectRequest(sender));
  });
}

async function acceptRequest(sender) {
  try {
    await api('POST', '/api/friend/accept', { user: State.user.btid, friend: sender });
    State.pendingRequests = State.pendingRequests.filter(r => r.sender !== sender);
    renderPendingBanner();
    renderRequestsList();
    toast('success', 'Friend added!', sender);
    loadFriends();
  } catch (err) { toast('error', 'Failed', err.message); }
}

async function rejectRequest(sender) {
  try {
    await api('POST', '/api/friend/reject', { user: State.user.btid, friend: sender });
    State.pendingRequests = State.pendingRequests.filter(r => r.sender !== sender);
    renderPendingBanner();
    renderRequestsList();
    toast('info', 'Request rejected');
  } catch (err) { toast('error', 'Failed', err.message); }
}

/* ─────────────────── SEARCH ─────────────────── */
function initSearch() {
  $('search-toggle-btn').addEventListener('click', () => {
    $('search-bar-wrap').classList.remove('hidden');
    $('global-search').focus();
  });
  $('search-close').addEventListener('click', () => {
    $('search-bar-wrap').classList.add('hidden');
    $('global-search').value = '';
    $('search-results').innerHTML = '';
  });
  $('global-search').addEventListener('input', debounce(async () => {
    const q = $('global-search').value.trim();
    if (!q) { $('search-results').innerHTML = ''; return; }
    try {
      const data = await api('GET', `/api/search?q=${encodeURIComponent(q)}&current_user=${encodeURIComponent(State.user.btid)}`);
      renderSearchResults(data.users || []);
    } catch (_) {}
  }, 350));
}

function renderSearchResults(users) {
  const container = $('search-results');
  if (!users.length) { container.innerHTML = '<div style="padding:10px;text-align:center;font-size:13px;color:var(--text-muted)">No users found</div>'; return; }
  container.innerHTML = users.map(u => {
    const isFriend = State.friends.some(f => f.btid === u.btid);
    return `
    <div class="search-result-item" data-btid="${escHtml(u.btid)}">
      <div class="avatar" style="width:32px;height:32px;font-size:12px">${makeAvatar(u.btid)}</div>
      <span class="search-result-btid">${escHtml(u.btid)}</span>
      ${isFriend
        ? `<button class="search-result-btn" data-action="chat">Message</button>`
        : `<button class="search-result-btn" data-action="add">Add</button>`}
    </div>`;
  }).join('');
  qsa('[data-action="chat"]', container).forEach(btn => {
    const btid = btn.closest('[data-btid]').dataset.btid;
    btn.addEventListener('click', () => { openChat(btid); $('search-close').click(); });
  });
  qsa('[data-action="add"]', container).forEach(btn => {
    const btid = btn.closest('[data-btid]').dataset.btid;
    btn.addEventListener('click', () => sendFriendRequest(btid));
  });
}

/* ─────────────────── OPEN CHAT ─────────────────── */
function openChat(btid) {
  State.currentPeer = btid;
  clearUnread(btid);

  // Update sidebar highlight
  qsa('.friend-item').forEach(item => item.classList.toggle('active', item.dataset.btid === btid));

  // Show chat view
  $('chat-empty').classList.add('hidden');
  $('chat-view').classList.remove('hidden');

  // Update header
  $('chat-peer-avatar').textContent = makeAvatar(btid);
  $('chat-peer-btid').textContent = btid;
  const friend = State.friends.find(f => f.btid === btid);
  const isOnline = friend?.online;
  $('chat-peer-status').textContent = isOnline ? 'Online' : 'Offline';
  $('chat-peer-status').className = `peer-status${isOnline ? ' online-text' : ''}`;
  $('chat-peer-status-dot').className = `status-dot${isOnline ? ' online' : ''}`;

  // Load draft
  const draft = loadDraft(btid);
  const input = $('message-input');
  input.textContent = draft;
  if (draft) toggleSendBtn(true);

  // Join room & load history
  State.socket?.emit('join_chat_room', { user: State.user.btid, friend: btid });
  if (!State.messages[btid] || !State.messages[btid].length) {
    requestHistory(btid);
  } else {
    renderMessages(btid);
  }

  // Mobile: close sidebar
  if (window.innerWidth <= 768) {
    $('sidebar').classList.remove('open');
    $('sidebar-overlay').classList.add('hidden');
  }

  input.focus();
}

/* ─────────────────── HISTORY ─────────────────── */
function requestHistory(btid, loadMore = false) {
  const offset = loadMore ? (State.msgOffsets[btid] || 0) : 0;
  if (!loadMore) { State.messages[btid] = []; State.msgOffsets[btid] = 0; }
  State.socket?.emit('get_chat_history', { user1: State.user.btid, user2: btid, limit: MSG_PAGE_SIZE, offset });
}

/* ─────────────────── RENDER MESSAGES ─────────────────── */
function renderMessages(btid, prepend = false) {
  const container = $('messages-list');
  const msgs = State.messages[btid] || [];

  if (!prepend) {
    container.innerHTML = '';
    // Render all messages grouped by date and sender
    let lastDate = null;
    let lastSender = null;
    msgs.forEach(msg => {
      const msgDate = formatDate(msg.timestamp);
      if (msgDate !== lastDate) {
        container.insertAdjacentHTML('beforeend', `<div class="date-divider">${escHtml(msgDate)}</div>`);
        lastDate = msgDate;
        lastSender = null;
      }
      appendMessageDOM(msg, container, lastSender !== msg.sender);
      lastSender = msg.sender;
    });
    scrollToBottom();
  } else {
    // Prepend older messages (re-render fully for simplicity)
    renderMessages(btid, false);
  }

  // Show/hide load more
  $('load-more-btn').style.display = msgs.length >= MSG_PAGE_SIZE ? 'inline-flex' : 'none';
}

function appendMessageDOM(msg, container, showAvatar = true) {
  const isSent = msg.sender === State.user.btid;
  const msgId = msg.id || msg.msg_id || Math.random().toString(36).slice(2);
  const html = `
  <div class="msg-group ${isSent ? 'sent' : 'received'}" data-msg-id="${escHtml(String(msgId))}">
    <div class="msg-row">
      <div class="bubble">${formatMsgContent(msg.msg)}</div>
    </div>
    <div class="msg-meta">
      <span class="msg-time">${formatTime(msg.timestamp)}</span>
      ${isSent ? `<span class="read-status${msg.read ? ' seen' : ''}" title="${msg.read ? 'Seen' : 'Delivered'}"><i class="fa-solid fa-${msg.read ? 'check-double' : 'check'}"></i></span>` : ''}
    </div>
  </div>`;
  container.insertAdjacentHTML('beforeend', html);
}

function addMessage(peer, msg) {
  if (!State.messages[peer]) State.messages[peer] = [];
  // Avoid duplicate
  if (State.messages[peer].some(m => (m.id || m.msg_id) === (msg.id || msg.msg_id))) return;
  State.messages[peer].push(msg);
  if (State.currentPeer === peer) {
    appendMessageDOM(msg, $('messages-list'));
    scrollToBottom();
  }
}

function markMsgDelivered(msg_id) {
  const el = qs(`[data-msg-id="${CSS.escape(String(msg_id))}"] .read-status`);
  if (el) {
    el.className = 'read-status';
    el.title = 'Delivered';
    el.innerHTML = '<i class="fa-solid fa-check"></i>';
  }
}

function markMsgRead(msg_id, reader) {
  const el = qs(`[data-msg-id="${CSS.escape(String(msg_id))}"] .read-status`);
  if (el) {
    el.className = 'read-status seen';
    el.title = `Seen by ${reader}`;
    el.innerHTML = '<i class="fa-solid fa-check-double"></i>';
  }
  // Update state
  if (State.messages[reader]) {
    const m = State.messages[reader].find(x => (x.id || x.msg_id) === msg_id);
    if (m) m.read = true;
  }
}

function formatMsgContent(text) {
  // Sanitize then linkify URLs, preserve newlines
  let s = escHtml(text)
    .replace(/\n/g, '<br>')
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer" style="color:inherit;text-decoration:underline">$1</a>');
  return s;
}

function scrollToBottom() {
  const c = $('messages-container');
  requestAnimationFrame(() => { c.scrollTop = c.scrollHeight; });
}

/* ─────────────────── SEND MESSAGE ─────────────────── */
function initMessageInput() {
  const input = $('message-input');
  const sendBtn = $('send-btn');
  let typingActive = false;
  let typingTimer = null;

  input.addEventListener('input', () => {
    const hasContent = input.textContent.trim().length > 0;
    toggleSendBtn(hasContent);
    saveDraft(State.currentPeer, input.textContent);
    // Typing indicator
    if (State.currentPeer) {
      if (!typingActive) {
        typingActive = true;
        State.socket?.emit('typing_start', { sender: State.user.btid, recipient: State.currentPeer });
      }
      clearTimeout(typingTimer);
      typingTimer = setTimeout(() => {
        typingActive = false;
        State.socket?.emit('typing_stop', { sender: State.user.btid, recipient: State.currentPeer });
      }, 1500);
    }
  });

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  sendBtn.addEventListener('click', sendMessage);
}

function toggleSendBtn(enabled) {
  $('send-btn').disabled = !enabled;
}

function sendMessage() {
  const input = $('message-input');
  const text = input.textContent.trim();
  if (!text || !State.currentPeer) return;
  const msg_id = `${State.user.btid}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  State.socket?.emit('private_message', {
    sender: State.user.btid,
    recipient: State.currentPeer,
    msg: text,
    msg_id,
  });
  // Optimistic UI
  addMessage(State.currentPeer, { id: msg_id, sender: State.user.btid, msg: text, timestamp: new Date().toISOString(), read: false });
  updateFriendLastMsg(State.currentPeer, text, new Date().toISOString());
  input.textContent = '';
  toggleSendBtn(false);
  saveDraft(State.currentPeer, '');
  AudioManager.playSend();
}

/* ─────────────────── TYPING INDICATOR ─────────────────── */
function showTyping() {
  $('typing-indicator').classList.remove('hidden');
  scrollToBottom();
}
function hideTyping() {
  $('typing-indicator').classList.add('hidden');
}

/* ─────────────────── EMOJI PICKER ─────────────────── */
function initEmojiPicker() {
  const panel = $('emoji-panel');
  EmojiPicker.build(panel, emoji => {
    const input = $('message-input');
    input.focus();
    const sel = window.getSelection();
    if (sel && sel.rangeCount) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      range.insertNode(document.createTextNode(emoji));
      range.collapse(false);
    } else {
      input.textContent += emoji;
    }
    toggleSendBtn(input.textContent.trim().length > 0);
    panel.classList.add('hidden');
  });

  $('emoji-btn').addEventListener('click', e => {
    e.stopPropagation();
    panel.classList.toggle('hidden');
  });
  document.addEventListener('click', e => {
    if (!panel.contains(e.target) && e.target !== $('emoji-btn')) {
      panel.classList.add('hidden');
    }
  });
}

/* ─────────────────── IN-CHAT SEARCH ─────────────────── */
function initChatSearch() {
  $('chat-search-btn').addEventListener('click', () => {
    $('chat-search-bar').classList.toggle('hidden');
    if (!$('chat-search-bar').classList.contains('hidden')) {
      $('chat-search-input').focus();
    }
  });
  $('chat-search-close').addEventListener('click', () => {
    $('chat-search-bar').classList.add('hidden');
    clearHighlights();
    $('chat-search-input').value = '';
    $('search-match-count').textContent = '';
  });
  $('chat-search-input').addEventListener('input', debounce(doChatSearch, 300));
}

function doChatSearch() {
  clearHighlights();
  const q = $('chat-search-input').value.trim().toLowerCase();
  if (!q) { $('search-match-count').textContent = ''; return; }
  const bubbles = qsa('.bubble');
  let matches = [];
  bubbles.forEach(bubble => {
    if (bubble.textContent.toLowerCase().includes(q)) {
      bubble.classList.add('highlighted');
      matches.push(bubble);
    }
  });
  $('search-match-count').textContent = matches.length ? `${matches.length} match${matches.length > 1 ? 'es' : ''}` : 'No matches';
  if (matches.length) matches[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function clearHighlights() {
  qsa('.bubble.highlighted').forEach(b => b.classList.remove('highlighted'));
}

/* ─────────────────── FRIEND MANAGEMENT ─────────────────── */
async function sendFriendRequest(targetBtid) {
  try {
    await api('POST', '/api/friend/request', { sender: State.user.btid, target: targetBtid });
    toast('success', 'Request sent!', targetBtid);
  } catch (err) { toast('error', 'Failed', err.message); }
}

function initFriendModals() {
  // Add Friend
  $('add-friend-btn').addEventListener('click', () => openModal('add-friend-modal'));
  $('send-request-btn').addEventListener('click', async () => {
    const btid = $('add-friend-input').value.trim();
    if (!btid) return;
    await sendFriendRequest(btid);
    closeAllModals();
    $('add-friend-input').value = '';
  });

  // Requests panel
  $('view-requests-btn').addEventListener('click', () => {
    $('requests-panel').classList.toggle('hidden');
    renderRequestsList();
  });
  $('close-requests-btn').addEventListener('click', () => $('requests-panel').classList.add('hidden'));

  // Chat dropdown
  $('chat-more-btn').addEventListener('click', e => {
    e.stopPropagation();
    $('chat-dropdown').classList.toggle('hidden');
  });
  document.addEventListener('click', () => $('chat-dropdown')?.classList.add('hidden'));

  $('dd-remove-friend').addEventListener('click', async () => {
    $('chat-dropdown').classList.add('hidden');
    const ok = await confirm('Remove Friend', `Remove ${State.currentPeer} from your friends?`);
    if (!ok) return;
    try {
      await api('POST', '/api/friend/remove', { user: State.user.btid, friend: State.currentPeer });
      toast('success', 'Friend removed');
      closeChatView();
      loadFriends();
    } catch (err) { toast('error', 'Failed', err.message); }
  });

  $('dd-block-user').addEventListener('click', async () => {
    $('chat-dropdown').classList.add('hidden');
    const ok = await confirm('Block User', `Block ${State.currentPeer}? They won't be able to message you.`);
    if (!ok) return;
    try {
      await api('POST', '/api/friend/block', { user: State.user.btid, target: State.currentPeer });
      toast('success', 'User blocked');
      closeChatView();
      loadFriends();
    } catch (err) { toast('error', 'Failed', err.message); }
  });

  $('dd-change-password').addEventListener('click', () => {
    $('chat-dropdown').classList.add('hidden');
    openModal('change-pass-modal');
  });

  $('save-password-btn').addEventListener('click', async () => {
    const curr = $('cp-current').value;
    const newp = $('cp-new').value;
    const conf = $('cp-confirm').value;
    if (!curr || !newp || !conf) { toast('warning', 'Fill all fields'); return; }
    if (newp.length < 6) { toast('warning', 'Password too short'); return; }
    if (newp !== conf) { toast('warning', 'Passwords do not match'); return; }
    try {
      await api('POST', '/api/changepassword', { btid: State.user.btid, old_password: curr, new_password: newp });
      toast('success', 'Password changed!');
      closeAllModals();
      [$('cp-current'),$('cp-new'),$('cp-confirm')].forEach(i => i.value = '');
    } catch (err) { toast('error', 'Failed', err.message); }
  });
}

function closeChatView() {
  State.currentPeer = null;
  $('chat-view').classList.add('hidden');
  $('chat-empty').classList.remove('hidden');
}

/* ─────────────────── MODALS ─────────────────── */
function openModal(id) {
  $(id).classList.remove('hidden');
}
function closeAllModals() {
  qsa('.modal-backdrop').forEach(m => m.classList.add('hidden'));
}
document.addEventListener('DOMContentLoaded', () => {
  qsa('.modal-backdrop').forEach(modal => {
    modal.addEventListener('click', e => { if (e.target === modal) closeAllModals(); });
  });
  qsa('.modal-close').forEach(btn => {
    btn.addEventListener('click', closeAllModals);
  });
});

/* ─────────────────── THEME ─────────────────── */
function initTheme() {
  const saved = localStorage.getItem('btchat_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  $('theme-toggle-btn').addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('btchat_theme', next);
  });
}

/* ─────────────────── SOUND TOGGLE ─────────────────── */
function initSound() {
  const saved = localStorage.getItem('btchat_sound');
  if (saved === 'false') { AudioManager.setEnabled(false); updateSoundIcon(); }
  $('sound-toggle-btn').addEventListener('click', () => {
    AudioManager.setEnabled(!AudioManager.isEnabled());
    localStorage.setItem('btchat_sound', AudioManager.isEnabled());
    updateSoundIcon();
  });
}
function updateSoundIcon() {
  $('sound-icon').className = `fa-solid fa-volume-${AudioManager.isEnabled() ? 'high' : 'xmark'}`;
}

/* ─────────────────── MOBILE ─────────────────── */
function initMobile() {
  $('mobile-back-btn').addEventListener('click', () => {
    $('sidebar').classList.add('open');
    $('sidebar-overlay').classList.remove('hidden');
  });
  $('sidebar-overlay').addEventListener('click', () => {
    $('sidebar').classList.remove('open');
    $('sidebar-overlay').classList.add('hidden');
  });
}

/* ─────────────────── LOAD MORE ─────────────────── */
function initLoadMore() {
  $('load-more-btn').addEventListener('click', () => {
    if (State.currentPeer) requestHistory(State.currentPeer, true);
  });
}

/* ─────────────────── LOGOUT BUTTON ─────────────────── */
function initLogout() {
  $('logout-btn').addEventListener('click', async () => {
    const ok = await confirm('Sign Out', 'Are you sure you want to sign out?');
    if (ok) doLogout();
  });
}

/* ─────────────────── UTILITY ─────────────────── */
function debounce(fn, delay) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

/* ─────────────────── INIT ─────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initAuth();
  initSearch();
  initMessageInput();
  initFriendModals();
  initChatSearch();
  initSound();
  initMobile();
  initLoadMore();
  initLogout();

  // Auto-login from session
  const savedUser = loadSession();
  if (savedUser) {
    $('login-btid').value = savedUser;
    // Don't auto-submit password — just pre-fill
  }
});
