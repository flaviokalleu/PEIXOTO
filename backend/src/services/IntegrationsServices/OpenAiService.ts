import { MessageUpsertType, proto, WASocket } from "@whiskeysockets/baileys";
import {
  convertTextToSpeechAndSaveToFile,
  getBodyMessage,
  keepOnlySpecifiedChars,
  transferQueue,
  verifyMediaMessage,
  verifyMessage,
} from "../WbotServices/wbotMessageListener";
import { isNil } from "lodash";
import fs from "fs";
import path from "path";
import axios from "axios";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import Ticket from "../../models/Ticket";
import Contact from "../../models/Contact";
import Message from "../../models/Message";
import TicketTraking from "../../models/TicketTraking";
import Prompt from "../../models/Prompt";

type Session = WASocket & {
  id?: number;
};

interface ImessageUpsert {
  messages: proto.IWebMessageInfo[];
  type: MessageUpsertType;
}

interface IOpenAi {
  name: string;
  prompt: string;
  voice: string;
  voiceKey: string;
  voiceRegion: string;
  maxTokens: number;
  temperature: number;
  apiKey: string;
  queueId: number;
  maxMessages: number;
  model: string;
  openAiApiKey?: string;
}

interface SessionOpenAi extends OpenAI {
  id?: number;
}

interface SessionGemini extends GoogleGenerativeAI {
  id?: number;
}

// Cache for AI sessions
const sessionsOpenAi: SessionOpenAi[] = [];
const sessionsGemini: SessionGemini[] = [];

/**
 * Safely deletes a file from the filesystem
 */
const deleteFileSync = (filePath: string): void => {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    console.error(`Error deleting file ${filePath}:`, error);
  }
};

/**
 * Downloads a file from URL and saves it locally
 */
const downloadFile = async (url: string, savePath: string): Promise<string | null> => {
  try {
    const response = await axios({
      method: 'GET',
      url: url,
      responseType: 'stream',
    });

    const writer = fs.createWriteStream(savePath);
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on('finish', () => resolve(savePath));
      writer.on('error', reject);
    });
  } catch (error) {
    console.error(`Error downloading file from ${url}:`, error);
    return null;
  }
};

/**
 * Checks if response contains image URLs and handles them
 */
