import * as Sentry from "@sentry/node";
import BullQueue from "bull";
import { MessageData, SendMessage } from "./helpers/SendMessage";
import Whatsapp from "./models/Whatsapp";
import logger from "./utils/logger";
import * as nodemailer from 'nodemailer';
import moment from "moment";
import Schedule from "./models/Schedule";
import { Op, QueryTypes, Sequelize } from "sequelize";
import GetDefaultWhatsApp from "./helpers/GetDefaultWhatsApp";
import Campaign from "./models/Campaign";
import Queues from "./models/Queue";
import ContactList from "./models/ContactList";
import ContactListItem from "./models/ContactListItem";
import { isEmpty, isNil, isArray } from "lodash";
import CampaignSetting from "./models/CampaignSetting";
import CampaignShipping from "./models/CampaignShipping";
import GetWhatsappWbot from "./helpers/GetWhatsappWbot";
import sequelize from "./database";
import { getMessageOptions } from "./services/WbotServices/SendWhatsAppMedia";
import { getIO } from "./libs/socket";
import path from "path";
import User from "./models/User";
import Company from "./models/Company";
import Contact from "./models/Contact";
import Queue from "./models/Queue";
import { ClosedAllOpenTickets } from "./services/WbotServices/wbotClosedTickets";
import Ticket from "./models/Ticket";
import ShowContactService from "./services/ContactServices/ShowContactService";
import UserQueue from "./models/UserQueue";
import ShowTicketService from "./services/TicketServices/ShowTicketService";
import SendWhatsAppMessage from "./services/WbotServices/SendWhatsAppMessage";
import UpdateTicketService from "./services/TicketServices/UpdateTicketService";
import { addSeconds, differenceInSeconds } from "date-fns";
import { GetWhatsapp } from "./helpers/GetWhatsapp";
const CronJob = require('cron').CronJob;
import CompaniesSettings from "./models/CompaniesSettings";
import { verifyMediaMessage, verifyMessage } from "./services/WbotServices/wbotMessageListener";
import FindOrCreateTicketService from "./services/TicketServices/FindOrCreateTicketService";
import CreateLogTicketService from "./services/TicketServices/CreateLogTicketService";
import formatBody from "./helpers/Mustache";
import TicketTag from "./models/TicketTag";
import Tag from "./models/Tag";
import { delay } from "@whiskeysockets/baileys";
import Plan from "./models/Plan";

const connection = process.env.REDIS_URI || "";
const limiterMax = process.env.REDIS_OPT_LIMITER_MAX || 1;
const limiterDuration = process.env.REDIS_OPT_LIMITER_DURATION || 3000;

interface ProcessCampaignData {
  id: number;
  delay: number;
}

interface CampaignSettings {
  messageInterval: number;
  longerIntervalAfter: number;
  greaterInterval: number;
  variables: any[];
}

interface PrepareContactData {
  contactId: number;
  campaignId: number;
  delay: number;
  variables: any[];
}

interface DispatchCampaignData {
  campaignId: number;
  campaignShippingId: number;
  contactListItemId: number;
}

export const userMonitor = new BullQueue("UserMonitor", connection);
export const scheduleMonitor = new BullQueue("ScheduleMonitor", connection);
export const sendScheduledMessages = new BullQueue("SendSacheduledMessages", connection);
export const campaignQueue = new BullQueue("CampaignQueue", connection);
export const queueMonitor = new BullQueue("QueueMonitor", connection);

export const messageQueue = new BullQueue("MessageQueue", connection, {
  limiter: {
    max: limiterMax as number,
    duration: limiterDuration as number
  }
});

let isProcessing = false;

async function handleSendMessage(job) {
  try {
    const { data } = job;

    const whatsapp = await Whatsapp.findByPk(data.whatsappId);

    if (whatsapp === null) {
      throw Error("Whatsapp não identificado");
    }

    const messageData: MessageData = data.data;

    await SendMessage(whatsapp, messageData);
  } catch (e: any) {
    Sentry.captureException(e);
    logger.error("MessageQueue -> SendMessage: error", e.message);
    throw e;
  }
}

async function handleVerifySchedules(job) {
  try {
    const { count, rows: schedules } = await Schedule.findAndCountAll({
      where: {
        status: "PENDENTE",
        sentAt: null,
        sendAt: {
          [Op.gte]: moment().format("YYYY-MM-DD HH:mm:ss"),
          [Op.lte]: moment().add("30", "seconds").format("YYYY-MM-DD HH:mm:ss")
        }
      },
      include: [{ model: Contact, as: "contact" }, { model: User, as: "user", attributes: ["name"] }],
      distinct: true,
      subQuery: false
    });

    if (count > 0) {
      schedules.map(async schedule => {
        await schedule.update({
          status: "AGENDADA"
        });
        sendScheduledMessages.add(
          "SendMessage",
          { schedule },
          { delay: 40000 }
        );
        logger.info(`Disparo agendado para: ${schedule.contact.name}`);
      });
    }
  } catch (e: any) {
    Sentry.captureException(e);
    logger.error("SendScheduledMessage -> Verify: error", e.message);
    throw e;
  }
}

