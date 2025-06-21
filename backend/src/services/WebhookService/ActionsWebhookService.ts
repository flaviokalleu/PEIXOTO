import AppError from "../../errors/AppError";
import { WebhookModel } from "../../models/Webhook";
import { sendMessageFlow } from "../../controllers/MessageController";
import { IConnections, INodes } from "./DispatchWebHookService";
import { Request, Response } from "express";
import { ParamsDictionary } from "express-serve-static-core";
import { ParsedQs } from "qs";
import CreateContactService from "../ContactServices/CreateContactService";
import Contact from "../../models/Contact";
import CreateTicketServiceWebhook from "../TicketServices/CreateTicketServiceWebhook";
import { SendMessage } from "../../helpers/SendMessage";
import GetDefaultWhatsApp from "../../helpers/GetDefaultWhatsApp";
import Ticket from "../../models/Ticket";
import fs from "fs";
import GetWhatsappWbot from "../../helpers/GetWhatsappWbot";
import path from "path";
import SendWhatsAppMedia from "../WbotServices/SendWhatsAppMedia";
import SendWhatsAppMediaFlow, {
  typeSimulation
} from "../WbotServices/SendWhatsAppMediaFlow";
import { randomizarCaminho } from "../../utils/randomizador";
import { SendMessageFlow } from "../../helpers/SendMessageFlow";
import formatBody from "../../helpers/Mustache";
import SetTicketMessagesAsRead from "../../helpers/SetTicketMessagesAsRead";
import SendWhatsAppMessage from "../WbotServices/SendWhatsAppMessage";
import ShowTicketService from "../TicketServices/ShowTicketService";
import CreateMessageService, {
  MessageData
} from "../MessageServices/CreateMessageService";
import { randomString } from "../../utils/randomCode";
import ShowQueueService from "../QueueService/ShowQueueService";
import { getIO } from "../../libs/socket";
import UpdateTicketService from "../TicketServices/UpdateTicketService";
import FindOrCreateATicketTrakingService from "../TicketServices/FindOrCreateATicketTrakingService";
import ShowTicketUUIDService from "../TicketServices/ShowTicketFromUUIDService";
import logger from "../../utils/logger";
import CreateLogTicketService from "../TicketServices/CreateLogTicketService";
import CompaniesSettings from "../../models/CompaniesSettings";
import ShowWhatsAppService from "../WhatsappService/ShowWhatsAppService";
import { delay } from "bluebird";
import typebotListener from "../TypebotServices/typebotListener";
import { getWbot } from "../../libs/wbot";
import { proto } from "@whiskeysockets/baileys";
import { handleOpenAi } from "../IntegrationsServices/OpenAiService";
import { IOpenAi } from "../../@types/openai";

interface IAddContact {
  companyId: number;
  name: string;
  phoneNumber: string;
  email?: string;
  dataMore?: any;
}

// Configurações globais para robustez
const FLOW_CONFIG = {
  MAX_ITERATIONS: 100,
  MAX_RETRY_ATTEMPTS: 3,
  DELAY_BETWEEN_MESSAGES: 1000,
  TYPING_SIMULATION_DELAY: 3000,
  DEFAULT_TIMEOUT: 30000,
  MEDIA_PROCESSING_TIMEOUT: 60000 // Novo timeout específico para processamento de mídia
};

// Classe para gerenciar erros do fluxo
class FlowError extends Error {
  constructor(
    message: string,
    public nodeId?: string,
    public nodeType?: string,
    public originalError?: any
  ) {
    super(message);
    this.name = 'FlowError';
  }
}

// Função helper robusta para encontrar arquivos de mídia
const getBaseDir = (): string => {
  try {
    const isDev = process.env.NODE_ENV !== 'production';
    
    if (isDev) {
      return path.resolve(__dirname, '..', '..').replace(/[\\\/]src$/, '');
    } else {
      return path.resolve(__dirname, '..', '..', '..').replace(/[\\\/]src$/, '');
    }
  } catch (error) {
    logger.error('Erro ao determinar diretório base:', error);
    return path.resolve(__dirname, '..');
  }
};

