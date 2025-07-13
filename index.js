const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const WebSocket = require('ws');
const axios = require('axios');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve static files
app.use(express.static('public'));

// Global variables
const globalLastSeen = new Map();
let sharedWebSocket = null;
let keepAliveInterval = null;

// Notifier system
const NOTIFIER_FILE = './notifier_list.json';
const ADMIN_PASSWORDS = ['admin123', 'stockadmin', 'gardenboss']; // Change these passwords
const targetItems = ['master sprinkler', 'godly sprinkler', 'advance sprinkler', 'ember lily', 'beanstalk'];
let notifierList = [];
let restockTimers = new Map();

// Facebook Page Integration
const FACEBOOK_PAGE_ACCESS_TOKEN = process.env.FACEBOOK_PAGE_ACCESS_TOKEN || 'your_facebook_page_access_token';
const FACEBOOK_PAGE_ID = process.env.FACEBOOK_PAGE_ID || 'your_facebook_page_id';

function formatValue(val) {
  if (val >= 1_000_000) return `x${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `x${(val / 1_000).toFixed(1)}K`;
  return `x${val}`;
}

function getPHTime() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" }));
}

// Load notifier list
function loadNotifierList() {
  try {
    if (fs.existsSync(NOTIFIER_FILE)) {
      const data = fs.readFileSync(NOTIFIER_FILE, 'utf8');
      notifierList = JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading notifier list:', error);
    notifierList = [];
  }
}

// Save notifier list
function saveNotifierList() {
  try {
    fs.writeFileSync(NOTIFIER_FILE, JSON.stringify(notifierList, null, 2));
  } catch (error) {
    console.error('Error saving notifier list:', error);
  }
}

// Send Facebook notification
async function sendFacebookNotification(message) {
  try {
    const response = await axios.post(
      `https://graph.facebook.com/v18.0/${FACEBOOK_PAGE_ID}/feed`,
      {
        message: message,
        access_token: FACEBOOK_PAGE_ACCESS_TOKEN
      }
    );
    console.log('Facebook notification sent:', response.data);
  } catch (error) {
    console.error('Error sending Facebook notification:', error.response?.data || error.message);
  }
}

// Check for target items and notify
function checkTargetItems(stockData) {
  const foundItems = [];

  Object.keys(stockData).forEach(category => {
    if (stockData[category] && stockData[category].items) {
      stockData[category].items.forEach(item => {
        if (item.quantity > 0) {
          const itemName = item.name.toLowerCase();
          const isTargetItem = targetItems.some(target => 
            itemName.includes(target.toLowerCase())
          );

          if (isTargetItem) {
            foundItems.push({
              name: item.name,
              quantity: item.quantity,
              category: category,
              emoji: item.emoji || ''
            });
          }
        }
      });
    }
  });

  if (foundItems.length > 0) {
    const message = `🚨 SPECIAL ITEMS IN STOCK! 🚨\n\n` +
      foundItems.map(item => 
        `${item.emoji} ${item.name}: ${formatValue(item.quantity)} (${item.category})`
      ).join('\n') +
      `\n\n⏰ ${getPHTime().toLocaleString('en-US', { timeZone: 'Asia/Manila' })} (PH Time)` +
      `\n🌾 Grow A Garden Stock Tracker`;

    // Send Facebook notification
    sendFacebookNotification(message);

    // Notify all users via socket
    io.emit('specialItemNotification', {
      items: foundItems,
      message: message,
      timestamp: getPHTime()
    });
  }
}

