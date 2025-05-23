import 'dotenv/config';
import gracefulShutdown from "http-graceful-shutdown";
import axios from "axios";
import cron from "node-cron";
import app from "./app";
import { initIO } from "./libs/socket";
import logger from "./utils/logger";
import { StartAllWhatsAppsSessions } from "./services/WbotServices/StartAllWhatsAppsSessions";
import Company from "./models/Company";
import BullQueue from './libs/queue';
import { startQueueProcess } from "./queues";

// Global variable to track key validity
let isKeyValid = false;

// Key verification function
async function verifyKey() {
  try {
    // Fetch key from meu.site.com/key.json
    const response = await axios.get("https://arquivos.parnassaimobiliaria.com.br/key.json", {
      timeout: 5000 // Add timeout to prevent hanging
    });
    const remoteKey = response.data.key; // Assuming key.json has a "key" field

    // Get key from .env
    const envKey = process.env.APP_KEY;

    // Compare keys
    if (!remoteKey || !envKey || remoteKey !== envKey) {
      throw new Error("Key verification failed: Keys do not match or are missing.");
    }
    logger.info("Key verification successful.");
    isKeyValid = true;
    return true;
  } catch (error) {
    logger.error("Key verification error: " + error.message);
    isKeyValid = false;
    return false;
  }
}

// Cron job to verify key every 15 hours and crash if invalid
function startKeyVerificationCron() {
  cron.schedule("0 */15 * * *", async () => {
    logger.info("Running key verification cron job...");
    const keyVerified = await verifyKey();
    if (!keyVerified) {
      logger.error("Cron job: Key verification failed. Crashing the system.");
      process.exitCode = 1; // Set exit code
      process.kill(process.pid, 'SIGTERM'); // Force immediate termination
    }
  });
}

// Add key verification middleware to the Express app
app.use((req, res, next) => {
  if (!isKeyValid) {
    logger.error("Access denied: Invalid or missing key. Crashing the system.");
    res.status(403).json({ error: "Access denied: Invalid or missing key." });
    process.exitCode = 1; // Set exit code
    process.kill(process.pid, 'SIGTERM'); // Force immediate termination
  }
  next();
});

// Verify key before starting the server
async function startServer() {
  const keyVerified = await verifyKey();
  if (!keyVerified) {
    logger.error("Server startup aborted: Key verification failed.");
    process.exitCode = 1; // Set exit code
    process.kill(process.pid, 'SIGTERM'); // Force immediate termination
  }

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

    // Start key verification cron job
    startKeyVerificationCron();

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
  process.exitCode = 1; // Set exit code
  process.kill(process.pid, 'SIGTERM'); // Force immediate termination
});

// Error handling for unhandled promise rejections
process.on("unhandledRejection", (reason, p) => {
  logger.error(`${new Date().toUTCString()} unhandledRejection: ${reason}`);
  process.exitCode = 1; // Set exit code
  process.kill(process.pid, 'SIGTERM'); // Force immediate termination
});

// Start the server
startServer();