const findMediaFile = (fileName: string, mediaType: string = 'any'): string => {
  if (!fileName || typeof fileName !== 'string') {
    throw new FlowError(`Nome de arquivo inválido: ${fileName}`);
  }

  const publicDir = path.join(getBaseDir(), "public");
  
  // Verificar se o diretório público existe
  if (!fs.existsSync(publicDir)) {
    throw new FlowError(`Diretório público não encontrado: ${publicDir}`);
  }
  
  // Sanitizar nome do arquivo
  const sanitizedFileName = fileName.replace(/[<>:"/\\|?*]/g, '_');
  
  // Primeiro, tentar o nome exato
  let fullPath = path.join(publicDir, sanitizedFileName);
  if (fs.existsSync(fullPath)) {
    logger.info(`✅ Arquivo encontrado (nome exato): ${fullPath}`);
    return fullPath;
  }
  
  // Se não encontrar, tentar variações para corrigir extensões duplicadas
  const variations = [
    sanitizedFileName.replace(/\.(mp4|jpg|jpeg|png|gif|pdf|mp3|wav|mpeg|aac|avi|mov)\.mp4$/gi, '.mp4'),
    sanitizedFileName.replace(/\.(mp4|jpg|jpeg|png|gif|pdf|mp3|wav|mpeg|aac|avi|mov)\.jpg$/gi, '.jpg'),
    sanitizedFileName.replace(/\.(mp4|jpg|jpeg|png|gif|pdf|mp3|wav|mpeg|aac|avi|mov)\.png$/gi, '.png'),
    sanitizedFileName.replace(/\.(mp4|jpg|jpeg|png|gif|pdf|mp3|wav|mpeg|aac|avi|mov)\.mp3$/gi, '.mp3'),
    sanitizedFileName.replace(/\.(mp4|jpg|jpeg|png|gif|pdf|mp3|wav|mpeg|aac|avi|mov)\.mpeg$/gi, '.mpeg'),
    sanitizedFileName.replace(/\.(mp4|jpg|jpeg|png|gif|pdf|mp3|wav|mpeg|aac|avi|mov)\.wav$/gi, '.wav'),
    sanitizedFileName.replace(/\.(mp4|jpg|jpeg|png|gif|pdf|mp3|wav|mpeg|aac|avi|mov)\.pdf$/gi, '.pdf')
  ];
  
  for (const variation of variations) {
    fullPath = path.join(publicDir, variation);
    if (fs.existsSync(fullPath)) {
      logger.info(`✅ Arquivo encontrado (variação): ${fullPath}`);
      return fullPath;
    }
  }
  
  // Buscar por arquivos similares
  try {
    const baseName = path.parse(sanitizedFileName).name.split('.')[0];
    const availableFiles = fs.readdirSync(publicDir)
      .filter(file => file.toLowerCase().includes(baseName.toLowerCase()))
      .slice(0, 5);
    
    logger.warn(`❌ Arquivo não encontrado: ${sanitizedFileName}`);
    logger.warn(`📁 Arquivos similares: ${availableFiles.join(', ')}`);
    
    // Se encontrou arquivos similares, tentar usar o primeiro
    if (availableFiles.length > 0) {
      const similarFile = path.join(publicDir, availableFiles[0]);
      logger.info(`🔄 Usando arquivo similar: ${similarFile}`);
      return similarFile;
    }
  } catch (e) {
    logger.error(`❌ Erro ao listar arquivos: ${e.message}`);
  }
  
  throw new FlowError(`Arquivo não encontrado: ${sanitizedFileName} no diretório ${publicDir}`);
};

// Função robusta para validar e normalizar número de telefone
const normalizePhoneNumber = (number: string): string => {
  if (!number || typeof number !== 'string') {
    throw new FlowError('Número de telefone inválido');
  }

  // Remove todos os caracteres não numéricos
  let normalized = number.replace(/[^0-9]/g, '');
  
  // Validações para números brasileiros
  if (normalized.startsWith('55')) {
    const ddd = normalized.substring(2, 4);
    if (parseInt(ddd) >= 11 && parseInt(ddd) <= 99) {
      // Remove o 9 extra de celulares se necessário
      if (normalized.length === 13 && parseInt(ddd) >= 31) {
        normalized = normalized.substring(0, 4) + normalized.substring(5);
      }
    }
  }
  
  // Validar se o número tem tamanho mínimo
  if (normalized.length < 10) {
    throw new FlowError(`Número de telefone muito curto: ${normalized}`);
  }
  
  return normalized;
};

// Função para executar com retry
const executeWithRetry = async <T>(
  operation: () => Promise<T>,
  maxRetries: number = FLOW_CONFIG.MAX_RETRY_ATTEMPTS,
  operationName: string = 'operação'
): Promise<T> => {
  let lastError: any;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      logger.warn(`Tentativa ${attempt}/${maxRetries} falhou para ${operationName}:`, error.message);
      
      if (attempt < maxRetries) {
        await delay(1000 * attempt); // Backoff exponencial
      }
    }
  }
  
  throw new FlowError(`Falha após ${maxRetries} tentativas para ${operationName}`, undefined, undefined, lastError);
};

// Função para validar nó
const validateNode = (node: any): boolean => {
  if (!node) {
    return false;
  }
  
  if (!node.id || !node.type) {
    logger.warn(`Nó inválido: ID ou tipo ausente`, node);
    return false;
  }
  
  return true;
};

// Função para buscar ticket com validação
const getTicketSafely = async (ticketId: number, companyId: number): Promise<Ticket | null> => {
  try {
    if (!ticketId || !companyId) {
      return null;
    }
    
    const ticket = await Ticket.findOne({
      where: { id: ticketId, companyId }
    });
    
    return ticket;
  } catch (error) {
    logger.error(`Erro ao buscar ticket ${ticketId}:`, error);
    return null;
  }
};

// Adicionar sistema de monitoramento simples
class FlowProcessingMonitor {
  private static instance: FlowProcessingMonitor;
  private metrics: Map<string, any> = new Map();

  static getInstance(): FlowProcessingMonitor {
    if (!FlowProcessingMonitor.instance) {
      FlowProcessingMonitor.instance = new FlowProcessingMonitor();
    }
    return FlowProcessingMonitor.instance;
  }

