const express = require('express');
const http = require('http');
const path = require('path');
const { WebSocketServer, WebSocket } = require('ws');

// 可選引用：youtube-chat (免 API Key 監聽 YouTube Live Chat)
let LiveChat;
try {
  LiveChat = require('youtube-chat').LiveChat;
} catch (e) {
  console.warn('[YouTube] youtube-chat module not installed yet. Run `npm install` to enable live fetching.');
}

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3000;
let activeLiveId = process.env.YOUTUBE_LIVE_ID || '';
let liveChatClient = null;
const commandCooldowns = new Map();

function allowCommand(author, command, cooldownMs) {
  const key = `${author || 'anonymous'}:${command}`;
  const now = Date.now();
  const previous = commandCooldowns.get(key) || 0;
  if (now - previous < cooldownMs) return false;
  commandCooldowns.set(key, now);
  return true;
}

// 靜態檔案目錄
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// 廣播給所有連接的前端 (OBS 瀏覽器來源或監看視窗)
function broadcast(action, payload = {}) {
  const message = JSON.stringify({ action, payload, timestamp: Date.now() });
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// 關鍵字與動作對應邏輯 (支援聊天室指令與打賞)
function handleChatMessage(messageData) {
  const { author, messageText, amount, isSuperChat } = messageData;
  const text = (messageText || '').trim().toLowerCase();

  // 1. 打賞 / Super Chat 優先權處理 (核心營利變現梯隊)
  if (isSuperChat || amount > 0) {
    console.log(`[SuperChat Monetization] ${author}: $${amount} - "${text}"`);

    // 嘗試從訊息中提取打賞者指定的國家 (例如: "$10 救台灣" 或 "$5 turkey")
    let specifiedCountry = 'Taiwan';
    const countryKeywords = ['taiwan', '台灣', 'turkey', '土耳其', 'japan', '日本', 'korea', '韓國', 'usa', '美國', 'brazil', '巴西', 'germany', '德國', 'ukraine', '烏克蘭'];
    for (const kw of countryKeywords) {
      if (text.toLowerCase().includes(kw)) {
        if (kw.includes('tai') || kw.includes('台灣')) specifiedCountry = 'Taiwan';
        else if (kw.includes('turk') || kw.includes('土耳其')) specifiedCountry = 'Turkey';
        else if (kw.includes('kor') || kw.includes('韓')) specifiedCountry = 'South Korea';
        else if (kw.includes('jap') || kw.includes('日')) specifiedCountry = 'Japan';
        else if (kw.includes('usa') || kw.includes('美')) specifiedCountry = 'United States';
        else if (kw.includes('bra') || kw.includes('巴')) specifiedCountry = 'Brazil';
        else if (kw.includes('ger') || kw.includes('德')) specifiedCountry = 'Germany';
        else if (kw.includes('ukr') || kw.includes('烏')) specifiedCountry = 'Ukraine';
        break;
      }
    }

    if (amount >= 30) {
      broadcast('TRIGGER_STORM', { author, amount });
    } else if (amount >= 10) {
      broadcast('RESPAWN_COUNTRY', { team: specifiedCountry, author, amount });
    } else {
      broadcast('SHIELD_COUNTRY', { team: specifiedCountry, author, amount });
    }
    return;
  }

  // Boss Attack Command (e.g. "#Taiwan attack boss", "#Taiwan boss", "attack boss")
  if (text.includes('boss') || text.includes('titan') || text.includes('魔王')) {
    if (!allowCommand(author, 'boss', 5000)) return;
    let team = 'Taiwan';
    const aliases = {
      'taiwan': 'Taiwan', 'tw': 'Taiwan', '台灣': 'Taiwan',
      'japan': 'Japan', 'jp': 'Japan', '日本': 'Japan',
      'usa': 'United States', 'us': 'United States', '美國': 'United States',
      'korea': 'South Korea', 'kr': 'South Korea', '韓國': 'South Korea',
      'turkey': 'Turkey', 'tr': 'Turkey', '土耳其': 'Turkey',
      'brazil': 'Brazil', 'br': 'Brazil', '巴西': 'Brazil',
      'germany': 'Germany', 'de': 'Germany', '德國': 'Germany',
      'uk': 'United Kingdom', 'gb': 'United Kingdom', '英國': 'United Kingdom',
      'ukraine': 'Ukraine', 'ua': 'Ukraine', '烏克蘭': 'Ukraine'
    };
    for (const [kw, cName] of Object.entries(aliases)) {
      if (text.includes(kw)) {
        team = cName;
        break;
      }
    }
    broadcast('ATTACK_BOSS', { team, author, damage: 500 });
    return;
  }

  // 2. 宿敵踩踏機制 (Stomp Rivalry: 例如 "#Taiwan stomp #Japan" 或 "#tw 踩 #kr")
  if (text.includes('stomp') || text.includes('踩') || text.includes('壓制')) {
    if (!allowCommand(author, 'stomp', 3000)) return;
    let attacker = 'Taiwan';
    let victim = 'Japan';

    // 辨識攻擊方與受害方
    if (text.includes('日本') || text.includes('japan')) victim = 'Japan';
    if (text.includes('韓國') || text.includes('korea')) victim = 'South Korea';
    if (text.includes('美國') || text.includes('usa')) victim = 'United States';
    if (text.includes('土耳其') || text.includes('turkey')) victim = 'Turkey';

    if (text.startsWith('#日本') || text.startsWith('#japan')) attacker = 'Japan';
    else if (text.startsWith('#韓國') || text.startsWith('#korea')) attacker = 'South Korea';
    else if (text.startsWith('#美國') || text.startsWith('#usa')) attacker = 'United States';
    else if (text.startsWith('#土耳其') || text.startsWith('#turkey')) attacker = 'Turkey';
    else if (text.startsWith('#台灣') || text.startsWith('#taiwan') || text.startsWith('#tw')) attacker = 'Taiwan';

    broadcast('STOMP_COUNTRY', { attacker, victim, author });
    return;
  }

  // 3. 免費留言向心攀爬 (拉抬直播在線演算法熱度)
  const countryAliases = {
    '#台灣': 'Taiwan', '#taiwan': 'Taiwan', '#tw': 'Taiwan',
    '#土耳其': 'Turkey', '#turkey': 'Turkey', '#türkiye': 'Turkey', '#tr': 'Turkey',
    '#日本': 'Japan', '#japan': 'Japan', '#jp': 'Japan',
    '#美國': 'United States', '#usa': 'United States', '#us': 'United States',
    '#韓國': 'South Korea', '#korea': 'South Korea', '#kr': 'South Korea',
    '#巴西': 'Brazil', '#brazil': 'Brazil', '#br': 'Brazil',
    '#德國': 'Germany', '#germany': 'Germany', '#de': 'Germany',
    '#法國': 'France', '#france': 'France', '#fr': 'France',
    '#英國': 'United Kingdom', '#uk': 'United Kingdom', '#gb': 'United Kingdom',
    '#烏克蘭': 'Ukraine', '#ukraine': 'Ukraine', '#ua': 'Ukraine',
    '#加拿大': 'Canada', '#canada': 'Canada', '#ca': 'Canada',
    '#阿根廷': 'Argentina', '#argentina': 'Argentina', '#ar': 'Argentina',
    '#印度': 'India', '#india': 'India', '#in': 'India'
  };

  for (const [kw, cName] of Object.entries(countryAliases)) {
    if (text.includes(kw)) {
      if (!allowCommand(author, 'assist', 10000)) return;
      broadcast('ASSIST_COUNTRY', { team: cName, author });
      break;
    }
  }

  if (text.includes('#護盾') || text.includes('!shield')) {
    if (!allowCommand(author, 'shield', 10000)) return;
    broadcast('SHIELD_COUNTRY', { team: 'Taiwan', author });
  } else if (text.includes('#復活') || text.includes('!respawn') || text.includes('!rocket')) {
    broadcast('RESPAWN_COUNTRY', { team: 'Taiwan', author });
  }
}

// 啟動 YouTube Live Chat 監聽器
function startYouTubeListener(channelOrLiveId) {
  if (!LiveChat) {
    console.log('[YouTube] LiveChat driver not available.');
    return;
  }

  if (liveChatClient) {
    try {
      liveChatClient.stop();
    } catch (err) {}
    liveChatClient = null;
  }

  if (!channelOrLiveId) {
    console.log('[YouTube] No channel/liveId configured. Waiting for configuration...');
    return;
  }

  console.log(`[YouTube] Connecting to live chat for ID: ${channelOrLiveId}...`);
  // 支援直播 ID (liveId) 或頻道 handle
  const options = channelOrLiveId.startsWith('UC') || channelOrLiveId.startsWith('@')
    ? { channelId: channelOrLiveId }
    : { liveId: channelOrLiveId };

  liveChatClient = new LiveChat(options);

  liveChatClient.on('start', (liveId) => {
    console.log(`[YouTube] Successfully connected to live: ${liveId}`);
    broadcast('STREAM_CONNECTED', { liveId });
  });

  liveChatClient.on('end', (reason) => {
    console.log(`[YouTube] Live chat ended: ${reason}. Retrying in 15 seconds...`);
    setTimeout(() => startYouTubeListener(activeLiveId), 15000);
  });

  liveChatClient.on('error', (err) => {
    console.error('[YouTube] Chat listener error:', err.message);
    setTimeout(() => startYouTubeListener(activeLiveId), 15000);
  });

  liveChatClient.on('chat', (chatItem) => {
    const author = chatItem.author?.name || 'Viewer';
    const messageText = chatItem.message?.map(m => m.text).join('') || '';
    const isSuperChat = Boolean(chatItem.superchat);
    let amount = 0;

    if (isSuperChat && chatItem.superchat?.amount) {
      amount = parseFloat(chatItem.superchat.amount.replace(/[^0-9.]/g, '')) || 50;
    }

    handleChatMessage({ author, messageText, amount, isSuperChat });
  });

  liveChatClient.start().catch((err) => {
    console.error('[YouTube] Failed to start listener:', err.message);
    setTimeout(() => startYouTubeListener(activeLiveId), 15000);
  });
}

// REST 介面：手動觸發測試、設定直播 ID、健康檢查
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    connections: wss.clients.size,
    liveId: activeLiveId || null,
    uptime: process.uptime()
  });
});