async function handleSendScheduledMessage(job) {
  const {
    data: { schedule }
  } = job;
  let scheduleRecord: Schedule | null = null;

  try {
    scheduleRecord = await Schedule.findByPk(schedule.id);
  } catch (e) {
    Sentry.captureException(e);
    logger.info(`Erro ao tentar consultar agendamento: ${schedule.id}`);
  }

  try {
    let whatsapp

    if (!isNil(schedule.whatsappId)) {
      whatsapp = await Whatsapp.findByPk(schedule.whatsappId);
    }

    if (!whatsapp)
      whatsapp = await GetDefaultWhatsApp(whatsapp.id,schedule.companyId);


    // const settings = await CompaniesSettings.findOne({
    //   where: {
    //     companyId: schedule.companyId
    //   }
    // })

    let filePath = null;
    if (schedule.mediaPath) {
      filePath = path.resolve("public", `company${schedule.companyId}`, schedule.mediaPath);
    }

    if (schedule.openTicket === "enabled") {
      let ticket = await Ticket.findOne({
        where: {
          contactId: schedule.contact.id,
          companyId: schedule.companyId,
          whatsappId: whatsapp.id,
          status: ["open", "pending"]
        }
      })

      if (!ticket)
        ticket = await Ticket.create({
          companyId: schedule.companyId,
          contactId: schedule.contactId,
          whatsappId: whatsapp.id,
          queueId: schedule.queueId,
          userId: schedule.ticketUserId,
          status: schedule.statusTicket
        })

      ticket = await ShowTicketService(ticket.id, schedule.companyId);

      let bodyMessage;

      // @ts-ignore: Unreachable code error
      if (schedule.assinar && !isNil(schedule.userId)) {
        bodyMessage = `*${schedule?.user?.name}:*\n${schedule.body.trim()}`
      } else {
        bodyMessage = schedule.body.trim();
      }
      const sentMessage = await SendMessage(whatsapp, {
        number: schedule.contact.number,
        body: `\u200e ${formatBody(bodyMessage, ticket)}`,
        mediaPath: filePath,
        companyId: schedule.companyId
      },
        schedule.contact.isGroup
      );

      if (schedule.mediaPath) {
        await verifyMediaMessage(sentMessage, ticket, ticket.contact, null, true, false, whatsapp);
      } else {
        await verifyMessage(sentMessage, ticket, ticket.contact, null, true, false);
      }
      // if (ticket) {
      //   await UpdateTicketService({
      //     ticketData: {
      //       sendFarewellMessage: false,
      //       status: schedule.statusTicket,
      //       userId: schedule.ticketUserId || null,
      //       queueId: schedule.queueId || null
      //     },
      //     ticketId: ticket.id,
      //     companyId: ticket.companyId
      //   })
      // }
    } else {
      await SendMessage(whatsapp, {
        number: schedule.contact.number,
        body: `\u200e ${schedule.body}`,
        mediaPath: filePath,
        companyId: schedule.companyId
      },
        schedule.contact.isGroup);
    }

    if (schedule.valorIntervalo > 0 && (isNil(schedule.contadorEnvio) || schedule.contadorEnvio < schedule.enviarQuantasVezes)) {
      let unidadeIntervalo;
      switch (schedule.intervalo) {
        case 1:
          unidadeIntervalo = 'days';
          break;
        case 2:
          unidadeIntervalo = 'weeks';
          break;
        case 3:
          unidadeIntervalo = 'months';
          break;
        case 4:
          unidadeIntervalo = 'minuts';
          break;
        default:
          throw new Error('Intervalo inválido');
      }

      function isDiaUtil(date) {
        const dayOfWeek = date.day();
        return dayOfWeek >= 1 && dayOfWeek <= 5; // 1 é segunda-feira, 5 é sexta-feira
      }

      function proximoDiaUtil(date) {
        let proximoDia = date.clone();
        do {
          proximoDia.add(1, 'day');
        } while (!isDiaUtil(proximoDia));
        return proximoDia;
      }

      // Função para encontrar o dia útil anterior
      function diaUtilAnterior(date) {
        let diaAnterior = date.clone();
        do {
          diaAnterior.subtract(1, 'day');
        } while (!isDiaUtil(diaAnterior));
        return diaAnterior;
      }

      const dataExistente = new Date(schedule.sendAt);
      const hora = dataExistente.getHours();
      const fusoHorario = dataExistente.getTimezoneOffset();

      // Realizar a soma da data com base no intervalo e valor do intervalo
      let novaData = new Date(dataExistente); // Clone da data existente para não modificar a original

      console.log(unidadeIntervalo)
      if (unidadeIntervalo !== "minuts") {
        novaData.setDate(novaData.getDate() + schedule.valorIntervalo * (unidadeIntervalo === 'days' ? 1 : unidadeIntervalo === 'weeks' ? 7 : 30));
      } else {
        novaData.setMinutes(novaData.getMinutes() + Number(schedule.valorIntervalo));
        console.log(novaData)
      }

      if (schedule.tipoDias === 5 && !isDiaUtil(novaData)) {
        novaData = diaUtilAnterior(novaData);
      } else if (schedule.tipoDias === 6 && !isDiaUtil(novaData)) {
        novaData = proximoDiaUtil(novaData);
      }

      novaData.setHours(hora);
      novaData.setMinutes(novaData.getMinutes() - fusoHorario);

      await scheduleRecord?.update({
        status: "PENDENTE",
        contadorEnvio: schedule.contadorEnvio + 1,
        sendAt: new Date(novaData.toISOString().slice(0, 19).replace('T', ' ')) // Mantendo o formato de hora
      })
    } else {
      await scheduleRecord?.update({
        sentAt: new Date(moment().format("YYYY-MM-DD HH:mm")),
        status: "ENVIADA"
      });
    }
    logger.info(`Mensagem agendada enviada para: ${schedule.contact.name}`);
    sendScheduledMessages.clean(15000, "completed");
  } catch (e: any) {
    Sentry.captureException(e);
    await scheduleRecord?.update({
      status: "ERRO"
    });
    logger.error("SendScheduledMessage -> SendMessage: error", e.message);
    throw e;
  }
}

async function handleVerifyCampaigns(job) {
  if (isProcessing) {
    // logger.warn('A campaign verification process is already running.');
    return;
  }

  isProcessing = true;
  try {
    await new Promise(r => setTimeout(r, 1500));

    const campaigns: { id: number; scheduledAt: string }[] =
      await sequelize.query(
        `SELECT id, "scheduledAt" FROM "Campaigns" c
        WHERE "scheduledAt" BETWEEN NOW() AND NOW() + INTERVAL '3 hour' AND status = 'PROGRAMADA'`,
        { type: QueryTypes.SELECT }
      );

    if (campaigns.length > 0) {
      logger.info(`Campanhas encontradas: ${campaigns.length}`);

      const promises = campaigns.map(async (campaign) => {
        try {
          await sequelize.query(
            `UPDATE "Campaigns" SET status = 'EM_ANDAMENTO' WHERE id = ${campaign.id}`
          );

          const now = moment();
          const scheduledAt = moment(campaign.scheduledAt);
          const delay = scheduledAt.diff(now, "milliseconds");
          logger.info(
            `Campanha enviada para a fila de processamento: Campanha=${campaign.id}, Delay Inicial=${delay}`
          );

          return campaignQueue.add(
            "ProcessCampaign",
            { id: campaign.id, delay },
            { priority: 3, removeOnComplete: { age: 60 * 60, count: 10 }, removeOnFail: { age: 60 * 60, count: 10 } }
          );

        } catch (err) {
          Sentry.captureException(err);
        }
      });

      await Promise.all(promises);

      logger.info('Todas as campanhas foram processadas e adicionadas à fila.');
    }
  } catch (err) {
    Sentry.captureException(err);
    logger.error(`Error processing campaigns: ${err.message}`);
  } finally {
    isProcessing = false;
  }
}


async function getCampaign(id) {
  return await Campaign.findOne({
    where: { id },
    include: [
      {
        model: ContactList,
        as: "contactList",
        attributes: ["id", "name"],
        include: [
          {
            model: ContactListItem,
            as: "contacts",
            attributes: ["id", "name", "number", "email", "isWhatsappValid", "isGroup"],
            where: { isWhatsappValid: true }
          }
        ]
      },
      {
        model: Whatsapp,
        as: "whatsapp",
        attributes: ["id", "name"]
      },
      // {
      //   model: CampaignShipping,
      //   as: "shipping",
      //   include: [{ model: ContactListItem, as: "contact" }]
      // }
    ]
  });
}

