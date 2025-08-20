import { MessageUpsertType, proto, WASocket } from "@whiskeysockets/baileys";
import {
  convertTextToSpeechAndSaveToFile,
  getBodyMessage,
  keepOnlySpecifiedChars,
  transferQueue,
  verifyMediaMessage,
  verifyMessage,
} from "../WbotServices/wbotMessageListener";
import { isNil, isNull } from "lodash";
import fs from "fs";
import path from "path";
import OpenAI from "openai";
import { groq } from '@ai-sdk/groq';
import { generateText } from 'ai';
import { createGroq } from '@ai-sdk/groq';
import Ticket from "../../models/Ticket";
import Contact from "../../models/Contact";
import Message from "../../models/Message";
import TicketTraking from "../../models/TicketTraking";

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

interface SessionGroq {
  id?: number;
  apiKey: string;
  model: string;
}

const sessionsOpenAi: SessionOpenAi[] = [];
const sessionsGroq: SessionGroq[] = [];

// Estatísticas de uso em tempo real para monitoramento
interface UsageStats {
  activeTickets: number;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  avgResponseTime: number;
  lastUpdated: number;
}

const usageStats: Record<string, UsageStats> = {
  openai: { activeTickets: 0, totalRequests: 0, successfulRequests: 0, failedRequests: 0, avgResponseTime: 0, lastUpdated: Date.now() },
  groq: { activeTickets: 0, totalRequests: 0, successfulRequests: 0, failedRequests: 0, avgResponseTime: 0, lastUpdated: Date.now() }
};

// Função para atualizar estatísticas e log inteligente
const updateStats = (provider: 'openai' | 'groq', success: boolean, responseTime?: number) => {
  const stats = usageStats[provider];
  stats.totalRequests++;
  stats.lastUpdated = Date.now();
  
  if (success) {
    stats.successfulRequests++;
    if (responseTime) {
      // Média móvel para resposta mais suave
      stats.avgResponseTime = stats.avgResponseTime * 0.9 + responseTime * 0.1;
    }
  } else {
    stats.failedRequests++;
  }
  
  // Atualiza contagem de tickets ativos
  if (provider === 'openai') {
    stats.activeTickets = sessionsOpenAi.length;
  } else {
    stats.activeTickets = sessionsGroq.length;
  }
  
  // Log periódico das estatísticas (a cada 8 requests)
  if (stats.totalRequests % 8 === 0) {
    const successRate = ((stats.successfulRequests / stats.totalRequests) * 100).toFixed(1);
    const errorRate = ((stats.failedRequests / stats.totalRequests) * 100).toFixed(1);
    
    // Log específico com limites atuais
    let limitsInfo = '';
    if (provider === 'groq') {
      limitsInfo = ' | Limites: 15-60 RPM (Groq Free)';
    } else {
      limitsInfo = ' | Limites: 40-60 RPM';
    }
    
    console.log(`📊 ${provider.toUpperCase()}: ${stats.activeTickets} tickets | ${successRate}% ✅ | ${errorRate}% ❌ | ${Math.round(stats.avgResponseTime)}ms${limitsInfo}`);
  }
};

// Rate limiting system baseado nos limites oficiais das APIs
interface RateLimiterState {
  tokens: number;
  lastRefill: number;
}

const rateLimiters: Record<string, RateLimiterState> = {};

