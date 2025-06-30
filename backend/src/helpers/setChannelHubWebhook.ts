import Whatsapp from "../models/Whatsapp";
import { IChannel } from "../controllers/ChannelHubController";
import { showHubToken } from "./showHubToken";
import logger  from "../utils/logger";
const {
  Client,
  MessageSubscription
} = require("notificamehubsdk");
require("dotenv").config();

export const setChannelWebhook = async (
  whatsapp: IChannel | any,
  whatsappId: string
) => {
  try {
    const notificameHubToken = await showHubToken(whatsapp.companyId);

    if (!notificameHubToken) {
      logger.warn(`Não foi possível configurar o webhook para o canal ${whatsapp.qrcode} - Token não encontrado`);
      return;
    }

    const client = new Client(notificameHubToken);

    logger.info(`[LOG] setChannelWebhook chamado para companyId: ${whatsapp.companyId}`);

    const url = `${process.env.BACKEND_URL}/hub-webhook/${whatsapp.qrcode}`;

    const subscription = new MessageSubscription(
      {
        url
      },
      {
        channel: whatsapp.qrcode
      }
    );

    await client.createSubscription(subscription);
    logger.info(`Webhook configurado com sucesso para o canal ${whatsapp.qrcode}`);

    await Whatsapp.update(
      {
        status: "CONNECTED"
      },
      {
        where: {
          id: whatsappId
        }
      }
    );
  } catch (err) {
    logger.error(`Erro ao configurar webhook: ${err.message}`);
    throw err;
  }
};