const handleImageUrls = async (
  responseText: string,
  wbot: Session,
  msg: proto.IWebMessageInfo,
  ticket: Ticket,
  contact: Contact,
  publicFolder: string
): Promise<string> => {
  const imagePattern = /imagem:\s*"([^"]+)"/gi;
  const videoPattern = /video:\s*"([^"]+)"/gi;
  const documentPattern = /documento:\s*"([^"]+)"/gi;
  
  let hasMedia = false;
  let cleanedResponse = responseText;

  // Handle images
  const imageMatches = [...responseText.matchAll(imagePattern)];
  if (imageMatches.length > 0) {
    hasMedia = true;
    
    // Extract text around image patterns to use as caption
    let textBeforeImage = "";
    let textAfterImage = "";
    
    const firstMatch = imageMatches[0];
    const firstImageIndex = firstMatch.index || 0;
    if (firstImageIndex > 0) {
      textBeforeImage = responseText.substring(0, firstImageIndex).trim();
    }
    
    const lastMatch = imageMatches[imageMatches.length - 1];
    const lastImageIndex = (lastMatch.index || 0) + lastMatch[0].length;
    if (lastImageIndex < responseText.length) {
      textAfterImage = responseText.substring(lastImageIndex).trim();
    }
    
    // Create caption from surrounding text
    let caption = "";
    if (textBeforeImage) {
      caption = textBeforeImage;
    }
    if (textAfterImage) {
      caption = caption ? `${caption}\n\n${textAfterImage}` : textAfterImage;
    }
    
    // Fallback to default if no surrounding text
    if (!caption) {
      caption = "📷";
    }
    
    for (const match of imageMatches) {
      const imageUrl = match[1];
      try {
        const fileName = `image_${Date.now()}_${Math.random().toString(36).substring(2, 15)}.jpg`;
        const imagePath = path.join(publicFolder, fileName);
        
        const downloadedPath = await downloadFile(imageUrl, imagePath);
        
        if (downloadedPath && fs.existsSync(downloadedPath)) {
          // Send the image with AI response as caption
          const sentImageMessage = await wbot.sendMessage(msg.key.remoteJid!, {
            image: { url: downloadedPath },
            caption: caption
          });
          
          await verifyMediaMessage(sentImageMessage!, ticket, contact, null as any, false, false, wbot);
          
          // Clean up the downloaded image after sending
          setTimeout(() => deleteFileSync(downloadedPath), 5000);
        }
      } catch (error) {
        console.error(`Error processing image URL ${imageUrl}:`, error);
      }
    }
    
    // Remove image patterns from response
    cleanedResponse = cleanedResponse.replace(imagePattern, '').trim();
  }

  // Handle videos
  const videoMatches = [...responseText.matchAll(videoPattern)];
  if (videoMatches.length > 0) {
    hasMedia = true;
    
    for (const match of videoMatches) {
      const videoUrl = match[1];
      try {
        const fileName = `video_${Date.now()}_${Math.random().toString(36).substring(2, 15)}.mp4`;
        const videoPath = path.join(publicFolder, fileName);
        
        const downloadedPath = await downloadFile(videoUrl, videoPath);
        
        if (downloadedPath && fs.existsSync(downloadedPath)) {
          // Send the video
          const sentVideoMessage = await wbot.sendMessage(msg.key.remoteJid!, {
            video: { url: downloadedPath },
            caption: "🎥"
          });
          
          await verifyMediaMessage(sentVideoMessage!, ticket, contact, null as any, false, false, wbot);
          
          // Clean up the downloaded video after sending
          setTimeout(() => deleteFileSync(downloadedPath), 5000);
        }
      } catch (error) {
        console.error(`Error processing video URL ${videoUrl}:`, error);
      }
    }
    
    // Remove video patterns from response
    cleanedResponse = cleanedResponse.replace(videoPattern, '').trim();
  }

  // Handle documents
  const documentMatches = [...responseText.matchAll(documentPattern)];
  if (documentMatches.length > 0) {
    hasMedia = true;
    
    for (const match of documentMatches) {
      const documentUrl = match[1];
      try {
        const fileName = `document_${Date.now()}_${Math.random().toString(36).substring(2, 15)}.pdf`;
        const documentPath = path.join(publicFolder, fileName);
        
        const downloadedPath = await downloadFile(documentUrl, documentPath);
        
        if (downloadedPath && fs.existsSync(downloadedPath)) {
          // Send the document
          const sentDocumentMessage = await wbot.sendMessage(msg.key.remoteJid!, {
            document: { url: downloadedPath },
            mimetype: "application/pdf",
            fileName: fileName,
            caption: "📄"
          });
          
          await verifyMediaMessage(sentDocumentMessage!, ticket, contact, null as any, false, false, wbot);
          
          // Clean up the downloaded document after sending
          setTimeout(() => deleteFileSync(downloadedPath), 5000);
        }
      } catch (error) {
        console.error(`Error processing document URL ${documentUrl}:`, error);
      }
    }
    
    // Remove document patterns from response
    cleanedResponse = cleanedResponse.replace(documentPattern, '').trim();
  }

  // If media was found and sent, return empty string to avoid duplicate text
  // Otherwise return the original response
  return hasMedia ? "" : responseText;
};

/**
 * Sanitizes a contact name for use in prompts
 */
const sanitizeName = (name: string): string => {
  if (!name) return "Cliente";
  
  let sanitized = name.split(" ")[0];
  sanitized = sanitized.replace(/[^a-zA-Z0-9]/g, "");
  return sanitized.substring(0, 60) || "Cliente";
};

/**
 * Prepares conversation history for AI models
 */
