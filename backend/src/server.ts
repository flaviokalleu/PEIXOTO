import 'dotenv/config';
import gracefulShutdown from "http-graceful-shutdown";
import app from "./app";
import cron from "node-cron";
import { initIO } from "./libs/socket";
import logger from "./utils/logger";
import { healthMonitor } from "./utils/healthMonitor";
import { StartAllWhatsAppsSessions } from "./services/WbotServices/StartAllWhatsAppsSessions";
import Company from "./models/Company";
import BullQueue from './libs/queue';

import { startQueueProcess } from "./queues";
// import { ScheduledMessagesJob, ScheduleMessagesGenerateJob, ScheduleMessagesEnvioJob, ScheduleMessagesEnvioForaHorarioJob } from "./wbotScheduledMessages";

const server = app.listen(process.env.PORT, async () => {
  const companies = await Company.findAll({
    where: { status: true },
    attributes: ["id"]
  });

  const allPromises: any[] = [];
  companies.map(async c => {
    const promise = StartAllWhatsAppsSessions(c.id);
    allPromises.push(promise);
  });

  Promise.all(allPromises).then(async () => {

    await startQueueProcess();
  });

  if (process.env.REDIS_URI_ACK && process.env.REDIS_URI_ACK !== '') {
    BullQueue.process();
  }

  logger.info(`Server started on port: ${process.env.PORT}`);
});

process.on("uncaughtException", err => {
  console.error(`${new Date().toUTCString()} uncaughtException:`, err.message);
  console.error(err.stack);
  
  // Log do erro mas não mata o processo
  healthMonitor.logError(err, "uncaughtException");
  logger.error("Uncaught Exception occurred, but process will continue", {
    error: err.message,
    stack: err.stack,
    timestamp: new Date().toISOString()
  });
  
  // Em vez de process.exit(1), apenas registra o erro
  // O sistema continua funcionando
});

process.on("unhandledRejection", (reason, p) => {
  console.error(
    `${new Date().toUTCString()} unhandledRejection:`,
    reason,
    p
  );
  
  // Log do erro mas não mata o processo
  healthMonitor.logError(reason as Error, "unhandledRejection");
  logger.error("Unhandled Promise Rejection occurred, but process will continue", {
    reason: reason,
    promise: p,
    timestamp: new Date().toISOString()
  });
  
  // Em vez de process.exit(1), apenas registra o erro
  // O sistema continua funcionando
});

// Graceful shutdown em sinais do sistema
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, starting graceful shutdown');
  healthMonitor.gracefulShutdown();
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, starting graceful shutdown');
  healthMonitor.gracefulShutdown();
});

// cron.schedule("* * * * * *", async () => {

//   try {
//     // console.log("Running a job at 5 minutes at America/Sao_Paulo timezone")
//     await ScheduledMessagesJob();
//     await ScheduleMessagesGenerateJob();
//   }
//   catch (error) {
//     logger.error(error);
//   }

// });

// cron.schedule("* * * * * *", async () => {

//   try {
//     // console.log("Running a job at 01:00 at America/Sao_Paulo timezone")
//     console.log("Running a job at 2 minutes at America/Sao_Paulo timezone")
//     await ScheduleMessagesEnvioJob();
//     await ScheduleMessagesEnvioForaHorarioJob()
//   }
//   catch (error) {
//     logger.error(error);
//   }

// });

initIO(server);
gracefulShutdown(server);
