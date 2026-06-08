import { createServer } from "node:http";
import { Server } from "socket.io";

const port = Number(process.env.PORT || 3001);

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: {
    origin: "*",
  },
});

io.on("connection", socket => {
  socket.on("room:create", async ({ roomCode }) => {
    socket.join(roomCode);
    socket.data.roomCode = roomCode;
    socket.data.role = "host";
    socket.to(roomCode).emit("room:host-ready", {
      roomCode,
    });

    const roomSockets = await io.in(roomCode).fetchSockets();
    roomSockets
      .filter(roomSocket => roomSocket.id !== socket.id && roomSocket.data.role === "guest")
      .forEach(roomSocket => {
        socket.emit("room:guest-joined", {
          socketId: roomSocket.id,
        });
      });
  });

  socket.on("room:join", ({ roomCode, role }) => {
    socket.join(roomCode);
    socket.data.roomCode = roomCode;
    socket.data.role = role;
    socket.to(roomCode).emit("room:guest-joined", {
      socketId: socket.id,
    });
  });

  socket.on("webrtc:offer", payload => {
    socket.to(payload.roomCode).emit("webrtc:offer", payload);
  });

  socket.on("webrtc:answer", payload => {
    socket.to(payload.roomCode).emit("webrtc:answer", payload);
  });

  socket.on("webrtc:ice-candidate", payload => {
    socket.to(payload.roomCode).emit("webrtc:ice-candidate", payload);
  });

  socket.on("reading:card-locked", payload => {
    socket.to(payload.roomCode).emit("reading:card-locked", payload);
  });

  socket.on("reading:card-confirmed", payload => {
    socket.to(payload.roomCode).emit("reading:card-confirmed", payload);
  });

  socket.on("room:leave", ({ roomCode }) => {
    socket.leave(roomCode);
  });

  socket.on("disconnect", () => {
    const roomCode = socket.data.roomCode;
    if (!roomCode) return;
    socket.to(roomCode).emit("room:peer-left", {
      role: socket.data.role ?? "unknown",
    });
  });
});

httpServer.listen(port, () => {
  console.log(`Realtime server listening on http://localhost:${port}`);
});
