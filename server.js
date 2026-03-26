require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

// serve frontend
app.use(express.static("public"));

const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" }
});

// =========================
// ⚙️ CONFIG
// =========================
const API_KEY = process.env.API_KEY || "secret123";

// =========================
// 🧠 MEMORY STORAGE
// =========================
let devices = {}; // device_id -> { socket, lastSeen }
let admins = [];

// =========================
// 🔌 SOCKET CONNECTION
// =========================
io.on("connection", (socket) => {
  console.log("🔌 Connected:", socket.id);

  // =========================
  // 📱 REGISTER DEVICE
  // =========================
  socket.on("register_device", ({ device_id, api_key }) => {
    if (api_key !== API_KEY) {
      console.log("❌ Unauthorized device");
      return socket.disconnect();
    }

    // 🔥 FIX: handle reconnect
    if (devices[device_id]) {
      try { devices[device_id].socket.disconnect(); } catch {}
    }

    devices[device_id] = {
      socket,
      lastSeen: Date.now()
    };

    console.log("📱 Device registered:", device_id);

    broadcastAdmins("device_status", {
      device_id,
      status: "online"
    });

    socket.emit("registered", { success: true });
  });

  // =========================
  // 👨‍💻 REGISTER ADMIN
  // =========================
  socket.on("register_admin", (api_key) => {
    if (api_key !== API_KEY) {
      console.log("❌ Unauthorized admin");
      return socket.disconnect();
    }

    admins.push(socket);
    console.log("👨‍💻 Admin connected");

    socket.emit("device_list", Object.keys(devices));
  });

  // =========================
  // 📡 LIVE DATA FROM DEVICE
  // =========================
  socket.on("live_data", (payload) => {
    const { device_id } = payload;

    if (!devices[device_id]) return;

    devices[device_id].lastSeen = Date.now();

    broadcastAdmins("live_data", {
      ...payload,
      timestamp: Date.now()
    });
  });

  // =========================
  // ❤️ HEARTBEAT
  // =========================
  socket.on("heartbeat", (device_id) => {
    if (devices[device_id]) {
      devices[device_id].lastSeen = Date.now();
    }
  });

  // =========================
  // 🎯 SEND COMMAND (ADMIN → DEVICE)
  // =========================
  socket.on("send_command", ({ device_id, command, payload }) => {
    if (devices[device_id]) {
      devices[device_id].socket.emit("command", {
        command,
        payload
      });
    }
  });

  // =========================
  // 📢 BROADCAST COMMAND
  // =========================
  socket.on("broadcast_command", ({ command, payload }) => {
    for (let id in devices) {
      devices[id].socket.emit("command", {
        command,
        payload
      });
    }
  });

  // =========================
  // ❌ DISCONNECT
  // =========================
  socket.on("disconnect", () => {
    console.log("❌ Disconnected:", socket.id);

    // remove device
    for (let id in devices) {
      if (devices[id].socket === socket) {
        delete devices[id];

        broadcastAdmins("device_status", {
          device_id: id,
          status: "offline"
        });
      }
    }

    // remove admin
    admins = admins.filter(a => a !== socket);
  });
});

// =========================
// 📡 HELPER
// =========================
function broadcastAdmins(event, data) {
  admins.forEach(admin => {
    admin.emit(event, data);
  });
}

// =========================
// 🧠 AUTO CLEANUP DEAD DEVICES
// =========================
setInterval(() => {
  const now = Date.now();

  for (let id in devices) {
    if (now - devices[id].lastSeen > 30000) {
      console.log("⚠️ Device timeout:", id);

      delete devices[id];

      broadcastAdmins("device_status", {
        device_id: id,
        status: "offline"
      });
    }
  }
}, 10000);

// =========================
// ❤️ HEALTH CHECK
// =========================
app.get("/ping", (req, res) => {
  res.send("alive");
});

// =========================
// 📊 STATUS API
// =========================
app.get("/status", (req, res) => {
  res.json({
    devices: Object.keys(devices),
    adminCount: admins.length,
    uptime: process.uptime()
  });
});

// =========================
// 🏠 ROOT (FIX)
// =========================
app.get("/", (req, res) => {
  res.sendFile(__dirname + "/public/index.html");
});

// =========================
// 🚀 START SERVER
// =========================
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log("🚀 Server running on port:", PORT);
});
