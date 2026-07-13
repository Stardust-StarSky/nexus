(function() {
    const WORKER_URL = 'https://admin.mynexus.dpdns.org';

    // ---- DOM ----
    const mainPage = document.getElementById('mainPage');
    const friendListContainer = document.getElementById('friendListContainer');
    const chatArea = document.getElementById('chatArea');
    const chatFriendName = document.getElementById('chatFriendName');
    const messageBox = document.getElementById('messageBox');
    const chatInput = document.getElementById('chatInput');
    const sendBtn = document.getElementById('sendBtn');
    const backBtn = document.getElementById('backBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const addFriendBtn = document.getElementById('addFriendBtn');
    const aboutBtn = document.getElementById('aboutBtnFriend');
    const settingsBtn = document.getElementById('settingsBtn');
    const customMenu = document.getElementById('customMenu');
    const menuRecall = document.getElementById('menuRecall');
    const menuReply = document.getElementById('menuReply');
    const toastContainer = document.getElementById('toastContainer');
    const friendProfileModal = document.getElementById('friendProfileModal');
    const closeFriendProfileBtn = document.getElementById('closeFriendProfileBtn');
    const fpUsername = document.getElementById('fpUsername');
    const fpNickname = document.getElementById('fpNickname');
    const fpBio = document.getElementById('fpBio');

    // ---- 状态 ----
    let currentUser = null;
    let currentToken = null;
    let currentFriend = null;
    let friends = [];
    let messagesCache = {};
    let unreadCountMap = {};
    let ws = null;
    let reconnectTimer = null;
    let isConnecting = false;
    let messageIdSet = {};
    let renderVersion = 0;
    let isAtBottom = true;
    let pendingNewMessages = 0;
    let replyToId = null;
    let heartbeatInterval = null;
    let typingTimeout = null;

    // ---- 工具 ----
    // ---- 模态框动画控制 ----
    function openModal(modalId) {
        const el = document.getElementById(modalId);
        if (!el) return;
        if (modalId === 'requestModal') {
            loadRequests(); // 打开时自动加载
        }
        el.classList.remove('closing', 'active');
        el.style.display = 'flex';
        void el.offsetHeight;
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                el.classList.add('active');
            });
        });
    }

    function closeModal(modalId) {
        const el = document.getElementById(modalId);
        if (!el) return;
        el.classList.remove('active');
        el.classList.add('closing');
        setTimeout(() => {
            el.style.display = 'none';
            el.classList.remove('closing');
        }, 300);
    }
    function showConfirm(title, msg, callback, danger = false) {
    const el = document.getElementById('customConfirm');
    if (!el) {
        console.error('❌ customConfirm 元素不存在');
        return;
    }
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmMessage').textContent = msg;
    const okBtn = document.getElementById('confirmOk');
    okBtn.style.background = danger ? '#ef4444' : '#3b82f6';

    // 重置状态
    el.classList.remove('closing', 'active');
    el.style.display = 'flex';
    
    // 强制重绘 + 双帧延迟，确保过渡生效
    void el.offsetHeight;
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            el.classList.add('active');
        });
    });

    const cb = (ok) => {
        callback(ok);
        hideConfirm();
    };
    document.getElementById('confirmOk').onclick = () => cb(true);
    document.getElementById('confirmCancel').onclick = () => cb(false);
    el.onclick = (e) => {
        if (e.target === e.currentTarget) cb(false);
    };
}