async function getContact(id) {
  return await ContactListItem.findByPk(id, {
    attributes: ["id", "name", "number", "email", "isGroup"]
  });
}

async function getSettings(campaign): Promise<CampaignSettings> {
  try {
    const settings = await CampaignSetting.findAll({
      where: { companyId: campaign.companyId },
      attributes: ["key", "value"]
    });

    let messageInterval: number = 20;
    let longerIntervalAfter: number = 20;
    let greaterInterval: number = 60;
    let variables: any[] = [];

    settings.forEach(setting => {
      if (setting.key === "messageInterval") {
        messageInterval = JSON.parse(setting.value);
      }
      if (setting.key === "longerIntervalAfter") {
        longerIntervalAfter = JSON.parse(setting.value);
      }
      if (setting.key === "greaterInterval") {
        greaterInterval = JSON.parse(setting.value);
      }
      if (setting.key === "variables") {
        variables = JSON.parse(setting.value);
      }
    });

    return {
      messageInterval,
      longerIntervalAfter,
      greaterInterval,
      variables
    };

  } catch (error) {
    console.log(error);
    throw error; // rejeita a Promise com o erro original
  }
}

export function parseToMilliseconds(seconds) {
  return seconds * 1000;
}

async function sleep(seconds) {
  logger.info(
    `Sleep de ${seconds} segundos iniciado: ${moment().format("HH:mm:ss")}`
  );
  return new Promise(resolve => {
    setTimeout(() => {
      logger.info(
        `Sleep de ${seconds} segundos finalizado: ${moment().format(
          "HH:mm:ss"
        )}`
      );
      resolve(true);
    }, parseToMilliseconds(seconds));
  });
}

function getCampaignValidMessages(campaign) {
  const messages = [];

  if (!isEmpty(campaign.message1) && !isNil(campaign.message1)) {
    messages.push(campaign.message1);
  }

  if (!isEmpty(campaign.message2) && !isNil(campaign.message2)) {
    messages.push(campaign.message2);
  }

  if (!isEmpty(campaign.message3) && !isNil(campaign.message3)) {
    messages.push(campaign.message3);
  }

  if (!isEmpty(campaign.message4) && !isNil(campaign.message4)) {
    messages.push(campaign.message4);
  }

  if (!isEmpty(campaign.message5) && !isNil(campaign.message5)) {
    messages.push(campaign.message5);
  }

  return messages;
}

function getCampaignValidConfirmationMessages(campaign) {
  const messages = [];

  if (
    !isEmpty(campaign.confirmationMessage1) &&
    !isNil(campaign.confirmationMessage1)
  ) {
    messages.push(campaign.confirmationMessage1);
  }

  if (
    !isEmpty(campaign.confirmationMessage2) &&
    !isNil(campaign.confirmationMessage2)
  ) {
    messages.push(campaign.confirmationMessage2);
  }

  if (
    !isEmpty(campaign.confirmationMessage3) &&
    !isNil(campaign.confirmationMessage3)
  ) {
    messages.push(campaign.confirmationMessage3);
  }

  if (
    !isEmpty(campaign.confirmationMessage4) &&
    !isNil(campaign.confirmationMessage4)
  ) {
    messages.push(campaign.confirmationMessage4);
  }

  if (
    !isEmpty(campaign.confirmationMessage5) &&
    !isNil(campaign.confirmationMessage5)
  ) {
    messages.push(campaign.confirmationMessage5);
  }

  return messages;
}

function getProcessedMessage(msg: string, variables: any[], contact: any) {
  let finalMessage = msg;

  if (finalMessage.includes("{nome}")) {
    finalMessage = finalMessage.replace(/{nome}/g, contact.name);
  }

  if (finalMessage.includes("{email}")) {
    finalMessage = finalMessage.replace(/{email}/g, contact.email);
  }

  if (finalMessage.includes("{numero}")) {
    finalMessage = finalMessage.replace(/{numero}/g, contact.number);
  }

  if (variables[0]?.value !== '[]') {
    variables.forEach(variable => {
      if (finalMessage.includes(`{${variable.key}}`)) {
        const regex = new RegExp(`{${variable.key}}`, "g");
        finalMessage = finalMessage.replace(regex, variable.value);
      }
    });
  }

  return finalMessage;
}

const checkerWeek = async () => {
  const sab = moment().day() === 6;
  const dom = moment().day() === 0;

  const sabado = await CampaignSetting.findOne({
    where: { key: "sabado" }
  });

  const domingo = await CampaignSetting.findOne({
    where: { key: "domingo" }
  });

  if (sabado?.value === "false" && sab) {
    messageQueue.pause();
    return true;
  }

  if (domingo?.value === "false" && dom) {
    messageQueue.pause();
    return true;
  }

  messageQueue.resume();
  return false;
};

const checkTime = async () => {
  const startHour = await CampaignSetting.findOne({
    where: {
      key: "startHour"
    }
  });

  const endHour = await CampaignSetting.findOne({
    where: {
      key: "endHour"
    }
  });

  const hour = startHour.value as unknown as number;
  const endHours = endHour.value as unknown as number;

  const timeNow = moment().format("HH:mm") as unknown as number;

  if (timeNow <= endHours && timeNow >= hour) {
    messageQueue.resume();

    return true;
  }


  logger.info(
    `Envio inicia as ${hour} e termina as ${endHours}, hora atual ${timeNow} não está dentro do horário`
  );
  messageQueue.clean(0, "delayed");
  messageQueue.clean(0, "wait");
  messageQueue.clean(0, "active");
  messageQueue.clean(0, "completed");
  messageQueue.clean(0, "failed");
  messageQueue.pause();

  return false;
};

// const checkerLimitToday = async (whatsappId: number) => {
//   try {

//     const setting = await SettingMessage.findOne({
//       where: { whatsappId: whatsappId }
//     });


//     const lastUpdate = moment(setting.dateStart);

//     const now = moment();

//     const passou = now.isAfter(lastUpdate, "day");



//     if (setting.sendToday <= setting.limit) {
//       await setting.update({
//         dateStart: moment().format()
//       });

//       return true;
//     }

//     const zerar = true
//     if(passou) {
//       await setting.update({
//         sendToday: 0,
//         dateStart: moment().format()
//       });

//       setting.reload();
//     }


//     setting.reload();

//     logger.info(`Enviada hoje ${setting.sendToday} limite ${setting.limit}`);
//     // sendMassMessage.clean(0, "delayed");
//     // sendMassMessage.clean(0, "wait");
//     // sendMassMessage.clean(0, "active");
//     // sendMassMessage.clean(0, "completed");
//     // sendMassMessage.clean(0, "failed");
//     // sendMassMessage.pause();
//     return false;
//   } catch (error) {
//     logger.error("conexão não tem configuração de envio.");
//   }
// };

