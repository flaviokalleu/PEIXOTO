import Ticket from "../../models/Ticket";
import User from "../../models/User";
import Whatsapp from "../../models/Whatsapp";
import { downloadFiles } from "../../helpers/downloadHubFiles";
import CreateMessageService from "./CreateHubMessageService";
/*import CreateOrUpdateTicketService from "./CreateOrUpdateHubTicketService";*/
import FindOrCreateContactService from "./FindOrCreateHubContactService";
import { UpdateMessageAck } from "./UpdateMessageHubAck";
import FindOrCreateTicketService from "../TicketServices/FindOrCreateTicketService";
import { getIO } from "../../libs/socket";

export interface HubInMessage {
  type: "MESSAGE";
  id: string;
  timestamp: string;
  subscriptionId: string;
  channel: "telegram" | "whatsapp" | "facebook" | "instagram" | "sms" | "email";
  direction: "IN" | "OUT";
  message: {
    id: string;
    from: string;
    to: string;
    direction: "IN" | "OUT";
    channel:
      | "telegram"
      | "whatsapp"
      | "facebook"
      | "instagram"
      | "sms"
      | "email";
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

const verifySentMessageStatus = (message: HubConfirmationSentMessage) => {
  const {
    messageStatus: { code }
  } = message;

  const isMessageSent = code === "SENT";

  if (isMessageSent) {
    return true;
  }

  return false;
};

const HubMessageListener = async (
  message: any | HubInMessage | HubConfirmationSentMessage,
  whatsapp: Whatsapp,
  medias: Express.Multer.File[]
) => {
  console.log("HubMessageListener", message);
  console.log("contents", message.message?.contents);

  // Verificar se é uma mensagem de status (confirmação de envio)
  const isMessageFromMe = message.type === "MESSAGE_STATUS";

  if (isMessageFromMe) {
    const isMessageSent = verifySentMessageStatus(
      message as HubConfirmationSentMessage
    );

    if (isMessageSent) {
      console.log("HubMessageListener: message sent");
      UpdateMessageAck(message.messageId);
    } else {
      console.log(
        "HubMessageListener: message not sent",
        message.messageStatus.code,
        message.messageStatus.description
      );
    }

    return;
  }

  // Desestruturando os dados da mensagem recebida
  const {
    message: { id, from, channel, contents, visitor, direction }
  } = message as HubInMessage;

  // Determinar se a mensagem é do sistema ou do usuário
  // OUT = sistema enviando para usuário (fromMe = true)
  // IN = usuário enviando para sistema (fromMe = false)
  const isFromMe = direction === "OUT";

  console.log(`📥 Processando mensagem ${direction}: ${isFromMe ? 'do sistema' : 'do usuário'}`);

  try {

    const unreadMessages = 1;
    
    // Passando whatsapp.companyId diretamente para FindOrCreateContactService
    const contact = await FindOrCreateContactService({
      ...visitor,
      from,
      whatsapp,
      channel,
      companyId: whatsapp.companyId // Passando diretamente
    });

    // Passando o companyId para a função de criação ou atualização do ticket
    const ticket = await FindOrCreateTicketService(
      contact,
      whatsapp,
      unreadMessages,
      contact.companyId || whatsapp.companyId // Passando o companyId aqui, já atribuído corretamente do contato ou whatsapp
    );

    // Obtendo o companyId corretamente
    let companyId = contact.companyId || whatsapp.companyId || ticket.companyId;

    // Se o companyId ainda for indefinido, lança erro
    if (!companyId) {
      throw new Error("Erro: companyId não encontrado no contato, WhatsApp nem no Ticket.");
      console.log("Erro: companyId não encontrado no contato, WhatsApp nem no Ticket.");
    }
    
    
  if (contents[0]?.type === "text") {
    const messageData = await CreateMessageService({
      id,
      contactId: contact.id,
      body: contents[0].text || "",
      ticketId: ticket.id,
      fromMe: isFromMe,
      companyId: contact.companyId || whatsapp.companyId || ticket.companyId
    });

    await Ticket.update(
      { lastMessage: contents[0].text || "" },
      { where: { id: ticket.id } }
    );

    // Emitir apenas evento de ticket atualizado (mensagem já é emitida pelo CreateMessageService)
    const io = getIO();
    const updatedTicket = await Ticket.findByPk(ticket.id, { 
      include: ["contact"],
      attributes: ["id", "uuid", "status", "lastMessage", "companyId", "contactId", "whatsappId"]
    });
    
    console.log("Ticket atualizado após mensagem de texto:", updatedTicket);
    
    if (updatedTicket) {
      io.to(updatedTicket.status)
        .to(updatedTicket.uuid.toString())
        .emit(`company-${companyId}-ticket`, {
          action: "update",
          ticket: updatedTicket
        });
      
      console.log("Evento 'ticket' emitido para mensagem de texto:", {
        status: updatedTicket.status,
        ticketUuid: updatedTicket.uuid,
        lastMessage: updatedTicket.lastMessage
      });
    }
} else if (contents[0]?.fileUrl) {
    const media = await downloadFiles(contents[0].fileUrl);

    if (typeof media.mimeType === "string") {
      const messageData = await CreateMessageService({
        id,
        contactId: contact.id,
        body: contents[0].text || "",
        ticketId: ticket.id,
        fromMe: isFromMe,
        companyId: contact.companyId || whatsapp.companyId || ticket.companyId,
        fileName: `${media.filename}`,
        mediaType: media.mimeType.split("/")[0],
        originalName: media.originalname
      });

      await Ticket.update(
        { lastMessage: contents[0].text || media.originalname },
        { where: { id: ticket.id } }
      );

      // Emitir apenas evento de ticket atualizado (mensagem já é emitida pelo CreateMessageService)
      const io = getIO();
      const updatedTicket = await Ticket.findByPk(ticket.id, { include: ["contact"] });
      
      console.log("Ticket atualizado após mensagem com arquivo:", updatedTicket);
      
      if (updatedTicket) {
        io.to(updatedTicket.status)
          .to(updatedTicket.uuid.toString())
          .emit(`company-${companyId}-ticket`, {
            action: "update",
            ticket: updatedTicket
          });
        
        console.log("Evento 'ticket' emitido para mensagem com arquivo:", {
          status: updatedTicket.status,
          ticketUuid: updatedTicket.uuid,
          lastMessage: updatedTicket.lastMessage
        });
      }
    }
  }
  } catch (error: any) {
    console.log(error);
  }
};

export default HubMessageListener;