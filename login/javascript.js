(function() {
    // ============================================================
    // 🔧 修改为您的 Worker 地址
    // ============================================================
    const WORKER_URL = 'https://admin.mynexus.dpdns.org';
    // ============================================================

    // ---- 常量 ----
    const LOGIN_START_HOUR = 7;
    const LOGIN_END_HOUR = 22;

    // ---- 调试日志 ----
    function debugLog(message, type = 'info', data = null) {
        const time = new Date().toLocaleTimeString();
        const prefix = type === 'ok' ? '✅' : type === 'warn' ? '⚠️' : type === 'error' ? '❌' : '📌';
        console.log(`[${time}] ${prefix} ${message}`, data || '');
    }

    // ---- 自定义确认 ----
    let confirmCallback = null;
    function showConfirm(title, message, callback, danger = false) {
        document.getElementById('confirmTitle').textContent = title || '提示';
        document.getElementById('confirmMessage').textContent = message || '确定执行此操作吗？';
        document.getElementById('customConfirm').style.display = 'flex';
        // 根据 danger 设置确认按钮颜色
        const okBtn = document.getElementById('confirmOk');
        if (danger) {
            okBtn.style.background = '#ef4444';  // 红色
            okBtn.style.boxShadow = '0 4px 12px rgba(239, 68, 68, 0.3)';
        } else {
            okBtn.style.background = '#3b82f6';  // 蓝色（默认）
            okBtn.style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.3)';
        }
        confirmCallback = callback;
    }
    function hideConfirm() {
        const modal = document.getElementById('customConfirm');
        modal.classList.add('closing');
        setTimeout(() => {
            modal.style.display = 'none';
            modal.classList.remove('closing');
            confirmCallback = null;
        }, 200);
    }
    document.getElementById('confirmOk').addEventListener('click', () => { if (confirmCallback) confirmCallback(true); hideConfirm(); });
    document.getElementById('confirmCancel').addEventListener('click', () => { if (confirmCallback) confirmCallback(false); hideConfirm(); });
    document.getElementById('customConfirm').addEventListener('click', (e) => { if (e.target === e.currentTarget) { if (confirmCallback) confirmCallback(false); hideConfirm(); } });

    // ---- DOM ----
    const loginPage = document.getElementById('loginPage');
    const mainPage = document.getElementById('mainPage');
    const usernameInput = document.getElementById('usernameInput');
    const passwordInput = document.getElementById('passwordInput');
    const loginBtn = document.getElementById('loginBtn');
    const loginError = document.getElementById('loginError');
    const kvError = document.getElementById('kvError');
    const accountInfo = document.getElementById('accountInfo');
    const logoutBtn = document.getElementById('logoutBtn');
    const addFriendBtn = document.getElementById('addFriendBtnHeader');
    const aboutBtn = document.getElementById('aboutBtnFriend');
    const myUsernameSpan = document.getElementById('myUsername');
    const friendListContainer = document.getElementById('friendListContainer');
    const chatArea = document.getElementById('chatArea');
    const chatFriendName = document.getElementById('chatFriendName');
    const messageBox = document.getElementById('messageBox');
    const chatInput = document.getElementById('chatInput');
    const sendBtn = document.getElementById('sendBtn');
    const backBtn = document.getElementById('backBtn');
    const addFriendModal = document.getElementById('addFriendModal');
    const friendSearchInput = document.getElementById('friendSearchInput');
    const searchFriendBtn = document.getElementById('searchFriendBtn');
    const searchResult = document.getElementById('searchResult');
    const requestEntry = document.getElementById('requestEntry');
    const requestBadge = document.getElementById('requestBadge');
    const requestModal = document.getElementById('requestModal');
    const requestList = document.getElementById('requestList');
    const customMenu = document.getElementById('customMenu');
    const menuRecall = document.getElementById('menuRecall');
    const menuToggleBtn = document.getElementById('menuToggleBtn');
    const chatSideMenu = document.getElementById('chatSideMenu');
    const sideMenuOverlay = document.getElementById('sideMenuOverlay');
    const sideMenuCloseBtn = document.getElementById('sideMenuCloseBtn');
    const clearChatMenuItem = document.getElementById('clearChatMenuItem');
    const deleteFriendMenuItem = document.getElementById('deleteFriendMenuItem');
    const profileBtn = document.getElementById('profileBtn');
    const profileModal = document.getElementById('profileModal');
    const closeProfileBtn = document.getElementById('closeProfileBtn');
    const profileForm = document.getElementById('profileForm');
    const profileUsername = document.getElementById('profileUsername');
    const profileNickname = document.getElementById('profileNickname');
    const profileBio = document.getElementById('profileBio');
    const profileEmail = document.getElementById('profileEmail');
    const profileMessage = document.getElementById('profileMessage');

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
    let pollTimer = null;
    let requestPollTimer = null;
    let isUserScrolling = false;
    let renderVersion = 0;
    let currentRecallMsgId = null;
    let isAtBottom = true;              // 当前是否在底部
    let pendingNewMessages = 0;         // 待显示的未读新消息条数
    let emojiPanelVisible = false;
    let heartbeatInterval = null;
    let typingTimeout = null;  // 发送端限流定时器

    // ---- 工具 ----
    const EMOJI_LIST = [
        '😀', '😁', '😂', '🤣', '😃', '😄', '😅', '😆', '😉', '😊',
        '😋', '😎', '😍', '🥰', '😘', '😗', '😙', '😚', '🙂', '🤗',
        '🤩', '🤔', '🤨', '😐', '😑', '😶', '🙄', '😏', '😣', '😥',
        '😮', '🤐', '😯', '😪', '😫', '😴', '😌', '😛', '😜', '😝',
        '🤤', '😒', '😓', '😔', '😕', '🙃', '🤑', '😲', '☹️', '🙁',
        '😖', '😞', '😟', '😤', '😢', '😭', '😦', '😧', '😨', '😩',
        '🤯', '😬', '😰', '😱', '🥵', '🥶', '😳', '🤪', '😵', '😡',
        '😠', '🤬', '👍', '👎', '👊', '✊', '🤛', '🤜', '👏', '🙌',
        '👐', '🤲', '🤝', '🙏', '✌️', '🤟', '🤘', '👌', '🤞', '🖕',
        '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔',
        '❤️‍🔥', '💕', '💞', '💓', '💗', '💖', '✨', '🌟', '⭐', '🌈',
        '🔥', '💧', '❄️', '☀️', '☁️', '⚡', '💨', '🌊', '🎉', '🎊',
        '🎈', '🎁', '🎀', '🎂', '🍰', '🍕', '🍔', '🍟', '🌭', '🍿',
        '🧇', '🥞', '🥓', '🥩', '🍗', '🍖', '🥨', '🥖', '🍞', '🥐',
        '🥯', '🥚', '🍳', '🧈', '🧀', '🥛', '☕', '🍵', '🧃', '🥤',
    ];
    function formatTime(ts) {
        if (!ts) return '';
        try {
            return new Date(ts).toLocaleTimeString('zh-CN', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
        } catch { return ''; }
    }
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    function getAvatarLetter(name) { return name.charAt(0).toUpperCase(); }
    function showNewMessageHint(count) {
        const hint = document.getElementById('newMsgHint');
        const countEl = document.getElementById('newMsgCount');
        if (count > 0) {
            countEl.textContent = count;
            hint.style.display = 'block';
        } else {
            hint.style.display = 'none';
        }
    }

    function hideNewMessageHint() {
        document.getElementById('newMsgHint').style.display = 'none';
        pendingNewMessages = 0;
    }

    // ---- HTTP API ----
    async function apiCall(endpoint, method = 'GET', data = null) {
        let url = `${WORKER_URL}${endpoint}`;
        if (method === 'GET') {
            const separator = url.includes('?') ? '&' : '?';
            url += `${separator}_t=${Date.now()}`;
        }
        const options = {
            method,
            headers: { 'Content-Type': 'application/json' },
        };
        if (currentToken) {
            options.headers['Authorization'] = `Bearer ${currentToken}`;
        }
        if (data) {
            options.body = JSON.stringify(data);
        }
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        options.signal = controller.signal;
        try {
            const resp = await fetch(url, options);
            clearTimeout(timeoutId);
            const result = await resp.json();
            if (!resp.ok) {
                throw new Error(result.error || '请求失败');
            }
            return result;
        } catch (e) {
            clearTimeout(timeoutId);
            if (e.name === 'AbortError') {
                throw new Error('请求超时，请检查网络');
            }
            throw e;
        }
    }

    // ---- WebSocket ----
    function connectWebSocket() {
        if (isConnecting || (ws && ws.readyState === WebSocket.OPEN)) return;
        isConnecting = true;
        debugLog('🔌 连接WebSocket...', 'info');
        try {
            const wsUrl = WORKER_URL.replace('https://', 'wss://').replace('http://', 'ws://') + '/ws';
            ws = new WebSocket(wsUrl);
            ws.onopen = () => {
                isConnecting = false;
                debugLog('✅ WS连接成功', 'ok');
                if (currentToken) {
                    ws.send(JSON.stringify({ type: 'auth', token: currentToken, username: currentUser }));
                }
                loadFriends();
                // ✅ 启动心跳（不要立即清除）
                if (heartbeatInterval) clearInterval(heartbeatInterval);
                heartbeatInterval = setInterval(() => {
                    if (ws && ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({ type: 'ping' }));
                    }
                }, 30000);
            };
            ws.onmessage = (ev) => {
                try {
                    const data = JSON.parse(ev.data);
                    debugLog(`📥 WS [${data.type}]`, 'info', data);
                    handleWsMessage(data);
                } catch (e) {
                    debugLog('❌ WS解析失败: ' + e.message, 'error');
                }
            };
            ws.onclose = () => {
                debugLog('🔌 WS关闭', 'warn');
                isConnecting = false;
                if (heartbeatInterval) {
                    clearInterval(heartbeatInterval);
                    heartbeatInterval = null;
                }
                ws = null;
                loadFriends();
                if (currentToken) {
                    clearTimeout(reconnectTimer);
                    reconnectTimer = setTimeout(connectWebSocket, 3000);
                }
            };

            ws.onerror = () => {
                debugLog('❌ WS错误', 'error');
                isConnecting = false;
                if (heartbeatInterval) {
                    clearInterval(heartbeatInterval);
                    heartbeatInterval = null;
                }
            };
        } catch (e) {
            isConnecting = false;
            debugLog('❌ WS连接失败: ' + e.message, 'error');
        }
    }

    // ---- 处理 WS 消息 ----
    async function handleWsMessage(data) {
        switch (data.type) {
            case 'auth_success':
                debugLog('✅ WS认证成功', 'ok');
                loadFriends();
                break;
            case 'new_message': {
                const msg = data.message;
                // 处理自己的回显（直接添加，不提示）
                if (msg.from === currentUser) {
                    debugLog('📩 收到自己的回显', 'info', msg);
                    const friend = msg.to;
                    const friendTrim = friend.trim();
                    if (!messageIdSet[msg.id]) {
                        if (!messagesCache[friendTrim]) messagesCache[friendTrim] = [];
                        messagesCache[friendTrim].push(msg);
                        messageIdSet[msg.id] = true;
                        if (currentFriend === friendTrim) {
                            renderMessages(friendTrim, renderVersion);
                            // 自己发送的消息强制滚动到底部
                            messageBox.scrollTop = messageBox.scrollHeight;
                            isAtBottom = true;
                            hideNewMessageHint();
                        }
                    }
                    break;
                }

                // 处理其他用户的消息
                if (msg.from !== currentUser && msg.to !== currentUser) {
                    return;
                }
                const friend = msg.from === currentUser ? msg.to : msg.from;
                const friendTrim = friend.trim();
                if (messageIdSet[msg.id]) return;
                messageIdSet[msg.id] = true;
                if (!messagesCache[friendTrim]) messagesCache[friendTrim] = [];
                messagesCache[friendTrim].push(msg);

                // 如果是当前聊天界面
                if (currentFriend === friendTrim && chatArea.classList.contains('active')) {
                    renderMessages(friendTrim, renderVersion);
                    if (isAtBottom) {
                        // 在底部 → 自动滚动
                        messageBox.scrollTop = messageBox.scrollHeight;
                    } else {
                        // 不在底部 → 累加提示
                        pendingNewMessages++;
                        showNewMessageHint(pendingNewMessages);
                    }
                    markAsRead(friendTrim);
                } else {
                    // 不在当前聊天 → 增加未读计数（红点）
                    if (!unreadCountMap[friendTrim]) unreadCountMap[friendTrim] = 0;
                    unreadCountMap[friendTrim]++;
                    renderFriendList();
                }
                break;
            }
            case 'message_recalled': {
                const { msgId, newText } = data;
                debugLog(`📥 收到撤回广播: ${msgId}`, 'info');
                for (const friend in messagesCache) {
                    const msgs = messagesCache[friend];
                    for (let i = 0; i < msgs.length; i++) {
                        if (msgs[i].id === msgId) {
                            msgs[i].text = newText || '已撤回';
                            msgs[i].recalled = true;
                            if (currentFriend === friend) {
                                renderMessages(friend, renderVersion);
                            }
                            break;
                        }
                    }
                }
                break;
            }
            case 'friend_request':
                debugLog(`📩 好友申请: ${data.from}`, 'info');
                loadRequestCount();
                if (requestModal.classList.contains('active')) loadRequests();
                break;
            case 'friend_request_processed':
                debugLog(`📩 申请处理: ${data.from} ${data.accepted ? '同意' : '拒绝'}`, 'info');
                console.log('[好友申请处理] 准备刷新好友列表，当前好友数:', friends.length);
                await loadFriends();
                console.log('[好友申请处理] 刷新后好友数:', friends.length);
                await loadRequestCount();
                if (requestModal.classList.contains('active')) {
                    await loadRequests();
                }
                break;
            // 在 handleWsMessage 的 switch 中添加
            case 'friend_deleted':
                const deletedBy = data.by;
                debugLog(`📩 好友 ${deletedBy} 删除了你`, 'info');
                showToast(`⚠️ ${deletedBy} 已将您从好友列表中删除`);
                await loadFriends();
                if (currentFriend === deletedBy) {
                    currentFriend = null;
                    chatArea.classList.remove('active');
                    chatFriendName.textContent = '选择好友';
                    messageBox.innerHTML = '<div class="empty-state">选择一位好友开始聊天</div>';
                    delete messagesCache[deletedBy];
                }
                break;
            case 'online_status':
                // 忽略
                break;
            default:
                debugLog(`❓ 未知WS类型: ${data.type}`, 'warn');
        }
    }

    // ---- 好友申请 ----
    async function loadRequestCount() {
        try {
            const result = await apiCall('/friend/requests');
            const count = result.requests ? result.requests.length : 0;
            if (count > 0) { requestEntry.classList.add('show'); requestBadge.textContent = count; }
            else { requestEntry.classList.remove('show'); }
        } catch (e) { debugLog('❌ 获取申请数失败: ' + e.message, 'error'); }
    }
    async function loadRequests() {
        try {
            const result = await apiCall('/friend/requests');
            const requests = result.requests || [];
            if (requests.length === 0) { requestList.innerHTML = '<div class="empty-state">暂无申请</div>'; return; }
            let html = '';
            for (const req of requests) {
                const time = formatTime(req.time);
                html += `
                    <div class="request-item" data-from="${req.from}">
                        <div><strong>${escapeHtml(req.from)}</strong><br/><span style="font-size:12px;color:#94a3b8;">${time}</span></div>
                        <div class="actions">
                            <button class="accept" data-action="accept" title="同意">✅</button>
                            <button class="reject" data-action="reject" title="拒绝">❌</button>
                        </div>
                    </div>
                `;
            }
            requestList.innerHTML = html;
            requestList.querySelectorAll('.request-item .actions button').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const item = btn.closest('.request-item');
                    const from = item.dataset.from;
                    const action = btn.dataset.action;
                    await handleRequest(from, action);
                });
            });
        } catch (e) {
            debugLog('❌ 加载申请列表失败: ' + e.message, 'error');
            requestList.innerHTML = '<div class="empty-state">加载失败</div>';
        }
    }
    async function handleRequest(from, action) {
        try {
            const endpoint = action === 'accept' ? '/friend/accept' : '/friend/reject';
            await apiCall(endpoint, 'POST', { from });
            await loadRequests();
            await loadRequestCount();
            await loadFriends();
        } catch (e) { alert('操作失败: ' + e.message); }
    }

    // ---- 添加好友 ----
    function closeAddFriend() {
        const modal = addFriendModal;
        modal.classList.add('closing');
        setTimeout(() => {
            modal.classList.remove('active', 'closing');
            friendSearchInput.value = '';
            searchResult.style.display = 'none';
        }, 200);
    }
    function closeRequests() {
        const modal = requestModal;
        modal.classList.add('closing');
        setTimeout(() => {
            modal.classList.remove('active', 'closing');
        }, 200);
    }

    async function searchFriend() {
        const query = friendSearchInput.value.trim();
        if (!query) { alert('请输入账号名'); return; }
        try {
            const result = await apiCall('/friend/search', 'POST', { query });
            if (result.success) {
                searchResult.style.display = 'block';
                searchResult.innerHTML = `
                    <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 0;">
                        <span>找到用户: <strong>${escapeHtml(result.username)}</strong></span>
                        <button class="btn-primary" style="padding:4px 16px; border:none; border-radius:20px; background:#3b82f6; color:white; cursor:pointer;" id="sendRequestBtn">发送申请</button>
                    </div>
                `;
                document.getElementById('sendRequestBtn').addEventListener('click', async () => {
                    await sendFriendRequest(result.username);
                });
            } else {
                searchResult.style.display = 'block';
                searchResult.innerHTML = `<div style="color:#ef4444;">${escapeHtml(result.message)}</div>`;
            }
        } catch (e) { alert('搜索失败: ' + e.message); }
    }
    async function sendFriendRequest(to) {
        try {
            await apiCall('/friend/request', 'POST', { to });
            alert('好友申请已发送');
            closeAddFriend();
        } catch (e) { alert('发送失败: ' + e.message); }
    }

    // ---- 轮询 ----
    async function pollMessages() {
        if (!currentToken || !currentFriend) return;
        const friend = currentFriend;
        const thisVersion = renderVersion;
        try {
            const result = await apiCall(`/messages?friend=${encodeURIComponent(friend)}`);
            if (thisVersion !== renderVersion || currentFriend !== friend) return;
            if (result.messages) {
                const newMsgs = result.messages;
                const oldMsgs = messagesCache[friend] || [];
                const oldIds = new Set(oldMsgs.map(m => m.id));
                const addedMsgs = newMsgs.filter(m => !oldIds.has(m.id));
                if (addedMsgs.length > 0) {
                    messagesCache[friend] = [...oldMsgs, ...addedMsgs];
                    addedMsgs.forEach(msg => { if (msg.id) messageIdSet[msg.id] = true; });
                    renderMessages(friend, thisVersion);
                    if (isAtBottom) {
                        messageBox.scrollTop = messageBox.scrollHeight;
                    } else {
                        pendingNewMessages += addedMsgs.length;
                        showNewMessageHint(pendingNewMessages);
                    }
                    markAsRead(friend);
                }
            }
        } catch (e) {}
    }

    function startPolling() {
        if (pollTimer) clearInterval(pollTimer);
        pollTimer = setInterval(pollMessages, 1000);
        // 删除 friendPollTimer 相关代码
        if (requestPollTimer) clearInterval(requestPollTimer);
        requestPollTimer = setInterval(() => {
            if (currentToken) loadRequestCount().catch(e => debugLog('⚠️ 申请轮询失败: ' + e.message, 'warn'));
        }, 5000);
        debugLog('🔄 轮询启动 (消息1s, 申请5s)', 'ok');
    }
    function stopPolling() {
        clearInterval(pollTimer);
        clearInterval(requestPollTimer);
        pollTimer = requestPollTimer = null;
    }

    // ---- 好友列表（核心修复：在线状态由WebSocket控制） ----
    async function loadFriends() {
        debugLog('📋 加载好友列表...', 'info');
        // 显示加载中
        friendListContainer.innerHTML = '<div class="empty-state">加载中...</div>';
        try {
            const result = await apiCall('/friends');
            if (result.friends && Array.isArray(result.friends)) {
                friends = result.friends.map(f => ({
                    username: f.username,
                    nickname: f.nickname || '',
                    unread: f.unread || 0
                }));
                unreadCountMap = {};
                for (const f of friends) {
                    if (f.unread > 0) {
                        unreadCountMap[f.username] = f.unread;
                    }
                }
                renderFriendList();
            } else {
                debugLog('❌ 好友列表数据格式错误', 'error');
                friendListContainer.innerHTML = '<div class="empty-state">数据异常，请刷新</div>';
            }
        } catch (e) {
            debugLog('❌ 加载好友失败: ' + e.message, 'error');
            friendListContainer.innerHTML = '<div class="empty-state">加载失败，请刷新</div>';
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
            const active = (currentFriend === f.username) ? 'active' : '';
            const unreadCount = unreadCountMap[f.username] || 0;
            const unreadHtml = unreadCount > 0 ? `<span class="unread-badge">${unreadCount}</span>` : '';
            const msgs = messagesCache[f.username] || [];
            const lastMsg = msgs.length > 0 ? msgs[msgs.length-1] : null;
            const lastText = lastMsg ? (lastMsg.from === currentUser ? '我: ' : '') + lastMsg.text : '';
            const lastTime = lastMsg && lastMsg.time ? formatTime(lastMsg.time) : '';
            const displayName = f.nickname || f.username;
            html += `
                <div class="friend-item ${active}" data-friend="${f.username}">
                    <div class="avatar">
                        ${getAvatarLetter(f.username)}
                    </div>
                    <div class="info">
                        <div class="name">${escapeHtml(displayName)}</div>
                        <div class="last-msg">${escapeHtml(lastText)}</div>
                    </div>
                    ${unreadHtml}
                    <span class="time">${lastTime}</span>
                </div>
            `;
        }
        friendListContainer.innerHTML = html;
        document.querySelectorAll('.friend-item').forEach(el => {
            el.addEventListener('click', () => {
                const friend = el.dataset.friend;
                selectFriend(friend);
            });
        });
    }

    // ---- 选择好友 ----
    function selectFriend(friend) {
        clearTimeout(window.typingClearTimeout);
        chatFriendName.textContent = friend || '选择好友';
        const isFriend = friends.some(f => f.username === friend);
        if (!isFriend) {
            // 仍允许查看历史，但标记为“已删除”
            // 不禁止加载消息
            chatFriendName.textContent = friend + ' (已删除)';
            // 但发送消息时会被阻止（sendMessage 中已有检查）
        }
        // 切换好友时重置新消息提示
        pendingNewMessages = 0;
        hideNewMessageHint();
        isAtBottom = true;
        if (!friend) return;
        const friendTrim = friend.trim();
        if (unreadCountMap[friendTrim]) unreadCountMap[friendTrim] = 0;
        renderVersion++;
        const thisVersion = renderVersion;
        debugLog(`🔄 切换好友: ${friendTrim} (${thisVersion})`, 'info');
        messageBox.innerHTML = '<div class="empty-state">加载中...</div>';
        currentFriend = friendTrim;
        renderFriendList();
        const friendObj = friends.find(f => f.username === friend);
        const displayName = friendObj?.nickname || friend;
        chatFriendName.textContent = displayName;
        chatArea.classList.add('active');
        messagesCache[friendTrim] = [];
        loadMessages(friendTrim, thisVersion);
        markAsRead(friendTrim);
    }

    // ---- 加载消息 ----（调用 renderMessages 时传入 animate = true）
    async function loadMessages(friend, version) {
        if (version !== renderVersion) {
            debugLog(`⏭️ 版本不匹配，取消加载`, 'warn');
            return;
        }
        try {
            const result = await apiCall(`/messages?friend=${encodeURIComponent(friend)}`);
            if (version !== renderVersion) return;
            if (result.messages) {
                const newMsgs = result.messages;
                const oldMsgs = messagesCache[friend] || [];
                const merged = [...oldMsgs];
                for (const msg of newMsgs) {
                    if (!merged.some(m => m.id === msg.id)) {
                        merged.push(msg);
                    }
                }
                merged.sort((a, b) => a.time - b.time);
                messagesCache[friend] = merged;
                merged.forEach(msg => { if (msg.id) messageIdSet[msg.id] = true; });
                // ✅ 传入 true，表示初次加载有动画
                renderMessages(friend, version, true);
                if (merged.length > 0) messageBox.scrollTop = messageBox.scrollHeight;
            }
        } catch (e) {
            debugLog('❌ 加载消息失败: ' + e.message, 'error');
            if (version === renderVersion) messageBox.innerHTML = '<div class="empty-state">加载失败</div>';
        }
    }
    async function fetchAndShowNotifications() {
        try {
            const result = await apiCall('/notifications');
            if (result.success && result.notifications && result.notifications.length > 0) {
                for (const notif of result.notifications) {
                    if (notif.type === 'friend_deleted') {
                        showToast(`⚠️ ${notif.by} 已将您从好友列表中删除`);
                    }
                }
            }
        } catch (e) {
            debugLog('❌ 获取通知失败: ' + e.message, 'error');
        }
    }
    async function loadProfile() {
        try {
            const result = await apiCall('/profile');
            if (result.success) {
                const p = result.profile;
                profileUsername.value = p.username;
                profileNickname.value = p.nickname || '';
                profileBio.value = p.bio || '';
                profileEmail.value = p.email || '';
                const displayName = p.nickname || p.username;
                myUsernameSpan.textContent = displayName;
                renderFriendList();
            }
        } catch (e) {
            console.error('加载个人资料失败:', e);
        }
    }
    function showToast(message, type = 'error') {
        const container = document.getElementById('toastContainer');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        container.appendChild(toast);
        // 自动消失
        setTimeout(() => {
            toast.classList.add('hide');
            setTimeout(() => {
                if (toast.parentNode) toast.parentNode.removeChild(toast);
            }, 300);
        }, 4000);
    }

    // ---- 渲染消息 ----
    function renderMessages(friend, version, animate = false) {
        if (version !== undefined && version !== renderVersion) {
            debugLog(`⏭️ 渲染版本不匹配 (${version} != ${renderVersion})，放弃渲染`, 'warn');
            return;
        }
        if (currentFriend !== friend) return;
        const msgs = messagesCache[friend] || [];
        if (msgs.length === 0) {
            messageBox.innerHTML = '<div class="empty-state">暂无消息，开始聊天吧</div>';
            return;
        }

        function formatTimeLabel(timestamp) {
            if (!timestamp) return '';
            const date = new Date(timestamp);
            if (isNaN(date.getTime())) return '';
            const now = new Date();
            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);
            const msgDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
            const timeStr = date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
            if (msgDate.getTime() === today.getTime()) return timeStr;
            if (msgDate.getTime() === yesterday.getTime()) return '昨天 ' + timeStr;
            if (date.getFullYear() === now.getFullYear()) return (date.getMonth()+1) + '月' + date.getDate() + '日 ' + timeStr;
            return date.getFullYear() + '年' + (date.getMonth()+1) + '月' + date.getDate() + '日 ' + timeStr;
        }

        let html = '';
        const animationClass = animate ? '' : 'no-animation';
        const fiveMinutes = 5 * 60 * 1000;

        for (let i = 0; i < msgs.length; i++) {
            const msg = msgs[i];
            const isMe = (msg.from === currentUser);
            const isRecalled = msg.recalled || false;
            const textClass = isRecalled ? 'msg-text recalled' : 'msg-text';
            const displayText = isRecalled ? (isMe ? '你撤回了一条消息' : '对方撤回了一条消息') : msg.text;

            const prevTime = msgs[i-1]?.time || 0;
            if (i === 0 || (msg.time - prevTime) > fiveMinutes) {
                html += `<div class="time-label">${formatTimeLabel(msg.time)}</div>`;
            }
            // 在循环中，获取发送者昵称
            const senderName = msg.fromNickname || msg.from;

            // 在构建 html 时，在消息气泡上方添加 sender 标签（仅对方消息）
            html += `
                <div class="msg-item ${isMe ? 'me' : ''} ${animationClass}" data-id="${msg.id}" data-from="${msg.from}" data-time="${msg.time}">
                    <div class="${textClass}">${escapeHtml(displayText)}</div>
                </div>
            `;
        }
        messageBox.innerHTML = html;

        // 绑定右键事件
        messageBox.querySelectorAll('.msg-item.me').forEach(el => {
            const msgId = el.dataset.id;
            const msgTime = parseInt(el.dataset.time);
            const timeDiff = Date.now() - msgTime;
            if (timeDiff < fiveMinutes) {
                el.addEventListener('contextmenu', function(e) {
                    e.preventDefault();
                    const msgs = messagesCache[friend] || [];
                    const msg = msgs.find(m => m.id === msgId);
                    if (msg && msg.recalled) return;
                    currentRecallMsgId = msgId;
                    customMenu.style.display = 'block';
                    customMenu.style.left = Math.min(e.clientX, window.innerWidth - 120) + 'px';
                    customMenu.style.top = Math.min(e.clientY, window.innerHeight - 50) + 'px';
                });
            }
        });
    }

    // ---- 自定义菜单事件 ----
    menuRecall.addEventListener('click', function() {
        customMenu.style.display = 'none';
        const msgId = currentRecallMsgId;
        if (!msgId) return;
        showConfirm('撤回消息', '确定撤回此消息吗？', async (ok) => {
            if (ok) {
                try {
                    await apiCall('/message/recall', 'POST', { msgId });
                } catch (e) {
                    alert('撤回失败: ' + e.message);
                }
            }
        });
    });

    document.addEventListener('click', function(e) {
        if (!customMenu.contains(e.target)) customMenu.style.display = 'none';
    });

    // ---- 发送消息 ----
    async function sendMessage(text) {
        if (!currentFriend) {
            alert('请先选择好友');
            return;
        }
        // ⭐ 新增：检查好友关系
        const isFriend = friends.some(f => f.username === currentFriend);
        if (!isFriend) {
            alert('⚠️ 对方已不是您的好友，无法发送消息');
            chatArea.classList.remove('active');
            currentFriend = null;
            chatFriendName.textContent = '选择好友';
            messageBox.innerHTML = '<div class="empty-state">选择一位好友开始聊天</div>';
            renderFriendList();
            return;
        }
        const clean = text.trim();
        if (!clean) return;

        if (ws && ws.readyState === WebSocket.OPEN) {
            // 通过 WebSocket 发送，等待回显（由 handleWsMessage 处理）
            ws.send(JSON.stringify({ type: 'message', to: currentFriend, text: clean }));
            clearTimeout(window.typingClearTimeout);
            chatFriendName.textContent = currentFriend;
            debugLog(`📤 WS消息已发送`, 'ok');
            chatInput.value = '';
            chatInput.focus();
            // 不乐观添加，等待回显
        } else {
            // 回退 HTTP
            debugLog(`⚠️ WS未连接，使用HTTP`, 'warn');
            try {
                const result = await apiCall('/messages', 'POST', { to: currentFriend, text: clean });
                if (result.success) {
                    const newMsg = {
                        id: result.id,
                        from: currentUser,
                        to: currentFriend,
                        text: clean,
                        time: Date.now(),
                        read: true,
                    };
                    if (!messagesCache[currentFriend]) messagesCache[currentFriend] = [];
                    messagesCache[currentFriend].push(newMsg);
                    messageIdSet[newMsg.id] = true;
                    renderMessages(currentFriend, renderVersion);
                    messageBox.scrollTop = messageBox.scrollHeight;
                    // ✅ 添加这两行，确保状态重置
                    hideNewMessageHint();
                    isAtBottom = true;
                } else {
                    throw new Error(result.error || '发送失败');
                }
            } catch (e) {
                alert('发送失败: ' + e.message);
            }
        }
    }

    // ---- 标记已读 ----
    async function markAsRead(friend) {
        try {
            await apiCall(`/messages/read?friend=${encodeURIComponent(friend)}`, 'POST');
            // 清空本地未读计数
            unreadCountMap[friend] = 0;
            renderFriendList();
        } catch (e) {
            debugLog('❌ 标记已读失败: ' + e.message, 'warn');
        }
    }

    // ---- 删除消息 ----
    async function deleteMessage(msgId) {
        try {
            await apiCall(`/messages?id=${msgId}`, 'DELETE');
            if (currentFriend && messagesCache[currentFriend]) {
                messagesCache[currentFriend] = messagesCache[currentFriend].filter(m => m.id !== msgId);
                delete messageIdSet[msgId];
                renderMessages(currentFriend, renderVersion);
            }
            await loadFriends();
        } catch (e) {
            alert('删除失败: ' + e.message);
        }
    }

    // ---- 清空聊天 ----
    function clearChat(friend) {
        showConfirm('清空聊天记录', `确定清空与 ${friend} 的所有聊天记录吗？`, async (result) => {
            if (!result) return;
            try {
                await apiCall('/messages/clear', 'POST', { friend: friend });
                if (currentFriend === friend) {
                    messagesCache[friend] = [];
                    renderMessages(friend, renderVersion);
                }
                await loadFriends();
            } catch (e) {
                alert('清空失败: ' + e.message);
            }
        }, true);  // ✅ 传入 true，确认按钮变为红色
    }

    // ---- 登录 ----
    async function login(username, password) {
        loginBtn.disabled = true;
        loginBtn.textContent = '登录中...';
        debugLog(`🔐 尝试登录: ${username}`, 'info');
        try {
            const result = await apiCall('/auth/login', 'POST', { username, password });
            if (result.success) {
                currentUser = username;
                currentToken = result.token;
                debugLog(`✅ 登录成功: ${username}`, 'ok');
                document.getElementById('app').classList.add('logged-in');
                localStorage.setItem('token', currentToken);
                loginError.classList.add('hidden');
                loginPage.style.display = 'none';
                mainPage.classList.add('active');
                myUsernameSpan.textContent = currentUser;
                await loadProfile();  // 加载昵称等资料
                connectWebSocket();
                await loadFriends();
                await loadRequestCount();
                startPolling();
                await fetchAndShowNotifications();
                loginBtn.disabled = false;
                loginBtn.textContent = '登 录';
                return true;
            } else {
                loginError.textContent = result.error || '登录失败';
                loginError.classList.remove('hidden');
                debugLog(`❌ 登录失败: ${result.error}`, 'error');
                loginBtn.disabled = false;
                loginBtn.textContent = '登 录';
                return false;
            }
        } catch (err) {
            loginError.textContent = '网络错误: ' + err.message;
            loginError.classList.remove('hidden');
            debugLog(`❌ 登录异常: ${err.message}`, 'error');
            loginBtn.disabled = false;
            loginBtn.textContent = '登 录';
            return false;
        }
    }

    // ---- 登出 ----
    async function logout() {
        debugLog(`🚪 用户登出: ${currentUser}`, 'info');
        stopPolling();
        document.getElementById('app').classList.remove('logged-in');
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
        mainPage.classList.remove('active');
        loginPage.style.display = 'flex';
        chatArea.classList.remove('active');
        loginError.classList.add('hidden');
        chatInput.value = '';
        messageBox.innerHTML = '<div class="empty-state">选择一位好友开始聊天</div>';
        friendListContainer.innerHTML = '<div class="empty-state">加载中...</div>';
        loadAccountInfo();
    }

    // ---- 账号信息（进入页面时检查时间和KV状态） ----
    async function loadAccountInfo() {
        debugLog('📋 加载账号信息...', 'info');
        accountInfo.textContent = '加载中...';

        // 2. 时间允许，尝试获取账号信息（检查KV状态）
        try {
            const result = await apiCall('/accounts/info');
            if (result.success) {
                accountInfo.textContent = '欢迎使用 Nexus';
                kvError.classList.add('hidden');
                loginError.classList.add('hidden');
                loginBtn.disabled = false;
                debugLog('✅ 账号信息加载成功，登录已启用', 'ok');
            } else {
                accountInfo.textContent = '⚠️ 加载失败，请刷新';
                loginBtn.disabled = true;
            }
        } catch (e) {
            const errorMsg = e.message || '';
            if (errorMsg.includes('limit') || errorMsg.includes('exceeded')) {
                // KV 超额提示
                kvError.classList.remove('hidden');
                loginBtn.disabled = true;
                // 计算第二天日期
                const tomorrow = new Date();
                tomorrow.setDate(tomorrow.getDate() + 1);
                const dateStr = tomorrow.getFullYear() + '年' + (tomorrow.getMonth() + 1) + '月' + tomorrow.getDate() + '日';
                kvError.textContent = '⚠️ 服务器存储已达上限，请 ' + dateStr + ' 后重试。';
                accountInfo.textContent = '⚠️ 存储已满，今日无法使用';
                debugLog('❌ KV 超额，登录已禁用', 'error');
            } else {
                // 其他网络错误
                accountInfo.textContent = '⚠️ 网络错误，请刷新重试';
                loginBtn.disabled = false; // 网络错误可重试
                debugLog(`❌ 加载账号信息异常: ${e.message}`, 'error');
            }
        }
    }

    // ---- 滚动检测 ----
    messageBox.addEventListener('scroll', () => {
        // 判断是否在底部（距底部 50px 内视为底部）
        const threshold = 50;
        const atBottom = messageBox.scrollHeight - messageBox.scrollTop - messageBox.clientHeight < threshold;
        if (atBottom) {
            // 滚动到底部时，清除新消息提示
            pendingNewMessages = 0;
            document.getElementById('newMsgHint').style.display = 'none';
            isAtBottom = true;
        } else {
            isAtBottom = false;
        }
    });

    // ---- 事件绑定 ----
    loginBtn.addEventListener('click', (e) => {
        e.preventDefault();
        login(usernameInput.value, passwordInput.value);
    });
    passwordInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); loginBtn.click(); }
    });
    usernameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); loginBtn.click(); }
    });
    logoutBtn.addEventListener('click', logout);
    sendBtn.addEventListener('click', (e) => {
        e.preventDefault();
        sendMessage(chatInput.value);
    });
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            sendBtn.click();
        }
    })

    // 单独绑定 input 事件（只绑定一次）
    chatInput.addEventListener('input', function() {
        if (!currentFriend || !ws || ws.readyState !== WebSocket.OPEN) return;
        // 发送 typing 事件
        ws.send(JSON.stringify({
            type: 'typing',
            to: currentFriend
        }));
        // 清除之前的限流定时器
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => {
            // 停止输入后不做额外操作，接收方3秒后自动消失
        }, 1000);
    });
    backBtn.addEventListener('click', () => {
        chatArea.classList.remove('active');
    });

    addFriendBtn.addEventListener('click', () => {
        addFriendModal.classList.add('active');
        friendSearchInput.value = '';
        searchResult.style.display = 'none';
        friendSearchInput.focus();
    });
    searchFriendBtn.addEventListener('click', searchFriend);
    friendSearchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); searchFriend(); }
    });
    // 关于按钮
    aboutBtn.addEventListener('click', () => {
        document.getElementById('aboutModal').classList.add('active');
    });
    profileBtn.addEventListener('click', openProfile);
    closeProfileBtn.addEventListener('click', closeProfile);
    profileModal.addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeProfile();
    });

    profileForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        const nickname = profileNickname.value.trim();
        const bio = profileBio.value.trim();
        const email = profileEmail.value.trim();
        try {
            const result = await apiCall('/profile', 'PUT', { nickname, bio, email });
            if (result.success) {
                showToast('✅ 资料更新成功', 'info');
                const displayName = result.profile.nickname || result.profile.username;
                myUsernameSpan.textContent = displayName;
                renderFriendList();
                closeProfile();
            } else {
                showToast('❌ ' + (result.error || '更新失败'), 'error');
            }
        } catch (e) {
            showToast('❌ 更新失败: ' + e.message, 'error');
        }
    });
    document.getElementById('closeAddFriendBtn').addEventListener('click', closeAddFriend);
    document.getElementById('closeRequestsBtn').addEventListener('click', closeRequests);
    addFriendModal.addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeAddFriend();
    });
    requestModal.addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeRequests();
    });

    requestEntry.addEventListener('click', () => {
        requestModal.classList.add('active');
        loadRequests();
    });
    document.getElementById('closeAboutBtn').addEventListener('click', () => {
        const modal = document.getElementById('aboutModal');
        modal.classList.add('closing');
        setTimeout(() => {
            modal.classList.remove('active', 'closing');
        }, 200);
    });
    // 点击背景关闭也需修改
    document.getElementById('aboutModal').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) {
            const modal = document.getElementById('aboutModal');
            modal.classList.add('closing');
            setTimeout(() => {
                modal.classList.remove('active', 'closing');
            }, 200);
        }
    });
    document.getElementById('newMsgBtn').addEventListener('click', () => {
        // 滚动到底部
        messageBox.scrollTop = messageBox.scrollHeight;
        hideNewMessageHint();
        isAtBottom = true;
    });
    // 表情按钮
    const emojiBtn = document.getElementById('emojiBtn');
    const emojiPanel = document.getElementById('emojiPanel');

    emojiBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        emojiPanelVisible = !emojiPanelVisible;
        emojiPanel.classList.toggle('show', emojiPanelVisible);
        // 点击按钮时，如果面板打开，自动聚焦输入框（但不强制）
        if (emojiPanelVisible) {
            chatInput.focus();
        }
    });

    // 点击页面其他地方关闭表情面板
    document.addEventListener('click', function(e) {
        if (emojiPanelVisible && !emojiPanel.contains(e.target) && e.target !== emojiBtn) {
            emojiPanel.classList.remove('show');
            emojiPanelVisible = false;
        }
    });
    // ---- 侧栏菜单 ----
    function openSideMenu() {
        chatSideMenu.classList.add('active');
        chatSideMenu.classList.remove('closing');
    }

    function closeSideMenu() {
        chatSideMenu.classList.add('closing');
        setTimeout(() => {
            chatSideMenu.classList.remove('active', 'closing');
        }, 250);
    }

    menuToggleBtn.addEventListener('click', () => {
        if (!currentFriend) return;
        openSideMenu();
    });

    sideMenuOverlay.addEventListener('click', closeSideMenu);
    sideMenuCloseBtn.addEventListener('click', closeSideMenu);

    // 清除聊天记录
    clearChatMenuItem.addEventListener('click', () => {
        closeSideMenu();
        if (currentFriend) clearChat(currentFriend);
    });

    // 删除好友
    deleteFriendMenuItem.addEventListener('click', () => {
        closeSideMenu();
        if (currentFriend) {
            showConfirm('删除好友', `确定要删除好友 "${currentFriend}" 吗？\n删除后你将无法向对方发送消息，对方仍可看到你。`, async (ok) => {
                if (ok) {
                    await deleteFriend(currentFriend);
                }
            }, true);
        }
    });
    function openProfile() {
        profileModal.classList.add('active');
        loadProfile();
        profileMessage.style.display = 'none';
    }

    function closeProfile() {
        profileModal.classList.add('closing');
        setTimeout(() => {
            profileModal.classList.remove('active', 'closing');
        }, 200);
    }

    // ---- 删除好友功能 ----
    async function deleteFriend(friend) {
        try {
            const result = await apiCall('/friend/delete', 'POST', { friend });
            if (result.success) {
                alert(`已删除好友 ${friend}`);
                // 直接使用服务器返回的新好友列表
                if (result.friends) {
                    friends = result.friends.map(f => ({ username: f, unread: false }));
                    renderFriendList();
                } else {
                    // 兼容旧逻辑
                    friends = friends.filter(f => f.username !== friend);
                    renderFriendList();
                }
                // 清理缓存
                delete messagesCache[friend];
                if (currentFriend === friend) {
                    currentFriend = null;
                    chatArea.classList.remove('active');
                    chatFriendName.textContent = '选择好友';
                    messageBox.innerHTML = '<div class="empty-state">选择一位好友开始聊天</div>';
                }
            } else {
                alert('删除失败: ' + (result.error || '未知错误'));
            }
        } catch (e) {
            alert('删除失败: ' + e.message);
        }
    }
    
    async function loadDailyWallpaper() {
        const loginPage = document.getElementById('loginPage');
        // 使用本地图片，保持原始宽高比，完整可见（可能有留白）
        loginPage.style.backgroundImage = 'url("../background.png")';
        loginPage.style.backgroundSize = 'cover';   // 完整显示，不裁剪，不拉伸
        loginPage.style.backgroundRepeat = 'no-repeat';
        loginPage.style.backgroundPosition = 'center';
        loginPage.style.backgroundColor = '#282a37'; // 留白区域颜色（与登录页背景一致）
    }

    // ---- 初始化 ----
    function renderEmojiPanel() {
        const panel = document.getElementById('emojiPanel');
        if (!panel) return;
        let html = '';
        for (const emoji of EMOJI_LIST) {
            html += `<span class="emoji-item" data-emoji="${emoji}">${emoji}</span>`;
        }
        panel.innerHTML = html;
        // 绑定点击事件
        panel.querySelectorAll('.emoji-item').forEach(el => {
            el.addEventListener('click', function() {
                const emoji = this.dataset.emoji;
                insertEmoji(emoji);
            });
        });
    }

    function insertEmoji(emoji) {
        const input = chatInput;
        const start = input.selectionStart;
        const end = input.selectionEnd;
        const text = input.value;
        input.value = text.substring(0, start) + emoji + text.substring(end);
        // 将光标移动到插入的 emoji 后面
        const newPos = start + emoji.length;
        input.selectionStart = input.selectionEnd = newPos;
        input.focus();
    }
    debugLog('🚀 应用启动', 'ok');
    loadDailyWallpaper();
    loginPage.style.display = 'flex';
    mainPage.classList.remove('active');
    loadAccountInfo();
    renderEmojiPanel();

    window.addEventListener('beforeunload', () => {
        stopPolling();
        if (ws) ws.close();
        clearTimeout(reconnectTimer);
    });
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && currentToken) {
            debugLog('📋 页面可见，刷新好友列表', 'info');
            loadFriends();
            loadRequestCount();
        }
    });
})();