import { WAMessage, AnyMessageContent, WAPresence } from "@whiskeysockets/baileys";
import * as Sentry from "@sentry/node";
import fs from "fs";
import { exec } from "child_process";
import path from "path";
import ffmpegPath from "@ffmpeg-installer/ffmpeg";
import AppError from "../../errors/AppError";
import GetTicketWbot from "../../helpers/GetTicketWbot";
import Ticket from "../../models/Ticket";
import mime from "mime-types";
import Contact from "../../models/Contact";

interface Request {
  media: Express.Multer.File;
  ticket: Ticket;
  body?: string;
}

interface RequestFlow {
  media: string;
  ticket: Ticket;
  body?: string;
  isFlow?: boolean;
  isRecord?: boolean;
}

const publicFolder = path.resolve(__dirname, "..", "..", "..", "public");
const ensureDir = (dir: string) => {
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  } catch {}
};

const processAudio = async (audio: string): Promise<string> => {
  // Convert to OGG/Opus mono com configurações para voice note nativo (com waveform)
  ensureDir(publicFolder);
  const outputAudio = `${publicFolder}/${new Date().getTime()}.ogg`;
  return new Promise((resolve, reject) => {
    exec(
      `${ffmpegPath.path} -i ${audio} -vn -ac 1 -ar 16000 -c:a libopus -b:a 32k -compression_level 10 -frame_duration 60 -application voip -f ogg ${outputAudio} -y`,
      (error, _stdout, _stderr) => {
        if (error) return reject(error);
        resolve(outputAudio);
      }
    );
  });
};

const processAudioFile = async (audio: string): Promise<string> => {
  // Conversão específica para voice note com waveform
  ensureDir(publicFolder);
  const outputAudio = `${publicFolder}/${new Date().getTime()}.ogg`;
  return new Promise((resolve, reject) => {
    exec(
      `${ffmpegPath.path} -i ${audio} -vn -ac 1 -ar 16000 -c:a libopus -b:a 32k -compression_level 10 -frame_duration 60 -application voip -f ogg ${outputAudio} -y`,
      (error, _stdout, _stderr) => {
        if (error) return reject(error);
        resolve(outputAudio);
      }
    );
  });
};

const nameFileDiscovery = (pathMedia: string) => {
  const spliting = pathMedia.split('/')
  const first = spliting[spliting.length - 1]
  return first.split(".")[0]
}

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

export const typeSimulation = async (ticket: Ticket, presence: WAPresence) => {

  const wbot = await GetTicketWbot(ticket);

  let contact = await Contact.findOne({
    where: {
      id: ticket.contactId,
    }
  });

  await wbot.sendPresenceUpdate(presence, `${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`);
  await delay(5000);
  await wbot.sendPresenceUpdate('paused', `${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`);

}

const SendWhatsAppMediaFlow = async ({
  media,
  ticket,
  body,
  isFlow = false,
  isRecord = false
}: RequestFlow): Promise<WAMessage> => {
  try {
    const wbot = await GetTicketWbot(ticket);

    const mimetype = mime.lookup(media)
    const pathMedia = media

    const typeMessage = mimetype.split("/")[0];
    const mediaName = nameFileDiscovery(media)

    let options: AnyMessageContent;

    if (typeMessage === "video") {
      options = {
        video: fs.readFileSync(pathMedia),
        caption: body,
        fileName: mediaName
        // gifPlayback: true
      };
  } else if (typeMessage === "audio") {
      // Sempre enviar áudio como voice note gravado na hora
      const convert = await processAudio(pathMedia);
      let seconds = 1;
      try {
        const bytes = fs.statSync(convert).size;
        seconds = Math.max(1, Math.round(bytes / 4000)); // ~32kbps => 4000 bytes/s
      } catch {}
      options = {
        audio: fs.readFileSync(convert),
        // WhatsApp voice note format - sempre como gravação
        mimetype: "audio/ogg; codecs=opus",
        ptt: true,
        seconds
      };
    } else if (typeMessage === "document" || typeMessage === "text") {
      options = {
        document: fs.readFileSync(pathMedia),
        caption: body,
        fileName: mediaName,
        mimetype: mimetype
      };
    } else if (typeMessage === "application") {
      options = {
        document: fs.readFileSync(pathMedia),
        caption: body,
        fileName: mediaName,
        mimetype: mimetype
      };
    } else {
      options = {
        image: fs.readFileSync(pathMedia),
        caption: body
      };
    }

    let contact = await Contact.findOne({
      where: {
        id: ticket.contactId,
      }
    });

    const sentMessage = await wbot.sendMessage(
      `${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`,
      {
        ...options
      }
    );

    await ticket.update({ lastMessage: mediaName });

    return sentMessage;
  } catch (err) {
    Sentry.captureException(err);
    console.log(err);
    throw new AppError("ERR_SENDING_WAPP_MSG");
  }
};

export default SendWhatsAppMediaFlow;