const prepareMessagesAI = (pastMessages: Message[], isGeminiModel: boolean, promptSystem: string): any[] => {
  const messagesAI = [];

  // Add system prompt for OpenAI
  if (!isGeminiModel) {
    messagesAI.push({ role: "system", content: promptSystem });
  }
  // For Gemini models that don't support systemInstruction, we'll handle it in handleGeminiRequest

  // Add conversation history
  for (const message of pastMessages) {
    if (message.mediaType === "conversation" || message.mediaType === "extendedTextMessage") {
      if (message.fromMe) {
        messagesAI.push({ role: "assistant", content: message.body });
      } else {
        messagesAI.push({ role: "user", content: message.body });
      }
    }
  }

  return messagesAI;
};

/**
 * Process and send AI response (text or audio)
 */
const processResponse = async (
  responseText: string,
  wbot: Session,
  msg: proto.IWebMessageInfo,
  ticket: Ticket,
  contact: Contact,
  openAiSettings: IOpenAi,
  ticketTraking: TicketTraking
): Promise<void> => {
  let response = responseText?.trim();
  if (!response) {
    console.warn("Empty response from AI");
    response = "Desculpe, não consegui processar sua solicitação. Por favor, tente novamente.";
  }

  // Check for transfer action trigger
  if (response.toLowerCase().includes("ação: transferir para o setor de atendimento")) {
    await transferQueue(openAiSettings.queueId, ticket, contact);
    response = response.replace(/ação: transferir para o setor de atendimento/i, "").trim();
  }

  const publicFolder: string = path.resolve(__dirname, "..", "..", "..", "public", `company${ticket.companyId}`);

  // Handle image URLs in the response before sending text
  response = await handleImageUrls(response, wbot, msg, ticket, contact, publicFolder);

  // Sempre enviar resposta em texto (não gerar áudio)
  if (response && response.trim() !== '') {
    const sentMessage = await wbot.sendMessage(msg.key.remoteJid!, {
      text: `\u200e ${response}`,
    });
    await verifyMessage(sentMessage!, ticket, contact);
  }
};

/**
 * Handle OpenAI request
 */
const handleOpenAIRequest = async (
  openai: SessionOpenAi, 
  messagesAI: any[], 
  openAiSettings: IOpenAi
): Promise<string> => {
  try {
    const chat = await openai.chat.completions.create({
      model: openAiSettings.model,
      messages: messagesAI,
      max_tokens: openAiSettings.maxTokens,
      temperature: openAiSettings.temperature,
    });
    return chat.choices[0].message?.content || "";
  } catch (error: any) {
    console.error("OpenAI request error:", error);
    
    // Handle specific API key errors
    if (error.status === 401 || error.message?.includes('Invalid API key')) {
      throw new Error("Chave de API do OpenAI inválida. Verifique as configurações.");
    }
    
    // Handle other specific errors
    if (error.status === 429) {
      throw new Error("Limite de requisições excedido. Tente novamente em alguns minutos.");
    }
    
    if (error.status === 503) {
      throw new Error("Serviço do OpenAI temporariamente indisponível. Tente novamente.");
    }
    
    throw new Error("Erro ao processar solicitação com OpenAI. Tente novamente.");
  }
};

/**
 * Handle Gemini request
 */
