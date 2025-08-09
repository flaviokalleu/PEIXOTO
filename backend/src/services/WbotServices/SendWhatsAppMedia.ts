import { WAMessage, AnyMessageContent } from "@whiskeysockets/baileys";
import * as Sentry from "@sentry/node";
import fs, { unlink, unlinkSync } from "fs";
import { exec } from "child_process";
import path from "path";
import ffmpegPath from "@ffmpeg-installer/ffmpeg";

import AppError from "../../errors/AppError";
import Ticket from "../../models/Ticket";
import mime from "mime-types";
import Contact from "../../models/Contact";
import { getWbot } from "../../libs/wbot";
import CreateMessageService from "../MessageServices/CreateMessageService";
import formatBody from "../../helpers/Mustache";
interface Request {
  media: Express.Multer.File;
  ticket: Ticket;
  companyId?: number;
  body?: string;
  isPrivate?: boolean;
  isForwarded?: boolean;
}
const os = require("os");

// let ffmpegPath;
// if (os.platform() === "win32") {
//   // Windows
//   ffmpegPath = "C:\\ffmpeg\\ffmpeg.exe"; // Substitua pelo caminho correto no Windows
// } else if (os.platform() === "darwin") {
//   // macOS
//   ffmpegPath = "/opt/homebrew/bin/ffmpeg"; // Substitua pelo caminho correto no macOS
// } else {
//   // Outros sistemas operacionais (Linux, etc.)
//   ffmpegPath = "/usr/bin/ffmpeg"; // Substitua pelo caminho correto em sistemas Unix-like
// }

const publicFolder = path.resolve(__dirname, "..", "..", "..", "public");

const ensureDir = (dir: string) => {
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  } catch {}
};

// Prefer Opus (OGG) para WhatsApp voice notes com waveform
const processAudioOpus = async (audio: string, companyId: string): Promise<string> => {
  const companyDir = `${publicFolder}/company${companyId}`;
  ensureDir(companyDir);
  const outputAudio = `${companyDir}/${new Date().getTime()}.ogg`;
  return new Promise((resolve, reject) => {
    const cmd = `${ffmpegPath.path} -y -i "${audio}" -vn -af "afftdn=nr=8:nf=-35,highpass=f=120,lowpass=f=3800,dynaudnorm=f=250" -ar 16000 -ac 1 -c:a libopus -b:a 32k -compression_level 10 -frame_duration 60 -application voip "${outputAudio}"`;
    exec(cmd, (error, _stdout, _stderr) => {
      if (error) return reject(error);
      resolve(outputAudio);
    });
  });
};

// MP3 fallback com configurações para voice note
const processAudioMp3 = async (audio: string, companyId: string): Promise<string> => {
  const companyDir = `${publicFolder}/company${companyId}`;
  ensureDir(companyDir);
  const outputAudio = `${companyDir}/${new Date().getTime()}.mp3`;
  return new Promise((resolve, reject) => {
    const cmd = `${ffmpegPath.path} -y -i "${audio}" -vn -af "afftdn=nr=8:nf=-35,highpass=f=120,lowpass=f=3800,dynaudnorm=f=250" -ar 16000 -ac 1 -c:a libmp3lame -b:a 32k "${outputAudio}"`;
    exec(cmd, (error, _stdout, _stderr) => {
      if (error) return reject(error);
      resolve(outputAudio);
    });
  });
};


const processAudioFile = async (audio: string, companyId: string): Promise<string> => {
  // keep MP3 for generic conversion usages
  const companyDir = `${publicFolder}/company${companyId}`;
  ensureDir(companyDir);
  const outputAudio = `${companyDir}/${new Date().getTime()}.mp3`;
  return new Promise((resolve, reject) => {
    const cmd = `${ffmpegPath.path} -y -i "${audio}" -vn -af "afftdn=nr=8:nf=-35,highpass=f=120,lowpass=f=3800,dynaudnorm=f=250" -ar 24000 -ac 1 -c:a libmp3lame -b:a 96k "${outputAudio}"`;
    exec(cmd, (error, _stdout, _stderr) => {
      if (error) return reject(error);
      resolve(outputAudio);
    });
  });
};

export const getMessageOptions = async (
  fileName: string,
  pathMedia: string,
  companyId?: string,
  body: string = " "
): Promise<any> => {
  const mimeType = mime.lookup(pathMedia);
  const typeMessage = mimeType.split("/")[0];

  try {
    if (!mimeType) {
      throw new Error("Invalid mimetype");
    }
    let options: AnyMessageContent;

    if (typeMessage === "video") {
      options = {
        video: fs.readFileSync(pathMedia),
        caption: body ? body : null,
        fileName: fileName
        // gifPlayback: true
      };
    } else if (typeMessage === "audio") {
      // Sempre enviar áudio como voice note gravado na hora
      try {
        const convertOgg = await processAudioOpus(pathMedia, companyId);
        let seconds = 1; try { const bytes = fs.statSync(convertOgg).size; seconds = Math.max(1, Math.round(bytes / 4000)); } catch {}
        options = {
          audio: fs.readFileSync(convertOgg),
          mimetype: "audio/ogg; codecs=opus",
          ptt: true,
          seconds
        };
        try { unlinkSync(convertOgg); } catch {}
      } catch (_e1) {
        try {
          const convertMp3 = await processAudioMp3(pathMedia, companyId);
          let seconds = 1; try { const bytes = fs.statSync(convertMp3).size; seconds = Math.max(1, Math.round(bytes / 4000)); } catch {}
          options = {
            audio: fs.readFileSync(convertMp3),
            mimetype: "audio/mpeg",
            ptt: true,
            seconds
          };
          try { unlinkSync(convertMp3); } catch {}
        } catch (_e2) {
          options = {
            audio: fs.readFileSync(pathMedia),
            mimetype: mimeType || "audio/mpeg",
            ptt: true
          };
        }
      }
    } else if (typeMessage === "document") {
      options = {
        document: fs.readFileSync(pathMedia),
        caption: body ? body : null,
        fileName: fileName,
        mimetype: mimeType
      };
    } else if (typeMessage === "application") {
      options = {
        document: fs.readFileSync(pathMedia),
        caption: body ? body : null,
        fileName: fileName,
        mimetype: mimeType
      };
    } else {
      options = {
        image: fs.readFileSync(pathMedia),
        caption: body ? body : null,
      };
    }

    return options;
  } catch (e) {
    Sentry.captureException(e);
    console.log(e);
    return null;
  }
};