// Set restock timer
function setRestockTimer(category, countdown) {
  if (!countdown) return;

  // Parse countdown string
  const timeMatch = countdown.match(/(?:(\d+)h\s*)?(?:(\d+)m\s*)?(?:(\d+)s)?/);
  if (timeMatch) {
    const hours = parseInt(timeMatch[1] || 0);
    const minutes = parseInt(timeMatch[2] || 0);
    const seconds = parseInt(timeMatch[3] || 0);

    const totalMs = (hours * 60 * 60 + minutes * 60 + seconds) * 1000;

    // Clear existing timer
    if (restockTimers.has(category)) {
      clearTimeout(restockTimers.get(category));
    }

    // Set new timer
    const timer = setTimeout(() => {
      console.log(`Restock timer expired for ${category}, fetching fresh data...`);
      fetchAndUpdateStock();
      restockTimers.delete(category);
    }, totalMs);

    restockTimers.set(category, timer);
    console.log(`Restock timer set for ${category}: ${countdown}`);
  }
}

// Fetch and update stock data
async function fetchAndUpdateStock() {
  try {
    const response = await axios.get('https://growagardenstock.com/api/stock');
    const stock = response.data;

    const stockData = {
      gear: stock.gear || { items: [], countdown: null },
      seed: stock.seed || { items: [], countdown: null },
      egg: stock.egg || { items: [], countdown: null },
      cosmetics: stock.cosmetics || { items: [], countdown: null },
      event: stock.event || { items: [], countdown: null },
      travelingmerchant: stock.travelingmerchant || { items: [], appearIn: null }
    };

    // Set restock timers
    Object.keys(stockData).forEach(category => {
      if (stockData[category].countdown) {
        setRestockTimer(category, stockData[category].countdown);
      } else if (stockData[category].appearIn) {
        setRestockTimer(category, stockData[category].appearIn);
      }
    });

    updateLastSeen("gear", stockData.gear.items);
    updateLastSeen("seed", stockData.seed.items);
    updateLastSeen("egg", stockData.egg.items);
    updateLastSeen("cosmetics", stockData.cosmetics.items);
    updateLastSeen("event", stockData.event.items);
    updateLastSeen("travelingmerchant", stockData.travelingmerchant.items);

    // Check for target items
    checkTargetItems(stockData);

    // Get weather data
    const weather = await axios.get("https://growagardenstock.com/api/stock/weather")
      .then(res => res.data).catch(() => null);

    const updateData = {
      stockData,
      weather,
      updatedAt: getPHTime()
    };

    latestStockData = updateData;
    io.emit('stockUpdate', updateData);

    console.log('Stock data refreshed automatically');
  } catch (error) {
    console.error('Error fetching stock data:', error);
  }
}

function updateLastSeen(category, items) {
  if (!Array.isArray(items)) return;
  if (!globalLastSeen.has(category)) globalLastSeen.set(category, new Map());
  const catMap = globalLastSeen.get(category);
  const now = getPHTime();
  for (const item of items) {
    if (item.quantity > 0) {
      catMap.set(item.name, now);
    }
  }
}