const handleGeminiRequest = async (
  gemini: SessionGemini,
  messagesAI: any[],
  openAiSettings: IOpenAi,
  bodyMessage: string,
  promptSystem: string
): Promise<string> => {
  try {
    // Check if model supports system instructions
    const supportsSystemInstruction = ["gemini-1.5-pro", "gemini-2.0-pro", "gemini-2.0-flash"].includes(openAiSettings.model);
    
    console.log(`🔧 Gemini model: ${openAiSettings.model}, supports systemInstruction: ${supportsSystemInstruction}`);
    
    let model;
    if (supportsSystemInstruction) {
      console.log("📋 Using systemInstruction for Gemini");
      model = gemini.getGenerativeModel({
        model: openAiSettings.model,
        systemInstruction: promptSystem,
      });
    } else {
      console.log("📋 Using manual prompt injection for Gemini");
      model = gemini.getGenerativeModel({
        model: openAiSettings.model,
      });
    }

    // Map messages to Gemini format
    const geminiHistory = messagesAI.map(msg => ({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: msg.content }],
    }));

    // For models without system instruction support, prepend the system prompt to history
    if (!supportsSystemInstruction && geminiHistory.length > 0) {
      // Add system prompt as the first user message
      geminiHistory.unshift({
        role: "user",
        parts: [{ text: promptSystem }],
      });
      // Add acknowledgment from model
      geminiHistory.splice(1, 0, {
        role: "model",
        parts: [{ text: "Entendido. Seguirei estas instruções em todas as minhas respostas." }],
      });
    }

    const chat = model.startChat({ history: geminiHistory });
    
    // For models without system instruction, prefix the current message with a reminder
    let messageToSend = bodyMessage;
    if (!supportsSystemInstruction) {
      messageToSend = `Lembre-se de seguir as instruções do sistema fornecidas anteriormente. Mensagem do usuário: ${bodyMessage}`;
    }
    
    const result = await chat.sendMessage(messageToSend);
    return result.response.text();
  } catch (error: any) {
    console.error("Gemini request error:", error);
    
    // Handle specific API key errors
    if (error.message?.includes('API key not valid') || error.status === 400) {
      throw new Error("Chave de API do Gemini inválida. Verifique as configurações.");
    }
    
    // Handle other specific errors
    if (error.status === 429) {
      throw new Error("Limite de requisições excedido. Tente novamente em alguns minutos.");
    }
    
    if (error.status === 503) {
      throw new Error("Serviço do Gemini temporariamente indisponível. Tente novamente.");
    }
    
    throw new Error("Erro ao processar solicitação com Gemini. Tente novamente.");
  }
};

/**
 * Process audio file and get transcription
 */
const processAudioFile = async (
  audioFilePath: string,
  openai: SessionOpenAi | null,
  gemini: SessionGemini | null,
  isOpenAIModel: boolean,
  isGeminiModel: boolean,
  promptSystem: string
): Promise<string | null> => {
  if (!fs.existsSync(audioFilePath)) {
    console.error(`Audio file not found: ${audioFilePath}`);
    return null;
  }

  try {
    if (isOpenAIModel && openai) {
      const file = fs.createReadStream(audioFilePath) as any;
      const transcriptionResult = await openai.audio.transcriptions.create({
        model: "whisper-1",
        file: file,
      });
      return transcriptionResult.text || null;
    } 
    else if (isGeminiModel && gemini) {
      const model = gemini.getGenerativeModel({
        model: "gemini-2.0-flash",  // Using pro model for transcription
        systemInstruction: promptSystem,
      });

      const audioFileBase64 = fs.readFileSync(audioFilePath, { encoding: 'base64' });
      const fileExtension = path.extname(audioFilePath).toLowerCase();
      let mimeType = 'audio/mp3';
      switch (fileExtension) {
        case '.wav': mimeType = 'audio/wav'; break;
        case '.mp3': mimeType = 'audio/mp3'; break;
        case '.aac': mimeType = 'audio/aac'; break;
        case '.ogg': mimeType = 'audio/ogg'; break;
        case '.flac': mimeType = 'audio/flac'; break;
        case '.aiff': mimeType = 'audio/aiff'; break;
      }

      const transcriptionRequest = await model.generateContent({
        contents: [
          {
            role: "user",
            parts: [
              { text: "Gere uma transcrição precisa deste áudio." },
              {
                inlineData: {
                  mimeType: mimeType,
                  data: audioFileBase64,
                },
              },
            ],
          },
        ],
      });

      return transcriptionRequest.response.text() || null;
    }
    
    return null;
  } catch (error) {
    console.error("Error transcribing audio:", error);
    return null;
  }
};

/**
 * Create or retrieve AI session for ticket
 */
