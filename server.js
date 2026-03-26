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

const API_KEY = process.env.API_KEY || "secret123";

let devices = {};
let admins = [];

// SOCKET
io.on("connection", (socket) => {
  console.log("Connected:", socket.id);

  socket.on("register_device", ({ device_id, api_key }) => {
    if (api_key !== API_KEY) return socket.disconnect();

    devices[device_id] = { socket, lastSeen: Date.now() };

    broadcastAdmins("device_status", { device_id, status: "online" });
  });

  socket.on("register_admin", (api_key) => {
    if (api_key !== API_KEY) return socket.disconnect();

    admins.push(socket);
    socket.emit("device_list", Object.keys(devices));
  });

  socket.on("live_data", (payload) => {
    if (!devices[payload.device_id]) return;

    devices[payload.device_id].lastSeen = Date.now();

    broadcastAdmins("live_data", payload);
  });

  socket.on("send_command", ({ device_id, command }) => {
    if (devices[device_id]) {
      devices[device_id].socket.emit("command", command);
    }
  });

  socket.on("disconnect", () => {
    for (let id in devices) {
      if (devices[id].socket === socket) {
        delete devices[id];
        broadcastAdmins("device_status", { device_id: id, status: "offline" });
      }
    }

    admins = admins.filter(a => a !== socket);
  });
});

function broadcastAdmins(event, data) {
  admins.forEach(a => a.emit(event, data));
}

// ROOT FIX
app.get("/", (req, res) => {
  res.sendFile(__dirname + "/public/index.html");
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("Server running:", PORT));
