import Whatsapp from "../../models/Whatsapp";
import AppError from "../../errors/AppError";
import Queue from "../../models/Queue";
import Chatbot from "../../models/Chatbot";
import { FindOptions } from "sequelize/types";
import Prompt from "../../models/Prompt";
import { FlowBuilderModel } from "../../models/FlowBuilder";

const ShowWhatsAppService = async (
  id: string | number,
  companyId: number,
  session?: any
): Promise<Whatsapp> => {
  // Validar se o ID é válido antes de fazer a consulta
  if (!id || id === "default" || (typeof id === "string" && isNaN(parseInt(id)))) {
    throw new AppError("ERR_INVALID_WHATSAPP_ID", 400);
  }

  const findOptions: FindOptions = {
    include: [
      {
        model: FlowBuilderModel,
      },
      {
        model: Queue,
        as: "queues",
        attributes: ["id", "name", "color", "greetingMessage", "integrationId", "fileListId", "closeTicket"],
        include: [
          {
            model: Chatbot,
            as: "chatbots",
            attributes: ["id", "name", "greetingMessage", "closeTicket"]
          }
        ]
      },
      {
        model: Prompt,
        as: "prompt",
      }
    ],
    order: [
      ["queues", "orderQueue", "ASC"],
      ["queues", "chatbots", "id", "ASC"]
    ]
  };

  if (session !== undefined && session == 0) {
    findOptions.attributes = { exclude: ["session"] };
  }

  // Converter string para número se necessário
  const whatsappId = typeof id === "string" ? parseInt(id) : id;
  
  const whatsapp = await Whatsapp.findByPk(whatsappId, findOptions);

  // Primeiro verificar se o WhatsApp existe
  if (!whatsapp) {
    throw new AppError("ERR_NO_WAPP_FOUND", 404);
  }

  // Depois verificar se pertence à empresa correta
  if (whatsapp.companyId !== companyId) {
    throw new AppError("Não é possível acessar registros de outra empresa", 403);
  }

  return whatsapp;
};

export default ShowWhatsAppService;