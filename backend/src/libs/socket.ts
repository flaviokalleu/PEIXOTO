
import { Server as SocketIO } from "socket.io";
import { Server } from "http";
import AppError from "../errors/AppError";
import logger from "../utils/logger";
import { instrument } from "@socket.io/admin-ui";
import User from "../models/User";
import jwt from "jsonwebtoken";
import authConfig from "../config/auth";

let io: SocketIO;

export const initIO = (httpServer: Server): SocketIO => {
  io = new SocketIO(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL,
      credentials: true
    }
  });

  if (process.env.SOCKET_ADMIN && JSON.parse(process.env.SOCKET_ADMIN)) {
    User.findByPk(1).then(
      (adminUser) => {
        instrument(io, {
          auth: {
            type: "basic",
            username: adminUser.email,
            password: adminUser.passwordHash
          },
          mode: "development",
        });
      }
    ); 
  }  
  
  const workspaces = io.of(/^\/\w+$/);
  workspaces.use(async (socket, next) => {
    // Tentar obter token de múltiplas fontes
    let token = socket.handshake.auth?.token || socket.handshake.query?.token;
    
    // Se não encontrou token, tentar nos cookies
    if (!token && socket.handshake.headers.cookie) {
      const cookies = socket.handshake.headers.cookie.split(';');
      for (let cookie of cookies) {
        const [name, value] = cookie.trim().split('=');
        if (name === 'token' || name === 'authToken' || name === 'public-token') {
          token = value;
          break;
        }
      }
    }
    
    console.log('Socket auth attempt:', {
      hasAuthToken: !!socket.handshake.auth?.token,
      hasQueryToken: !!socket.handshake.query?.token,
      hasCookies: !!socket.handshake.headers.cookie,
      finalToken: !!token
    });
    
    if (!token) {
      console.error('Socket authentication failed: No token provided');
      return next(new Error("Authentication error: Token not provided"));
    }
    
    try {
      const decoded = jwt.verify(token, authConfig.secret);
      // @ts-ignore
      socket.user = decoded;
      console.log('Socket authenticated successfully:', { userId: (decoded as any).id, companyId: (decoded as any).companyId });
      return next();
    } catch (err) {
      console.error('Socket authentication failed: Invalid token', (err as Error).message);
      return next(new Error("Authentication error: Invalid token"));
    }
  });

  workspaces.on("connection", socket => {
    // @ts-ignore
    const user = socket.user;

    socket.on("joinChatBox", (ticketId: string) => {
      socket.join(`chatbox_${user.id}_${ticketId}`);
    });

    socket.on("joinNotification", () => {
      socket.join(`notification_${user.id}`);
    });

    socket.on("joinTickets", (status: string) => {
      socket.join(`tickets_${user.id}_${status}`);
    });

    socket.on("joinTicketsLeave", (status: string) => {
      socket.leave(`tickets_${user.id}_${status}`);
    });

    socket.on("joinChatBoxLeave", (ticketId: string) => {
      socket.leave(`chatbox_${user.id}_${ticketId}`);
    });

    socket.on("disconnect", () => {
      // logger.info(`Client disconnected namespace ${socket.nsp.name}`);
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