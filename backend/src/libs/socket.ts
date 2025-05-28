import { Server as SocketIO } from "socket.io";
import { Server } from "http";
import AppError from "../errors/AppError";
import logger from "../utils/logger";
import { instrument } from "@socket.io/admin-ui";
import User from "../models/User";
import jwt from "jsonwebtoken"; // <== IMPORTANTE

let io: SocketIO;

export const initIO = (httpServer: Server): SocketIO => {
  io = new SocketIO(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL
    }
  });

  // ✅ Middleware de autenticação por token
  io.use((socket, next) => {
    const token = socket.handshake.query.token as string;

    if (!token) {
      return next(new Error("Token ausente"));
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.data.user = decoded;
      return next();
    } catch (err) {
      return next(new Error("Token inválido"));
    }
  });

  // ✅ Verificação da origem (opcional)
  io.engine.on("headers", (headers, req) => {
    const origin = req.headers.origin || req.headers.referer;
    const allowedOrigins = [process.env.FRONTEND_URL];

    if (origin && !allowedOrigins.includes(origin)) {
      console.warn("WebSocket bloqueado de origem não autorizada:", origin);
      req.destroy();
    }
  });

  if (process.env.SOCKET_ADMIN && JSON.parse(process.env.SOCKET_ADMIN)) {
    User.findByPk(1).then((adminUser) => {
      instrument(io, {
        auth: {
          type: "basic",
          username: adminUser.email,
          password: adminUser.passwordHash
        },
        mode: "development"
      });
    });
  }

  const workspaces = io.of(/^\/\w+$/);
  workspaces.on("connection", socket => {
    const { userId } = socket.handshake.query;

    socket.on("joinChatBox", (ticketId: string) => {
      socket.join(ticketId);
    });

    socket.on("joinNotification", () => {
      socket.join("notification");
    });

    socket.on("joinTickets", (status: string) => {
      socket.join(status);
    });

    socket.on("joinTicketsLeave", (status: string) => {
      socket.leave(status);
    });

    socket.on("joinChatBoxLeave", (ticketId: string) => {
      socket.leave(ticketId);
    });

    socket.on("disconnect", () => {
      // desconectado
    });
  });

  return io;
};

export const getIO = (): SocketIO => {
  if (!io) {
    throw new AppError("Socket IO not initialized");
  }
  return io;
};