// Limites baseados na documentação oficial do Groq (Free tier)
const getProviderLimits = (providerKey: string) => {
  // OpenAI: ~60 RPM para gpt-3.5-turbo, ~40 RPM para gpt-4
  if (providerKey.includes('openai:gpt-4')) {
    return { tokens: 3, intervalMs: 4500 }; // ~40 RPM
  }
  if (providerKey.includes('openai:gpt-3.5')) {
    return { tokens: 4, intervalMs: 4000 }; // ~60 RPM
  }
  
  // Groq Free Tier - Limites específicos por modelo
  if (providerKey.includes('groq:allam-2-7b')) {
    return { tokens: 3, intervalMs: 6000 }; // 30 RPM, 6K TPM
  }
  if (providerKey.includes('groq:compound-beta')) {
    return { tokens: 1, intervalMs: 8000 }; // 15 RPM, 70K TPM
  }
  if (providerKey.includes('groq:compound-beta-mini')) {
    return { tokens: 1, intervalMs: 8000 }; // 15 RPM, 70K TPM
  }
  if (providerKey.includes('groq:deepseek-r1-distill-llama-70b')) {
    return { tokens: 3, intervalMs: 6000 }; // 30 RPM, 6K TPM
  }
  if (providerKey.includes('groq:gemma2-9b-it')) {
    return { tokens: 3, intervalMs: 6000 }; // 30 RPM, 15K TPM
  }
  if (providerKey.includes('groq:llama-3.1-8b-instant')) {
    return { tokens: 3, intervalMs: 6000 }; // 30 RPM, 6K TPM
  }
  if (providerKey.includes('groq:llama-3.3-70b-versatile')) {
    return { tokens: 3, intervalMs: 6000 }; // 30 RPM, 12K TPM
  }
  if (providerKey.includes('groq:llama3-70b-8192')) {
    return { tokens: 3, intervalMs: 6000 }; // 30 RPM, 6K TPM
  }
  if (providerKey.includes('groq:llama3-8b-8192')) {
    return { tokens: 3, intervalMs: 6000 }; // 30 RPM, 6K TPM
  }
  if (providerKey.includes('groq:meta-llama/llama-4-maverick')) {
    return { tokens: 3, intervalMs: 6000 }; // 30 RPM, 6K TPM
  }
  if (providerKey.includes('groq:meta-llama/llama-4-scout')) {
    return { tokens: 3, intervalMs: 6000 }; // 30 RPM, 30K TPM
  }
  if (providerKey.includes('groq:meta-llama/llama-guard-4-12b')) {
    return { tokens: 3, intervalMs: 6000 }; // 30 RPM, 15K TPM
  }
  if (providerKey.includes('groq:moonshotai/kimi-k2-instruct')) {
    return { tokens: 5, intervalMs: 5000 }; // 60 RPM, 10K TPM
  }
  if (providerKey.includes('groq:openai/gpt-oss')) {
    return { tokens: 3, intervalMs: 6000 }; // 30 RPM, 8K TPM
  }
  if (providerKey.includes('groq:qwen/qwen3-32b')) {
    return { tokens: 5, intervalMs: 5000 }; // 60 RPM, 6K TPM
  }
  
  // Default conservador para Groq Free
  return { tokens: 3, intervalMs: 6000 }; // 30 RPM
};

const acquireRateLimit = (key: string): number => {
  const now = Date.now();
  const limits = getProviderLimits(key);
  
  if (!rateLimiters[key]) {
    rateLimiters[key] = { tokens: limits.tokens, lastRefill: now };
  }
  
  const state = rateLimiters[key];
  const elapsed = now - state.lastRefill;
  
  // Refill tokens baseado no tempo decorrido
  if (elapsed >= limits.intervalMs) {
    const refillCount = Math.floor(elapsed / limits.intervalMs);
    state.tokens = Math.min(limits.tokens, state.tokens + refillCount);
    state.lastRefill = now;
  }
  
  if (state.tokens > 0) {
    state.tokens -= 1;
    console.log(`🎫 Rate limit OK: ${key} (${state.tokens}/${limits.tokens} tokens, próximo refill em ${Math.max(0, limits.intervalMs - elapsed)}ms)`);
    return 0;
  }
  
  // Delay até próximo token
  const delay = limits.intervalMs - (now - state.lastRefill);
  console.log(`⏳ Rate limit ativo: ${key} aguardando ${delay}ms (limite: ${limits.tokens} tokens/${limits.intervalMs}ms)`);
  return delay;
};

// Helper function to wait
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Exponential backoff with jitter for retries
const executeWithRetries = async <T>(
  fn: () => Promise<T>,
  options: { attempts?: number; baseDelayMs?: number; maxDelayMs?: number; providerKey: string }
): Promise<T> => {
  const { attempts = 4, baseDelayMs = 1000, maxDelayMs = 12000, providerKey } = options;
  let lastErr: any;
  
  for (let attempt = 1; attempt <= attempts; attempt++) {
    // Rate limiting inteligente por provider/modelo
    const rateDelay = acquireRateLimit(providerKey);
    if (rateDelay > 0) {
      await wait(rateDelay);
    }
    
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;
      const status = err?.status || err?.response?.status;
      
      // Log específico para debugging com detalhes do Groq
      console.log(`❌ Tentativa ${attempt}/${attempts} falhou: ${providerKey} - Status: ${status} - ${err?.message}`);
      
      // Erros que valem retry (incluindo específicos do Groq)
      const isRetryable = [429, 408, 409, 500, 502, 503, 504].includes(status) ||
        /timeout|ETIMEDOUT|ECONNRESET|EAI_AGAIN|rate.?limit|quota.*exceeded/i.test(err?.message || "") ||
        err?.message?.includes('RESOURCE_EXHAUSTED');
      
      if (!isRetryable || attempt === attempts) {
        console.log(`🚫 Parando retries para ${providerKey}: ${!isRetryable ? 'erro não recuperável' : 'tentativas esgotadas'}`);
        break;
      }
      
      // Backoff adaptativo - específico para Groq vs OpenAI
      let backoff = baseDelayMs * Math.pow(1.8, attempt - 1);
      
      if (status === 429 || err?.message?.includes('rate') || err?.message?.includes('quota')) {
        // Para rate limit: delay maior no Groq devido aos limites mais baixos
        if (providerKey.includes('groq')) {
          backoff = Math.min(15000, backoff * 2); // Até 15s para Groq
        } else {
          backoff = Math.min(6000, backoff); // Até 6s para OpenAI
        }
      }
      
      backoff = Math.min(maxDelayMs, backoff);
      const jitter = Math.random() * backoff * 0.4; // 40% de jitter
      const finalDelay = backoff + jitter;
      
      console.log(`🔄 Retry ${attempt}/${attempts} em ${Math.round(finalDelay)}ms para ${providerKey} (reason: ${status || 'network'})`);
      await wait(finalDelay);
    }
  }
  
  throw lastErr;
};