  recordExecution(flowId: number, companyId: number, duration: number, success: boolean) {
    const key = `flow_${flowId}_company_${companyId}`;
    const existing = this.metrics.get(key) || { executions: 0, totalTime: 0, successCount: 0, errorCount: 0 };
    
    existing.executions++;
    existing.totalTime += duration;
    
    if (success) {
      existing.successCount++;
    } else {
      existing.errorCount++;
    }
    
    existing.avgTime = existing.totalTime / existing.executions;
    existing.successRate = existing.successCount / existing.executions;
    
    this.metrics.set(key, existing);
    
    // Log se taxa de erro for alta
    if (existing.errorRate > 0.2 && existing.executions > 10) {
      logger.warn(`Alta taxa de erro no fluxo ${flowId}: ${(existing.errorRate * 100).toFixed(1)}%`);
    }
  }

  getMetrics() {
    return Object.fromEntries(this.metrics);
  }
}

const monitor = FlowProcessingMonitor.getInstance();

// Função principal melhorada
export const ActionsWebhookService = async (
  whatsappId: number,
  idFlowDb: number,
  companyId: number,
  nodes: INodes[],
  connects: IConnections[],
  nextStage: string,
  dataWebhook: any,
  details: any,
  hashWebhookId: string,
  pressKey?: string,
  idTicket?: number,
  numberPhrase: "" | { number: string; name: string; email: string } = "",
  msg?: proto.IWebMessageInfo
): Promise<string> => {
  const startTime = Date.now();
  let iterationCount = 0;
  let success = false;
  
  try {
    logger.info(`[FlowBuilder] Iniciando execução - Flow: ${idFlowDb}, Ticket: ${idTicket}, WhatsApp: ${whatsappId}, Company: ${companyId}`);
    
    // Validações iniciais
    if (!nodes || !Array.isArray(nodes) || nodes.length === 0) {
      throw new FlowError('Lista de nós inválida ou vazia');
    }
    
    if (!connects || !Array.isArray(connects)) {
      throw new FlowError('Lista de conexões inválida');
    }
    
    if (!companyId || !whatsappId) {
      throw new FlowError('Company ID ou WhatsApp ID inválidos');
    }

    const io = getIO();

    // Inicializar next com validação
    let next = nextStage;
    if (idTicket && (!next || next === "null" || next === null)) {
      const ticket = await getTicketSafely(idTicket, companyId);
      if (ticket) {
        next = ticket.lastFlowId || nodes[0]?.id || null;
      }
    }

    // Normalizar dados de contato
    let createFieldJsonName = "";
    let numberClient = "";
    let createFieldJsonEmail = "";

    try {
      if (numberPhrase === "") {
        // Extrair nome
        const nameInput = details?.inputs?.find(item => item.keyValue === "nome");
        if (nameInput?.data) {
          nameInput.data.split(",").forEach(dataN => {
            const lineToData = details.keysFull?.find(item => item === dataN);
            createFieldJsonName += lineToData ? constructJsonLine(lineToData, dataWebhook) : dataN;
          });
        }

        // Extrair número
        const numberInput = details?.inputs?.find(item => item.keyValue === "celular");
        if (numberInput?.data) {
          numberInput.data.split(",").forEach(dataN => {
            const lineToDataNumber = details.keysFull?.find(item => item === dataN);
            numberClient += lineToDataNumber ? constructJsonLine(lineToDataNumber, dataWebhook) : dataN;
          });
        }

        // Extrair email
        const emailInput = details?.inputs?.find(item => item.keyValue === "email");
        if (emailInput?.data) {
          emailInput.data.split(",").forEach(dataN => {
            const lineToDataEmail = details.keysFull?.find(item => item.endsWith("email"));
            createFieldJsonEmail += lineToDataEmail ? constructJsonLine(lineToDataEmail, dataWebhook) : dataN;
          });
        }
      } else {
        createFieldJsonName = numberPhrase.name || "";
        numberClient = numberPhrase.number || "";
        createFieldJsonEmail = numberPhrase.email || "";
      }

      // Normalizar número de telefone
      if (numberClient) {
        numberClient = normalizePhoneNumber(numberClient);
      }
    } catch (error) {
      logger.error('Erro ao processar dados de contato:', error);
      throw new FlowError('Erro ao processar dados de contato', undefined, undefined, error);
    }

    // Validar WhatsApp
    const whatsapp = await executeWithRetry(
      () => GetDefaultWhatsApp(whatsappId, companyId),
      3,
      'obter WhatsApp'
    );

    if (!whatsapp || whatsapp.status !== "CONNECTED") {
      throw new FlowError(`WhatsApp não conectado. Status: ${whatsapp?.status || 'desconhecido'}`);
    }

    const lengthLoop = Math.min(nodes.length, FLOW_CONFIG.MAX_ITERATIONS);
    let execCount = 0;
    let execFn = "";
    let ticket: Ticket | null = null;
    let noAlterNext = false;

    // Loop principal com proteção contra loops infinitos
    for (let i = 0; i < lengthLoop && iterationCount < FLOW_CONFIG.MAX_ITERATIONS; i++) {
      iterationCount++;
      
      let nodeSelected: any; // <-- Declare here so it's always in scope
      try {
        let ticketInit: Ticket;

        // Lógica de parada
        if (pressKey === "parar") {
          logger.info(`[FlowBuilder] Parando fluxo por comando - Ticket: ${idTicket}`);
          if (idTicket) {
            const ticketToClose = await getTicketSafely(idTicket, companyId);
            if (ticketToClose) {
              await ticketToClose.update({ status: "closed" });
            }
          }
          break;
        }

        // Selecionar nó atual
        if (pressKey && pressKey !== "parar") {
          if (execFn === "") {
            nodeSelected = { type: "menu" };
          } else {
            nodeSelected = nodes.find(node => node.id === execFn);
          }
        } else {
          const otherNode = nodes.find(node => node.id === next);
          if (otherNode) {
            nodeSelected = otherNode;
          } else {
            logger.warn(`Nó não encontrado para next: ${next}. Tentando próximo.`);
            const nextConnection = connects.find(connect => connect.source === next);
            if (nextConnection) {
              next = nextConnection.target;
            } else {
              next = nodes[i + 1]?.id || null;
            }
            continue;
          }
        }

        // Validar nó selecionado
        if (!validateNode(nodeSelected)) {
          logger.error(`Nó inválido para next: ${next}. Pulando.`);
          continue;
        }

        logger.info(`[FlowBuilder] Processando nó: ${nodeSelected.id} (tipo: ${nodeSelected.type}) - Iteração: ${iterationCount}`);

        // Buscar ticket se necessário
        if (idTicket && !ticket) {
          ticket = await getTicketSafely(idTicket, companyId);
        }

        // Processar diferentes tipos de nós
        switch (nodeSelected.type) {
          case "message":
            await processMessageNode(nodeSelected, ticket, numberClient, whatsapp);
            break;

          case "typebot":
            await processTypebotNode(nodeSelected, whatsapp, msg, ticket);
            break;

          case "openai":
            await processOpenAiNode(nodeSelected, whatsapp, msg, ticket, numberClient, companyId);
            break;

          case "question":
            const shouldBreak = await processQuestionNode(
              nodeSelected, 
              ticket, 
              connects, 
              hashWebhookId, 
              idFlowDb, 
              companyId
            );
            if (shouldBreak) {
              logger.info(`[FlowBuilder] Aguardando resposta da pergunta - Parando fluxo`);
              return "awaiting_response";
            }
            break;

          case "ticket":
            await processTicketNode(nodeSelected, ticket, companyId, whatsapp, hashWebhookId, idFlowDb);
            logger.info(`[FlowBuilder] ✅ Transferido para fila - PARANDO FLUXO`);
            return "transferred_to_queue";

          case "singleBlock":
            await processSingleBlockNode(nodeSelected, ticket, numberClient, whatsapp, companyId, idTicket);
            break;

          case "randomizer":
            const randomResult = processRandomizerNode(nodeSelected, connects);
            next = randomResult.next;
            noAlterNext = randomResult.noAlterNext;
            break;

          case "menu":
            const menuResult = await processMenuNode(
              nodeSelected,
              pressKey,
              connects,
              nodes,
              next,
              numberClient,
              ticket,
              companyId,
              dataWebhook,
              hashWebhookId,
              idFlowDb,
              whatsappId
            );
            
            if (menuResult.shouldBreak) {
              logger.info(`[FlowBuilder] Menu processado - Aguardando seleção`);
              return "menu_displayed";
            }
            
            execFn = menuResult.execFn;
            pressKey = menuResult.pressKey;
            break;

          default:
            logger.warn(`Tipo de nó não reconhecido: ${nodeSelected.type}`);
        }

        // Determinar próximo nó
        const nextNodeResult = determineNextNode(
          nodeSelected,
          connects,
          pressKey,
          execFn,
          execCount,
          noAlterNext,
          nodes,
          i
        );

        next = nextNodeResult.next;
        pressKey = nextNodeResult.pressKey;
        execCount = nextNodeResult.execCount;

        // Verificar se deve parar
        if (nextNodeResult.shouldBreak) {
          logger.info(`[FlowBuilder] Fim do fluxo detectado - Finalizando`);
          break;
        }

        // Atualizar ticket com próximo nó
        if (ticket && next) {
          await ticket.update({
            lastFlowId: nodeSelected.id,
            nextFlowId: next,
            hashFlowId: hashWebhookId,
            flowStopped: idFlowDb.toString()
          });
        }

        // Reset de flags
        noAlterNext = false;
        execCount++;

        // Verificar timeout
        if (Date.now() - startTime > FLOW_CONFIG.DEFAULT_TIMEOUT) {
          logger.warn(`[FlowBuilder] Timeout atingido após ${Date.now() - startTime}ms`);
          break;
        }

      } catch (nodeError) {
        logger.error(`Erro ao processar nó ${nodeSelected?.id || 'desconhecido'}:`, nodeError);
        
        // Tentar continuar com próximo nó em caso de erro não crítico
        if (nodeError instanceof FlowError && !nodeError.message.includes('crítico')) {
          continue;
        } else {
          throw nodeError;
        }
      }
    }

    const executionTime = Date.now() - startTime;
    success = true;
    logger.info(`[FlowBuilder] Execução finalizada - Tempo: ${executionTime}ms, Iterações: ${iterationCount}`);
    
    // Registrar métricas
    monitor.recordExecution(idFlowDb, companyId, executionTime, success);

    return "completed";

  } catch (error) {
    const executionTime = Date.now() - startTime;
    logger.error(`[FlowBuilder] Erro na execução após ${executionTime}ms, ${iterationCount} iterações:`, error);
    
    // Registrar métricas de erro
    monitor.recordExecution(idFlowDb, companyId, executionTime, false);
    
    if (error instanceof FlowError) {
      throw new AppError(error.message, 400);
    }
    
    throw new AppError('Erro interno no processamento do fluxo', 500);
  }
};

