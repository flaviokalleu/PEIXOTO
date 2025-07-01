import AppError from "../../errors/AppError";
import Message from "../../models/Message";
import Ticket from "../../models/Ticket";
import ShowTicketService from "../TicketServices/ShowTicketService";
import { Op } from "sequelize";
import { intersection } from "lodash";
import User from "../../models/User";
import isQueueIdHistoryBlocked from "../UserServices/isQueueIdHistoryBlocked";
import Contact from "../../models/Contact";
import Queue from "../../models/Queue";
import Whatsapp from "../../models/Whatsapp";

interface Request {
  ticketId: string;
  companyId: number;
  pageNumber?: string;
  queues?: number[];
  user?: User;
}

interface Response {
  messages: Message[];
  ticket: Ticket;
  count: number;
  hasMore: boolean;
}

const ListMessagesService = async ({
  pageNumber = "1",
  ticketId,
  companyId,
  queues = [],
  user
}: Request): Promise<Response> => {


  if (!isNaN(Number(ticketId))) {
    const uuid = await Ticket.findOne({
      where: {
        id: ticketId,
        companyId
      },
      attributes: ["uuid"]
    });
    ticketId = uuid.uuid;
  }
  const ticket = await Ticket.findOne({
    where: {
      uuid: ticketId,
      companyId
    }
  });

  // Permitir tickets do canal "hub" além do whatsapp
  if (!ticket) {
    throw new AppError("ERR_NO_TICKET_FOUND", 404);
  }

  // Se o ticket for do canal hub, não filtrar por whatsappId
  const isHubChannel = ticket.channel === "hub";

  console.log("[ListMessagesService] Ticket info:", { 
    id: ticket.id, 
    channel: ticket.channel, 
    isHubChannel, 
    contactId: ticket.contactId, 
    whatsappId: ticket.whatsappId 
  });

  const ticketsFilter: any[] | null = [];

  const isAllHistoricEnabled = await isQueueIdHistoryBlocked({ userRequest: user.id });

  let ticketIds = [];
  if (!isAllHistoricEnabled) {
    ticketIds = await Ticket.findAll({
      where: {
        id: { [Op.lte]: ticket.id },
        companyId: ticket.companyId,
        contactId: ticket.contactId,
        ...(isHubChannel ? {} : { whatsappId: ticket.whatsappId }),
        isGroup: ticket.isGroup,
        queueId: user.profile === "admin" || user.allTicket === "enable" || (ticket.isGroup && user.allowGroup)
          ? { [Op.or]: [queues, null] }
          : { [Op.in]: queues },
        channel: ticket.channel // garante que só pega tickets do mesmo canal
      },
      attributes: ["id"]
    });
  } else {
    ticketIds = await Ticket.findAll({
      where: {
        id: { [Op.lte]: ticket.id },
        companyId: ticket.companyId,
        contactId: ticket.contactId,
        ...(isHubChannel ? {} : { whatsappId: ticket.whatsappId }),
        isGroup: ticket.isGroup,
        channel: ticket.channel
      },
      attributes: ["id"]
    });
  }

  if (ticketIds) {
    ticketsFilter.push(ticketIds.map(t => t.id));
  }

  console.log("[ListMessagesService] ticketIds found:", ticketIds.length);
  console.log("[ListMessagesService] ticketIds:", ticketIds.map(t => t.id));

  // }

  const tickets: number[] = intersection(...ticketsFilter);

  console.log("[ListMessagesService] ticketsFilter:", ticketsFilter);
  console.log("[ListMessagesService] tickets:", tickets);

  if (!tickets || tickets.length === 0) {
    throw new AppError("ERR_NO_TICKET_FOUND", 404);
  }

  // await setMessagesAsRead(ticket);
  const limit = 20;
  const offset = limit * (+pageNumber - 1);

  const { count, rows: messages } = await Message.findAndCountAll({
    where: { ticketId: { [Op.in]: tickets }, companyId },
    attributes: ["id", "wid", "fromMe", "mediaUrl", "body", "mediaType", "ack", "createdAt", "ticketId", "isDeleted", "queueId", "isForwarded", "isEdited", "isPrivate", "companyId", "quotedMsgId"],
    limit,
    include: [
      {
        model: Contact,
        as: "contact",
        attributes: ["id", "name"],
      },
      {
        model: Message,
        attributes: ["id", "fromMe", "mediaUrl", "body", "mediaType", "companyId"],
        as: "quotedMsg",
        include: [
          {
            model: Contact,
            as: "contact",
            attributes: ["id", "name"],
          }
        ],
        required: false
      },
      {
        model: Ticket,
        required: true,
        attributes: ["id", "whatsappId", "queueId"],
        include: [
          {
            model: Queue,
            as: "queue",
            attributes: ["id", "name", "color"]
          }
        ],
      }
    ],
    distinct: true,
    offset,
    subQuery: false,
    order: [["createdAt", "DESC"]] 
  });

  const hasMore = count > offset + messages.length;

  console.log("[ListMessagesService] Retornando:", { count, messagesLength: messages.length, hasMore });

  return {
    messages: messages.reverse(),
    ticket,
    count,
    hasMore
  };
};

export default ListMessagesService;