export function randomValue(min, max) {
  return Math.floor(Math.random() * max) + min;
}

async function verifyAndFinalizeCampaign(campaign) {
  const { companyId, contacts } = campaign.contactList;

  const count1 = contacts.length;

  const count2 = await CampaignShipping.count({
    where: {
      campaignId: campaign.id,
      deliveredAt: {
        [Op.ne]: null
      },
      confirmation: campaign.confirmation ? true : { [Op.or]: [null, false] }
    }
  });

  if (count1 === count2) {
    await campaign.update({ status: "FINALIZADA", completedAt: moment() });
  }

  const io = getIO();
  io.of(companyId)
    .emit(`company-${campaign.companyId}-campaign`, {
      action: "update",
      record: campaign
    });
}

async function handleProcessCampaign(job) {
  try {
    const { id }: ProcessCampaignData = job.data;
    const campaign = await getCampaign(id);
    const settings = await getSettings(campaign);
    if (campaign) {
      const { contacts } = campaign.contactList;
      if (isArray(contacts)) {
        const contactData = contacts.map(contact => ({
          contactId: contact.id,
          campaignId: campaign.id,
          variables: settings.variables,
          isGroup: contact.isGroup
        }));

        // const baseDelay = job.data.delay || 0;
        const longerIntervalAfter = parseToMilliseconds(settings.longerIntervalAfter);
        const greaterInterval = parseToMilliseconds(settings.greaterInterval);
        const messageInterval = settings.messageInterval;

        let baseDelay = campaign.scheduledAt;

        // const isOpen = await checkTime();
        // const isFds = await checkerWeek();

        const queuePromises = [];
        for (let i = 0; i < contactData.length; i++) {
          baseDelay = addSeconds(baseDelay, i > longerIntervalAfter ? greaterInterval : messageInterval);

          const { contactId, campaignId, variables } = contactData[i];
          const delay = calculateDelay(i, baseDelay, longerIntervalAfter, greaterInterval, messageInterval);
          // if (isOpen || !isFds) {
          const queuePromise = campaignQueue.add(
            "PrepareContact",
            { contactId, campaignId, variables, delay },
            { removeOnComplete: true }
          );
          queuePromises.push(queuePromise);
          logger.info(`Registro enviado pra fila de disparo: Campanha=${campaign.id};Contato=${contacts[i].name};delay=${delay}`);
          // }
        }
        await Promise.all(queuePromises);
        // await campaign.update({ status: "EM_ANDAMENTO" });
      }
    }
  } catch (err: any) {
    Sentry.captureException(err);
  }
}

function calculateDelay(index, baseDelay, longerIntervalAfter, greaterInterval, messageInterval) {
  const diffSeconds = differenceInSeconds(baseDelay, new Date());
  if (index > longerIntervalAfter) {
    return diffSeconds * 1000 + greaterInterval
  } else {
    return diffSeconds * 1000 + messageInterval
  }
}

async function handlePrepareContact(job) {
  try {
    const { contactId, campaignId, delay, variables }: PrepareContactData =
      job.data;
    const campaign = await getCampaign(campaignId);
    const contact = await getContact(contactId);
    const campaignShipping: any = {};
    campaignShipping.number = contact.number;
    campaignShipping.contactId = contactId;
    campaignShipping.campaignId = campaignId;
    const messages = getCampaignValidMessages(campaign);

    if (messages.length >= 0) {
      const radomIndex = randomValue(0, messages.length);

      const message = getProcessedMessage(
        messages[radomIndex] || "",
        variables,
        contact
      );

      campaignShipping.message = message === null ? "" : `\u200c ${message}`;
    }
    if (campaign.confirmation) {
      const confirmationMessages =
        getCampaignValidConfirmationMessages(campaign);
      if (confirmationMessages.length) {
        const radomIndex = randomValue(0, confirmationMessages.length);
        const message = getProcessedMessage(
          confirmationMessages[radomIndex] || "",
          variables,
          contact
        );
        campaignShipping.confirmationMessage = `\u200c ${message}`;
      }
    }
    const [record, created] = await CampaignShipping.findOrCreate({
      where: {
        campaignId: campaignShipping.campaignId,
        contactId: campaignShipping.contactId
      },
      defaults: campaignShipping
    });

    if (
      !created &&
      record.deliveredAt === null &&
      record.confirmationRequestedAt === null
    ) {
      record.set(campaignShipping);
      await record.save();
    }

    if (
      record.deliveredAt === null &&
      record.confirmationRequestedAt === null
    ) {
      const nextJob = await campaignQueue.add(
        "DispatchCampaign",
        {
          campaignId: campaign.id,
          campaignShippingId: record.id,
          contactListItemId: contactId
        },
        {
          delay
        }
      );

      await record.update({ jobId: String(nextJob.id) });
    }

    await verifyAndFinalizeCampaign(campaign);
  } catch (err: any) {
    Sentry.captureException(err);
    logger.error(`campaignQueue -> PrepareContact -> error: ${err.message}`);
  }
}