// Funções auxiliares para processar cada tipo de nó

const processMessageNode = async (nodeSelected: any, ticket: Ticket, numberClient: string, whatsapp: any) => {
  try {
    let msgBody = nodeSelected.data?.label || '';
    
    if (ticket?.dataWebhook && typeof ticket.dataWebhook === "object" && "variables" in ticket.dataWebhook) {
      msgBody = replaceMessages((ticket.dataWebhook as { variables?: any }).variables, msgBody);
    }

    await executeWithRetry(
      () => SendMessage(whatsapp, {
        number: numberClient,
        body: msgBody
      }),
      3,
      'envio de mensagem'
    );

    await delay(FLOW_CONFIG.DELAY_BETWEEN_MESSAGES);
  } catch (error) {
    throw new FlowError('Erro ao enviar mensagem', nodeSelected.id, 'message', error);
  }
};

const processTypebotNode = async (nodeSelected: any, whatsapp: any, msg: any, ticket: Ticket) => {
  try {
    const wbot = getWbot(whatsapp.id);
    await typebotListener({
      wbot: wbot,
      msg,
      ticket,
      typebot: nodeSelected.data?.typebotIntegration
    });
  } catch (error) {
    throw new FlowError('Erro ao processar Typebot', nodeSelected.id, 'typebot', error);
  }
};

