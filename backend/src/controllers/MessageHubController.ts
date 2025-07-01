import { Request, Response } from "express";
import User from "../models/User";
import { getIO } from "../libs/socket";
import Contact from "../models/Contact";
import Ticket from "../models/Ticket";
import Whatsapp from "../models/Whatsapp";
import Message from "../models/Message";
import { SendMediaMessageService } from "../services/HubServices/SendMediaMessageHubService";
import { SendTextMessageService } from "../services/HubServices/SendTextMessageHubService";
import CreateHubTicketService from "../services/HubServices/CreateHubTicketService";


interface TicketData {
  contactId: number;
  status: string;
  queueId: number;
  userId: number;
  channel: string;
  companyId: number;
}

export const send = async (req: Request, res: Response): Promise<Response> => {

  const { companyId } = req.user;

  console.log('CompanyId do usuário autenticado:', companyId);  // Verifique se companyId está correto aqui
  
  const { body: message } = req.body;
  const { ticketId } = req.params;
  const medias = req.files as Express.Multer.File[];

  console.log("sending hub message controller");

  const ticket = await Ticket.findOne({
    where: { id: ticketId, companyId }, // Filtro pelo companyId
    include: [
      {
        model: Contact,
        as: "contact",
        attributes: ["number", "messengerId", "instagramId"]
      },
      {
        model: Whatsapp,
        as: "whatsapp",
        attributes: ["qrcode", "type", "companyId"]
      }
    ]
  });

  if (!ticket) {
    return res.status(404).json({ message: "Ticket not found" });
  }

  try {
    if (medias) {
      await Promise.all(
        medias.map(async (media: Express.Multer.File) => {
          await SendMediaMessageService(
            media,
            message,
            ticket.id,
            ticket.contact,
            ticket.whatsapp,
            companyId
          );
        })
      );
    } else {
      await SendTextMessageService(
        message,
        ticket.id,
        ticket.contact,
        ticket.whatsapp,
        companyId
      );
    }

    return res.status(200).json({ message: "Message sent" });
  } catch (error) {
    console.log(error);

    return res.status(400).json({ message: error });
  }
};

export const store = async (req: Request, res: Response): Promise<Response> => {
  const { contactId, status, userId, channel }: TicketData = req.body;

  const { companyId } = req.user;  // Obtendo o companyId do usuário autenticado

  const ticket = await CreateHubTicketService({
    contactId,
    status,
    userId,
    channel,
    companyId  // Passando o companyId na criação do ticket
  });

  const io = getIO();
  io.to(ticket.status).emit("ticket", {
    action: "update",
    ticket
  });

  return res.status(200).json(ticket);
};

export const index = async (req: Request, res: Response): Promise<Response> => {
  const { ticketId } = req.params;
  const { companyId } = req.user;
  const { pageNumber = "1" } = req.query;

  try {
    console.log("🔍 [Hub Messages API] Buscando mensagens Hub para ticket:", ticketId);
    
    const ticket = await Ticket.findOne({
      where: { uuid: ticketId, companyId },
      attributes: ["id", "uuid", "companyId"]
    });

    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    const limit = 20;
    const offset = limit * (+pageNumber - 1);

    const messages = await Message.findAndCountAll({
      where: { 
        ticketId: ticket.id,
        companyId: companyId
      },
      limit,
      offset,
      order: [["createdAt", "DESC"]],
      include: [
        {
          model: Contact,
          as: "contact",
          attributes: ["id", "name", "number", "urlPicture"]
        },
        {
          model: Ticket,
          as: "ticket",
          attributes: ["id", "uuid", "status", "companyId", "contactId", "whatsappId"],
          include: [
            {
              model: Contact,
              as: "contact",
              attributes: ["id", "name", "number", "urlPicture"]
            },
            {
              model: Whatsapp,
              as: "whatsapp",
              attributes: ["id", "name", "type"]
            }
          ]
        }
      ]
    });

    const hasMore = messages.count > offset + messages.rows.length;

    console.log("📦 [Hub Messages API] Encontradas", messages.rows.length, "mensagens");
    
    return res.json({
      messages: messages.rows.reverse(),
      ticket,
      count: messages.count,
      hasMore
    });

  } catch (error) {
    console.error("❌ [Hub Messages API] Erro:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};