function ensureWebSocketConnection() {
  if (sharedWebSocket && sharedWebSocket.readyState === WebSocket.OPEN) return;

  sharedWebSocket = new WebSocket("wss://gagstock.gleeze.com");

  sharedWebSocket.on("open", () => {
    console.log("WebSocket connected");
    keepAliveInterval = setInterval(() => {
      if (sharedWebSocket.readyState === WebSocket.OPEN) {
        sharedWebSocket.send("ping");
      }
    }, 10000);
  });

  sharedWebSocket.on("message", async (data) => {
    try {
      const payload = JSON.parse(data);
      if (payload.status !== "success" || !payload.data) return;

      const stock = payload.data;
      const stockData = {
        gear: stock.gear || { items: [], countdown: null },
        seed: stock.seed || { items: [], countdown: null },
        egg: stock.egg || { items: [], countdown: null },
        cosmetics: stock.cosmetics || { items: [], countdown: null },
        event: stock.event || { items: [], countdown: null },
        travelingmerchant: stock.travelingmerchant || { items: [], appearIn: null }
      };

      // Set restock timers
      Object.keys(stockData).forEach(category => {
        if (stockData[category].countdown) {
          setRestockTimer(category, stockData[category].countdown);
        } else if (stockData[category].appearIn) {
          setRestockTimer(category, stockData[category].appearIn);
        }
      });

      updateLastSeen("gear", stockData.gear.items);
      updateLastSeen("seed", stockData.seed.items);
      updateLastSeen("egg", stockData.egg.items);
      updateLastSeen("cosmetics", stockData.cosmetics.items);
      updateLastSeen("event", stockData.event.items);
      updateLastSeen("travelingmerchant", stockData.travelingmerchant.items);

      // Check for target items
      checkTargetItems(stockData);

      // Get weather data
      const weather = await axios.get("https://growagardenstock.com/api/stock/weather")
        .then(res => res.data).catch(() => null);

      const updatedAt = getPHTime();

      const updateData = {
        stockData,
        weather,
        updatedAt
      };

      // Store latest data
      latestStockData = updateData;

      // Emit to all connected clients
      io.emit('stockUpdate', updateData);

    } catch (error) {
      console.error('Error processing WebSocket message:', error);
    }
  });

  sharedWebSocket.on("close", () => {
    console.log("WebSocket disconnected");
    clearInterval(keepAliveInterval);
    sharedWebSocket = null;
    setTimeout(ensureWebSocketConnection, 3000);
  });

  sharedWebSocket.on("error", (error) => {
    console.error('WebSocket error:', error);
    sharedWebSocket?.close();
  });
}

// Store latest data
let latestStockData = null;

