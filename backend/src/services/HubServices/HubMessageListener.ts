import Whatsapp from "../../models/Whatsapp";
import Contact from "../../models/Contact";
import Ticket from "../../models/Ticket";
import { downloadFiles } from "../../helpers/downloadHubFiles";
import CreateMessageService from "./CreateHubMessageService";
import FindOrCreateContactService from "./FindOrCreateHubContactService";
import FindOrCreateTicketService from "../TicketServices/FindOrCreateTicketService";
import { UpdateMessageAck } from "./UpdateMessageHubAck";
import { getIO } from "../../libs/socket";

export interface HubInMessage {
  type: "MESSAGE";
  id: string;
  timestamp: string;
  subscriptionId: string;
  channel: "telegram" | "whatsapp" | "facebook" | "instagram" | "sms" | "email";
  direction: "IN";
  message: {
    id: string;
    from: string;
    to: string;
    direction: "IN";
    channel: "telegram" | "whatsapp" | "facebook" | "instagram" | "sms" | "email";
    visitor: {
      name: string;
      firstName: string;
      lastName: string;
      picture: string;
    };
    contents: IContent[];
    timestamp: string;
  };
}

export interface IContent {
  type: "text" | "image" | "audio" | "video" | "file" | "location";
  text?: string;
  url?: string;
  fileUrl?: string;
  latitude?: number;
  longitude?: number;
  filename?: string;
  fileSize?: number;
  fileMimeType?: string;
}

export interface HubConfirmationSentMessage {
  type: "MESSAGE_STATUS";
  timestamp: string;
  subscriptionId: string;
  channel: "telegram" | "whatsapp" | "facebook" | "instagram" | "sms" | "email";
  messageId: string;
  contentIndex: number;
  messageStatus: {
    timestamp: string;
    code: "SENT" | "REJECTED";
    description: string;
  };
}

const verifySentMessageStatus = (message: HubConfirmationSentMessage): boolean => {
  const { messageStatus: { code } } = message;
  return code === "SENT";
};

const HubMessageListener = async (
  message: HubInMessage | HubConfirmationSentMessage,
  whatsapp: Whatsapp,
  medias: Express.Multer.File[] = []
): Promise<void> => {
  console.log("HubMessageListener", message);

  // Tratar confirmação de status de mensagem
  if (message.type === "MESSAGE_STATUS") {
    const isMessageSent = verifySentMessageStatus(message as HubConfirmationSentMessage);
    if (isMessageSent) {
      console.log("HubMessageListener: message sent");
      await UpdateMessageAck(message.messageId);
    } else {
      console.error(
        "HubMessageListener: message not sent",
        message.messageStatus.code,
        message.messageStatus.description
      );
    }
    return;
  }

  // Tratar mensagens recebidas (IN)
  // No need to check direction === "OUT" since HubInMessage.direction is always "IN"
  const {
    message: { id, from, channel, contents, visitor },
  } = message as HubInMessage;

  try {
    // Encontrar ou criar contato
    const contact = await FindOrCreateContactService({
      ...visitor,
      from,
      whatsapp,
      channel,
    });

    // Encontrar ou criar ticket
    const ticket = await FindOrCreateTicketService(
      contact,
      whatsapp,
      1, // unreadMessages
      whatsapp.companyId, // Garantir que companyId seja usado
      undefined, // queueId
      undefined, // userId
      undefined, // groupContact
      channel
    );

    // Processar conteúdo da mensagem
    const content = contents[0];
    if (!content) {
      throw new Error("No content provided in message");
    }

    if (content.type === "text") {
      await CreateMessageService({
        id,
        contactId: contact.id,
        body: content.text || "",
        ticketId: ticket.id,
        fromMe: false,
      });
    } else if (content.fileUrl) {
      const media = await downloadFiles(content.fileUrl);
      if (typeof media.mimeType === "string") {
        await CreateMessageService({
          id,
          contactId: contact.id,
          body: content.text || "",
          ticketId: ticket.id,
          fromMe: false,
          fileName: media.filename,
          mediaType: media.mimeType.split("/")[0],
          originalName: media.originalname,
        });
      }
    }

    // Emitir evento via socket para notificar atualização do ticket
    const io = getIO();
    io.to(ticket.status).emit("ticket", {
      action: "update",
      ticket,
    });

  } catch (error: any) {
    console.error("Error in HubMessageListener:", error.message);
    throw new Error(`Failed to process message: ${error.message}`);
  }
};

export default HubMessageListener;