const getAISession = async (
  ticket: Ticket, 
  isOpenAIModel: boolean, 
  isGeminiModel: boolean, 
  openAiSettings: IOpenAi
): Promise<{ openai: SessionOpenAi | null, gemini: SessionGemini | null }> => {
  let openai: SessionOpenAi | null = null;
  let gemini: SessionGemini | null = null;

  // Get API key from database first, then fallback to environment variables
  let apiKey = '';
  
  // Try to find prompt by queueId to get API key from database
  if (ticket.queueId) {
    try {
      const promptFromDB = await Prompt.findOne({
        where: {
          queueId: ticket.queueId,
          companyId: ticket.companyId
        }
      });
      
      if (promptFromDB && promptFromDB.apiKey) {
        apiKey = promptFromDB.apiKey;
        console.log(`📋 Using API key from database prompt (Queue ID: ${ticket.queueId})`);
      } else {
        console.log(`❌ No prompt found for queueId: ${ticket.queueId}, companyId: ${ticket.companyId}`);
      }
    } catch (error) {
      console.error("Error fetching prompt from database:", error);
    }
  } else {
    // Se não tem queueId, busca pelo promptId do whatsapp
    console.log(`❌ No queueId found in ticket: ${ticket.id}, trying to get from whatsapp promptId`);
    
    // Primeiro tenta usar o queueId do openAiSettings se disponível
    if (openAiSettings.queueId) {
      try {
        const promptFromDB = await Prompt.findOne({
          where: {
            queueId: openAiSettings.queueId,
            companyId: ticket.companyId
          }
        });
        
        if (promptFromDB && promptFromDB.apiKey) {
          apiKey = promptFromDB.apiKey;
          console.log(`📋 Using API key from database prompt via openAiSettings (Queue ID: ${openAiSettings.queueId})`);
        } else {
          console.log(`❌ No prompt found for openAiSettings.queueId: ${openAiSettings.queueId}, companyId: ${ticket.companyId}`);
        }
      } catch (error) {
        console.error("Error fetching prompt from database via openAiSettings:", error);
      }
    }
    
    // Se ainda não tem API key, busca diretamente pelo ID do prompt se disponível no openAiSettings
    if ((!apiKey || apiKey.trim() === '') && (openAiSettings as any).id) {
      try {
        const promptFromDB = await Prompt.findOne({
          where: {
            id: (openAiSettings as any).id,
            companyId: ticket.companyId
          }
        });
        
        if (promptFromDB && promptFromDB.apiKey) {
          apiKey = promptFromDB.apiKey;
          console.log(`📋 Using API key from database prompt via direct ID: ${(openAiSettings as any).id}`);
        } else {
          console.log(`❌ No prompt found for direct ID: ${(openAiSettings as any).id}, companyId: ${ticket.companyId}`);
        }
      } catch (error) {
        console.error("Error fetching prompt from database via direct ID:", error);
      }
    }
  }

  // Fallback to openAiSettings.apiKey if no database key found
  if (!apiKey || apiKey.trim() === '') {
    apiKey = openAiSettings.apiKey;
    if (apiKey && apiKey.trim() !== '') {
      console.log("📋 Using API key from openAiSettings");
    }
  }

  // Sanitize API key (remove whitespace, newlines)
  if (apiKey) {
    const originalApiKey = apiKey;
    apiKey = apiKey.trim().replace(/\s+/g, '');
    if (originalApiKey !== apiKey) {
      console.log("⚠️ API key sanitized (whitespace removed)");
    }
    // Log only first and last 4 chars for debug
    if (apiKey.length > 8) {
      console.log(`🔑 Gemini API key (partial): ${apiKey.slice(0,4)}...${apiKey.slice(-4)}`);
    } else {
      console.log(`🔑 Gemini API key length: ${apiKey.length}`);
    }
  }

  // Final fallback to environment variables - REMOVIDO
  // if (!apiKey || apiKey.trim() === '') {
  //   if (isGeminiModel) {
  //     apiKey = process.env.GEMINI_API_KEY || '';
  //     console.log("📋 Using fallback Gemini API key from environment");
  //   } else if (isOpenAIModel) {
  //     apiKey = process.env.OPENAI_API_KEY || '';
  //     console.log("📋 Using fallback OpenAI API key from environment");
  //   }
  // }

  // Initialize OpenAI if needed
  if (isOpenAIModel) {
    if (!apiKey || apiKey.trim() === '') {
      console.error(`❌ OpenAI API key is missing - Database: ${ticket.queueId ? 'searched' : 'no queueId'}, OpenAiSettings.queueId: ${openAiSettings.queueId ? 'searched' : 'missing'}, Settings: ${openAiSettings.apiKey ? 'present' : 'missing'}`);
      return { openai: null, gemini: null };
    }
    
    const openAiIndex = sessionsOpenAi.findIndex(s => s.id === ticket.id);
    if (openAiIndex === -1) {
      try {
        openai = new OpenAI({ apiKey }) as SessionOpenAi;
        openai.id = ticket.id;
        sessionsOpenAi.push(openai);
      } catch (error) {
        console.error("Error creating OpenAI session:", error);
        return { openai: null, gemini: null };
      }
    } else {
      openai = sessionsOpenAi[openAiIndex];
    }
  } 
  // Initialize Gemini if needed
  else if (isGeminiModel) {
    if (!apiKey || apiKey.trim() === '') {
      console.error(`❌ Gemini API key is missing - Database: ${ticket.queueId ? 'searched' : 'no queueId'}, OpenAiSettings.queueId: ${openAiSettings.queueId ? 'searched' : 'missing'}, Settings: ${openAiSettings.apiKey ? 'present' : 'missing'}`);
      return { openai: null, gemini: null };
    }
    
    const geminiIndex = sessionsGemini.findIndex(s => s.id === ticket.id);
    if (geminiIndex === -1) {
      try {
        gemini = new GoogleGenerativeAI(apiKey) as SessionGemini;
        gemini.id = ticket.id;
        sessionsGemini.push(gemini);
      } catch (error) {
        console.error("Error creating Gemini session:", error);
        return { openai: null, gemini: null };
      }
    } else {
      gemini = sessionsGemini[geminiIndex];
    }
  }

  // Initialize OpenAI for transcription if needed
  let transcriptionApiKey = openAiSettings.openAiApiKey || apiKey;
  if (!transcriptionApiKey || transcriptionApiKey.trim() === '') {
    transcriptionApiKey = process.env.OPENAI_API_KEY || '';
  }
  
  if (transcriptionApiKey && !openai) {
    const openAiIndex = sessionsOpenAi.findIndex(s => s.id === ticket.id);
    if (openAiIndex === -1) {
      try {
        openai = new OpenAI({ apiKey: transcriptionApiKey }) as SessionOpenAi;
        openai.id = ticket.id;
        sessionsOpenAi.push(openai);
      } catch (error) {
        console.error("Error creating OpenAI transcription session:", error);
      }
    } else {
      openai = sessionsOpenAi[openAiIndex];
    }
  }

  return { openai, gemini };
};

