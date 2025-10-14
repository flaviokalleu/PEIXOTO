import { WAMessage, AnyMessageContent, getDevice } from "@whiskeysockets/baileys";
import * as Sentry from "@sentry/node";
import fs, { unlink, unlinkSync } from "fs";
import { exec } from "child_process";
import path from "path";
import ffmpegPath from "@ffmpeg-installer/ffmpeg";

import AppError from "../../errors/AppError";
import Ticket from "../../models/Ticket";
import mime from "mime-types";
import Contact from "../../models/Contact";
import Message from "../../models/Message";
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

const processAudio = async (audio: string, companyId: string): Promise<string> => {
  const outputAudio = `${publicFolder}/company${companyId}/${new Date().getTime()}.mp3`;
  
  return new Promise((resolve, reject) => {
    exec(
      `"${ffmpegPath.path}" -i "${audio}" -af "afftdn=nr=5:nf=-40, highpass=f=100, lowpass=f=4000, dynaudnorm=f=1000, aresample=44100, volume=1.0" -vn -ar 44100 -ac 2 -b:a 256k "${outputAudio}" -y`,
      (error, _stdout, _stderr) => {
        if (error) reject(error);
        resolve(outputAudio);
      }
    );
  });
};

// Converte para OGG OPUS para melhor compatibilidade com Android (PTT)
const processAudioToOgg = async (audio: string, companyId: string): Promise<string> => {
  const outputAudio = `${publicFolder}/company${companyId}/${new Date().getTime()}.ogg`;
  return new Promise((resolve, reject) => {
    // 48kHz, mono, libopus, bitrate 32-64k é suficiente p/ voz
    exec(
      `"${ffmpegPath.path}" -i "${audio}" -af "highpass=f=100, lowpass=f=4000, dynaudnorm=f=1000" -vn -ar 48000 -ac 1 -c:a libopus -b:a 48k "${outputAudio}" -y`,
      (error, _stdout, _stderr) => {
        if (error) return reject(error);
        resolve(outputAudio);
      }
    );
  });
};


const processAudioFile = async (audio: string, companyId: string): Promise<string> => {
  const outputAudio = `${publicFolder}/company${companyId}/${new Date().getTime()}.mp3`;
  return new Promise((resolve, reject) => {
    exec(
      `${ffmpegPath.path} -i ${audio} -af "afftdn=nr=5:nf=-40, highpass=f=100, lowpass=f=4000, dynaudnorm=f=1000, aresample=44100, volume=1.0" -vn -ar 44100 -ac 2 -b:a 256k ${outputAudio} -y`,
      (error, _stdout, _stderr) => {
        if (error) reject(error);
        // fs.unlinkSync(audio);
        resolve(outputAudio);
      }
    );
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
      // Sempre enviar como PTT e preferir OGG/OPUS para compatibilidade (Android/iOS)
      const oggPath = await processAudioToOgg(pathMedia, companyId);
      const buffer = fs.readFileSync(oggPath);
      try { unlinkSync(oggPath); } catch {}
      options = {
        audio: buffer,
        mimetype: "audio/ogg; codecs=opus",
        ptt: true
      };
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

    // Determine destinatário (JID) antes para detectar dispositivo
    const contactNumber = await Contact.findByPk(ticket.contactId)
    let number: string;
    if (contactNumber.remoteJid && contactNumber.remoteJid !== "" && contactNumber.remoteJid.includes("@")) {
      number = contactNumber.remoteJid;
    } else {
      number = `${contactNumber.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`;
    }
    // Detecta dispositivo (Android/iOS/Web) com base na última mensagem recebida do contato
    let targetDevice: string = "unknown";
    try {
      const lastInbound = await Message.findOne({
        where: { ticketId: ticket.id, fromMe: false },
        order: [["createdAt", "DESC"]]
      });
      const lastWid = lastInbound?.get?.("wid") || (lastInbound as any)?.wid;
      if (lastWid) {
        const d = (getDevice as any)?.(lastWid);
        if (typeof d === "string") targetDevice = d.toLowerCase();
      }
    } catch { /* ignore */ }

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
      // Se destino for Android, preferir OGG OPUS
      if (targetDevice === "unknown" || targetDevice.includes("android")) {
        try {
          const oggPath = await processAudioToOgg(media.path, companyId);
          options = {
            audio: fs.readFileSync(oggPath),
            mimetype: "audio/ogg; codecs=opus",
            ptt: true,
            caption: bodyMedia,
            contextInfo: { forwardingScore: isForwarded ? 2 : 0, isForwarded: isForwarded },
          };
          unlinkSync(oggPath);
        } catch (e) {
          // fallback para MP3 se falhar
          const convert = await processAudio(media.path, companyId);
          options = {
            audio: fs.readFileSync(convert),
            mimetype: "audio/mpeg",
            ptt: true,
            caption: bodyMedia,
            contextInfo: { forwardingScore: isForwarded ? 2 : 0, isForwarded: isForwarded },
          };
          unlinkSync(convert);
        }
      } else {
        const convert = await processAudio(media.path, companyId);
        options = {
          audio: fs.readFileSync(convert),
          mimetype: "audio/mpeg",
          ptt: true,
          caption: bodyMedia,
          contextInfo: { forwardingScore: isForwarded ? 2 : 0, isForwarded: isForwarded },
        };
        unlinkSync(convert);
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
