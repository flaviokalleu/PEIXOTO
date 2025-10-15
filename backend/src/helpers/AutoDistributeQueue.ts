import Queue from "../models/Queue";
import Company from "../models/Company";
import Ticket from "../models/Ticket";
import { Op } from "sequelize";

interface AutoDistributeQueueRequest {
  companyId: number;
  ticketId?: number;
}

/**
 * Distribui automaticamente um ticket para uma fila de forma equilibrada
 * Busca todas as filas da empresa e distribui de forma round-robin
 * baseado na quantidade de tickets pendentes em cada fila
 */
const AutoDistributeQueue = async ({
  companyId,
  ticketId
}: AutoDistributeQueueRequest): Promise<number | null> => {
  try {
    // Busca todas as filas ativas da empresa ordenadas por ID
    const queues = await Queue.findAll({
      where: {
        companyId
      },
      order: [["id", "ASC"]],
      attributes: ["id", "name"]
    });

    // Se não houver filas, retorna null
    if (!queues || queues.length === 0) {
      return null;
    }

    // Busca o total de tickets pendentes por fila
    const queueTicketCounts = await Promise.all(
      queues.map(async (queue) => {
        const count = await Ticket.count({
          where: {
            queueId: queue.id,
            status: {
              [Op.in]: ["pending", "open"]
            },
            companyId
          }
        });

        return {
          queueId: queue.id,
          queueName: queue.name,
          ticketCount: count
        };
      })
    );

    // Ordena as filas pela quantidade de tickets (menor para maior)
    // Em caso de empate, mantém a ordem por ID
    queueTicketCounts.sort((a, b) => {
      if (a.ticketCount === b.ticketCount) {
        return a.queueId - b.queueId;
      }
      return a.ticketCount - b.ticketCount;
    });

    // Retorna a fila com menor quantidade de tickets
    const selectedQueue = queueTicketCounts[0];

    console.log(`[AutoDistributeQueue] Distribuindo ticket para fila: ${selectedQueue.queueName} (ID: ${selectedQueue.queueId}) - Tickets atuais: ${selectedQueue.ticketCount}`);

    return selectedQueue.queueId;
  } catch (error) {
    console.error("[AutoDistributeQueue] Erro ao distribuir fila:", error);
    return null;
  }
};

export default AutoDistributeQueue;
