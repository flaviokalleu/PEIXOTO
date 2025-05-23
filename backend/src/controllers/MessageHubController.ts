import { Request, Response } from "express";
import Contact from "../models/Contact";
import Ticket from "../models/Ticket";
import { SendTextMessageService } from "../services/HubServices/SendTextMessageHubService";
import Whatsapp from "../models/Whatsapp";
import { SendMediaMessageService } from "../services/HubServices/SendMediaMessageHubService";
import CreateHubTicketService from "../services/HubServices/CreateHubTicketService";
import { getIO } from "../libs/socket";

interface TicketData {
  contactId: number;
  status: string;
  queueId: number;
  userId: number;
  channel: string;
  companyId: number;
}

export const send = async (req: Request, res: Response): Promise<Response> => {
  const { body: message } = req.body;
  const { ticketId } = req.params;
  const medias = req.files as Express.Multer.File[];

  console.log("sending hub message controller");

  const ticket = await Ticket.findByPk(ticketId, {
    include: [
      {
        model: Contact,
        as: "contact",
        attributes: ["number", "messengerId", "instagramId"]
      },
      {
        model: Whatsapp,
        as: "whatsapp",
        attributes: ["qrcode", "type"]
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
            ticket.whatsapp
          );
        })
      );
    } else {
      await SendTextMessageService(
        message,
        ticket.id,
        ticket.contact,
        ticket.whatsapp
      );
    }

    return res.status(200).json({ message: "Message sent" });
  } catch (error) {
    console.log(error);

    return res.status(400).json({ message: error });
  }
};

export const store = async (req: Request, res: Response): Promise<Response> => {
  const { contactId, status, userId, queueId, channel }: TicketData = req.body;
  const { companyId } = req.user;

  const ticket = await CreateHubTicketService({ 
    contactId, 
    status, 
    userId, 
    queueId, 
    channel, 
    companyId 
  });

  const io = getIO();
  io.to(ticket.status).emit("ticket", {
    action: "update",
    ticket
  });

  return res.status(200).json(ticket);
};