const processOpenAiNode = async (
  nodeSelected: any, 
  whatsapp: any, 
  msg: any, 
  ticket: Ticket, 
  numberClient: string, 
  companyId: number
) => {
  try {
    if (!nodeSelected.data?.typebotIntegration) {
      throw new FlowError('Configuração OpenAI ausente');
    }

    const {
      name, prompt, voice, voiceKey, voiceRegion,
      maxTokens, temperature, apiKey, queueId, maxMessages, model
    } = nodeSelected.data.typebotIntegration as IOpenAi;

    const openAiSettings = {
      name: name || 'Assistant',
      prompt: prompt || '',
      voice: voice || 'alloy',
      voiceKey: voiceKey || '',
      voiceRegion: voiceRegion || 'us-east-1',
      maxTokens: Number(maxTokens) || 256,
      temperature: Number(temperature) || 0.7,
      apiKey: apiKey || '',
      queueId: Number(queueId) || 0,
      maxMessages: Number(maxMessages) || 10,
      model: model || 'gpt-3.5-turbo'
    };

    const contact = await Contact.findOne({
      where: { number: numberClient, companyId }
    });

    const wbot = getWbot(whatsapp.id);

    const ticketTraking = await FindOrCreateATicketTrakingService({
      ticketId: ticket.id,
      companyId,
      userId: null,
      whatsappId: whatsapp?.id
    });

    await handleOpenAi(
      openAiSettings,
      msg,
      wbot,
      ticket,
      contact,
      null,
      ticketTraking
    );
  } catch (error) {
    throw new FlowError('Erro ao processar OpenAI', nodeSelected.id, 'openai', error);
  }
};

const processQuestionNode = async (
  nodeSelected: any,
  ticket: Ticket,
  connects: IConnections[],
  hashWebhookId: string,
  idFlowDb: number,
  companyId: number
): Promise<boolean> => {
  try {
    if (!ticket) {
      throw new FlowError('Ticket não encontrado para pergunta');
    }

    const webhook = (ticket.dataWebhook || {}) as { variables?: any };
    const variables = webhook.variables || {};
    const { message, answerKey } = nodeSelected.data?.typebotIntegration || {};

    if (!answerKey) {
      throw new FlowError('Chave de resposta não definida para pergunta');
    }

    // Verificar se esta pergunta específica já foi respondida
    if (!variables[answerKey]) {
      const ticketDetails = await ShowTicketService(ticket.id, companyId);
      const bodyFila = formatBody(message || 'Pergunta não definida', ticket);

      await delay(FLOW_CONFIG.TYPING_SIMULATION_DELAY);
      await typeSimulation(ticket, "composing");
      await SendWhatsAppMessage({ body: bodyFila, ticket: ticketDetails, quotedMsg: null });
      SetTicketMessagesAsRead(ticketDetails);

      await ticketDetails.update({ lastMessage: bodyFila });

      // Encontrar a próxima conexão
      const nextConnection = connects.find(connect => connect.source === nodeSelected.id);
      const nextNodeId = nextConnection ? nextConnection.target : null;

      await ticket.update({
        userId: null,
        lastFlowId: nodeSelected.id,
        nextFlowId: nextNodeId,
        hashFlowId: hashWebhookId,
        flowStopped: idFlowDb.toString(),
        awaitingResponse: true
      });

      return true; // Deve parar o fluxo
    }

    return false; // Pode continuar
  } catch (error) {
    throw new FlowError('Erro ao processar pergunta', nodeSelected.id, 'question', error);
  }
};