async function handleDispatchCampaign(job) {
  try {
    const { data } = job;
    const { campaignShippingId, campaignId }: DispatchCampaignData = data;
    const campaign = await getCampaign(campaignId);
    const wbot = await GetWhatsappWbot(campaign.whatsapp);

    if (!wbot) {
      logger.error(`campaignQueue -> DispatchCampaign -> error: wbot not found`);
      return;
    }

    if (!campaign.whatsapp) {
      logger.error(`campaignQueue -> DispatchCampaign -> error: whatsapp not found`);
      return;
    }

    if (!wbot?.user?.id) {
      logger.error(`campaignQueue -> DispatchCampaign -> error: wbot user not found`);
      return;
    }

    logger.info(
      `Disparo de campanha solicitado: Campanha=${campaignId};Registro=${campaignShippingId}`
    );

    const campaignShipping = await CampaignShipping.findByPk(
      campaignShippingId,
      {
        include: [{ model: ContactListItem, as: "contact" }]
      }
    );

    const chatId = campaignShipping.contact.isGroup ? `${campaignShipping.number}@g.us` : `${campaignShipping.number}@s.whatsapp.net`;

    if (campaign.openTicket === "enabled") {
      const [contact] = await Contact.findOrCreate({
        where: {
          number: campaignShipping.number,
          companyId: campaign.companyId
        },
        defaults: {
          companyId: campaign.companyId,
          name: campaignShipping.contact.name,
          number: campaignShipping.number,
          email: campaignShipping.contact.email,
          whatsappId: campaign.whatsappId,
          profilePicUrl: ""
        }
      })
      const whatsapp = await Whatsapp.findByPk(campaign.whatsappId);

      let ticket = await Ticket.findOne({
        where: {
          contactId: contact.id,
          companyId: campaign.companyId,
          whatsappId: whatsapp.id,
          status: ["open", "pending"]
        }
      })

      if (!ticket)
        ticket = await Ticket.create({
          companyId: campaign.companyId,
          contactId: contact.id,
          whatsappId: whatsapp.id,
          queueId: campaign?.queueId,
          userId: campaign?.userId,
          status: campaign?.statusTicket
        })

      ticket = await ShowTicketService(ticket.id, campaign.companyId);

      if (whatsapp.status === "CONNECTED") {
        if (campaign.confirmation && campaignShipping.confirmation === null) {
          const confirmationMessage = await wbot.sendMessage(chatId, {
            text: `\u200c ${campaignShipping.confirmationMessage}`
          });

          await verifyMessage(confirmationMessage, ticket, contact, null, true, false);

          await campaignShipping.update({ confirmationRequestedAt: moment() });
        } else {

          if (!campaign.mediaPath) {
            const sentMessage = await wbot.sendMessage(chatId, {
              text: `\u200c ${campaignShipping.message}`
            });

            await verifyMessage(sentMessage, ticket, contact, null, true, false);
          }


          if (campaign.mediaPath) {

            const publicFolder = path.resolve(__dirname, "..", "public");
            const filePath = path.join(publicFolder, `company${campaign.companyId}`, campaign.mediaPath);

            const options = await getMessageOptions(campaign.mediaName, filePath, String(campaign.companyId), `\u200c ${campaignShipping.message}`);
            if (Object.keys(options).length) {
              if (options.mimetype === "audio/mp4") {
                const audioMessage = await wbot.sendMessage(chatId, {
                  text: `\u200c ${campaignShipping.message}`
                });

                await verifyMessage(audioMessage, ticket, contact, null, true, false);
              }
              const sentMessage = await wbot.sendMessage(chatId, { ...options });

              await verifyMediaMessage(sentMessage, ticket, ticket.contact, null, false, true, wbot);
            }
          }
          // if (campaign?.statusTicket === 'closed') {
          //   await ticket.update({
          //     status: "closed"
          //   })
          //   const io = getIO();

          //   io.of(String(ticket.companyId))
          //     // .to(ticket.id.toString())
          //     .emit(`company-${ticket.companyId}-ticket`, {
          //       action: "delete",
          //       ticketId: ticket.id
          //     });
          // }
        }
        await campaignShipping.update({ deliveredAt: moment() });
      }
    }
    else {


      if (campaign.confirmation && campaignShipping.confirmation === null) {
        await wbot.sendMessage(chatId, {
          text: campaignShipping.confirmationMessage
        });
        await campaignShipping.update({ confirmationRequestedAt: moment() });

      } else {

        if (!campaign.mediaPath) {
          await wbot.sendMessage(chatId, {
            text: campaignShipping.message
          });
        }

        if (campaign.mediaPath) {
          const publicFolder = path.resolve(__dirname, "..", "public");
          const filePath = path.join(publicFolder, `company${campaign.companyId}`, campaign.mediaPath);

          const options = await getMessageOptions(campaign.mediaName, filePath, String(campaign.companyId), campaignShipping.message);
          if (Object.keys(options).length) {
            if (options.mimetype === "audio/mp4") {
              await wbot.sendMessage(chatId, {
                text: campaignShipping.message
              });
            }
            await wbot.sendMessage(chatId, { ...options });
          }
        }
      }

      await campaignShipping.update({ deliveredAt: moment() });

    }
    await verifyAndFinalizeCampaign(campaign);

    const io = getIO();
    io.of(String(campaign.companyId))
      .emit(`company-${campaign.companyId}-campaign`, {
        action: "update",
        record: campaign
      });

    logger.info(
      `Campanha enviada para: Campanha=${campaignId};Contato=${campaignShipping.contact.name}`
    );
  } catch (err: any) {
    Sentry.captureException(err);
    logger.error(err.message);
    console.log(err.stack);
  }
}

async function handleLoginStatus(job) {
  const thresholdTime = new Date();
  thresholdTime.setMinutes(thresholdTime.getMinutes() - 5);

  await User.update({ online: false }, {
    where: {
      updatedAt: { [Op.lt]: thresholdTime },
      online: true,
    },
  });
}

async function handleResumeTicketsOutOfHour(job) {
  // logger.info("Buscando atendimentos perdidos nas filas");
  try {
    const companies = await Company.findAll({
      attributes: ['id', 'name'],
      where: {
        status: true
      },
      include: [
        {
          model: Whatsapp,
          attributes: ["id", "name", "status", "timeSendQueue", "sendIdQueue"],
          where: {
            timeSendQueue: { [Op.gt]: 0 }
          }
        },
      ]
    });

    companies.map(async c => {

      c.whatsapps.map(async w => {

        if (w.status === "CONNECTED") {
          var companyId = c.id;

          const moveQueue = w.timeSendQueue ? w.timeSendQueue : 0;
          const moveQueueId = w.sendIdQueue;
          const moveQueueTime = moveQueue;
          const idQueue = moveQueueId;
          const timeQueue = moveQueueTime;

          if (moveQueue > 0) {

            if (!isNaN(idQueue) && Number.isInteger(idQueue) && !isNaN(timeQueue) && Number.isInteger(timeQueue)) {

              const tempoPassado = moment().subtract(timeQueue, "minutes").utc().format();
              // const tempoAgora = moment().utc().format();

              const { count, rows: tickets } = await Ticket.findAndCountAll({
                attributes: ["id"],
                where: {
                  status: "pending",
                  queueId: null,
                  companyId: companyId,
                  whatsappId: w.id,
                  updatedAt: {
                    [Op.lt]: tempoPassado
                  },
                  // isOutOfHour: false
                },
                include: [
                  {
                    model: Contact,
                    as: "contact",
                    attributes: ["id", "name", "number", "email", "profilePicUrl", "acceptAudioMessage", "active", "disableBot", "urlPicture", "lgpdAcceptedAt", "companyId"],
                    include: ["extraInfo", "tags"]
                  },
                  {
                    model: Queue,
                    as: "queue",
                    attributes: ["id", "name", "color"]
                  },
                  {
                    model: Whatsapp,
                    as: "whatsapp",
                    attributes: ["id", "name", "expiresTicket", "groupAsTicket"]
                  }
                ]
              });

              if (count > 0) {
                tickets.map(async ticket => {
                  await ticket.update({
                    queueId: idQueue
                  });

                  await ticket.reload();

                  const io = getIO();
                  io.of(String(companyId))
                    // .to("notification")
                    // .to(ticket.id.toString())
                    .emit(`company-${companyId}-ticket`, {
                      action: "update",
                      ticket,
                      ticketId: ticket.id
                    });

                  // io.to("pending").emit(`company-${companyId}-ticket`, {
                  //   action: "update",
                  //   ticket,
                  // });

                  logger.info(`Atendimento Perdido: ${ticket.id} - Empresa: ${companyId}`);
                });
              }
            } else {
              logger.info(`Condição não respeitada - Empresa: ${companyId}`);
            }
          }
        }
      });
    });
  } catch (e: any) {
    Sentry.captureException(e);
    logger.error("SearchForQueue -> VerifyQueue: error", e.message);
    throw e;
  }
};