// Socket.io connection handling
io.on('connection', async (socket) => {
  console.log('Client connected');

  // Send latest data to newly connected client if available
  if (latestStockData) {
    socket.emit('stockUpdate', latestStockData);
  } else {
    // Fetch initial data if not available
    try {
      const response = await axios.get('https://growagardenstock.com/api/stock');
      const stock = response.data;

      const stockData = {
        gear: stock.gear || { items: [], countdown: null },
        seed: stock.seed || { items: [], countdown: null },
        egg: stock.egg || { items: [], countdown: null },
        cosmetics: stock.cosmetics || { items: [], countdown: null },
        event: stock.event || { items: [], countdown: null },
        travelingmerchant: { items: [], appearIn: null }
      };

      // Get weather data
      const weather = await axios.get("https://growagardenstock.com/api/stock/weather")
        .then(res => res.data).catch(() => null);

      // Set restock timers for initial data
      Object.keys(stockData).forEach(category => {
        if (stockData[category].countdown) {
          setRestockTimer(category, stockData[category].countdown);
        } else if (stockData[category].appearIn) {
          setRestockTimer(category, stockData[category].appearIn);
        }
      });

      const initialData = {
        stockData,
        weather,
        updatedAt: getPHTime()
      };

      latestStockData = initialData;
      socket.emit('stockUpdate', initialData);
    } catch (error) {
      console.error('Error fetching initial stock data:', error);
      socket.emit('stockUpdate', {
        stockData: {
          gear: { items: [], countdown: null },
          seed: { items: [], countdown: null },
          egg: { items: [], countdown: null },
          cosmetics: { items: [], countdown: null },
          event: { items: [], countdown: null },
          travelingmerchant: { items: [], appearIn: null }
        },
        weather: null,
        updatedAt: getPHTime()
      });
    }
  }

  // Handle admin commands
  socket.on('adminCommand', (data) => {
    const { command, password, userId, name } = data;

    if (!ADMIN_PASSWORDS.includes(password)) {
      socket.emit('adminResponse', { success: false, message: 'Invalid admin password' });
      return;
    }

    if (command === 'addNotifier') {
      if (!userId || !name) {
        socket.emit('adminResponse', { success: false, message: 'User ID and name required' });
        return;
      }

      const existing = notifierList.find(u => u.userId === userId);
      if (existing) {
        socket.emit('adminResponse', { success: false, message: 'User already in notifier list' });
        return;
      }

      notifierList.push({
        userId,
        name,
        addedAt: getPHTime().toISOString(),
        addedBy: 'admin'
      });

      saveNotifierList();
      socket.emit('adminResponse', { 
        success: true, 
        message: `Added ${name} to notifier list`,
        notifierCount: notifierList.length
      });

      // Send notification to all clients about new subscriber
      io.emit('notifierUpdate', {
        type: 'userAdded',
        user: { userId, name },
        totalSubscribers: notifierList.length
      });
    }

    if (command === 'listNotifiers') {
      socket.emit('adminResponse', {
        success: true,
        notifierList: notifierList,
        count: notifierList.length
      });
    }

    if (command === 'removeNotifier') {
      if (!userId) {
        socket.emit('adminResponse', { success: false, message: 'User ID required' });
        return;
      }

      const index = notifierList.findIndex(u => u.userId === userId);
      if (index === -1) {
        socket.emit('adminResponse', { success: false, message: 'User not found in notifier list' });
        return;
      }

      const removed = notifierList.splice(index, 1)[0];
      saveNotifierList();
      socket.emit('adminResponse', { 
        success: true, 
        message: `Removed ${removed.name} from notifier list`,
        notifierCount: notifierList.length
      });
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/bot-test', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'bot-test.html'));
});

// API Routes
app.use(express.json());

// Bot testing API endpoint
app.post('/api/test-bot', (req, res) => {
  const { message, userId } = req.body;
  
  if (!message || !userId) {
    return res.status(400).json({ error: 'Message and userId required' });
  }

  // Simulate bot response
  handleFacebookMessage(userId, message);
  
  res.json({ 
    success: true, 
    timestamp: getPHTime().toISOString(),
    message: 'Bot response simulated'
  });
});

// Facebook webhook verification
app.get('/webhook', (req, res) => {
  const VERIFY_TOKEN = 'garden_stock_webhook_token';

  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('Webhook verified');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// Handle Facebook webhook events
app.post('/webhook', (req, res) => {
  const body = req.body;

  if (body.object === 'page') {
    body.entry.forEach((entry) => {
      const webhook_event = entry.messaging[0];
      console.log('Facebook webhook event:', webhook_event);

      if (webhook_event.message) {
        const sender_psid = webhook_event.sender.id;
        const message_text = webhook_event.message.text;

        // Handle Facebook messages
        handleFacebookMessage(sender_psid, message_text);
      }
    });

    res.status(200).send('EVENT_RECEIVED');
  } else {
    res.sendStatus(404);
  }
});

// Handle Facebook messages
async function handleFacebookMessage(sender_psid, message_text) {
  const lowerMessage = message_text.toLowerCase();

  if (lowerMessage.includes('subscribe') || lowerMessage.includes('notify')) {
    // Add user to notifier list
    const existing = notifierList.find(u => u.userId === sender_psid);
    if (!existing) {
      notifierList.push({
        userId: sender_psid,
        name: `FB_User_${sender_psid.slice(-8)}`,
        addedAt: getPHTime().toISOString(),
        addedBy: 'facebook',
        platform: 'facebook'
      });
      saveNotifierList();

      await sendFacebookMessage(sender_psid, 
        '🌾 You are now subscribed to Grow A Garden stock notifications! ' +
        'You\'ll be notified when special items (Master Sprinkler, Godly Sprinkler, Advance Sprinkler, Ember Lily, Beanstalk) are in stock.'
      );
    } else {
      await sendFacebookMessage(sender_psid, '✅ You are already subscribed to notifications!');
    }
  } else if (lowerMessage.includes('unsubscribe')) {
    const index = notifierList.findIndex(u => u.userId === sender_psid);
    if (index !== -1) {
      notifierList.splice(index, 1);
      saveNotifierList();
      await sendFacebookMessage(sender_psid, '❌ You have been unsubscribed from notifications.');
    } else {
      await sendFacebookMessage(sender_psid, '❓ You are not currently subscribed.');
    }
  } else if (lowerMessage.includes('stock') || lowerMessage.includes('status')) {
    if (latestStockData) {
      const { stockData } = latestStockData;
      const foundItems = [];

      Object.keys(stockData).forEach(category => {
        if (stockData[category] && stockData[category].items) {
          stockData[category].items.forEach(item => {
            if (item.quantity > 0) {
              const itemName = item.name.toLowerCase();
              const isTargetItem = targetItems.some(target => 
                itemName.includes(target.toLowerCase())
              );

              if (isTargetItem) {
                foundItems.push(`${item.emoji || ''} ${item.name}: ${formatValue(item.quantity)}`);
              }
            }
          });
        }
      });

      const message = foundItems.length > 0 
        ? `🌾 Special items currently in stock:\n${foundItems.join('\n')}`
        : '❌ No special items currently in stock.';

      await sendFacebookMessage(sender_psid, message);
    } else {
      await sendFacebookMessage(sender_psid, '⏳ Stock data is being loaded...');
    }
  } else {
    await sendFacebookMessage(sender_psid, 
      '🌾 Grow A Garden Stock Bot\n\n' +
      'Commands:\n' +
      '• "subscribe" - Get notified for special items\n' +
      '• "unsubscribe" - Stop notifications\n' +
      '• "stock" - Check current special items\n\n' +
      'Special items: Master Sprinkler, Godly Sprinkler, Advance Sprinkler, Ember Lily, Beanstalk'
    );
  }
}

// Send Facebook message
async function sendFacebookMessage(recipient_psid, message) {
  try {
    const response = await axios.post(
      'https://graph.facebook.com/v18.0/me/messages',
      {
        recipient: { id: recipient_psid },
        message: { text: message }
      },
      {
        params: { access_token: FACEBOOK_PAGE_ACCESS_TOKEN }
      }
    );
    console.log('Facebook message sent:', response.data);
  } catch (error) {
    console.error('Error sending Facebook message:', error.response?.data || error.message);
  }
}

// Auto uptime system - Auto-detect deployment URL
let DEPLOYMENT_URL = null;

// Auto-detect deployment URL
function detectDeploymentURL() {
  // Try environment variables from different platforms
  const possibleUrls = [
    process.env.REPL_URL,
    process.env.RENDER_EXTERNAL_URL,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
    process.env.RAILWAY_STATIC_URL,
    process.env.HEROKU_APP_NAME ? `https://${process.env.HEROKU_APP_NAME}.herokuapp.com` : null,
    process.env.DEPLOYMENT_URL,
    process.env.APP_URL,
    process.env.PUBLIC_URL
  ];

  // Find first valid URL
  for (const url of possibleUrls) {
    if (url && url.startsWith('http')) {
      DEPLOYMENT_URL = url;
      console.log(`🌐 Auto-detected deployment URL: ${DEPLOYMENT_URL}`);
      return DEPLOYMENT_URL;
    }
  }

  // Fallback - try to detect from request headers later
  console.log('⚠️ No deployment URL found in environment variables. Will detect from first request.');
  return null;
}

// Store deployment URL from incoming requests
app.use((req, res, next) => {
  if (!DEPLOYMENT_URL && req.headers.host) {
    const protocol = req.headers['x-forwarded-proto'] || (req.connection.encrypted ? 'https' : 'http');
    DEPLOYMENT_URL = `${protocol}://${req.headers.host}`;
    console.log(`🌐 Detected deployment URL from request: ${DEPLOYMENT_URL}`);
  }
  next();
});

// Keep-alive endpoint
app.get('/keep-alive', (req, res) => {
  res.status(200).json({
    status: 'alive',
    timestamp: getPHTime().toISOString(),
    uptime: process.uptime(),
    notifiers: notifierList.length,
    activeTimers: restockTimers.size,
    deploymentUrl: DEPLOYMENT_URL,
    platform: detectPlatform()
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    websocket: sharedWebSocket ? sharedWebSocket.readyState === WebSocket.OPEN : false,
    timestamp: getPHTime().toISOString(),
    memory: process.memoryUsage(),
    notifierCount: notifierList.length,
    deploymentUrl: DEPLOYMENT_URL,
    platform: detectPlatform()
  });
});

// Detect deployment platform
function detectPlatform() {
  if (process.env.REPL_SLUG) return 'Replit';
  if (process.env.RENDER) return 'Render';
  if (process.env.VERCEL) return 'Vercel';
  if (process.env.RAILWAY_ENVIRONMENT) return 'Railway';
  if (process.env.DYNO) return 'Heroku';
  if (process.env.NETLIFY) return 'Netlify';
  return 'Unknown';
}

// Auto uptime function
function startUptimeSystem() {
  // Wait a bit for URL detection
  setTimeout(() => {
    if (!DEPLOYMENT_URL) {
      console.log('⚠️ No deployment URL detected yet. Uptime system will start once URL is detected.');
      return;
    }

    const platform = detectPlatform();
    console.log(`🚀 Starting uptime system for ${platform} deployment: ${DEPLOYMENT_URL}`);

    // Ping self every 5 minutes to keep alive
    const uptimeInterval = setInterval(async () => {
      if (!DEPLOYMENT_URL) {
        console.log('⏳ Waiting for deployment URL detection...');
        return;
      }

      try {
        const response = await axios.get(`${DEPLOYMENT_URL}/keep-alive`, {
          timeout: 10000,
          headers: {
            'User-Agent': 'GrowAGarden-UptimeBot/1.0',
            'Accept': 'application/json'
          }
        });
        console.log(`🟢 Uptime ping successful [${platform}]: ${response.data.status} - ${new Date().toISOString()}`);
      } catch (error) {
        console.error('🔴 Uptime ping failed:', error.message);
      }
    }, 5 * 60 * 1000); // 5 minutes

    // Extended keep-alive ping every 15 minutes
    const healthInterval = setInterval(async () => {
      if (!DEPLOYMENT_URL) return;

      try {
        await axios.get(`${DEPLOYMENT_URL}/health`, {
          timeout: 15000,
          headers: {
            'User-Agent': 'GrowAGarden-HealthCheck/1.0',
            'Accept': 'application/json'
          }
        });
        console.log(`💚 Health check completed [${platform}]: ${new Date().toISOString()}`);
      } catch (error) {
        console.error('💔 Health check failed:', error.message);
      }
    }, 15 * 60 * 1000); // 15 minutes

    // Additional ping for platforms that need more frequent pings
    if (platform === 'Render' || platform === 'Railway') {
      setInterval(async () => {
        if (!DEPLOYMENT_URL) return;
        try {
          await axios.get(`${DEPLOYMENT_URL}/keep-alive`, {
            timeout: 8000,
            headers: { 'User-Agent': 'KeepAlive-Bot/1.0' }
          });
        } catch (error) {
          // Silent fail for frequent pings
        }
      }, 3 * 60 * 1000); // 3 minutes for render/railway
    }

    console.log('🚀 Auto uptime system started - Bot will stay active 24/7');
  }, 2000);
}

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => {
  const platform = detectPlatform();
  console.log(`Server running on port ${PORT} [${platform}]`);

  // Detect deployment URL
  detectDeploymentURL();

  if (DEPLOYMENT_URL) {
    console.log(`Facebook webhook URL: ${DEPLOYMENT_URL}/webhook`);
    console.log(`Keep-alive URL: ${DEPLOYMENT_URL}/keep-alive`);
  } else {
    console.log(`Facebook webhook URL: [URL will be auto-detected]/webhook`);
    console.log(`Keep-alive URL: [URL will be auto-detected]/keep-alive`);
  }

  loadNotifierList();
  ensureWebSocketConnection();

  // Start auto uptime system after 10 seconds
  setTimeout(() => {
    startUptimeSystem();
  }, 10000);
});