const processTicketNode = async (
  nodeSelected: any,
  ticket: Ticket,
  companyId: number,
  whatsapp: any,
  hashWebhookId: string,
  idFlowDb: number
) => {
  try {
    const queueId = nodeSelected.data?.data?.id || nodeSelected.data?.id;
    
    if (!queueId) {
      throw new FlowError('ID da fila não definido');
    }

    const queue = await ShowQueueService(queueId, companyId);

    if (!ticket) {
      throw new FlowError('Ticket não encontrado para transferência');
    }

    await ticket.update({
      status: "pending",
      queueId: queue.id,
      userId: ticket.userId,
      companyId,
      flowWebhook: true,
      lastFlowId: nodeSelected.id,
      hashFlowId: hashWebhookId,
      flowStopped: idFlowDb.toString()
    });

    await FindOrCreateATicketTrakingService({
      ticketId: ticket.id,
      companyId,
      whatsappId: ticket.whatsappId,
      userId: ticket.userId
    });

    await UpdateTicketService({
      ticketData: { status: "pending", queueId: queue.id },
      ticketId: ticket.id,
      companyId
    });

    await CreateLogTicketService({ 
      ticketId: ticket.id, 
      type: "queue", 
      queueId: queue.id 
    });

    // Enviar mensagem de posição na fila se configurado
    const settings = await CompaniesSettings.findOne({ where: { companyId } });
    const enableQueuePosition = settings?.sendQueuePosition === "enabled";

    if (enableQueuePosition) {
      const count = await Ticket.findAndCountAll({
        where: { 
          userId: null, 
          status: "pending", 
          companyId, 
          queueId: queue.id, 
          whatsappId: whatsapp.id, 
          isGroup: false 
        }
      });
      
      const qtd = count.count === 0 ? 1 : count.count;
      const msgFila = `${settings.sendQueuePositionMessage} *${qtd}*`;
      const ticketDetails = await ShowTicketService(ticket.id, companyId);
      const bodyFila = formatBody(msgFila, ticket);

      await delay(FLOW_CONFIG.TYPING_SIMULATION_DELAY);
      await typeSimulation(ticket, "composing");
      await SendWhatsAppMessage({ body: bodyFila, ticket: ticketDetails, quotedMsg: null });
      SetTicketMessagesAsRead(ticketDetails);
      await ticketDetails.update({ lastMessage: bodyFila });
    }
  } catch (error) {
    throw new FlowError('Erro ao processar transferência para fila', nodeSelected.id, 'ticket', error);
  }
};

const processSingleBlockNode = async (
  nodeSelected: any,
  ticket: Ticket,
  numberClient: string,
  whatsapp: any,
  companyId: number,
  idTicket: number
) => {
  try {
    if (!nodeSelected.data?.seq || !Array.isArray(nodeSelected.data.seq)) {
      throw new FlowError('Sequência do bloco inválida');
    }

    for (let iLoc = 0; iLoc < nodeSelected.data.seq.length; iLoc++) {
      const elementNowSelected = nodeSelected.data.seq[iLoc];

      if (!ticket) {
        ticket = await getTicketSafely(idTicket, companyId);
      }

      if (elementNowSelected.includes("message")) {
        await processSingleBlockMessage(nodeSelected, elementNowSelected, ticket, companyId, idTicket);
      }

      if (elementNowSelected.includes("interval")) {
        const intervalValue = nodeSelected.data.elements?.find(
          item => item.number === elementNowSelected
        )?.value || "1";
        await delay(parseInt(intervalValue) * 1000);
      }

      if (elementNowSelected.includes("img")) {
        await processSingleBlockImage(nodeSelected, elementNowSelected, ticket, numberClient, whatsapp);
      }

      if (elementNowSelected.includes("audio")) {
        await processSingleBlockAudio(nodeSelected, elementNowSelected, ticket);
      }

      if (elementNowSelected.includes("video")) {
        await processSingleBlockVideo(nodeSelected, elementNowSelected, ticket);
      }
    }
  } catch (error) {
    throw new FlowError('Erro ao processar bloco único', nodeSelected.id, 'singleBlock', error);
  }
};