async function handleVerifyQueue(job) {
  // logger.info("Buscando atendimentos perdidos nas filas");
  try {
    const companies = await Company.findAll({
      attributes: ['id', 'name'],
      where: {
        status: true
      },
      include: [
        {
          model: Whatsapp,
          attributes: ["id", "name", "status", "timeSendQueue", "sendIdQueue"]
        },
      ]
    });

    companies.map(async c => {

      c.whatsapps.map(async w => {

        if (w.status === "CONNECTED") {
          var companyId = c.id;

          const moveQueue = w.timeSendQueue ? w.timeSendQueue : 0;
          const moveQueueId = w.sendIdQueue;
          const moveQueueTime = moveQueue;
          const idQueue = moveQueueId;
          const timeQueue = moveQueueTime;

          if (moveQueue > 0) {

            if (!isNaN(idQueue) && Number.isInteger(idQueue) && !isNaN(timeQueue) && Number.isInteger(timeQueue)) {

              const tempoPassado = moment().subtract(timeQueue, "minutes").utc().format();
              // const tempoAgora = moment().utc().format();

              const { count, rows: tickets } = await Ticket.findAndCountAll({
                attributes: ["id"],
                where: {
                  status: "pending",
                  queueId: null,
                  companyId: companyId,
                  whatsappId: w.id,
                  updatedAt: {
                    [Op.lt]: tempoPassado
                  },
                  // isOutOfHour: false
                },
                include: [
                  {
                    model: Contact,
                    as: "contact",
                    attributes: ["id", "name", "number", "email", "profilePicUrl", "acceptAudioMessage", "active", "disableBot", "urlPicture", "lgpdAcceptedAt", "companyId"],
                    include: ["extraInfo", "tags"]
                  },
                  {
                    model: Queue,
                    as: "queue",
                    attributes: ["id", "name", "color"]
                  },
                  {
                    model: Whatsapp,
                    as: "whatsapp",
                    attributes: ["id", "name", "expiresTicket", "groupAsTicket"]
                  }
                ]
              });

              if (count > 0) {
                tickets.map(async ticket => {
                  await ticket.update({
                    queueId: idQueue
                  });

                  await CreateLogTicketService({
                    userId: null,
                    queueId: idQueue,
                    ticketId: ticket.id,
                    type: "redirect"
                  });

                  await ticket.reload();

                  const io = getIO();
                  io.of(String(companyId))
                    // .to("notification")
                    // .to(ticket.id.toString())
                    .emit(`company-${companyId}-ticket`, {
                      action: "update",
                      ticket,
                      ticketId: ticket.id
                    });

                  // io.to("pending").emit(`company-${companyId}-ticket`, {
                  //   action: "update",
                  //   ticket,
                  // });

                  logger.info(`Atendimento Perdido: ${ticket.id} - Empresa: ${companyId}`);
                });
              }
            } else {
              logger.info(`Condição não respeitada - Empresa: ${companyId}`);
            }
          }
        }
      });
    });
  } catch (e: any) {
    Sentry.captureException(e);
    logger.error("SearchForQueue -> VerifyQueue: error", e.message);
    throw e;
  }
};

async function handleRandomUser() {
  // logger.info("Iniciando a randomização dos atendimentos...");

  const jobR = new CronJob('0 */2 * * * *', async () => {

    try {
      const companies = await Company.findAll({
        attributes: ['id', 'name'],
        where: {
          status: true
        },
        include: [
          {
            model: Queues,
            attributes: ["id", "name", "ativarRoteador", "tempoRoteador"],
            where: {
              ativarRoteador: true,
              tempoRoteador: {
                [Op.ne]: 0
              }
            }
          },
        ]
      });

      if (companies) {
        companies.map(async c => {
          c.queues.map(async q => {
            const { count, rows: tickets } = await Ticket.findAndCountAll({
              where: {
                companyId: c.id,
                status: "pending",
                queueId: q.id,
              },
            });

            //logger.info(`Localizado: ${count} filas para randomização.`);

            const getRandomUserId = (userIds) => {
              const randomIndex = Math.floor(Math.random() * userIds.length);
              return userIds[randomIndex];
            };

            // Function to fetch the User record by userId
            const findUserById = async (userId, companyId) => {
              try {
                const user = await User.findOne({
                  where: {
                    id: userId,
                    companyId
                  },
                });

                if (user && user?.profile === "user") {
                  if (user.online === true) {
                    return user.id;
                  } else {
                    // logger.info("USER OFFLINE");
                    return 0;
                  }
                } else {
                  // logger.info("ADMIN");
                  return 0;
                }

              } catch (errorV) {
                Sentry.captureException(errorV);
                logger.error("SearchForUsersRandom -> VerifyUsersRandom: error", errorV.message);
                throw errorV;
              }
            };

            if (count > 0) {
              for (const ticket of tickets) {
                const { queueId, userId } = ticket;
                const tempoRoteador = q.tempoRoteador;
                // Find all UserQueue records with the specific queueId
                const userQueues = await UserQueue.findAll({
                  where: {
                    queueId: queueId,
                  },
                });

                const contact = await ShowContactService(ticket.contactId, ticket.companyId);

                // Extract the userIds from the UserQueue records
                const userIds = userQueues.map((userQueue) => userQueue.userId);

                const tempoPassadoB = moment().subtract(tempoRoteador, "minutes").utc().toDate();
                const updatedAtV = new Date(ticket.updatedAt);

                let settings = await CompaniesSettings.findOne({
                  where: {
                    companyId: ticket.companyId
                  }
                });
                const sendGreetingMessageOneQueues = settings.sendGreetingMessageOneQueues === "enabled" || false;

                if (!userId) {
                  // ticket.userId is null, randomly select one of the provided userIds
                  const randomUserId = getRandomUserId(userIds);


                  if (randomUserId !== undefined && await findUserById(randomUserId, ticket.companyId) > 0) {
                    // Update the ticket with the randomly selected userId
                    //ticket.userId = randomUserId;
                    //ticket.save();

                    if (sendGreetingMessageOneQueues) {
                      const ticketToSend = await ShowTicketService(ticket.id, ticket.companyId);

                      await SendWhatsAppMessage({ body: `\u200e *Assistente Virtual*:\nAguarde enquanto localizamos um atendente... Você será atendido em breve!`, ticket: ticketToSend });

                    }

                    await UpdateTicketService({
                      ticketData: { status: "pending", userId: randomUserId },
                      ticketId: ticket.id,
                      companyId: ticket.companyId,

                    });

                    //await ticket.reload();
                    logger.info(`Ticket ID ${ticket.id} atualizado para UserId ${randomUserId} - ${ticket.updatedAt}`);
                  } else {
                    //logger.info(`Ticket ID ${ticket.id} NOT updated with UserId ${randomUserId} - ${ticket.updatedAt}`);            
                  }

                } else if (userIds.includes(userId)) {
                  if (tempoPassadoB > updatedAtV) {
                    // ticket.userId is present and is in userIds, exclude it from random selection
                    const availableUserIds = userIds.filter((id) => id !== userId);

                    if (availableUserIds.length > 0) {
                      // Randomly select one of the remaining userIds
                      const randomUserId = getRandomUserId(availableUserIds);

                      if (randomUserId !== undefined && await findUserById(randomUserId, ticket.companyId) > 0) {
                        // Update the ticket with the randomly selected userId
                        //ticket.userId = randomUserId;
                        //ticket.save();

                        if (sendGreetingMessageOneQueues) {

                          const ticketToSend = await ShowTicketService(ticket.id, ticket.companyId);
                          await SendWhatsAppMessage({ body: "*Assistente Virtual*:\nAguarde enquanto localizamos um atendente... Você será atendido em breve!", ticket: ticketToSend });
                        };

                        await UpdateTicketService({
                          ticketData: { status: "pending", userId: randomUserId },
                          ticketId: ticket.id,
                          companyId: ticket.companyId,

                        });

                        logger.info(`Ticket ID ${ticket.id} atualizado para UserId ${randomUserId} - ${ticket.updatedAt}`);
                      } else {
                        //logger.info(`Ticket ID ${ticket.id} NOT updated with UserId ${randomUserId} - ${ticket.updatedAt}`);            
                      }

                    }
                  }
                }

              }
            }
          })
        })
      }
    } catch (e) {
      Sentry.captureException(e);
      logger.error("SearchForUsersRandom -> VerifyUsersRandom: error", e.message);
      throw e;
    }

  });

  jobR.start();
}