const SendWhatsAppMedia = async ({
  media,
  ticket,
  body = "",
  isPrivate = false,
  isForwarded = false
}: Request): Promise<WAMessage> => {
  try {
    const wbot = await getWbot(ticket.whatsappId);
    const companyId = ticket.companyId.toString()

    const pathMedia = media.path;
    const typeMessage = media.mimetype.split("/")[0];
    let options: AnyMessageContent;
    let bodyTicket = "";
    const bodyMedia = ticket ? formatBody(body, ticket) : body;

    // console.log(media.mimetype)
    if (typeMessage === "video") {
      options = {
        video: fs.readFileSync(pathMedia),
        caption: bodyMedia,
        fileName: media.originalname.replace('/', '-'),
        contextInfo: { forwardingScore: isForwarded ? 2 : 0, isForwarded: isForwarded },
      };
      bodyTicket = "🎥 Arquivo de vídeo"
    } else if (typeMessage === "audio") {
      // Sempre enviar áudio como voice note gravado na hora
      try {
        const convertOgg = await processAudioOpus(media.path, companyId);
        let seconds = 1; try { const bytes = fs.statSync(convertOgg).size; seconds = Math.max(1, Math.round(bytes / 4000)); } catch {}
        options = {
          audio: fs.readFileSync(convertOgg),
          mimetype: "audio/ogg; codecs=opus",
          ptt: true,
          seconds
        };
        try { unlinkSync(convertOgg); } catch {}
      } catch (_e1) {
        try {
          const convertMp3 = await processAudioMp3(media.path, companyId);
          let seconds = 1; try { const bytes = fs.statSync(convertMp3).size; seconds = Math.max(1, Math.round(bytes / 4000)); } catch {}
          options = {
            audio: fs.readFileSync(convertMp3),
            mimetype: "audio/mpeg",
            ptt: true,
            seconds
          };
          try { unlinkSync(convertMp3); } catch {}
        } catch (_e2) {
          options = {
            audio: fs.readFileSync(media.path),
            mimetype: media.mimetype || "audio/mpeg",
            ptt: true
          };
        }
      }
      bodyTicket = "🎵 Arquivo de áudio"
    } else if (typeMessage === "document" || typeMessage === "text") {
      options = {
        document: fs.readFileSync(pathMedia),
        caption: bodyMedia,
        fileName: media.originalname.replace('/', '-'),
        mimetype: media.mimetype,
        contextInfo: { forwardingScore: isForwarded ? 2 : 0, isForwarded: isForwarded },
      };
      bodyTicket = "📂 Documento"
    } else if (typeMessage === "application") {
      options = {
        document: fs.readFileSync(pathMedia),
        caption: bodyMedia,
        fileName: media.originalname.replace('/', '-'),
        mimetype: media.mimetype,
        contextInfo: { forwardingScore: isForwarded ? 2 : 0, isForwarded: isForwarded },
      };
      bodyTicket = "📎 Outros anexos"
    } else {
      if (media.mimetype.includes("gif")) {
        options = {
          image: fs.readFileSync(pathMedia),
          caption: bodyMedia,
          mimetype: "image/gif",
          contextInfo: { forwardingScore: isForwarded ? 2 : 0, isForwarded: isForwarded },
          gifPlayback: true

        };
      } else {
        options = {
          image: fs.readFileSync(pathMedia),
          caption: bodyMedia,
          contextInfo: { forwardingScore: isForwarded ? 2 : 0, isForwarded: isForwarded },
        };
      }
      bodyTicket = "📎 Outros anexos"
    }

    if (isPrivate === true) {
      const messageData = {
        wid: `PVT${companyId}${ticket.id}${body.substring(0, 6)}`,
        ticketId: ticket.id,
        contactId: undefined,
        body: bodyMedia,
        fromMe: true,
        mediaUrl: media.filename,
        mediaType: media.mimetype.split("/")[0],
        read: true,
        quotedMsgId: null,
        ack: 2,
        remoteJid: null,
        participant: null,
        dataJson: null,
        ticketTrakingId: null,
        isPrivate
      };

      await CreateMessageService({ messageData, companyId: ticket.companyId });

      return
    }

    const contactNumber = await Contact.findByPk(ticket.contactId)

    let number: string;

    if (contactNumber.remoteJid && contactNumber.remoteJid !== "" && contactNumber.remoteJid.includes("@")) {
      number = contactNumber.remoteJid;
    } else {
      number = `${contactNumber.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"
        }`;
    }

    const sentMessage = await wbot.sendMessage(
      number,
      {
        ...options
      }
    );

    await ticket.update({ lastMessage: body !== media.filename ? body : bodyMedia, imported: null });

    return sentMessage;
  } catch (err) {
    console.log(`ERRO AO ENVIAR MIDIA ${ticket.id} media ${media.originalname}`)
    Sentry.captureException(err);
    console.log(err);
    throw new AppError("ERR_SENDING_WAPP_MSG");
  }
};

export default SendWhatsAppMedia;
