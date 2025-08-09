import Whatsapp from "../models/Whatsapp";
import GetWhatsappWbot from "./GetWhatsappWbot";
import fs from "fs";

import { getMessageOptions } from "../services/WbotServices/SendWhatsAppMedia";

export type MessageData = {
  number: number | string;
  body: string;
  mediaPath?: string;
};

export const SendMessageFlow = async (  
  whatsapp: Whatsapp,
  messageData: MessageData,
  isFlow: boolean = false,
  isRecord: boolean = false
): Promise<any> => {
  try {
    const wbot = await GetWhatsappWbot(whatsapp);
    const chatId = `${messageData.number}@s.whatsapp.net`;

    let message;
    
    const body = `\u200e${messageData.body}`;
  // Note: templateButtons are not supported in AnyMessageContent for the current Baileys version.
  // Sending plain text to ensure compatibility.
  message = await wbot.sendMessage(chatId, { text: body });
    

    return message;
  } catch (err: any) {
    throw new Error(err);
  }
};