async function handleProcessLanes() {
  const job = new CronJob('*/1 * * * *', async () => {
    const companies = await Company.findAll({
      include: [
        {
          model: Plan,
          as: "plan",
          attributes: ["id", "name", "useKanban"],
          where: {
            useKanban: true
          }
        },
      ]
    });
    companies.map(async c => {

      try {
        const companyId = c.id;

        const ticketTags = await TicketTag.findAll({
          include: [{
            model: Ticket,
            as: "ticket",
            where: {
              status: "open",
              fromMe: true,
              companyId
            },
            attributes: ["id", "contactId", "updatedAt", "whatsappId"]
          }, {
            model: Tag,
            as: "tag",
            attributes: ["id", "timeLane", "nextLaneId", "greetingMessageLane"],
            where: {
              companyId
            }
          }]
        })

        if (ticketTags.length > 0) {
          ticketTags.map(async t => {
            if (!isNil(t?.tag.nextLaneId) && t?.tag.nextLaneId > 0 && t?.tag.timeLane > 0) {
              const nextTag = await Tag.findByPk(t?.tag.nextLaneId);

              const dataLimite = new Date();
              dataLimite.setHours(dataLimite.getHours() - Number(t.tag.timeLane));
              const dataUltimaInteracaoChamado = new Date(t.ticket.updatedAt)

              if (dataUltimaInteracaoChamado < dataLimite) {
                await TicketTag.destroy({ where: { ticketId: t.ticketId, tagId: t.tagId } });
                await TicketTag.create({ ticketId: t.ticketId, tagId: nextTag.id });

                const whatsapp = await Whatsapp.findByPk(t.ticket.whatsappId);

                if (!isNil(nextTag.greetingMessageLane) && nextTag.greetingMessageLane !== "") {
                  const bodyMessage = nextTag.greetingMessageLane;

                  const contact = await Contact.findByPk(t.ticket.contactId);
                  const ticketUpdate = await ShowTicketService(t.ticketId, companyId);

                  await SendMessage(whatsapp, {
                    number: contact.number,
                    body: `${formatBody(bodyMessage, ticketUpdate)}`,
                    mediaPath: null,
                    companyId: companyId
                  },
                    contact.isGroup
                  )
                }
              }
            }
          })
        }
      } catch (e: any) {
        Sentry.captureException(e);
        logger.error("Process Lanes -> Verify: error", e.message);
        throw e;
      }

    });
  });
  job.start()
}

async function handleCloseTicketsAutomatic() {
  const job = new CronJob('*/1 * * * *', async () => {
    const companies = await Company.findAll({
      where: {
        status: true
      }
    });
    companies.map(async c => {

      try {
        const companyId = c.id;
        await ClosedAllOpenTickets(companyId);
      } catch (e: any) {
        Sentry.captureException(e);
        logger.error("ClosedAllOpenTickets -> Verify: error", e.message);
        throw e;
      }

    });
  });
  job.start()
}

async function handleWhatsapp() {
  const jobW = new CronJob('* 15 3 * * *', async () => {
    //*Whatsapp
    GetWhatsapp();
    jobW.stop();
  }, null, false, 'America/Sao_Paulo')
  jobW.start();
}

