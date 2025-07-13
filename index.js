const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const WebSocket = require('ws');
const axios = require('axios');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve static files
app.use(express.static('public'));

// Global variables
const globalLastSeen = new Map();
let sharedWebSocket = null;
let keepAliveInterval = null;

function formatValue(val) {
  if (val >= 1_000_000) return `x${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `x${(val / 1_000).toFixed(1)}K`;
  return `x${val}`;
}

function getPHTime() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" }));
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

      updateLastSeen("gear", stockData.gear.items);
      updateLastSeen("seed", stockData.seed.items);
      updateLastSeen("egg", stockData.egg.items);
      updateLastSeen("cosmetics", stockData.cosmetics.items);
      updateLastSeen("event", stockData.event.items);
      updateLastSeen("travelingmerchant", stockData.travelingmerchant.items);

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
        travelingmerchant: stock.travelingmerchant || { items: [], appearIn: null }
      };

      // Get weather data
      const weather = await axios.get("https://growagardenstock.com/api/stock/weather")
        .then(res => res.data).catch(() => null);

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

  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  ensureWebSocketConnection();
});