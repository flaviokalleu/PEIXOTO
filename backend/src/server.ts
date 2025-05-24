import 'dotenv/config';
import gracefulShutdown from "http-graceful-shutdown";
import app from "./app";
import { initIO } from "./libs/socket";
import logger from "./utils/logger";
import { StartAllWhatsAppsSessions } from "./services/WbotServices/StartAllWhatsAppsSessions";
import Company from "./models/Company";
import BullQueue from './libs/queue';
import { startQueueProcess } from "./queues";

// Start the server
async function startServer() {
  const server = app.listen(process.env.PORT, async () => {
    // Start WhatsApp sessions
    const companies = await Company.findAll({
      where: { status: true },
      attributes: ["id"]
    });

    const allPromises = companies.map(async (c) => {
      return StartAllWhatsAppsSessions(c.id);
    });

    Promise.all(allPromises).then(async () => {
      await startQueueProcess();
    });

    // Start Bull queue if REDIS_URI_ACK is defined
    if (process.env.REDIS_URI_ACK && process.env.REDIS_URI_ACK !== '') {
      BullQueue.process();
    }

    logger.info(`Server started on port: ${process.env.PORT}`);
  });

  // Initialize socket.io
  initIO(server);

  // Enable graceful shutdown with a short timeout
  gracefulShutdown(server, {
    timeout: 1000, // Force shutdown after 1 second
    onShutdown: async () => {
      logger.info("Graceful shutdown initiated.");
    }
  });
}

// Error handling for uncaught exceptions
process.on("uncaughtException", (err) => {
  logger.error(`${new Date().toUTCString()} uncaughtException: ${err.message}`);
  logger.error(err.stack);
  
  process.kill(process.pid, 'SIGTERM'); // Force immediate termination
});

// Error handling for unhandled promise rejections
process.on("unhandledRejection", (reason, p) => {
  logger.error(`${new Date().toUTCString()} unhandledRejection: ${reason}`);
  
  process.kill(process.pid, 'SIGTERM'); // Force immediate termination
});

// Start the server
startServer();