import { Server as SocketIO } from "socket.io";
import { Server } from "http";
import AppError from "../errors/AppError";
import logger from "../utils/logger";
import { instrument } from "@socket.io/admin-ui";
import { z } from "zod";
import jwt from "jsonwebtoken";

// Define allowed namespaces
const ALLOWED_NAMESPACES = /^\/workspace-\d+$/;

// Validation schemas
const userIdSchema = z.string().uuid().optional();
const ticketIdSchema = z.string().uuid();
const statusSchema = z.enum(["open", "closed", "pending"]);
const jwtPayloadSchema = z.object({
  userId: z.string().uuid(),
  iat: z.number().optional(),
  exp: z.number().optional(),
});

// Allowed CORS origins
const ALLOWED_ORIGINS = process.env.FRONTEND_URL
  ? process.env.FRONTEND_URL.split(",").map((url) => url.trim())
  : ["http://localhost:3000"];

// Custom error class for Socket.IO compatibility
class SocketCompatibleAppError extends Error {
  constructor(public message: string, public statusCode: number) {
    super(message);
    this.name = "AppError";
    Error.captureStackTrace?.(this, SocketCompatibleAppError);
  }
}

let io: SocketIO;

export const initIO = (httpServer: Server): SocketIO => {
  io = new SocketIO(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (!origin || ALLOWED_ORIGINS.includes(origin)) {
          callback(null, true);
        } else {
          logger.warn(`Unauthorized origin: ${origin}`);
          callback(new SocketCompatibleAppError("CORS policy violation", 403));
        }
      },
      methods: ["GET", "POST"],
      credentials: true,
    },
    maxHttpBufferSize: 1e6, // 1MB payload limit
    pingTimeout: 20000,
    pingInterval: 25000,
  });

  // JWT authentication middleware
  io.use((socket, next) => {
    const token = socket.handshake.query.token as string;
    // Allow connections without token for public events (optional)
    if (!token) {
      logger.warn("Connection attempt without token");
      socket.data.user = null; // Allow unauthenticated access
      return next();
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || "default_secret");
      const validatedPayload = jwtPayloadSchema.parse(decoded);
      socket.data.user = validatedPayload;
      next();
    } catch (err) {
      logger.warn("Invalid token");
      return next(new SocketCompatibleAppError("Invalid token", 401));
    }
  });

  // Admin UI for development
  const isAdminEnabled = process.env.SOCKET_ADMIN === "true" && process.env.NODE_ENV !== "production";
  if (isAdminEnabled && process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD) {
    try {
      instrument(io, {
        auth: {
          type: "basic",
          username: process.env.ADMIN_USERNAME,
          password: process.env.ADMIN_PASSWORD,
        },
        mode: "development",
        readonly: true,
      });
      logger.info("Socket.IO Admin UI initialized in development mode");
    } catch (error) {
      logger.error("Failed to initialize Socket.IO Admin UI", error);
    }
  } else if (isAdminEnabled) {
    logger.warn("Admin credentials missing, Admin UI not initialized");
  }

  // Root namespace (/) for general events like company-${companyId}-whatsapp
  io.of("/").on("connection", (socket) => {
    const clientIp = socket.handshake.address;
    logger.info(`Client connected to root namespace (IP: ${clientIp})`);    

    socket.on("error", (error) => {
      logger.error(`Error in root namespace: ${error.message}`);
    });
  });

  // Dynamic workspaces namespaces
  const workspaces = io.of(ALLOWED_NAMESPACES);
  workspaces.on("connection", (socket) => {
    const clientIp = socket.handshake.address;

    // Validate userId
    let userId: string | undefined;
    try {
      userId = userIdSchema.parse(socket.handshake.query.userId);
    } catch (error) {
      socket.disconnect(true);
      logger.warn(`Invalid userId from ${clientIp}`);
      return;
    }

    logger.info(`Client connected to namespace ${socket.nsp.name} (IP: ${clientIp})`);

    socket.on("joinChatBox", (ticketId: string, callback: (error?: string) => void) => {
      try {
        const validatedTicketId = ticketIdSchema.parse(ticketId);
        socket.join(validatedTicketId);
        logger.info(`Client joined ticket channel ${validatedTicketId} in namespace ${socket.nsp.name}`);
        callback();
      } catch (error) {
        logger.warn(`Invalid ticketId: ${ticketId}`);
        callback("Invalid ticket ID");
      }
    });

    socket.on("joinNotification", (callback: (error?: string) => void) => {
      socket.join("notification");
      logger.info(`Client joined notification channel in namespace ${socket.nsp.name}`);
      callback();
    });

    socket.on("joinTickets", (status: string, callback: (error?: string) => void) => {
      try {
        const validatedStatus = statusSchema.parse(status);
        socket.join(validatedStatus);
        logger.info(`Client joined ${validatedStatus} channel in namespace ${socket.nsp.name}`);
        callback();
      } catch (error) {
        logger.warn(`Invalid status: ${status}`);
        callback("Invalid status");
      }
    });

    socket.on("joinTicketsLeave", (status: string, callback: (error?: string) => void) => {
      try {
        const validatedStatus = statusSchema.parse(status);
        socket.leave(validatedStatus);
        logger.info(`Client left ${validatedStatus} channel in namespace ${socket.nsp.name}`);
        callback();
      } catch (error) {
        logger.warn(`Invalid status: ${status}`);
        callback("Invalid status");
      }
    });

    socket.on("joinChatBoxLeave", (ticketId: string, callback: (error?: string) => void) => {
      try {
        const validatedTicketId = ticketIdSchema.parse(ticketId);
        socket.leave(validatedTicketId);
        logger.info(`Client left ticket channel ${validatedTicketId} in namespace ${socket.nsp.name}`);
        callback();
      } catch (error) {
        logger.warn(`Invalid ticketId: ${ticketId}`);
        callback("Invalid ticket ID");
      }
    });

    socket.on("disconnect", () => {
      logger.info(`Client disconnected from namespace ${socket.nsp.name} (IP: ${clientIp})`);
    });

    socket.on("error", (error) => {
      logger.error(`Error in namespace ${socket.nsp.name}: ${error.message}`);
    });
  });

  return io;
};

export const getIO = (): SocketIO => {
  if (!io) {
    throw new SocketCompatibleAppError("Socket IO not initialized", 500);
  }
  return io;
};