// Provider concurrency control
interface ProviderConcurrencyState {
  max: number;
  current: number;
  queue: Array<{
    resolve: () => void;
    reject: (err: any) => void;
    enqueuedAt: number;
  }>;
}

// Provider concurrency control baseado nos limites reais
interface ProviderConcurrencyState {
  max: number;
  current: number;
  queue: Array<{
    resolve: () => void;
    reject: (err: any) => void;
    enqueuedAt: number;
  }>;
}

const providerConcurrency: Record<string, ProviderConcurrencyState> = {
  // OpenAI: permite mais concorrência (limites maiores)
  openai: { max: 5, current: 0, queue: [] },
  // Groq: boa concorrência, Groq tem limites razoáveis
  groq: { max: 4, current: 0, queue: [] }
};

const PROVIDER_MAX_QUEUE = 80; // Queue ajustada
const PROVIDER_QUEUE_TIMEOUT_MS = 25000; // Timeout maior para Groq

const processProviderQueue = (provider: string) => {
  const state = providerConcurrency[provider];
  while (state.current < state.max && state.queue.length > 0) {
    const item = state.queue.shift();
    if (!item) break;
    state.current += 1;
    item.resolve();
  }
};

const withProviderConcurrency = async <T>(provider: 'openai' | 'groq', fn: () => Promise<T>): Promise<T> => {
  const state = providerConcurrency[provider];
  if (!state) return fn();

  const canRunImmediately = state.current < state.max;
  if (canRunImmediately) {
    state.current += 1;
    console.log(`🚀 ${provider} executando imediatamente (${state.current}/${state.max})`);
  } else {
    if (state.queue.length >= PROVIDER_MAX_QUEUE) {
      throw new Error(`Provider ${provider} sobrecarregado - ${state.queue.length} na fila. Tente novamente.`);
    }
    
    console.log(`⏳ ${provider} na fila: posição ${state.queue.length + 1}`);
    
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        const idx = state.queue.findIndex(q => q.resolve === resolve);
        if (idx > -1) state.queue.splice(idx, 1);
        reject(new Error(`Timeout na fila do ${provider} após ${PROVIDER_QUEUE_TIMEOUT_MS}ms`));
      }, PROVIDER_QUEUE_TIMEOUT_MS);
      
      state.queue.push({
        resolve: () => {
          clearTimeout(timeout);
          state.current += 1;
          console.log(`✅ ${provider} saiu da fila (${state.current}/${state.max})`);
          resolve();
        },
        reject: (err) => {
          clearTimeout(timeout);
          reject(err);
        },
        enqueuedAt: Date.now()
      });
    });
  }
  
  try {
    const result = await fn();
    return result;
  } finally {
    state.current -= 1;
    if (state.current < 0) state.current = 0;
    console.log(`🏁 ${provider} finalizado (${state.current}/${state.max})`);
    processProviderQueue(provider);
  }
};

const deleteFileSync = (path: string): void => {
  try {
    fs.unlinkSync(path);
  } catch (error) {
    console.error("Erro ao deletar o arquivo:", error);
  }
};

const sanitizeName = (name: string): string => {
  let sanitized = name.split(" ")[0];
  sanitized = sanitized.replace(/[^a-zA-Z0-9]/g, "");
  return sanitized.substring(0, 60);
};

