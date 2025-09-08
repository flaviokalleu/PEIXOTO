import Whatsapp from "../models/Whatsapp";
import GetWhatsappWbot from "./GetWhatsappWbot";
// Note: interactive buttons typings in Baileys sometimes lag behind features.
// We cast the message content to any when adding buttons to avoid TS errors
// if the installed version's AnyMessageContent lacks these fields.
import fs from "fs"; // (kept in case future media usage is added)

import { getMessageOptions } from "../services/WbotServices/SendWhatsAppMedia"; // (unused here but kept for consistency)

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

    const buttons = [
      {
        buttonId: "id1",
        buttonText: { displayText: "⭐ Star Baileys on GitHub!" },
        type: 1
      },
      {
        buttonId: "id2",
        buttonText: { displayText: "Call me!" },
        type: 1
      },
      {
        buttonId: "id3",
        buttonText: {
          displayText: "This is a reply, just like normal buttons!"
        },
        type: 1
      }
    ];

    const body = `\u200e${messageData.body}`;
    // Using buttons message (cast to any for compatibility with current typings)
    message = await wbot.sendMessage(
      chatId,
      {
        text: body,
        buttons,
        headerType: 1
      } as any
    );


    return message;
  } catch (err: any) {
    throw new Error(err);
  }
};