function hideConfirm() {
    const el = document.getElementById('customConfirm');
    if (!el) return;
    el.classList.remove('active');
    el.classList.add('closing');
    setTimeout(() => {
        el.style.display = 'none';
        el.classList.remove('closing');
    }, 300);
}
    function debugLog(msg, type = 'info', data = null) {
        const time = new Date().toLocaleTimeString();
        const prefix = type === 'ok' ? '✅' : type === 'warn' ? '⚠️' : type === 'error' ? '❌' : '📌';
        console.log(`[${time}] ${prefix} ${msg}`, data || '');
    }
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    function formatTime(ts) {
        if (!ts) return '';
        try { return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
        catch { return ''; }
    }
    function getAvatarLetter(name) { return name.charAt(0).toUpperCase(); }
    function showToast(msg, type = 'error') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = msg;
        toastContainer.appendChild(toast);
        setTimeout(() => {
            toast.classList.add('hide');
            setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 300);
        }, 4000);
    }
    function showNewMessageHint(count) {
        const hint = document.getElementById('newMsgHint');
        const el = document.getElementById('newMsgCount');
        if (count > 0) { el.textContent = count; hint.style.display = 'block'; }
        else { hint.style.display = 'none'; }
    }
    function hideNewMessageHint() {
        document.getElementById('newMsgHint').style.display = 'none';
        pendingNewMessages = 0;
    }

    // ---- API ----
    async function apiCall(endpoint, method = 'GET', data = null) {
        let url = `${WORKER_URL}${endpoint}`;
        if (method === 'GET') url += (url.includes('?') ? '&' : '?') + '_t=' + Date.now();
        const opts = { method, headers: { 'Content-Type': 'application/json' } };
        if (currentToken) opts.headers['Authorization'] = `Bearer ${currentToken}`;
        if (data) opts.body = JSON.stringify(data);
        const resp = await fetch(url, opts);
        const result = await resp.json();
        if (!resp.ok) throw new Error(result.error || '请求失败');
        return result;
    }

    // ---- WebSocket ----
    function connectWebSocket() {
        if (isConnecting || (ws && ws.readyState === WebSocket.OPEN)) return;
        isConnecting = true;
        try {
            const wsUrl = WORKER_URL.replace('https://', 'wss://').replace('http://', 'ws://') + '/ws';
            ws = new WebSocket(wsUrl);
            ws.onopen = () => {
                isConnecting = false;
                debugLog('WS连接成功', 'ok');
                if (currentToken) ws.send(JSON.stringify({ type: 'auth', token: currentToken, username: currentUser }));
                // 不再重复加载好友列表（已在 init 中加载）
                if (heartbeatInterval) clearInterval(heartbeatInterval);
                heartbeatInterval = setInterval(() => {
                    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' }));
                }, 30000);
            };
            ws.onmessage = (ev) => {
                try { handleWsMessage(JSON.parse(ev.data)); }
                catch (e) { debugLog('WS解析失败: ' + e.message, 'error'); }
            };
            ws.onclose = () => {
                debugLog('WS关闭', 'warn');
                isConnecting = false;
                if (heartbeatInterval) { clearInterval(heartbeatInterval); heartbeatInterval = null; }
                ws = null;
                loadFriends();
                if (currentToken) {
                    clearTimeout(reconnectTimer);
                    reconnectTimer = setTimeout(connectWebSocket, 3000);
                }
            };
            ws.onerror = () => {
                debugLog('WS错误', 'error');
                isConnecting = false;
                if (heartbeatInterval) { clearInterval(heartbeatInterval); heartbeatInterval = null; }
            };
        } catch (e) {
            isConnecting = false;
            debugLog('WS连接失败: ' + e.message, 'error');
        }
    }

    // ---- WS 消息处理 ----
    async function handleWsMessage(data) {
        switch (data.type) {
            case 'auth_success': debugLog('WS认证成功', 'ok'); break;
            case 'new_message': {
                const msg = data.message;
                if (msg.from === currentUser) {
                    const friend = msg.to.trim();
                    if (!messageIdSet[msg.id]) {
                        if (!messagesCache[friend]) messagesCache[friend] = [];
                        messagesCache[friend].push(msg);
                        messageIdSet[msg.id] = true;
                        if (currentFriend === friend) {
                            renderMessages(friend, renderVersion);
                            messageBox.scrollTop = messageBox.scrollHeight;
                            isAtBottom = true;
                            hideNewMessageHint();
                        }
                    }
                    break;
                }
                if (msg.from !== currentUser && msg.to !== currentUser) return;
                const friend = msg.from === currentUser ? msg.to : msg.from;
                const trim = friend.trim();
                if (messageIdSet[msg.id]) return;
                messageIdSet[msg.id] = true;
                if (!messagesCache[trim]) messagesCache[trim] = [];
                messagesCache[trim].push(msg);
                if (currentFriend === trim && chatArea.classList.contains('active')) {
                    renderMessages(trim, renderVersion);
                    if (isAtBottom) { messageBox.scrollTop = messageBox.scrollHeight; }
                    else { pendingNewMessages++; showNewMessageHint(pendingNewMessages); }
                    markAsRead(trim);
                } else {
                    if (!unreadCountMap[trim]) unreadCountMap[trim] = 0;
                    unreadCountMap[trim]++;
                    renderFriendList();
                }
                break;
            }
            case 'message_recalled': {
                const { msgId } = data;
                for (const f in messagesCache) {
                    const msgs = messagesCache[f];
                    for (let i = 0; i < msgs.length; i++) {
                        if (msgs[i].id === msgId) {
                            msgs[i].recalled = true;
                            msgs[i].text = '已撤回';
                            if (currentFriend === f) renderMessages(f, renderVersion);
                            break;
                        }
                    }
                }
                break;
            }
            case 'friend_request': loadRequestCount(); break;
            case 'friend_request_processed': await loadFriends(); await loadRequestCount(); break;
            case 'friend_deleted':
                showToast(`⚠️ ${data.by} 删除了你`);
                await loadFriends();
                if (currentFriend === data.by) {
                    currentFriend = null;
                    chatArea.classList.remove('active');
                    chatFriendName.textContent = '选择好友';
                    messageBox.innerHTML = '<div class="empty-state">选择一位好友开始聊天</div>';
                    delete messagesCache[data.by];
                }
                break;
            default: break;
        }
    }

    // ---- 好友 ----
    async function loadFriends(showLoading = true) {
        // 只在明确需要显示加载时设置（首次加载）
        if (showLoading) {
            friendListContainer.innerHTML = '<div class="empty-state">加载中...</div>';
        }
        try {
            const res = await apiCall('/friends');
            if (res.friends && Array.isArray(res.friends)) {
                friends = res.friends.map(f => ({ username: f.username, nickname: f.nickname || '', unread: f.unread || 0 }));
                unreadCountMap = {};
                for (const f of friends) { if (f.unread > 0) unreadCountMap[f.username] = f.unread; }
                renderFriendList();
            } else {
                if (showLoading) {
                    friendListContainer.innerHTML = '<div class="empty-state">数据异常</div>';
                }
            }
        } catch (e) {
            if (showLoading) {
                friendListContainer.innerHTML = '<div class="empty-state">加载失败，请刷新</div>';
            }
        }
    }
    function renderFriendList() {
        if (!friendListContainer) return;
        if (friends.length === 0) {
            friendListContainer.innerHTML = '<div class="empty-state">暂无好友，点击 "＋" 添加好友</div>';
            return;
        }
        let html = '';
        for (const f of friends) {
            const active = currentFriend === f.username ? 'active' : '';
            const unread = unreadCountMap[f.username] || 0;
            const unreadHtml = unread > 0 ? `<span class="unread-badge">${unread}</span>` : '';
            const displayName = f.nickname || f.username;
            html += `<div class="friend-item ${active}" data-friend="${f.username}">
                <div class="avatar">${getAvatarLetter(f.username)}</div>
                <div class="info">
                    <div class="name">${escapeHtml(displayName)}</div>
                </div>
                ${unreadHtml}
            </div>`;
        }
        friendListContainer.innerHTML = html;
        document.querySelectorAll('.friend-item').forEach(el => {
            el.addEventListener('click', () => selectFriend(el.dataset.friend));
        });
    }
    function selectFriend(friend) {
        if (!friend) return;

        const trim = friend.trim();
        currentFriend = trim;

        const obj = friends.find(f => f.username === trim);
        chatFriendName.textContent = obj?.nickname || trim;
        if (window.innerWidth <= 768) {
            document.getElementById('topBar').style.display = 'none';
            const friendList = document.getElementById('friendList');

            friendList.classList.add('hidden-mobile');
            chatArea.classList.add('active');
        } else {
            chatArea.classList.add('active');
        }

        renderVersion++;
        const ver = renderVersion;

        messageBox.innerHTML =
            '<div class="empty-state">加载中...</div>';

        messagesCache[trim] = [];
    if (unreadCountMap[trim]) unreadCountMap[trim] = 0;
        renderFriendList();
        loadMessages(trim, ver);
        markAsRead(trim);
    }

    // ---- 消息 ----
    async function loadMessages(friend, ver) {
        if (ver !== renderVersion) return;
        try {
            const res = await apiCall(`/messages?friend=${encodeURIComponent(friend)}`);
            if (ver !== renderVersion) return;
            if (res.messages) {
                const merged = [...messagesCache[friend]];
                for (const m of res.messages) {
                    if (!merged.some(x => x.id === m.id)) merged.push(m);
                }
                merged.sort((a, b) => a.time - b.time);
                messagesCache[friend] = merged;
                merged.forEach(m => { if (m.id) messageIdSet[m.id] = true; });
                renderMessages(friend, ver, true);
                if (merged.length > 0) messageBox.scrollTop = messageBox.scrollHeight;
            }
        } catch (e) {
            if (ver === renderVersion) messageBox.innerHTML = '<div class="empty-state">加载失败</div>';
        }
    }
    function renderMessages(friend, ver, animate = false) {
        if (ver !== undefined && ver !== renderVersion) return;
        if (currentFriend !== friend) return;
        const msgs = messagesCache[friend] || [];
        if (msgs.length === 0) {
            messageBox.innerHTML = '<div class="empty-state">暂无消息，开始聊天吧</div>';
            return;
        }
        const animClass = animate ? '' : 'no-animation';
        const fiveMin = 5 * 60 * 1000;
        let html = '';
        for (let i = 0; i < msgs.length; i++) {
            const msg = msgs[i];
            const isMe = msg.from === currentUser;
            const recalled = msg.recalled || false;
            const text = recalled ? (isMe ? '你撤回了一条消息' : '对方撤回了一条消息') : msg.text;
            const prev = msgs[i - 1]?.time || 0;
            if (i === 0 || (msg.time - prev) > fiveMin) {
                html += `<div class="time-label">${formatTimeLabel(msg.time)}</div>`;
            }
            let replyHtml = '';
            if (msg.replyTo) {
                const replied = msgs.find(m => m.id === msg.replyTo);
                if (replied) {
                    const rText = replied.recalled ? (replied.from === currentUser ? '你撤回了一条消息' : '对方撤回了一条消息') : replied.text;
                    replyHtml = `<div class="reply-preview" data-reply-id="${msg.replyTo}">
                        <span class="reply-sender">${escapeHtml(replied.fromNickname || replied.from)}</span>
                        <span class="reply-text">${escapeHtml(rText)}</span>
                    </div>`;
                }
            }
            html += `<div class="msg-item ${isMe ? 'me' : ''} ${animClass}" data-id="${msg.id}" data-time="${msg.time}" data-friend="${friend}">
                ${replyHtml}
                <div class="msg-text ${recalled ? 'recalled' : ''}">${escapeHtml(text)}</div>
            </div>`;
        }
        messageBox.innerHTML = html;

        // 绑定事件（关键修复）
        const items = messageBox.querySelectorAll('.msg-item');
        console.log('[渲染] 找到消息元素数量:', items.length); // 调试日志
        items.forEach(el => {
            const id = el.dataset.id;
            const friendName = el.dataset.friend;
            const time = parseInt(el.dataset.time);
            // 始终绑定右键事件（所有消息）
            el.addEventListener('contextmenu', function(e) {
                e.preventDefault();
                console.log('[右键] 消息被点击, id:', id, 'friend:', friendName);
                const msg = (messagesCache[friendName] || []).find(m => m.id === id);
                if (msg && msg.recalled) return;
                showMessageMenu(e, id, friendName);
            });

            // 始终绑定长按事件（所有消息）
            let timer = null;
            el.addEventListener('touchstart', function(e) {
                timer = setTimeout(() => {
                    const touch = e.touches[0];
                    console.log('[长按] 消息被长按, id:', id, 'friend:', friendName);
                    const msg = (messagesCache[friendName] || []).find(m => m.id === id);
                    if (msg && msg.recalled) return;
                    showMessageMenu({ clientX: touch.clientX, clientY: touch.clientY }, id, friendName);
                }, 500);
            });
            el.addEventListener('touchend', () => clearTimeout(timer));
            el.addEventListener('touchmove', () => clearTimeout(timer));
            // 引用预览点击跳转
            el.querySelector('.reply-preview')?.addEventListener('click', function() {
                const target = messageBox.querySelector(`[data-id="${this.dataset.replyId}"]`);
                if (target) {
                    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    target.style.background = 'rgba(139,92,246,0.15)';
                    setTimeout(() => target.style.background = '', 2000);
                }
            });
        });
    }
    function formatTimeLabel(ts) {
        if (!ts) return '';
        const d = new Date(ts);
        if (isNaN(d.getTime())) return '';
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const md = new Date(d.getFullYear(), d.getMonth(), d.getDate());
        const str = d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        if (md.getTime() === today.getTime()) return str;
        if (md.getTime() === yesterday.getTime()) return '昨天 ' + str;
        if (d.getFullYear() === now.getFullYear()) return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + str;
        return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + str;
    }

    // ---- 菜单 ----
    function showMessageMenu(e, msgId, friend) {
        if (!customMenu) return;
        window._currentMenuMsgId = msgId;
        window._currentMenuFriend = friend;
        const msgs = messagesCache[friend] || [];
        const msg = msgs.find(m => m.id === msgId);
        const canRecall = msg && msg.from === currentUser && !msg.recalled && (Date.now() - msg.time < 300000);
        if (menuRecall) menuRecall.style.display = canRecall ? 'flex' : 'none';
        customMenu.style.display = 'block';
        const w = 160, h = canRecall ? 80 : 50;
        let left = e.clientX, top = e.clientY;
        if (left + w > window.innerWidth) left = window.innerWidth - w - 10;
        if (top + h > window.innerHeight) top = window.innerHeight - h - 10;
        customMenu.style.left = Math.max(10, left) + 'px';
        customMenu.style.top = Math.max(10, top) + 'px';
        setTimeout(() => {
            document.addEventListener('click', function close(e) {
                if (!customMenu.contains(e.target)) {
                    customMenu.style.display = 'none';
                    document.removeEventListener('click', close);
                }
            });
        }, 10);
    }
    async function showFriendProfile() {
        if (!currentFriend) return;
        try {
            const res = await apiCall(`/user/profile?username=${encodeURIComponent(currentFriend)}`);
            if (res.success && res.profile) {
                fpUsername.textContent = res.profile.username;
                fpNickname.textContent = res.profile.nickname || '未设置';
                fpBio.textContent = res.profile.bio || '这个人很懒，什么都没写';
                openModal('friendProfileModal');
            } else {
                showToast('加载资料失败', 'error');
            }
        } catch (e) {
            showToast('加载资料失败: ' + e.message, 'error');
        }
    }
    function showReplyIndicator(msgId) {
        console.log('[引用] 开始显示引用, msgId:', msgId);
        const msgs = messagesCache[currentFriend] || [];
        const msg = msgs.find(m => m.id === msgId);
        if (!msg) {
            console.warn('[引用] 未找到消息');
            return;
        }
        console.log('[引用] 找到消息:', msg);
        replyToId = msgId;
        const bar = document.getElementById('replyBar');
        const text = msg.text || (msg.recalled ? '已撤回' : '');
        bar.innerHTML = `<span style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:14px;">
            💬 ${escapeHtml(msg.fromNickname || msg.from)}: ${escapeHtml(text.slice(0, 50))}
        </span>
        <button id="replyBarClose" style="background:none; border:none; cursor:pointer; font-size:18px;">✕</button>`
        bar.style.display = 'flex';
        document.getElementById('replyBarClose')?.addEventListener('click', cancelReply);
        chatInput.focus();
    }
    function cancelReply() {
        replyToId = null;
        const bar = document.getElementById('replyBar');
        if (bar) bar.style.display = 'none';
        chatInput.focus();
    }
    window.cancelReply = cancelReply;

    // ---- 发送 ----
    async function sendMessage(text) {
        if (!currentFriend) { alert('请先选择好友'); return; }
        const isFriend = friends.some(f => f.username === currentFriend);
        if (!isFriend) {
            alert('⚠️ 对方已不是您的好友');
            chatArea.classList.remove('active');
            currentFriend = null;
            chatFriendName.textContent = '选择好友';
            messageBox.innerHTML = '<div class="empty-state">选择一位好友开始聊天</div>';
            renderFriendList();
            return;
        }
        const clean = text.trim();
        if (!clean) return;
        const replyId = replyToId;
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'message', to: currentFriend, text: clean, replyTo: replyId }));
            chatInput.value = '';
            chatInput.focus();
            cancelReply();
        } else {
            try {
                const res = await apiCall('/messages', 'POST', { to: currentFriend, text: clean, replyTo: replyId });
                if (res.success) {
                    const newMsg = { id: res.id, from: currentUser, to: currentFriend, text: clean, time: Date.now(), read: true };
                    if (!messagesCache[currentFriend]) messagesCache[currentFriend] = [];
                    messagesCache[currentFriend].push(newMsg);
                    messageIdSet[newMsg.id] = true;
                    renderMessages(currentFriend, renderVersion);
                    messageBox.scrollTop = messageBox.scrollHeight;
                    hideNewMessageHint();
                    isAtBottom = true;
                    cancelReply();
                } else throw new Error(res.error || '发送失败');
            } catch (e) { alert('发送失败: ' + e.message); }
        }
    }

    // ---- 已读 ----
    async function markAsRead(friend) {
        try {
            await apiCall(`/messages/read?friend=${encodeURIComponent(friend)}`, 'POST');
            unreadCountMap[friend] = 0;
            renderFriendList();
        } catch (e) {}
    }

    // ---- 好友申请 ----
    async function loadRequestCount() {
        try {
            const res = await apiCall('/friend/requests');
            const count = res.requests ? res.requests.length : 0;
            const entry = document.getElementById('requestEntry');
            const badge = document.getElementById('requestBadge');
            if (count > 0) { entry.classList.add('show'); badge.textContent = count; }
            else { entry.classList.remove('show'); }
        } catch (e) {}
    }
    async function loadRequests() {
        try {
            const res = await apiCall('/friend/requests');
            const container = document.getElementById('requestList');
            if (!container) return;
            if (!res.requests || res.requests.length === 0) {
                container.innerHTML = '<div class="empty-state">暂无好友申请</div>';
                return;
            }
            let html = '';
            for (const req of res.requests) {
                html += `
                    <div class="request-item" data-from="${req.from}">
                        <span>${escapeHtml(req.from)}</span>
                        <span style="font-size:12px; color:#94a3b8;">${new Date(req.time).toLocaleString()}</span>
                        <div class="actions">
                            <button class="accept" data-from="${req.from}" title="同意">
                                <svg t="1783861808917" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="1690" width="20" height="20"><path d="M512 0C229.000533 0 0 229.000533 0 512s229.000533 512 512 512 512-229.000533 512-512S794.999467 0 512 0z m260.650667 425.429333L493.380267 704.699733c-5.5808 5.5808-13.0304 9.301333-21.410134 9.301334-10.24 1.8688-20.48-0.9216-27.9296-8.3712L268.100267 528.759467a30.907733 30.907733 0 0 1 0-43.758934l14.8992-14.890666a30.8992 30.8992 0 0 1 43.7504 0l141.499733 141.499733 244.821333-244.829867a30.8992 30.8992 0 0 1 43.758934 0l15.8208 14.890667a30.8992 30.8992 0 0 1 0 43.758933z" fill="#34CF50" p-id="1691"></path></svg>
                            </button>
                            <button class="reject" data-from="${req.from}" title="拒绝">
                                <svg t="1783861856883" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="2874" width="20" height="20"><path d="M511.6 62.9C263.3 62.9 62 264.2 62 512.4 62 760.7 263.3 962 511.6 962s449.6-201.3 449.6-449.6c-0.1-248.2-201.4-449.5-449.6-449.5z m193.9 593.4l-44.8 44.9-144.5-139.7-139.4 139.8-49.8-45 144.4-139.7L327 371.9l49.8-44.9 139.5 139.7L660.6 327l44.8 44.9L561 516.6l144.5 139.7z" fill="#FA5A5A" p-id="2875"></path></svg>
                            </button>
                        </div>
                    </div>
                `;
            }
            container.innerHTML = html;

            // 绑定同意/拒绝事件
            container.querySelectorAll('.accept').forEach(btn => {
                btn.addEventListener('click', async function(e) {
                    e.stopPropagation();
                    const from = this.dataset.from;
                    try {
                        await apiCall('/friend/accept', 'POST', { from });
                        showToast(`已同意好友申请`, 'success');
                        await loadRequests();
                        await loadFriends();
                        await loadRequestCount();
                    } catch (e) {
                        showToast('❌ 操作失败: ' + e.message);
                    }
                });
            });
            container.querySelectorAll('.reject').forEach(btn => {
                btn.addEventListener('click', async function(e) {
                    e.stopPropagation();
                    const from = this.dataset.from;
                    try {
                        await apiCall('/friend/reject', 'POST', { from });
                        showToast('已拒绝好友申请', 'success');
                        await loadRequests();
                        await loadRequestCount();
                    } catch (e) {
                        showToast('❌ 操作失败: ' + e.message);
                    }
                });
            });
        } catch (e) {
            document.getElementById('requestList').innerHTML = '<div class="empty-state">加载失败，请刷新</div>';
        }
    }
    function closeAddFriend() {
        const modal = document.getElementById('addFriendModal');
        if (!modal) return;
        modal.classList.remove('active');
        modal.classList.add('closing');
        setTimeout(() => {
            modal.classList.remove('closing');
            modal.style.display = 'none'; // 强制隐藏，确保背景模糊消失
        }, 200);
    }
    // 搜索好友等功能可直接在 HTML 中绑定，这里省略详细实现，保持核心功能

    // ---- 登出 ----
    async function logout() {
        stopPolling();
        if (ws) { ws.close(); ws = null; }
        clearTimeout(reconnectTimer);
        try { if (currentToken) await apiCall('/auth/logout', 'POST'); } catch (e) {}
        currentUser = null;
        currentToken = null;
        currentFriend = null;
        friends = [];
        messagesCache = {};
        unreadCountMap = {};
        messageIdSet = {};
        localStorage.removeItem('token');
        window.location.href = '/login';
    }

    // ---- 轮询 ----
    function startPolling() {
        // 消息轮询（1秒）
        if (window._pollTimer) clearInterval(window._pollTimer);
        window._pollTimer = setInterval(() => {
            if (!currentToken || !currentFriend) return;
            const friend = currentFriend;
            const ver = renderVersion;
            apiCall(`/messages?friend=${encodeURIComponent(friend)}`)
                .then(res => {
                    if (friend !== currentFriend || ver !== renderVersion) {
                        console.log('[轮询] 忽略过期请求');
                        return;
                    }
                    if (res.messages) {
                        const old = messagesCache[friend] || [];
                        const oldIds = new Set(old.map(m => m.id));
                        const added = res.messages.filter(m => !oldIds.has(m.id));
                        if (added.length > 0) {
                            messagesCache[friend] = [...old, ...added];
                            added.forEach(m => { if (m.id) messageIdSet[m.id] = true; });
                            renderMessages(friend, renderVersion);
                            if (isAtBottom) {
                                messageBox.scrollTop = messageBox.scrollHeight;
                            } else {
                                pendingNewMessages += added.length;
                                showNewMessageHint(pendingNewMessages);
                            }
                            markAsRead(friend);
                        }
                    }
                })
                .catch(() => {});
        }, 1000);

        // 申请轮询（5秒）
        if (window._reqPollTimer) clearInterval(window._reqPollTimer);
        window._reqPollTimer = setInterval(() => {
            if (currentToken) loadRequestCount().catch(() => {});
        }, 5000);

        // ✅ 新增：好友列表轮询（15秒，作为 WebSocket 的备用）
        if (window._friendPollTimer) clearInterval(window._friendPollTimer);
        window._friendPollTimer = setInterval(() => {
            if (currentToken) {
                loadFriends(false);
            }
        }, 15000);
    }
    function stopPolling() {
        clearInterval(window._pollTimer);
        clearInterval(window._reqPollTimer);
        clearInterval(window._friendPollTimer); 
    }

    // ---- 初始化 ----
    async function init() {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = '/login';
        return;
    }
    currentToken = token;
    try {
        const profile = await apiCall('/profile');
        if (!profile.success) {
            localStorage.removeItem('token');
            window.location.href = '/login';
            return;
        }
        currentUser = profile.profile.username;
        mainPage.classList.add('active');
        await loadProfile();
        connectWebSocket();
        await loadFriends(true);
        await loadRequestCount();
        startPolling();
        debugLog('聊天初始化完成', 'ok');
    } catch (e) {
        console.error('[init] 错误:', e);
        localStorage.removeItem('token');
        window.location.href = '/login';
    }
}
    async function loadProfile() {
        try {
            const res = await apiCall('/profile');
            if (res.success) {
                const p = res.profile;
                document.getElementById('profileUsername').value = p.username;
                document.getElementById('profileNickname').value = p.nickname || '';
                document.getElementById('profileBio').value = p.bio || '';
                document.getElementById('profileEmail').value = p.email || '';
            }
        } catch (e) {}
    }

    // ---- 事件绑定 ----
    logoutBtn?.addEventListener('click', logout);
    sendBtn?.addEventListener('click', () => sendMessage(chatInput.value));
    chatInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); sendBtn.click(); } });
    chatInput?.addEventListener('input', function() {
        if (!currentFriend || !ws || ws.readyState !== WebSocket.OPEN) return;
        ws.send(JSON.stringify({ type: 'typing', to: currentFriend }));
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => {}, 1000);
    });
    backBtn?.addEventListener('click', () => {

        // 隐藏聊天
        chatArea.classList.remove('active');
        chatArea.style.display = 'none';

        // 手机端恢复好友列表
        if (window.innerWidth <= 768) {

            const friendList = document.getElementById('friendList');
            document.getElementById('topBar').style.display = 'flex';

            if(friendList){
                friendList.classList.remove('hidden-mobile');
                friendList.style.removeProperty('display');
                friendList.style.display = 'flex';
            }

            // 清除聊天区域残留样式
            chatArea.style.removeProperty('width');
            chatArea.style.removeProperty('flex');
        }

    });
    addFriendBtn?.addEventListener('click', () => openModal('addFriendModal'));
    aboutBtn?.addEventListener('click', () => openModal('aboutModal'));
    chatFriendName?.addEventListener('click', showFriendProfile);
    closeFriendProfileBtn?.addEventListener('click', () => closeModal('friendProfileModal'));
    friendProfileModal?.addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeModal('friendProfileModal');
    });
    document.getElementById('closeAboutBtn')?.addEventListener('click', () => closeModal('aboutModal'));
    document.getElementById('aboutModal')?.addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeModal('aboutModal');
    });
    document.getElementById('closeAddFriendBtn')?.addEventListener('click', () => closeModal('addFriendModal'));
    document.getElementById('addFriendModal')?.addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeAddFriend();
    });
    // 搜索好友
    document.getElementById('searchFriendBtn')?.addEventListener('click', async function() {
        const q = document.getElementById('friendSearchInput').value.trim();
        if (!q) { alert('请输入账号名'); return; }
        try {
            const res = await apiCall('/friend/search', 'POST', { query: q });
            const box = document.getElementById('searchResult');
            if (res.success) {
                box.style.display = 'block';
                box.innerHTML = `<div style="display:flex; justify-content:space-between; align-items:center; padding:8px 0;">
                    <span>找到用户: <strong>${escapeHtml(res.username)}</strong></span>
                    <button class="btn-primary" style="padding:4px 16px; border:none; border-radius:20px; background:#3b82f6; color:white; cursor:pointer;" id="sendRequestBtn">发送申请</button>
                </div>`;
                document.getElementById('sendRequestBtn')?.addEventListener('click', async function() {
                    try {
                        await apiCall('/friend/request', 'POST', { to: res.username });
                        showToast('已提交好友申请', 'success');
                        closeAddFriend(); // ✅ 确保调用
                    } catch (e) { alert('发送失败: ' + e.message); }
                });
            } else {
                box.style.display = 'block';
                box.innerHTML = `<div style="color:#ef4444;">${escapeHtml(res.message)}</div>`;
            }
        } catch (e) { alert('搜索失败: ' + e.message); }
    });
    // 好友申请入口
    document.getElementById('requestEntry')?.addEventListener('click', () => {
        openModal('requestModal');
        loadRequests(); // 加载申请列表
    });    document.getElementById('closeRequestsBtn')?.addEventListener('click', () => closeModal('requestModal'));
    document.getElementById('requestModal')?.addEventListener('click', (e) => {
        if (e.target === e.currentTarget) {
            e.target.classList.add('closing');
            setTimeout(() => e.target.classList.remove('active', 'closing'), 200);
        }
    });
    // 侧栏菜单
    const menuToggleBtn = document.getElementById('menuToggleBtn');
    const chatSideMenu = document.getElementById('chatSideMenu');

    if (menuToggleBtn) {
        menuToggleBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            if (!currentFriend) {
                showToast('请先选择好友', 'warn');
                return;
            }
            if (!chatSideMenu) return;
            // 强制显示 + 添加激活类
            chatSideMenu.style.display = 'flex';
            chatSideMenu.classList.add('active');
            chatSideMenu.classList.remove('closing');
            // 调试日志
            console.log('[侧栏菜单] 已打开', chatSideMenu.className);
        });
    }
    document.getElementById('sideMenuOverlay')?.addEventListener('click', function() {
        const menu = document.getElementById('chatSideMenu');
        if (menu) {
            menu.classList.add('closing');
            setTimeout(() => {
                menu.classList.remove('active', 'closing');
                menu.style.display = 'none'; // 确保隐藏
            }, 250);
        }
    });

    document.getElementById('sideMenuCloseBtn')?.addEventListener('click', function() {
        const menu = document.getElementById('chatSideMenu');
        if (menu) {
            menu.classList.add('closing');
            setTimeout(() => {
                menu.classList.remove('active', 'closing');
                menu.style.display = 'none';
            }, 250);
        }
    });
    // 清除聊天记录
    document.getElementById('clearChatMenuItem')?.addEventListener('click', () => {
        // 立即隐藏侧栏菜单
        const menu = document.getElementById('chatSideMenu');
        if (menu) {
            menu.classList.remove('active', 'closing');
            menu.style.display = 'none';
        }
        if (currentFriend) {
            showConfirm('清空聊天记录', `确定清空与 ${currentFriend} 的聊天记录？`, async (ok) => {
                if (ok) {
                    try {
                        await apiCall('/messages/clear', 'POST', { friend: currentFriend });
                        messagesCache[currentFriend] = [];
                        renderMessages(currentFriend, renderVersion);
                        await loadFriends(false);
                    } catch (e) { alert('清空失败: ' + e.message); }
                }
            }, true);
        }
    });

    // 删除好友
    document.getElementById('deleteFriendMenuItem')?.addEventListener('click', () => {
        // 立即隐藏侧栏菜单
        const menu = document.getElementById('chatSideMenu');
        if (menu) {
            menu.classList.remove('active', 'closing');
            menu.style.display = 'none';
        }
        if (currentFriend) {
            showConfirm('删除好友', `确定要删除好友 "${currentFriend}"？`, async (ok) => {
                if (ok) {
                    try {
                        const res = await apiCall('/friend/delete', 'POST', { friend: currentFriend });
                        if (res.success) {
                            showToast(`已删除好友 ${currentFriend}`, 'success');
                            friends = friends.filter(f => f.username !== currentFriend);
                            delete messagesCache[currentFriend];
                            currentFriend = null;
                            chatArea.classList.remove('active');
                            chatFriendName.textContent = '选择好友';
                            messageBox.innerHTML = '<div class="empty-state">选择一位好友开始聊天</div>';
                            renderFriendList();
                        } else alert('删除失败: ' + (res.error || '未知错误'));
                    } catch (e) { alert('删除失败: ' + e.message); }
                }
            }, true);
        }
    });
    // 右键菜单
    if (menuRecall) {
        menuRecall.addEventListener('click', function() {
            customMenu.style.display = 'none';
            const id = window._currentMenuMsgId;
            const friend = window._currentMenuFriend;
            if (!id || !friend) return;
            const msgs = messagesCache[friend] || [];
            const msg = msgs.find(m => m.id === id);
            if (!msg || msg.from !== currentUser) { showToast('只能撤回自己的消息'); return; }
            if (msg.recalled) { showToast('消息已撤回'); return; }
            if (Date.now() - msg.time > 300000) { showToast('超过5分钟，无法撤回'); return; }
            showConfirm('撤回消息', '确定撤回此消息？', async (ok) => {
                if (ok) {
                    try {
                        await apiCall('/message/recall', 'POST', { msgId: id });
                        msg.recalled = true;
                        msg.text = '已撤回';
                        if (currentFriend === friend) renderMessages(friend, renderVersion);
                    } catch (e) { alert('撤回失败: ' + e.message); }
                }
            });
        });
    }
    if (menuReply) {
        menuReply.addEventListener('click', function() {
            customMenu.style.display = 'none';
            const id = window._currentMenuMsgId;
            if (id) {
                const msgs = messagesCache[currentFriend] || [];
                const msg = msgs.find(m => m.id === id);
                if (msg && !msg.recalled) showReplyIndicator(id);
            }
        });
    }
    document.addEventListener('click', function(e) {
        if (customMenu && !customMenu.contains(e.target)) customMenu.style.display = 'none';
    });
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    // 个人设置
    settingsBtn?.addEventListener('click', () => openModal('profileModal'));
    document.getElementById('closeSettingsBtn')?.addEventListener('click', () => closeModal('profileModal'));
    document.getElementById('profileModal')?.addEventListener('click', function(e) {
        if (e.target === e.currentTarget) {
            e.target.classList.add('closing');
            setTimeout(() => e.target.classList.remove('active', 'closing'), 200);
        }
    });
    document.getElementById('profileForm')?.addEventListener('submit', async function(e) {
        e.preventDefault();
        const nickname = document.getElementById('profileNickname').value.trim();
        const bio = document.getElementById('profileBio').value.trim();
        const email = document.getElementById('profileEmail').value.trim();
        try {
            const res = await apiCall('/profile', 'PUT', { nickname, bio, email });
            if (res.success) {
                showToast('资料更新成功', 'success');
                renderFriendList();
                document.getElementById('profileModal').classList.add('closing');
                setTimeout(() => document.getElementById('profileModal').classList.remove('active', 'closing'), 200);
            } else showToast('❌ ' + (res.error || '更新失败'));
        } catch (e) { showToast('❌ 更新失败: ' + e.message); }
    });
    // 新消息按钮
    document.getElementById('newMsgBtn')?.addEventListener('click', function() {
        messageBox.scrollTop = messageBox.scrollHeight;
        hideNewMessageHint();
        isAtBottom = true;
    });
    // 表情
    const emojiBtn = document.getElementById('emojiBtn');
    const emojiPanel = document.getElementById('emojiPanel');
    let emojiVisible = false;
    const EMOJI_LIST = ['😀','😁','😂','🤣','😃','😄','😅','😆','😉','😊','😋','😎','😍','🥰','😘','😗','😙','😚','🙂','🤗','🤩','🤔','🤨','😐','😑','😶','🙄','😏','😣','😥','😮','🤐','😯','😪','😫','😴','😌','😛','😜','😝','🤤','😒','😓','😔','😕','🙃','🤑','😲','☹️','🙁','😖','😞','😟','😤','😢','😭','😦','😧','😨','😩','🤯','😬','😰','😱','🥵','🥶','😳','🤪','😵','😡','😠','🤬'];
    if (emojiBtn) {
        emojiBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            emojiVisible = !emojiVisible;
            emojiPanel.classList.toggle('show', emojiVisible);
            if (emojiVisible) chatInput.focus();
        });
        emojiPanel.innerHTML = EMOJI_LIST.map(e => `<span class="emoji-item" data-emoji="${e}">${e}</span>`).join('');
        emojiPanel.querySelectorAll('.emoji-item').forEach(el => {
            el.addEventListener('click', function() {
                const emoji = this.dataset.emoji;
                const start = chatInput.selectionStart;
                const end = chatInput.selectionEnd;
                const val = chatInput.value;
                chatInput.value = val.substring(0, start) + emoji + val.substring(end);
                const newPos = start + emoji.length;
                chatInput.selectionStart = chatInput.selectionEnd = newPos;
                chatInput.focus();
            });
        });
    }
    document.addEventListener('click', function(e) {
        if (emojiVisible && emojiPanel && !emojiPanel.contains(e.target) && e.target !== emojiBtn) {
            emojiPanel.classList.remove('show');
            emojiVisible = false;
        }
    });
    // 滚动检测
    messageBox?.addEventListener('scroll', function() {
        const threshold = 50;
        const bottom = this.scrollHeight - this.scrollTop - this.clientHeight < threshold;
        if (bottom) {
            pendingNewMessages = 0;
            document.getElementById('newMsgHint').style.display = 'none';
            isAtBottom = true;
        } else isAtBottom = false;
    });

    // 启动
    init();
})();