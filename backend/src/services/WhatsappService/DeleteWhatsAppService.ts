import Whatsapp from "../../models/Whatsapp";
import AppError from "../../errors/AppError";
import { getIO } from "../../libs/socket";

const DeleteWhatsAppService = async (id: string): Promise<void> => {
  const whatsapp = await Whatsapp.findOne({
    where: { id }
  });

  if (!whatsapp) {
    throw new AppError("ERR_NO_WAPP_FOUND", 404);
  }

  const companyId = whatsapp.companyId;
  
  await whatsapp.destroy();

  const io = getIO();
  io.of(String(companyId))
    .emit(`company-${companyId}-whatsapp`, {
      action: "delete",
      whatsappId: +id
    });
};

export default DeleteWhatsAppService;
