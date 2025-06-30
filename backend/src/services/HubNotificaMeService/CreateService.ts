import * as Yup from "yup";
import AppError from "../../errors/AppError";
import HubNotificaMe from "../../models/HubNotificaMe";
import Whatsapp from "../../models/Whatsapp"; // Importando a tabela Whatsapps

interface Data {
  name: string;
  qrcode: string;
  type: string;  
  companyId: number | string;
}

const CreateService = async (data: Data): Promise<Whatsapp> => {

  const { name, qrcode, type, companyId  } = data;

  // Validação do token
  const schema = Yup.object().shape({
    qrcode: Yup.string()
      .min(6, "ERR_HUBNOTIFICAME_INVALID_TOKEN")
      .required("ERR_HUBNOTIFICAME_REQUIRED")
  });

  try {
    await schema.validate({ qrcode });
  } catch (err: any) {
    throw new AppError(err.message);
  }

  // Criando o registro na tabela HubNotificaMe
  //const record = await HubNotificaMe.create({ ...data, tipo });


  // Criando o registro na tabela Whatsapp
  const whatsappRecord = await Whatsapp.create({
    qrcode: qrcode, // Mesma informação do token
    status: "CONNECTED", // Status fixo
    createdAt: new Date(), // Data e hora atual
    updatedAt: new Date(), // Data e hora atual
    name: name, // Mesmo valor de nome
    companyId: companyId, // Pega da requisição
    type: type, // Mesmo valor de tipo
  });

  return whatsappRecord;
};

export default CreateService;
