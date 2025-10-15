import { subHours } from "date-fns";
import { Op } from "sequelize";
import Contact from "../../models/Contact";
import Ticket from "../../models/Ticket";
import ShowTicketService from "./ShowTicketService";
import FindOrCreateATicketTrakingService from "./FindOrCreateATicketTrakingService";
import Setting from "../../models/Setting";
import AutoDistributeQueue from "../../helpers/AutoDistributeQueue";
import CreateLogTicketService from "./CreateLogTicketService";

interface TicketData {
  status?: string;
  companyId?: number;
  unreadMessages?: number;
}

const FindOrCreateTicketServiceMeta = async (
  contact: Contact,
  whatsappId: number,
  unreadMessages: number,
  companyId: number,
  channel: string
): Promise<Ticket> => {
  let ticket = await Ticket.findOne({
    where: {
      status: {
        [Op.or]: ["open", "pending", "closed"]
      },
      contactId: contact.id,
      companyId,
      channel
    },
    order: [["id", "DESC"]]
  });

  if (ticket) {
    await ticket.update({ unreadMessages });
  }

  if (!ticket) {
    ticket = await Ticket.findOne({
      where: {
        contactId: contact.id,
        channel
      },
      order: [["updatedAt", "DESC"]]
    });

    if (ticket) {
      await ticket.update({
        status: "pending",
        userId: null,
        unreadMessages,
        companyId,
        channel
      });
      await FindOrCreateATicketTrakingService({
        ticketId: ticket.id,
        companyId,
        whatsappId: ticket.whatsappId,
        userId: ticket.userId
      });
    }
    const msgIsGroupBlock = await Setting.findOne({
      where: { key: "timeCreateNewTicket" }
    });

    const value = msgIsGroupBlock ? parseInt(msgIsGroupBlock.value, 10) : 7200;
  }

  if (!ticket) {
    ticket = await Ticket.findOne({
      where: {
        updatedAt: {
          [Op.between]: [+subHours(new Date(), 2), +new Date()]
        },
        contactId: contact.id
      },
      order: [["updatedAt", "DESC"]]
    });

    if (ticket) {
      await ticket.update({
        status: "pending",
        userId: null,
        unreadMessages,
        companyId,
        channel
      });
      await FindOrCreateATicketTrakingService({
        ticketId: ticket.id,
        companyId,
        whatsappId: ticket.whatsappId,
        userId: ticket.userId
      });
    }
  }

  if (!ticket) {
    // Distribui automaticamente para uma fila
    const autoQueueId = await AutoDistributeQueue({ 
      companyId 
    });

    ticket = await Ticket.create({
      contactId: contact.id,
      status: "pending",
      isGroup: false,
      unreadMessages,
      whatsappId,
      companyId,
      channel,
      isActiveDemand: false,
      queueId: autoQueueId
    });

    await FindOrCreateATicketTrakingService({
      ticketId: ticket.id,
      companyId,
      whatsappId,
      userId: ticket.userId
    });

    if (autoQueueId) {
      await CreateLogTicketService({
        ticketId: ticket.id,
        queueId: autoQueueId,
        type: "queue"
      });
      console.log(`[FindOrCreateTicketServiceMeta] Ticket ${ticket.id} distribuído automaticamente para fila ${autoQueueId}`);
    }

  } else {
    await ticket.update({ whatsappId });
    
    // Se o ticket existente não tem fila, distribui automaticamente
    if (!ticket.queueId) {
      const autoQueueId = await AutoDistributeQueue({ 
        companyId,
        ticketId: ticket.id 
      });
      
      if (autoQueueId) {
        await ticket.update({ queueId: autoQueueId });
        await CreateLogTicketService({
          ticketId: ticket.id,
          queueId: autoQueueId,
          type: "queue"
        });
        console.log(`[FindOrCreateTicketServiceMeta] Ticket ${ticket.id} existente distribuído automaticamente para fila ${autoQueueId}`);
      }
    }
  }

  ticket = await ShowTicketService(ticket.id, companyId);

  return ticket;
};

export default FindOrCreateTicketServiceMeta;