const processSingleBlockMessage = async (
  nodeSelected: any,
  elementNowSelected: string,
  ticket: Ticket,
  companyId: number,
  idTicket: number
) => {
  try {
    const bodyFor = nodeSelected.data.elements?.find(
      item => item.number === elementNowSelected
    )?.value || '';

    const ticketDetails = await ShowTicketService(idTicket, companyId);
    const webhook = ticket?.dataWebhook;

    let msg = bodyFor;
    if ((webhook as { variables?: any })?.variables) {
      msg = replaceMessages((webhook as { variables?: any }).variables, bodyFor);
    }

    await delay(FLOW_CONFIG.TYPING_SIMULATION_DELAY);
    await typeSimulation(ticket, "composing");

    await SendWhatsAppMessage({
      body: msg,
      ticket: ticketDetails,
      quotedMsg: null
    });

    SetTicketMessagesAsRead(ticketDetails);
    await ticketDetails.update({
      lastMessage: formatBody(bodyFor, ticket)
    });

    await delay(FLOW_CONFIG.DELAY_BETWEEN_MESSAGES);
  } catch (error) {
    throw new FlowError('Erro ao processar mensagem do bloco', undefined, 'singleBlockMessage', error);
  }
};

const processSingleBlockImage = async (
  nodeSelected: any,
  elementNowSelected: string,
  ticket: Ticket,
  numberClient: string,
  whatsapp: any
) => {
  try {
    await typeSimulation(ticket, "composing");
    
    const fileName = nodeSelected.data.elements?.find(
      item => item.number === elementNowSelected
    )?.value;

    if (!fileName) {
      throw new FlowError('Nome do arquivo de imagem não definido');
    }

    const mediaPath = findMediaFile(fileName, 'image');

    await executeWithRetry(
      () => SendMessage(whatsapp, {
        number: numberClient,
        body: "",
        mediaPath
      }),
      3,
      'envio de imagem'
    );

    await delay(FLOW_CONFIG.DELAY_BETWEEN_MESSAGES);
  } catch (error) {
    logger.error(`❌ Erro ao enviar imagem: ${error.message}`);
    // Não quebrar o fluxo por erro de mídia
  }
};

const processSingleBlockAudio = async (
  nodeSelected: any,
  elementNowSelected: string,
  ticket: Ticket
) => {
  try {
    const fileName = nodeSelected.data.elements?.find(
      item => item.number === elementNowSelected
    )?.value;

    if (!fileName) {
      throw new FlowError('Nome do arquivo de áudio não definido');
    }

    const mediaDirectory = findMediaFile(fileName, 'audio');
    const isRecord = nodeSelected.data.elements?.find(
      item => item.number === elementNowSelected
    )?.record || false;

    await typeSimulation(ticket, "recording");
    
    // Usar timeout específico para mídia
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Timeout no processamento de áudio')), 
        FLOW_CONFIG.MEDIA_PROCESSING_TIMEOUT);
    });
    
    const sendPromise = SendWhatsAppMediaFlow({
      media: mediaDirectory,
      ticket: ticket,
      isRecord: isRecord
    });
    
    await Promise.race([sendPromise, timeoutPromise]);
    await delay(FLOW_CONFIG.DELAY_BETWEEN_MESSAGES);
  } catch (error) {
    logger.error(`❌ Erro ao enviar áudio: ${error.message}`);
    // Não quebrar o fluxo por erro de mídia, mas registrar
    monitor.recordExecution(0, ticket.companyId, 0, false);
  }
};

const processSingleBlockVideo = async (
  nodeSelected: any,
  elementNowSelected: string,
  ticket: Ticket
) => {
  try {
    const fileName = nodeSelected.data.elements?.find(
      item => item.number === elementNowSelected
    )?.value;

    if (!fileName) {
      throw new FlowError('Nome do arquivo de vídeo não definido');
    }

    const mediaDirectory = findMediaFile(fileName, 'video');

    await typeSimulation(ticket, "recording");
    
    await executeWithRetry(
      () => SendWhatsAppMediaFlow({
        media: mediaDirectory,
        ticket: ticket
      }),
      3,
      'envio de vídeo'
    );

    await delay(FLOW_CONFIG.DELAY_BETWEEN_MESSAGES);
  } catch (error) {
    logger.error(`❌ Erro ao enviar vídeo: ${error.message}`);
    // Não quebrar o fluxo por erro de mídia
  }
};

const processRandomizerNode = (nodeSelected: any, connects: IConnections[]) => {
  try {
    const selectedRandom = randomizarCaminho(
      nodeSelected.data?.percent ? nodeSelected.data.percent / 100 : 0.5
    );

    const resultConnect = connects.filter(
      connect => connect.source === nodeSelected.id
    );

    let next: string;
    if (selectedRandom === "A") {
      const connectionA = resultConnect.find(item => item.sourceHandle === "a");
      next = connectionA?.target || '';
    } else {
      const connectionB = resultConnect.find(item => item.sourceHandle === "b");
      next = connectionB?.target || '';
    }

    return { next, noAlterNext: true };
  } catch (error) {
    throw new FlowError('Erro ao processar randomizador', nodeSelected.id, 'randomizer', error);
  }
};