// Prepares the AI messages from past messages  
const prepareMessagesAI = (pastMessages: Message[], isGroqModel: boolean, promptSystem: string): any[] => {
  const messagesAI = [];

  // Para Groq, sempre incluir system prompt (suporte nativo)
  if (isGroqModel) {
    messagesAI.push({ role: "system", content: promptSystem });
  } else {
    // Para OpenAI, também incluir system prompt
    messagesAI.push({ role: "system", content: promptSystem });
  }

  // Map past messages to AI message format
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

// Sistema inteligente de seleção de modelo Groq com base nos limites (Free tier)
const getAvailableGroqModel = (messageLength: number, historyLength: number, failedModels: string[] = []): string => {
  const allModels = [
    // Modelos com limite de 60 RPM (Free tier)
    { name: 'moonshotai/kimi-k2-instruct', rpm: 60, tpm: 10000, tier: 'high' },
    { name: 'qwen/qwen3-32b', rpm: 60, tpm: 6000, tier: 'high' },
    
    // Modelos com limite de 30 RPM (Free tier)
    { name: 'deepseek-r1-distill-llama-70b', rpm: 30, tpm: 6000, tier: 'medium' },
    { name: 'llama-3.1-8b-instant', rpm: 30, tpm: 6000, tier: 'medium' },
    { name: 'llama-3.3-70b-versatile', rpm: 30, tpm: 12000, tier: 'medium' },
    { name: 'meta-llama/llama-4-maverick-17b-128e-instruct', rpm: 30, tpm: 6000, tier: 'medium' },
    { name: 'meta-llama/llama-4-scout-17b-16e-instruct', rpm: 30, tpm: 30000, tier: 'medium' },
    { name: 'openai/gpt-oss-120b', rpm: 30, tpm: 8000, tier: 'medium' },
    { name: 'openai/gpt-oss-20b', rpm: 30, tpm: 8000, tier: 'medium' },
    { name: 'allam-2-7b', rpm: 30, tpm: 6000, tier: 'medium' },
    { name: 'gemma2-9b-it', rpm: 30, tpm: 15000, tier: 'medium' },
    { name: 'llama3-70b-8192', rpm: 30, tpm: 6000, tier: 'medium' },
    { name: 'llama3-8b-8192', rpm: 30, tpm: 6000, tier: 'medium' },
    { name: 'meta-llama/llama-guard-4-12b', rpm: 30, tpm: 15000, tier: 'medium' },
    
    // Modelos de backup com limite de 15 RPM (Free tier)
    { name: 'compound-beta', rpm: 15, tpm: 70000, tier: 'low' },
    { name: 'compound-beta-mini', rpm: 15, tpm: 70000, tier: 'low' },
  ];
  
  // Filtrar modelos que falharam
  const availableModels = allModels.filter(model => !failedModels.includes(model.name));
  
  if (availableModels.length === 0) {
    console.log(`⚠️ Todos os modelos falharam, retornando ao padrão`);
    return 'llama-3.1-8b-instant';
  }
  
  // Seleção inteligente baseada na complexidade
  let selectedModels: typeof allModels = [];
  
  if (messageLength > 500 || historyLength > 10) {
    // Consultas complexas -> modelos de alta performance (60 RPM)
    selectedModels = availableModels.filter(m => m.tier === 'high' && m.rpm >= 60);
  } else if (messageLength > 200 || historyLength > 5) {
    // Complexidade média -> modelos balanceados (30 RPM)
    selectedModels = availableModels.filter(m => m.tier === 'medium' || (m.tier === 'high' && m.rpm >= 30));
  } else {
    // Consultas simples -> qualquer modelo disponível, priorizando alta performance
    selectedModels = availableModels.filter(m => m.tier === 'high');
    if (selectedModels.length === 0) {
      selectedModels = availableModels;
    }
  }
  
  if (selectedModels.length === 0) {
    selectedModels = availableModels;
  }
  
  // Seleção aleatória dentro da categoria apropriada
  const selected = selectedModels[Math.floor(Math.random() * selectedModels.length)];
  
  console.log(`🎯 Modelo selecionado: ${selected.name} (${selected.rpm} RPM, ${selected.tpm} TPM, tier: ${selected.tier})`);
  console.log(`📊 Contexto: ${messageLength} chars, ${historyLength} msgs histórico, ${failedModels.length} modelos falharam`);
  
  return selected.name;
};

// Processes the AI response (text or audio)
const processResponse = async (
  responseText: string,
  wbot: Session,
  msg: proto.IWebMessageInfo,
  ticket: Ticket,
  contact: Contact,
  openAiSettings: IOpenAi,
  ticketTraking: TicketTraking
): Promise<void> => {
  let response = responseText;

  // Check for transfer action trigger
  if (response?.toLowerCase().includes("ação: transferir para o setor de atendimento")) {
    await transferQueue(openAiSettings.queueId, ticket, contact);
    response = response.replace(/ação: transferir para o setor de atendimento/i, "").trim();
  }

  const publicFolder: string = path.resolve(__dirname, "..", "..", "..", "public", `company${ticket.companyId}`);

  // Send response based on preferred format (text or voice)
  if (openAiSettings.voice === "texto") {
    const sentMessage = await wbot.sendMessage(msg.key.remoteJid!, {
      text: `\u200e ${response}`,
    });
    await verifyMessage(sentMessage!, ticket, contact);
  } else {
    const fileNameWithOutExtension = `${ticket.id}_${Date.now()}`;
    try {
      await convertTextToSpeechAndSaveToFile(
        keepOnlySpecifiedChars(response),
        `${publicFolder}/${fileNameWithOutExtension}`,
        openAiSettings.voiceKey,
        openAiSettings.voiceRegion,
        openAiSettings.voice,
        "mp3"
      );
      const sendMessage = await wbot.sendMessage(msg.key.remoteJid!, {
        audio: { url: `${publicFolder}/${fileNameWithOutExtension}.mp3` },
        mimetype: "audio/mpeg",
        ptt: true,
      });
      await verifyMediaMessage(sendMessage!, ticket, contact, ticketTraking, false, false, wbot);
      deleteFileSync(`${publicFolder}/${fileNameWithOutExtension}.mp3`);
      deleteFileSync(`${publicFolder}/${fileNameWithOutExtension}.wav`);
    } catch (error) {
      console.error(`Erro para responder com audio: ${error}`);
      // Fallback to text response
      const sentMessage = await wbot.sendMessage(msg.key.remoteJid!, {
        text: `\u200e ${response}`,
      });
      await verifyMessage(sentMessage!, ticket, contact);
    }
  }
};

// Handles OpenAI request
const handleOpenAIRequest = async (openai: SessionOpenAi, messagesAI: any[], openAiSettings: IOpenAi): Promise<string> => {
  const startTime = Date.now();
  
  try {
    const result = await executeWithRetries(
      async () => {
        return await withProviderConcurrency('openai', async () => {
          const chat = await openai.chat.completions.create({
            model: openAiSettings.model,
            messages: messagesAI,
            max_tokens: openAiSettings.maxTokens,
            temperature: openAiSettings.temperature,
          });
          return chat.choices[0].message?.content || "";
        });
      },
      { providerKey: `openai:${openAiSettings.model}` }
    );
    
    const responseTime = Date.now() - startTime;
    updateStats('openai', true, responseTime);
    
    return result;
  } catch (error) {
    const responseTime = Date.now() - startTime;
    updateStats('openai', false, responseTime);
    throw error;
  }
};

// Handles Groq request using AI SDK with intelligent model rotation
const handleGroqRequest = async (
  apiKey: string,
  messagesAI: any[],
  openAiSettings: IOpenAi,
  bodyMessage: string,
  promptSystem: string,
  ticketId: number
): Promise<string> => {
  const startTime = Date.now();
  let selectedModel = "";
  let failedModels: string[] = [];
  let maxRetries = 3;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await executeWithRetries(
        async () => {
          return await withProviderConcurrency('groq', async () => {
            // Seleção inteligente de modelo baseada na complexidade e falhas anteriores
            const messageLength = bodyMessage.length;
            const historyLength = messagesAI.length;
            selectedModel = getAvailableGroqModel(messageLength, historyLength, failedModels);
            
            console.log(`🚀 Groq AI SDK Request - Ticket: ${ticketId}, Model: ${selectedModel} (tentativa ${attempt}/${maxRetries})`);
            
            // Use AI SDK for generation with API key from prompt
            process.env.GROQ_API_KEY = apiKey;
            
            // Prepare conversation context
            let conversationContext = promptSystem + "\n\n";
            messagesAI.forEach(msg => {
              if (msg.role === "user") {
                conversationContext += `Usuário: ${msg.content}\n`;
              } else if (msg.role === "assistant") {
                conversationContext += `Assistente: ${msg.content}\n`;
              }
            });
            conversationContext += `Usuário: ${bodyMessage}\n\nAssistente:`;
            
            const { text } = await generateText({
              model: groq(selectedModel),
              prompt: conversationContext,
              temperature: openAiSettings.temperature || 0.7,
            });

            console.log(`✅ Groq AI SDK Response Success - Ticket: ${ticketId}, Model: ${selectedModel}`);
            
            return text;
          });
        },
        { providerKey: `groq:${selectedModel}` }
      );
      
      const responseTime = Date.now() - startTime;
      updateStats('groq', true, responseTime);
      
      return result;
      
    } catch (error: any) {
      console.error(`❌ Groq AI SDK Error - Ticket: ${ticketId}, Model: ${selectedModel}, Attempt: ${attempt}:`, {
        message: error.message,
        cause: error.cause
      });
      
      // Adicionar modelo que falhou à lista de falhas
      if (selectedModel && !failedModels.includes(selectedModel)) {
        failedModels.push(selectedModel);
        console.log(`🚫 Modelo ${selectedModel} adicionado à lista de falhas. Total falharam: ${failedModels.length}`);
      }
      
      // Se ainda há tentativas, continua o loop
      if (attempt < maxRetries) {
        console.log(`🔄 Tentando novamente com modelo diferente... (${attempt + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt)); // Backoff incremental
        continue;
      }
      
      // Última tentativa falhou
      const responseTime = Date.now() - startTime;
      updateStats('groq', false, responseTime);
      
      // Re-throw with enhanced error information
      if (error.message?.includes('API key') || error.message?.includes('authentication')) {
        throw new Error(`API key inválida para Groq: ${error.message}`);
      } else if (error.message?.includes('rate limit') || error.message?.includes('429')) {
        throw new Error(`Rate limit excedido para todos os modelos Groq testados (${failedModels.join(', ')}). Tente novamente em alguns segundos.`);
      } else if (error.message?.includes('quota') || error.message?.includes('billing')) {
        throw new Error('Cota do Groq excedida. Verifique sua conta.');
      }
      
      throw new Error(`Falha em todos os modelos Groq após ${maxRetries} tentativas: ${error.message}`);
    }
  }
  
  // Nunca deveria chegar aqui, mas por garantia
  throw new Error('Erro inesperado no sistema de rotação de modelos Groq');
};// Main function to handle AI interactions
export const handleOpenAi = async (
  openAiSettings: IOpenAi,
  msg: proto.IWebMessageInfo,
  wbot: Session,
  ticket: Ticket,
  contact: Contact,
  mediaSent: Message | undefined,
  ticketTraking: TicketTraking
): Promise<void> => {
  // Log inicial para debugging
  console.log(`🎫 Iniciando handleOpenAi - Ticket: ${ticket.id}, Company: ${ticket.companyId}, Modelo: ${openAiSettings.model}`);
  console.log(`🔍 DEBUG - Queue ID: ${ticket.queueId}, Prompt ID: ${(openAiSettings as any).id || 'N/A'}`);
  console.log(`🔑 DEBUG - API Key source: ${openAiSettings.apiKey ? `presente (${openAiSettings.apiKey.slice(0,10)}...)` : 'ausente'}`);
  
  if (contact.disableBot) {
    console.log(`🤖 Bot desabilitado para contato ${contact.id}`);
    return;
  }

  const bodyMessage = getBodyMessage(msg);
  if (!bodyMessage && !msg.message?.audioMessage) {
    console.log(`📝 Sem mensagem de texto ou áudio para processar`);
    return;
  }

  if (!openAiSettings) {
    console.log(`⚙️ Configurações do OpenAI não encontradas`);
    return;
  }

  if (msg.messageStubType) {
    console.log(`📌 Ignorando message stub type`);
    return;
  }

  // VERIFICAÇÃO CRÍTICA: Se não tem queueId, de onde vem a API key?
  if (!ticket.queueId) {
    console.warn(`⚠️ ALERTA: Ticket ${ticket.id} sem queueId! API Key vinda de openAiSettings direto.`);
    console.log(`🔍 openAiSettings completo:`, JSON.stringify({
      name: openAiSettings.name,
      model: openAiSettings.model,
      queueId: openAiSettings.queueId,
      apiKey: openAiSettings.apiKey ? `${openAiSettings.apiKey.slice(0,4)}...${openAiSettings.apiKey.slice(-4)}` : 'null',
      openAiApiKey: openAiSettings.openAiApiKey ? `${openAiSettings.openAiApiKey.slice(0,4)}...${openAiSettings.openAiApiKey.slice(-4)}` : 'null'
    }, null, 2));
  }

  const publicFolder: string = path.resolve(__dirname, "..", "..", "..", "public", `company${ticket.companyId}`);

  // Detecção inteligente do modelo
  const isOpenAIModel = [
    "gpt-3.5-turbo-1106", "gpt-4o", "gpt-4", "gpt-3.5-turbo", 
    "gpt-4-turbo", "gpt-4o-mini"
  ].includes(openAiSettings.model);
  
  // Sistema de rotação inteligente quando GROQ é selecionado
  const isGroqModel = openAiSettings.model === 'GROQ';

  console.log(`🤖 Provider: ${isGroqModel ? 'GROQ (Rotação Inteligente)' : isOpenAIModel ? 'OpenAI' : 'Modelo Customizado'} | Ticket: ${ticket.id}`);

  if (!isGroqModel && !isOpenAIModel) {
    console.error(`❌ Modelo não suportado: ${openAiSettings.model}`);
    const errorMsg = `Modelo "${openAiSettings.model}" não é suportado. Use GROQ (rotação inteligente) ou modelos OpenAI (gpt-3.5-turbo-1106, gpt-4o).`;
    const sentMessage = await wbot.sendMessage(msg.key.remoteJid!, {
      text: `⚙️ ${errorMsg}`,
    });
    await verifyMessage(sentMessage!, ticket, contact);
    return;
  }

  let openai: SessionOpenAi | null = null;
  let groq: SessionGroq | null = null;

  // Initialize OpenAI provider se selecionado
  if (isOpenAIModel) {
    const openaiIndex = sessionsOpenAi.findIndex(s => s.id === ticket.id);
    if (openaiIndex === -1) {
      openai = new OpenAI({
        apiKey: openAiSettings.openAiApiKey || openAiSettings.apiKey,
      });
      openai.id = ticket.id;
      sessionsOpenAi.push(openai);
      console.log(`🔑 Nova sessão OpenAI criada para ticket ${ticket.id}`);
    } else {
      openai = sessionsOpenAi[openaiIndex];
      console.log(`♻️ Reutilizando sessão OpenAI existente para ticket ${ticket.id}`);
    }
  }

  // Initialize Groq provider se selecionado (sistema de rotação inteligente)
  if (isGroqModel) {
    const groqIndex = sessionsGroq.findIndex(s => s.id === ticket.id);
    if (groqIndex === -1) {
      try {
        const apiKey = openAiSettings.apiKey;
        if (!apiKey || !apiKey.startsWith('gsk_')) {
          const errorMessage = await wbot.sendMessage(msg.key.remoteJid!, {
            text: "🔧 Chave API do Groq inválida. Deve começar com 'gsk_'. Verifique a configuração.",
          });
          await verifyMessage(errorMessage!, ticket, contact);
          return;
        }
        groq = { 
          id: ticket.id, 
          apiKey,
          model: "GROQ"
        } as SessionGroq;
        sessionsGroq.push(groq);
      } catch (error: any) {
        const errorMessage = await wbot.sendMessage(msg.key.remoteJid!, {
          text: "🔧 Erro na validação da chave API do Groq. Verifique se a chave está correta e ativa.",
        });
        await verifyMessage(errorMessage!, ticket, contact);
        return;
      }
    } else {
      groq = sessionsGroq[groqIndex];
    }
  }
  const messages = await Message.findAll({
    where: { ticketId: ticket.id },
    order: [["createdAt", "ASC"]],
    limit: openAiSettings.maxMessages,
  });

  // Format system prompt
  const clientName = sanitizeName(contact.name || "Amigo(a)");
  const promptSystem = `Instruções do Sistema:
  - Use o nome ${clientName} nas respostas para que o cliente se sinta mais próximo e acolhido.
  - Certifique-se de que a resposta tenha até ${openAiSettings.maxTokens} tokens e termine de forma completa, sem cortes.
  - Sempre que der, inclua o nome do cliente para tornar o atendimento mais pessoal e gentil. se não souber o nome pergunte
  - Se for preciso transferir para outro setor, comece a resposta com 'Ação: Transferir para o setor de atendimento'.
  
  Prompt Específico:
  ${openAiSettings.prompt}
  
  Siga essas instruções com cuidado para garantir um atendimento claro e amigável em todas as respostas.`;

  // Handle text message
  if (msg.message?.conversation || msg.message?.extendedTextMessage?.text) {
    const messagesAI = prepareMessagesAI(messages, isGroqModel, promptSystem);

    try {
      let responseText: string | null = null;

      // Modo teste - sempre usar Groq
      if (groq) {
        responseText = await handleGroqRequest(openAiSettings.apiKey, messagesAI, openAiSettings, bodyMessage!, promptSystem, ticket.id);
      }

      if (!responseText) {
        console.error("No response from AI provider");
        return;
      }

      await processResponse(responseText, wbot, msg, ticket, contact, openAiSettings, ticketTraking);
    } catch (error: any) {
      console.error(`❌ AI request failed para ticket ${ticket.id}:`, error);
      
      // Enhanced error handling com informações específicas dos providers
      let errorMessage = "Desculpe, estou com dificuldades técnicas para processar sua solicitação no momento.";
      
      // Tratamento específico para erro de API key inválida
      if (error?.status === 400 && (error?.message?.includes('API key not valid') || error?.errorDetails?.some((detail: any) => detail.reason === 'API_KEY_INVALID'))) {
        console.error(`🔑 ERRO CRÍTICO: API Key inválida para ${openAiSettings.model}`);
        console.error(`🔍 Debugging: Ticket ${ticket.id}, Queue ${ticket.queueId}, Company ${ticket.companyId}`);
        console.error(`🔍 API Key usada: ${openAiSettings.apiKey ? `${openAiSettings.apiKey.slice(0,10)}...${openAiSettings.apiKey.slice(-4)}` : 'null'}`);
        
        errorMessage = "🔑 A chave API da IA está inválida ou expirada. Nossa equipe técnica foi notificada para corrigir o problema.";
      }
      else if (error?.status === 429 || error?.response?.status === 429 || error?.message?.includes('rate') || error?.message?.includes('quota')) {
        // Mensagem específica baseada no provider
        if (openAiSettings.model.includes('groq')) {
          errorMessage = "⏳ Limite do Groq atingido. O sistema aguardará alguns segundos automaticamente. Sua mensagem será processada em breve.";
        } else {
          errorMessage = "⏳ Muitas conversas simultâneas no OpenAI. Aguarde alguns segundos e sua mensagem será processada.";
        }
      } else if (error?.status === 401 || error?.response?.status === 401) {
        errorMessage = "🔧 Problema na chave de API da IA. Nossa equipe técnica foi notificada automaticamente.";
      } else if (error?.status >= 500 || error?.response?.status >= 500) {
        const provider = openAiSettings.model.includes('groq') ? 'Groq' : 'OpenAI';
        errorMessage = `🌐 O serviço ${provider} está com instabilidade temporária. Tentaremos novamente automaticamente.`;
      } else if (error?.message?.includes('queue overflow') || error?.message?.includes('sobrecarregado')) {
        errorMessage = "🚦 Sistema com alta demanda no momento. Sua mensagem será processada nos próximos segundos, aguarde.";
      } else if (error?.message?.includes('timeout')) {
        errorMessage = "⏱️ Tempo limite excedido devido ao volume de conversas. Reprocessando automaticamente...";
      } else if (error?.message?.includes('RESOURCE_EXHAUSTED')) {
        errorMessage = "📊 Recursos do Groq temporariamente esgotados. O sistema aguardará e tentará novamente.";
      }
      
      console.log(`📤 Enviando erro específico para ticket ${ticket.id} (${openAiSettings.model}): ${errorMessage}`);
      
      const sentMessage = await wbot.sendMessage(msg.key.remoteJid!, {
        text: errorMessage,
      });
      await verifyMessage(sentMessage!, ticket, contact);
    }
  }
  // Handle audio message
  else if (msg.message?.audioMessage && mediaSent) {
    const messagesAI = prepareMessagesAI(messages, isGroqModel, promptSystem);

    try {
      const mediaUrl = mediaSent.mediaUrl!.split("/").pop();
      const audioFilePath = `${publicFolder}/${mediaUrl}`;

      if (!fs.existsSync(audioFilePath)) {
        console.error(`Arquivo de áudio não encontrado: ${audioFilePath}`);
        const sentMessage = await wbot.sendMessage(msg.key.remoteJid!, {
          text: "Desculpe, não foi possível processar seu áudio. Por favor, tente novamente.",
        });
        await verifyMessage(sentMessage!, ticket, contact);
        return;
      }

      let transcription: string | null = null;

      if (isOpenAIModel && openai) {
        const file = fs.createReadStream(audioFilePath) as any;
        const transcriptionResult = await executeWithRetries(
          async () => {
            return await withProviderConcurrency('openai', async () => {
              return await openai.audio.transcriptions.create({
                model: "whisper-1",
                file: file,
              });
            });
          },
          { providerKey: 'openai:whisper-1' }
        );
        transcription = transcriptionResult.text;

        messagesAI.push({ role: "user", content: transcription });
        const responseText = await handleOpenAIRequest(openai, messagesAI, openAiSettings);
        if (responseText) {
          await processResponse(responseText, wbot, msg, ticket, contact, openAiSettings, ticketTraking);
        }
      } else if (isGroqModel && groq) {
        // Transcrição de áudio com Groq Whisper
        try {
          console.log(`🎤 Iniciando transcrição de áudio com Groq Whisper para ticket ${ticket.id}`);
          
          // Usar a API do Groq para transcrição
          const Groq = require("groq-sdk");
          const groqClient = new Groq({
            apiKey: openAiSettings.apiKey
          });
          
          const file = fs.createReadStream(audioFilePath) as any;
          const transcriptionResult = await groqClient.audio.transcriptions.create({
            file: file,
            model: "whisper-large-v3-turbo", // Modelo mais rápido do Groq
            language: "pt", // Português
            response_format: "json",
            temperature: 0.0,
          });
          
          transcription = transcriptionResult.text;
          console.log(`✅ Transcrição Groq concluída para ticket ${ticket.id}: ${transcription?.slice(0, 100)}...`);

          messagesAI.push({ role: "user", content: transcription });
          const responseText = await handleGroqRequest(
            openAiSettings.apiKey,
            messagesAI,
            openAiSettings,
            transcription,
            promptSystem,
            ticket.id
          );
          if (responseText) {
            await processResponse(responseText, wbot, msg, ticket, contact, openAiSettings, ticketTraking);
          }
        } catch (groqAudioError: any) {
          console.error(`❌ Erro na transcrição Groq para ticket ${ticket.id}:`, groqAudioError);
          const sentMessage = await wbot.sendMessage(msg.key.remoteJid!, {
            text: "🎤 Erro ao processar áudio com Groq. Tente enviar uma mensagem de texto ou verifique se o áudio é claro.",
          });
          await verifyMessage(sentMessage!, ticket, contact);
        }
      }

      if (!transcription) {
        console.warn("Transcrição vazia recebida");
        const sentMessage = await wbot.sendMessage(msg.key.remoteJid!, {
          text: "Desculpe, não consegui entender o áudio. Por favor, tente novamente ou envie uma mensagem de texto.",
        });
        await verifyMessage(sentMessage!, ticket, contact);
      }
    } catch (error: any) {
      console.error("Erro no processamento de áudio:", error);
      
      // Enhanced error handling for audio processing
      let errorMessage = "Desculpe, houve um erro ao processar sua mensagem de áudio.";
      
      if (error?.status === 429 || error?.response?.status === 429) {
        errorMessage = "Sistema sobrecarregado com processamento de áudio. Aguarde alguns segundos e tente novamente.";
      } else if (error?.status === 401 || error?.response?.status === 401) {
        errorMessage = "Problema de configuração no processamento de áudio. Entre em contato com o suporte.";
      } else if (error?.message?.includes('queue overflow')) {
        errorMessage = "Muitas solicitações de áudio. Aguarde um momento e tente novamente.";
      } else {
        errorMessage = "Não foi possível processar o áudio. Tente enviar uma mensagem de texto.";
      }
      
      const sentMessage = await wbot.sendMessage(msg.key.remoteJid!, {
        text: errorMessage,
      });
      await verifyMessage(sentMessage!, ticket, contact);
    }
  }
};

export default handleOpenAi;