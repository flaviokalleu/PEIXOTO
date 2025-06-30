import { Op } from "sequelize";
import AppError from "../errors/AppError";
import Ticket from "../models/Ticket";

const CheckContactOpenTickets = async (
  contactId: number | string,
  whatsappId: number | string,
  companyId: number | string
): Promise<void> => {
  const ticket = await Ticket.findOne({
    where: { contactId, whatsappId, companyId, status: { [Op.or]: ["open", "pending"] } }
  });

  if (ticket) {
    throw new AppError("ERR_OTHER_OPEN_TICKET");
  }
};

export default CheckContactOpenTickets;