async function handleInvoiceCreate() {
  const job = new CronJob('0 * * * * *', async () => {
    try {
      console.log('Running invoice creation job at:', moment().format());

      // Fetch all companies
      const companies = await Company.findAll();

      // Process each company
      await Promise.all(companies.map(async (company) => {
        const dueDate = moment(company.dueDate).format('DD/MM/yyyy');
        const today = moment().format('DD/MM/yyyy');
        const diff = moment(dueDate, 'DD/MM/yyyy').diff(moment(today, 'DD/MM/yyyy'));
        const daysUntilDue = moment.duration(diff).asDays();

        // Check if due date is within 20 days
        if (daysUntilDue < 20) {
          const plan = await Plan.findByPk(company.planId);
          if (!plan) {
            console.warn(`No plan found for company ${company.id}`);
            return;
          }

          // Check if invoice already exists for the due date
          const sqlCheck = `
            SELECT COUNT(*) as mycount 
            FROM "Invoices" 
            WHERE "companyId" = :companyId 
            AND "dueDate"::text LIKE :dueDate;
          `;
          const invoice = await sequelize.query<{ mycount: number }>(
            sqlCheck,
            {
              type: QueryTypes.SELECT,
              replacements: {
                companyId: company.id,
                dueDate: `${moment(company.dueDate).format('yyyy-MM-DD')}%`,
              },
            }
          );

          if (invoice[0].mycount > 0) {
            console.log(`Invoice already exists for company ${company.id} on due date ${dueDate}`);
            return;
          }

          // Insert new invoice
          const timestamp = moment().format();
          const sqlInsert = `
            INSERT INTO "Invoices" (detail, status, value, "updatedAt", "createdAt", "dueDate", "companyId")
            VALUES (:detail, 'open', :value, :updatedAt, :createdAt, :dueDate, :companyId);
          `;
          await sequelize.query(
            sqlInsert,
            {
              type: QueryTypes.INSERT,
              replacements: {
                detail: plan.name,
                value: plan.amount, // Ensure plan.amount is a number in the database
                updatedAt: timestamp,
                createdAt: timestamp,
                dueDate: moment(company.dueDate).format('yyyy-MM-DD'),
                companyId: company.id,
              },
            }
          );
          console.log(`Invoice created for company ${company.id}`);

          // Configure email transporter
          const transporter = nodemailer.createTransport({
            host: process.env.MAIL_HOST,
            port: Number(process.env.MAIL_PORT) || 587,
            secure: process.env.SMTP_SECURE === 'true',
            auth: {
              user: process.env.MAIL_USER,
              pass: process.env.MAIL_PASS,
            },
          });

          // Convert plan.amount to number for toFixed
          const amount = typeof plan.amount === 'string' ? parseFloat(plan.amount) : plan.amount;

          // HTML email template
          const htmlContent = `
  <div style="font-family: 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: auto; padding: 40px 30px; background: linear-gradient(180deg, #ffffff, #f4f6f9); color: #333; border-radius: 12px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);">
    
    <!-- Logo -->
    <div style="text-align: center; margin-bottom: 20px;">
      <img src="${process.env.FRONTEND_URL}/logo.png" alt="Sua Empresa" style="max-width: 150px;">
    </div>

    <!-- Título -->
    <div style="text-align: center; margin-bottom: 30px;">
      <h1 style="color: #2c3e50; font-size: 26px; margin: 0;">🎉 Sua nova fatura está disponível</h1>
      <p style="font-size: 16px; color: #555; margin-top: 8px;">Confira os detalhes abaixo</p>
    </div>

    <!-- Saudação -->
    <p style="font-size: 16px;">Olá, <strong>${company.name}</strong>,</p>

    <p style="font-size: 15px; line-height: 1.6;">
      Uma nova fatura foi gerada para sua conta. Fique atento ao vencimento para evitar atrasos.
    </p>

    <!-- Bloco de Detalhes -->
    <div style="background-color: #ffffff; padding: 20px; border-radius: 10px; border: 1px solid #e0e0e0; margin: 25px 0;">
      <p style="margin: 12px 0; font-size: 15px;"><strong>🧾 Plano:</strong> ${plan.name}</p>
      <p style="margin: 12px 0; font-size: 15px;"><strong>💰 Valor:</strong> <span style="color: #27ae60;">R$ ${amount.toFixed(2)}</span></p>
      <p style="margin: 12px 0; font-size: 15px;"><strong>📅 Vencimento:</strong> ${dueDate}</p>
    </div>

    <!-- Botão -->
    <div style="text-align: center; margin: 30px 0;">
      <a href="${process.env.FRONTEND_URL}/financeiro" 
         style="background-color: #2ecc71; color: white; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-size: 16px; font-weight: bold; display: inline-block; transition: background 0.3s;">
        💼 Visualizar Fatura
      </a>
    </div>

    <!-- Ajuda -->
    <p style="font-size: 14px; color: #666; text-align: center;">
      Precisa de ajuda? Nossa equipe está pronta para te atender.
    </p>

    <!-- Link alternativo -->
    <p style="font-size: 13px; color: #888; margin-top: 30px;">
      🔗 Se o botão acima não funcionar, copie e cole este link no navegador:<br>
      <a href="${process.env.FRONTEND_URL}/financeiro" style="color: #3498db;">${process.env.FRONTEND_URL}/financeiro</a>
    </p>

    <!-- Rodapé -->
    <hr style="border: none; border-top: 1px solid #ddd; margin: 40px 0;">

    <footer style="text-align: center; font-size: 12px; color: #aaa;">
      © ${new Date().getFullYear()} Sua Empresa. Todos os direitos reservados.<br>
      <a href="${process.env.FRONTEND_URL}/suporte" style="color: #aaa; text-decoration: underline;">Suporte</a> |
      <a href="${process.env.FRONTEND_URL}/politica-de-privacidade" style="color: #aaa; text-decoration: underline;">Política de Privacidade</a>
    </footer>
  </div>
`;


          // Send email
          try {
            await transporter.sendMail({
              from: process.env.SMTP_FROM || process.env.MAIL_USER,
              to: company.email,
              subject: 'Fatura Gerada - Sistema',
              text: `Olá ${company.name},\n\nUma nova fatura foi gerada!\n\nVencimento: ${dueDate}\nValor: R$ ${amount.toFixed(2)}\nLink: ${process.env.FRONTEND_URL}/financeiro\n\nQualquer dúvida, estamos à disposição!`,
              html: htmlContent,
            });
            console.log(`Invoice email sent to ${company.email}`);
          } catch (error) {
            console.error(`Failed to send invoice email to ${company.email}:`, error);
          }
        }
      }));
    } catch (error) {
      console.error('Error in invoice creation job:', error);
    }
  });

  job.start();
}


handleInvoiceCreate()

handleWhatsapp();
handleProcessLanes();
handleCloseTicketsAutomatic();
handleRandomUser();

export async function startQueueProcess() {
  logger.info("Iniciando processamento de filas");

  messageQueue.process("SendMessage", handleSendMessage);

  scheduleMonitor.process("Verify", handleVerifySchedules);

  sendScheduledMessages.process("SendMessage", handleSendScheduledMessage);

  campaignQueue.process("VerifyCampaignsDaatabase", handleVerifyCampaigns);

  campaignQueue.process("ProcessCampaign", handleProcessCampaign);

  campaignQueue.process("PrepareContact", handlePrepareContact);

  campaignQueue.process("DispatchCampaign", handleDispatchCampaign);

  userMonitor.process("VerifyLoginStatus", handleLoginStatus);

  queueMonitor.process("VerifyQueueStatus", handleVerifyQueue);

  scheduleMonitor.add(
    "Verify",
    {},
    {
      repeat: { cron: "0 * * * * *", key: "verify" },
      removeOnComplete: true
    }
  );

  campaignQueue.add(
    "VerifyCampaignsDaatabase",
    {},
    {
      repeat: { cron: "*/20 * * * * *", key: "verify-campaing" },
      removeOnComplete: true
    }
  );

  userMonitor.add(
    "VerifyLoginStatus",
    {},
    {
      repeat: { cron: "* * * * *", key: "verify-login" },
      removeOnComplete: true
    }
  );

  queueMonitor.add(
    "VerifyQueueStatus",
    {},
    {
      repeat: { cron: "0 * * * * *", key: "verify-queue" },
      removeOnComplete: true
    }
  );
}