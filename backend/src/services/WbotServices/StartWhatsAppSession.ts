import ListWhatsAppsService from "../WhatsappService/ListWhatsAppsService";
import { initWASocket } from "../../libs/wbot";
import Whatsapp from "../../models/Whatsapp";
import Company from "../../models/Company";
import { wbotMessageListener } from "./wbotMessageListener";
import { getIO } from "../../libs/socket";
import wbotMonitor from "./wbotMonitor";
import logger from "../../utils/logger";
import * as Sentry from "@sentry/node";

let setChannelWebhook: (whatsapp: Whatsapp, id: string) => void;
try {
  setChannelWebhook = require("../../helpers/setChannelHubWebhook").setChannelWebhook;
} catch (error) {
  logger.warn("Failed to load setChannelHubWebhook. Skipping webhook setup for WhatsApp channels.");
  setChannelWebhook = () => {
    logger.info("setChannelHubWebhook not available, proceeding without webhook setup.");
  };
}

export const StartWhatsAppSession = async (
  whatsapp: Whatsapp,
  companyId: number
): Promise<void> => {
  await whatsapp.update({ status: "OPENING" });

  const io = getIO();
  io.of(String(companyId))
    .emit(`company-${companyId}-whatsappSession`, {
      action: "update",
      session: whatsapp
    });

  try {
    const wbot = await initWASocket(whatsapp);
   
    if (wbot.id) {
      wbotMessageListener(wbot, companyId);
      wbotMonitor(wbot, whatsapp, companyId);
    }
  } catch (err) {
    Sentry.captureException(err);
    logger.error(err);
  }
};

export const StartAllWhatsAppsSessions = async (): Promise<void> => {
  try {
    const companies = await Company.findAll({ attributes: ["id"] });
    let allWhatsapps: Whatsapp[] = [];

    for (const company of companies) {
      const companyId = company.id;
      const whatsapps = await ListWhatsAppsService({ companyId });
      allWhatsapps = allWhatsapps.concat(whatsapps);
    }

    if (allWhatsapps.length > 0) {
      allWhatsapps.forEach(whatsapp => {
        if (whatsapp.type !== null) {
          try {
            setChannelWebhook(whatsapp, whatsapp.id.toString());
          } catch (error) {
            logger.error(`Failed to set webhook for WhatsApp ID ${whatsapp.id}: ${error}`);
            Sentry.captureException(error);
          }
        } else {
          StartWhatsAppSession(whatsapp, whatsapp.companyId);
        }
      });
    } else {
      logger.info("No WhatsApp sessions found to start.");
    }
  } catch (error) {
    logger.error(`Failed to start all WhatsApp sessions: ${error}`);
    Sentry.captureException(error);
  }
};