/**
 * Main function to handle AI interactions
 */
export const handleOpenAi = async (
  openAiSettings: IOpenAi,
  msg: proto.IWebMessageInfo,
  wbot: Session,
  ticket: Ticket,
  contact: Contact,
  mediaSent: Message | undefined,
  ticketTraking: TicketTraking
): Promise<void> => {
  try {
    console.log(`🚀 handleOpenAi started - Ticket ID: ${ticket.id}, Queue ID: ${ticket.queueId}, Company ID: ${ticket.companyId}`);
    
    // Se openAiSettings é um modelo Sequelize, converte para objeto simples
    let settings: IOpenAi;
    if (openAiSettings && typeof openAiSettings === 'object' && 'dataValues' in openAiSettings) {
      settings = (openAiSettings as any).dataValues || (openAiSettings as any).toJSON();
      console.log(`🔧 OpenAiSettings converted from Sequelize model`);
    } else {
      settings = openAiSettings;
    }
    
    console.log(`🔧 Settings apiKey:`, settings.apiKey ? '***present***' : 'missing');
    console.log(`🔧 Settings queueId:`, settings.queueId);
    console.log(`🔧 Settings model:`, settings.model);
    
    // Skip processing if bot is disabled for this contact
    if (contact.disableBot) {
      return;
    }

    // Get message body or check for audio
    const bodyMessage = getBodyMessage(msg);
    if (!bodyMessage && !msg.message?.audioMessage) return;

    // Skip if no settings or is a message stub
    if (!settings || msg.messageStubType) return;

    const publicFolder: string = path.resolve(__dirname, "..", "..", "..", "public", `company${ticket.companyId}`);

    // Determine model type
    const isOpenAIModel = ["gpt-3.5-turbo-1106", "gpt-4o"].includes(settings.model);
    const isGeminiModel = ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-2.0-pro", "gemini-2.0-flash"].includes(settings.model);

    if (!isOpenAIModel && !isGeminiModel) {
      console.error(`Unsupported model: ${settings.model}`);
      return;
    }

    // Get AI session
    const { openai, gemini } = await getAISession(ticket, isOpenAIModel, isGeminiModel, settings);

    // Check if AI session was created successfully
    if ((isOpenAIModel && !openai) || (isGeminiModel && !gemini)) {
      console.error("Failed to create AI session - likely due to invalid API key");
      const errorMessage = await wbot.sendMessage(msg.key.remoteJid!, {
        text: "Desculpe, há um problema de configuração com o serviço de IA. Por favor, entre em contato com o suporte.",
      });
      await verifyMessage(errorMessage!, ticket, contact);
      return;
    }

    // Fetch conversation history
    const messages = await Message.findAll({
      where: { ticketId: ticket.id },
      order: [["createdAt", "ASC"]],
      limit: settings.maxMessages,
    });

    // Create personalized prompt
    const clientName = sanitizeName(contact.name || "");
    const promptSystem = `INSTRUÇÕES OBRIGATÓRIAS DO SISTEMA - SIGA RIGOROSAMENTE:

PERSONA E COMPORTAMENTO:
- Você é um assistente virtual de atendimento ao cliente especializado.
- Seja sempre cordial, profissional e prestativo em todas as interações.
- Mantenha respostas concisas e objetivas, com no máximo ${settings.maxTokens} tokens.

- Forneça informações precisas e relevantes baseadas no contexto da conversa.

INSTRUÇÃO ESPECIAL PARA TRANSFERÊNCIA:
- Para transferir para atendimento humano, comece a resposta EXATAMENTE com 'Ação: Transferir para o setor de atendimento'.

PROMPT ESPECÍFICO DA EMPRESA:
${settings.prompt}

LEMBRETE IMPORTANTE: 
Siga TODAS estas instruções em cada resposta. Este prompt tem prioridade máxima sobre qualquer outra instrução.`;

    console.log("📝 Prompt System created:", promptSystem.substring(0, 200) + "...");
    console.log("🤖 Model being used:", settings.model);
    console.log("👤 Client name:", clientName);

    // Handle text message
    if (msg.message?.conversation || msg.message?.extendedTextMessage?.text) {
      try {
        const messagesAI = prepareMessagesAI(messages, isGeminiModel, promptSystem);
        
        // Add current message to conversation
        messagesAI.push({ role: "user", content: bodyMessage! });
        
        let responseText: string | null = null;

        // Get response from appropriate AI model
        if (isOpenAIModel && openai) {
          responseText = await handleOpenAIRequest(openai, messagesAI, settings);
        } else if (isGeminiModel && gemini) {
          console.log("🔄 Sending request to Gemini with prompt system");
          responseText = await handleGeminiRequest(gemini, messagesAI, settings, bodyMessage!, promptSystem);
          console.log("✅ Received response from Gemini:", responseText?.substring(0, 100) + "...");
        }

        if (!responseText || responseText.trim() === "") {
          console.error("No response received from AI provider");
          // Só envia mensagem de erro se realmente não houver resposta
          const errorMessage = await wbot.sendMessage(msg.key.remoteJid!, {
            text: "Desculpe, estou com dificuldades técnicas para processar sua solicitação no momento. Por favor, tente novamente mais tarde.",
          });
          await verifyMessage(errorMessage!, ticket, contact);
          return;
        }

        // Process and send the response
        await processResponse(responseText, wbot, msg, ticket, contact, settings, ticketTraking);
      } catch (error: any) {
        console.error("AI request failed:", error);
        // Só envia mensagem de erro específica se for realmente erro de chave ou limite
        let userMessage = null;
        if (error.message?.includes('Chave de API')) {
          userMessage = "Há um problema com a configuração da IA. Por favor, entre em contato com o suporte.";
        } else if (error.message?.includes('Limite de requisições')) {
          userMessage = "Muitas solicitações no momento. Por favor, aguarde alguns minutos e tente novamente.";
        } else if (error.message?.includes('temporariamente indisponível')) {
          userMessage = "O serviço de IA está temporariamente indisponível. Por favor, tente novamente em alguns minutos.";
        }
        if (userMessage) {
          try {
            const errorMessage = await wbot.sendMessage(msg.key.remoteJid!, {
              text: userMessage,
            });
            await verifyMessage(errorMessage!, ticket, contact);
          } catch (sendError) {
            console.error("Failed to send error message:", sendError);
          }
        }
        // Se não for erro conhecido, não envia fallback, apenas loga
      }
    }
    // Handle audio message
    else if (msg.message?.audioMessage && mediaSent) {
      try {
        const mediaUrl = mediaSent.mediaUrl!.split("/").pop();
        const audioFilePath = `${publicFolder}/${mediaUrl}`;

        // Process audio and get transcription
        const transcription = await processAudioFile(
          audioFilePath, 
          openai, 
          gemini, 
          isOpenAIModel, 
          isGeminiModel,
          promptSystem
        );

        if (!transcription) {
          const noTranscriptMessage = await wbot.sendMessage(msg.key.remoteJid!, {
            text: "Desculpe, não consegui entender o áudio. Por favor, tente novamente ou envie uma mensagem de texto.",
          });
          await verifyMessage(noTranscriptMessage!, ticket, contact);
          return;
        }

        // Send transcription confirmation
        const transcriptMessage = await wbot.sendMessage(msg.key.remoteJid!, {
          text: `🎤 *Sua mensagem de voz:* ${transcription}`,
        });
        await verifyMessage(transcriptMessage!, ticket, contact);

        // Prepare conversation for AI response
        const messagesAI = prepareMessagesAI(messages, isGeminiModel, promptSystem);
        messagesAI.push({ role: "user", content: transcription });
        
        let responseText: string | null = null;

        // Get response from appropriate AI model
        if (isOpenAIModel && openai) {
          responseText = await handleOpenAIRequest(openai, messagesAI, settings);
        } else if (isGeminiModel && gemini) {
          responseText = await handleGeminiRequest(gemini, messagesAI, settings, transcription, promptSystem);
        }

        if (!responseText) {
          console.error("No response received from AI provider");
          return;
        }

        // Process and send the response
        await processResponse(responseText, wbot, msg, ticket, contact, settings, ticketTraking);
      } catch (error: any) {
        console.error("Audio processing error:", error);
        
        let userMessage = "Desculpe, houve um erro ao processar sua mensagem de áudio. Por favor, tente novamente ou envie uma mensagem de texto.";
        
        // Provide more specific error messages based on the error type
        if (error.message?.includes('Chave de API')) {
          userMessage = "Há um problema com a configuração da IA. Por favor, entre em contato com o suporte.";
        } else if (error.message?.includes('Limite de requisições')) {
          userMessage = "Muitas solicitações no momento. Por favor, aguarde alguns minutos e tente novamente.";
        } else if (error.message?.includes('temporariamente indisponível')) {
          userMessage = "O serviço de IA está temporariamente indisponível. Por favor, tente novamente em alguns minutos.";
        }
        
        try {
          const errorMessage = await wbot.sendMessage(msg.key.remoteJid!, {
            text: userMessage,
          });
          await verifyMessage(errorMessage!, ticket, contact);
        } catch (sendError) {
          console.error("Failed to send error message:", sendError);
        }
      }
    }
  } catch (globalError: any) {
    // Captura qualquer erro não tratado na função principal
    console.error("Critical error in handleOpenAi:", globalError);
    
    try {
      // Tenta enviar uma mensagem de erro genérica
      const fallbackMessage = await wbot.sendMessage(msg.key.remoteJid!, {
        text: "Desculpe, ocorreu um erro interno. Por favor, tente novamente em alguns instantes.",
      });
      await verifyMessage(fallbackMessage!, ticket, contact);
    } catch (finalError) {
      // Se nem isso funcionar, apenas loga o erro
      console.error("Final fallback failed:", finalError);
    }
  }
};