const processMenuNode = async (
  nodeSelected: any,
  pressKey: string | undefined,
  connects: IConnections[],
  nodes: INodes[],
  next: string,
  numberClient: string,
  ticket: Ticket,
  companyId: number,
  dataWebhook: any,
  hashWebhookId: string,
  idFlowDb: number,
  whatsappId: number
) => {
  try {
    if (pressKey) {
      // Processar seleção do menu
      const filterOne = connects.filter(confil => confil.source === next);
      const filterTwo = filterOne.filter(filt2 => filt2.sourceHandle === "a" + pressKey);
      
      let execFn = filterTwo.length > 0 ? filterTwo[0].target : undefined;
      
      if (execFn === undefined) {
        return { shouldBreak: true, execFn: '', pressKey: undefined };
      }

      return { shouldBreak: false, execFn, pressKey: "999" };
    } else {
      // Mostrar menu
      if (!nodeSelected.data?.arrayOption || !Array.isArray(nodeSelected.data.arrayOption)) {
        throw new FlowError('Opções do menu inválidas');
      }

      let optionsMenu = "";
      nodeSelected.data.arrayOption.forEach(item => {
        optionsMenu += `[${item.number}] ${item.value}\n`;
      });

      const menuCreate = `${nodeSelected.data.message || 'Escolha uma opção:'}\n\n${optionsMenu}`;
      
      let msgBody = menuCreate;
      if ((ticket?.dataWebhook as { variables?: any })?.variables) {
        msgBody = replaceMessages((ticket.dataWebhook as { variables?: any }).variables, menuCreate);
      }

      const ticketDetails = await ShowTicketService(ticket.id, companyId);

      await typeSimulation(ticket, "composing");
      await SendWhatsAppMessage({
        body: msgBody,
        ticket: ticketDetails,
        quotedMsg: null
      });

      SetTicketMessagesAsRead(ticketDetails);
      await ticketDetails.update({
        lastMessage: formatBody(msgBody, ticket)
      });

      await delay(FLOW_CONFIG.DELAY_BETWEEN_MESSAGES);

      // Atualizar ticket com estado do menu
      await ticket.update({
        queueId: ticket.queueId || null,
        userId: null,
        companyId: companyId,
        flowWebhook: true,
        lastFlowId: nodeSelected.id,
        dataWebhook: dataWebhook,
        hashFlowId: hashWebhookId,
        flowStopped: idFlowDb.toString()
      });

      return { shouldBreak: true, execFn: '', pressKey: undefined };
    }
  } catch (error) {
    throw new FlowError('Erro ao processar menu', nodeSelected.id, 'menu', error);
  }
};

const determineNextNode = (
  nodeSelected: any,
  connects: IConnections[],
  pressKey: string | undefined,
  execFn: string,
  execCount: number,
  noAlterNext: boolean,
  nodes: INodes[],
  currentIndex: number
) => {
  let next = "";
  let newPressKey = pressKey;
  let newExecCount = execCount;

  try {
    if (pressKey === "999" && execCount > 0) {
      newPressKey = undefined;
      const result = connects.find(connect => connect.source === execFn);
      next = result ? (noAlterNext ? next : result.target) : "";
    } else {
      const result = connects.find(connect => connect.source === nodeSelected.id);
      next = result ? (noAlterNext ? next : result.target) : "";
    }

    // Se não encontrou próximo nó, tentar próximo na lista
    if (!next || next === "" || next === null) {
      if (currentIndex + 1 < nodes.length) {
        next = nodes[currentIndex + 1].id;
      } else {
        return { next: "", pressKey: newPressKey, execCount: newExecCount, shouldBreak: true };
      }
    }

    // Verificar se chegou ao fim
    const nextNodeConnections = connects.filter(connect => connect.source === nodeSelected.id);
    if (nextNodeConnections.length === 0 && !pressKey) {
      return { next: "", pressKey: newPressKey, execCount: newExecCount, shouldBreak: true };
    }

    return { next, pressKey: newPressKey, execCount: newExecCount, shouldBreak: false };
  } catch (error) {
    logger.error('Erro ao determinar próximo nó:', error);
    return { next: "", pressKey: newPressKey, execCount: newExecCount, shouldBreak: true };
  }
};

// Funções auxiliares já existentes (melhoradas)
const constructJsonLine = (line: string, json: any): string => {
  try {
    if (!line || !json) return "";
    
    let valor = json;
    const chaves = line.split(".");

    if (chaves.length === 1) {
      return valor[chaves[0]] || "";
    }

    for (const chave of chaves) {
      if (valor && typeof valor === 'object' && chave in valor) {
        valor = valor[chave];
      } else {
        return "";
      }
    }
    
    return String(valor || "");
  } catch (error) {
    logger.error('Erro ao construir linha JSON:', error);
    return "";
  }
};

const intervalWhats = (time: string): Promise<void> => {
  try {
    const seconds = Math.max(0, Math.min(30, parseInt(time) || 1)); // Limitar entre 0 e 30 segundos
    return new Promise(resolve => setTimeout(resolve, seconds * 1000));
  } catch (error) {
    logger.error('Erro no intervalo:', error);
    return Promise.resolve();
  }
};

const replaceMessages = (variables: any, message: string): string => {
  try {
    if (!variables || !message) return message || "";
    
    return message.replace(
      /{{\s*([^{}\s]+)\s*}}/g,
      (match, key) => {
        if (variables && typeof variables === 'object' && key in variables) {
          return String(variables[key] || "");
        }
        return match; // Manter o placeholder se não encontrar a variável
      }
    );
  } catch (error) {
    logger.error('Erro ao substituir mensagens:', error);
    return message || "";
  }
}