app.post('/api/set-live-id', (req, res) => {
  const { liveId } = req.body;
  activeLiveId = (liveId || '').trim();
  if (activeLiveId) {
    startYouTubeListener(activeLiveId);
    res.json({ success: true, message: `Listener started for: ${activeLiveId}` });
  } else {
    if (liveChatClient) liveChatClient.stop();
    res.json({ success: true, message: 'Listener stopped' });
  }
});

app.post('/api/simulate-action', (req, res) => {
  const { action, payload } = req.body;
  broadcast(action, payload || { author: 'LocalAdmin' });
  res.json({ success: true, triggered: action });
});

// WebSocket 連結生命週期
wss.on('connection', (ws) => {
  console.log(`[WebSocket] Client connected. Active clients: ${wss.clients.size}`);
  ws.send(JSON.stringify({ action: 'CONNECTED', payload: { liveId: activeLiveId } }));

  ws.on('close', () => {
    console.log(`[WebSocket] Client disconnected. Active clients: ${wss.clients.size}`);
  });
});

// 啟動伺服器
server.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`  The Ascent: Orbital Domination Server (Apple Live Activity)`);
  console.log(`  Overlay URL (for OBS): http://localhost:${PORT}`);
  console.log(`  Admin Control:        http://localhost:${PORT}/admin.html`);
  console.log(`====================================================`);

  if (activeLiveId) {
    startYouTubeListener(activeLiveId);
  }
});
