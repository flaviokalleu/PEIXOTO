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
import Ticket from "../../models/Ticket";
import Contact from "../../models/Contact";
import Message from "../../models/Message";
import TicketTraking from "../../models/TicketTraking";
import Prompt from "../../models/Prompt";
import { apiKeyMonitor } from "../../utils/ApiKeyMonitor";

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

interface SessionGemini {
  id?: number;
  apiKey: string;
}

// Cache for AI sessions
const sessionsOpenAi: SessionOpenAi[] = [];
// Gemini sessions now just hold apiKey (no external SDK)
const sessionsGemini: SessionGemini[] = [];

// Outgoing message dedupe / loop prevention
interface ProcessedMsgMeta { ts: number; }
const processedMessageIds: Map<string, ProcessedMsgMeta> = new Map();
const PROCESSED_TTL_MS = 10 * 60 * 1000; // 10 min
const CLEAN_INTERVAL_MS = 60 * 1000; // 1 min
let lastCleanProcessed = 0;

// Anti-loop per ticket state
interface LastUserEntry { text: string; ts: number; }
interface LastAiEntry { hash: string; ts: number; raw: string; }
const lastUserMessage: Map<number, LastUserEntry> = new Map();
const lastAiResponse: Map<number, LastAiEntry> = new Map();
const USER_REPEAT_WINDOW_MS = 45 * 1000; // 45s window to ignore identical user prompts
const AI_DUPLICATE_WINDOW_MS = 5 * 60 * 1000; // 5 min for greeting suppression

const normalize = (t: string) => t.trim().toLowerCase().replace(/\s+/g,' ');
const hashText = (t: string) => require('crypto').createHash('md5').update(normalize(t)).digest('hex');

const isLoopMessage = (msg: proto.IWebMessageInfo): boolean => {
  // Ignore messages sent by the bot itself
  if (msg?.key?.fromMe) return true;
  const body = (msg.message?.conversation || msg.message?.extendedTextMessage?.text || '').toLowerCase();
  // Ignore if empty
  if (!body) return true;
  // Ignore if it's clearly an AI self-introduction we produced previously (safeguard)
  if (body.startsWith('assistente virtual:') || body.includes('sou o galpãobot')) return true;
  return false;
};

const trackProcessedMessage = (id?: string) => {
  if (!id) return;
  processedMessageIds.set(id, { ts: Date.now() });
  const now = Date.now();
  if (now - lastCleanProcessed > CLEAN_INTERVAL_MS) {
    lastCleanProcessed = now;
    for (const [mid, meta] of processedMessageIds.entries()) {
      if (now - meta.ts > PROCESSED_TTL_MS) processedMessageIds.delete(mid);
    }
  }
};

const alreadyProcessed = (id?: string) => {
  if (!id) return false;
  return processedMessageIds.has(id);
};

// Simple in-memory rate limiter (token bucket) per provider/model
interface RateLimiterState {
  tokens: number;
  lastRefill: number;
}

const rateLimiters: Record<string, RateLimiterState> = {};

const RATE_LIMIT_TOKENS = 5; // allow bursts
const RATE_LIMIT_INTERVAL_MS = 1000; // per second refill

const acquireRateLimit = (key: string): number => {
  const now = Date.now();
  if (!rateLimiters[key]) {
    rateLimiters[key] = { tokens: RATE_LIMIT_TOKENS, lastRefill: now };
  }
  const state = rateLimiters[key];
  const elapsed = now - state.lastRefill;
  if (elapsed >= RATE_LIMIT_INTERVAL_MS) {
    const refillCount = Math.floor(elapsed / RATE_LIMIT_INTERVAL_MS);
    state.tokens = Math.min(RATE_LIMIT_TOKENS, state.tokens + refillCount * RATE_LIMIT_TOKENS);
    state.lastRefill = now;
  }
  if (state.tokens > 0) {
    state.tokens -= 1;
    return 0; // no delay
  }
  // compute delay until next refill
  return RATE_LIMIT_INTERVAL_MS - (now - state.lastRefill);
};

// Exponential backoff with jitter
const wait = (ms: number) => new Promise(res => setTimeout(res, ms));

const executeWithRetries = async <T>(
  fn: () => Promise<T>,
  options: { attempts?: number; baseDelayMs?: number; maxDelayMs?: number; providerKey: string }
): Promise<T> => {
  const { attempts = 5, baseDelayMs = 500, maxDelayMs = 8000, providerKey } = options;
  let lastErr: any;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const rateDelay = acquireRateLimit(providerKey);
    if (rateDelay > 0) {
      await wait(rateDelay);
    }
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;
      const status = err?.status || err?.response?.status;
      const isRetryable = [429, 408, 409, 500, 502, 503, 504].includes(status) ||
        /timeout|ETIMEDOUT|ECONNRESET|EAI_AGAIN/i.test(err?.message || "");
      if (!isRetryable || attempt === attempts) {
        break;
      }
      const backoff = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, attempt - 1));
      // Full jitter (AWS strategy)
      const jitter = Math.random() * backoff;
      await wait(jitter);
    }
  }
  throw lastErr;
};

// Global provider concurrency control
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
  openai: { max: 3, current: 0, queue: [] },
  gemini: { max: 3, current: 0, queue: [] }
};

const PROVIDER_MAX_QUEUE = 200; // generous queue
const PROVIDER_QUEUE_TIMEOUT_MS = 15000; // wait up to 15s

const processProviderQueue = (provider: string) => {
  const state = providerConcurrency[provider];
  while (state.current < state.max && state.queue.length > 0) {
    const item = state.queue.shift();
    if (!item) break;
    state.current += 1;
    item.resolve();
  }
};

const withProviderConcurrency = async <T>(provider: 'openai' | 'gemini', fn: () => Promise<T>): Promise<T> => {
  const state = providerConcurrency[provider];
  if (!state) return fn();

  const canRunImmediately = state.current < state.max;
  if (canRunImmediately) {
    state.current += 1;
  } else {
    if (state.queue.length >= PROVIDER_MAX_QUEUE) {
      throw new Error('High load: queue overflow');
    }
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        const idx = state.queue.findIndex(q => q.resolve === resolve);
        if (idx > -1) state.queue.splice(idx, 1);
        reject(new Error('High load: wait timeout'));
      }, PROVIDER_QUEUE_TIMEOUT_MS);
      state.queue.push({
        resolve: () => {
          clearTimeout(timeout);
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
    const res = await fn();
    return res;
  } finally {
    state.current -= 1;
    if (state.current < 0) state.current = 0;
    processProviderQueue(provider);
  }
};

// Per-ticket in-flight dedupe
interface TicketProcessingInfo { startedAt: number; lastNotifyAt: number; }
const ticketsProcessing: Map<number, TicketProcessingInfo> = new Map();
const DEDUPE_WINDOW_MS = 3000; // 3s window to avoid parallel same-ticket calls
const NOTIFY_COOLDOWN_MS = 10000; // only notify user about processing every 10s

// Circuit breaker per provider+model
interface CircuitState {
  state: 'closed' | 'open' | 'half-open';
  failureCount: number;
  nextAttemptAt: number;
  cooldownMs: number;
}
const circuitBreakers: Record<string, CircuitState> = {};
const CB_FAILURE_THRESHOLD = 5;
const CB_BASE_COOLDOWN = 15000; // 15s
const CB_MAX_COOLDOWN = 120000; // 2m

const withCircuitBreaker = async <T>(key: string, fn: () => Promise<T>): Promise<T> => {
  const now = Date.now();
  let state = circuitBreakers[key];
  if (!state) {
    state = circuitBreakers[key] = { state: 'closed', failureCount: 0, nextAttemptAt: 0, cooldownMs: CB_BASE_COOLDOWN };
  }
  if (state.state === 'open') {
    if (now < state.nextAttemptAt) {
      throw new Error('CircuitOpen');
    } else {
      state.state = 'half-open';
    }
  }
  try {
    const res = await fn();
    // success -> reset
    state.state = 'closed';
    state.failureCount = 0;
    state.cooldownMs = CB_BASE_COOLDOWN;
    return res;
  } catch (err: any) {
    const status = err?.status || err?.response?.status;
    const retryable = [429, 408, 409, 500, 502, 503, 504].includes(status) || /timeout|ECONNRESET|EAI_AGAIN/i.test(err?.message || '');
    if (retryable) {
      state.failureCount += 1;
      if (state.failureCount >= CB_FAILURE_THRESHOLD || state.state === 'half-open') {
        state.state = 'open';
        state.nextAttemptAt = now + state.cooldownMs;
        state.cooldownMs = Math.min(CB_MAX_COOLDOWN, Math.round(state.cooldownMs * 1.5));
      }
    } else {
      // non-retryable -> reset breaker
      state.state = 'closed';
      state.failureCount = 0;
    }
    throw err;
  }
};

// Simple in-memory summaries to reduce context size
const conversationSummaries: Map<number, string> = new Map();
const SUMMARY_THRESHOLD = 30; // number of stored messages before summarizing
const SUMMARY_MAX_LENGTH = 1200; // chars

const buildSummary = (messages: Message[]): string => {
  const parts: string[] = [];
  let userCount = 0;
  let assistantCount = 0;
  for (const m of messages) {
    if (!m.body) continue;
    if (m.fromMe && assistantCount < 10) {
      assistantCount++; parts.push(`A:${m.body.slice(0,120)}`);
    }
    if (!m.fromMe && userCount < 10) {
      userCount++; parts.push(`U:${m.body.slice(0,120)}`);
    }
    if (assistantCount >= 10 && userCount >= 10) break;
  }
  let summary = parts.join(' | ');
  if (summary.length > SUMMARY_MAX_LENGTH) summary = summary.slice(0, SUMMARY_MAX_LENGTH) + '…';
  return `Resumo anterior: ${summary}`;
};

// Approx token estimation (rough chars/4)
const estimateTokens = (messages: any[]): number => {
  let chars = 0;
  for (const m of messages) {
    if (typeof m.content === 'string') chars += m.content.length;
    else if (Array.isArray(m.parts)) {
      for (const p of m.parts) { if (p.text) chars += p.text.length; }
    }
  }
  return Math.ceil(chars / 4);
};

const adjustMaxTokens = (baseMax: number, messagesAI: any[], hardLimit: number = 16000): number => {
  const used = estimateTokens(messagesAI);
  const remaining = hardLimit - used;
  if (remaining <= 500) return Math.max(128, Math.min(baseMax, remaining));
  return Math.min(baseMax, remaining);
};

// Response cache for frequently asked questions
interface CacheEntry {
  response: string;
  timestamp: number;
  hitCount: number;
}
const responseCache: Map<string, CacheEntry> = new Map();
const CACHE_TTL_MS = 300000; // 5 minutes
const CACHE_MAX_SIZE = 1000;

const getCacheKey = (prompt: string, lastMessage: string): string => {
  const normalized = lastMessage.toLowerCase().trim().replace(/[^\w\s]/g, '');
  return `${prompt.slice(0, 100)}:${normalized.slice(0, 200)}`;
};

const getCachedResponse = (key: string): string | null => {
  const entry = responseCache.get(key);
  if (!entry) return null;
  
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    responseCache.delete(key);
    return null;
  }
  
  entry.hitCount++;
  return entry.response;
};

const setCachedResponse = (key: string, response: string): void => {
  if (responseCache.size >= CACHE_MAX_SIZE) {
    // LRU eviction - remove oldest entry
    const oldestKey = Array.from(responseCache.keys())[0];
    responseCache.delete(oldestKey);
  }
  
  responseCache.set(key, {
    response,
    timestamp: Date.now(),
    hitCount: 1
  });
};

// Health monitoring
interface HealthMetrics {
  requests: number;
  successes: number;
  failures: number;
  avgLatency: number;
  circuitBreakerState: Record<string, string>;
  queueSizes: Record<string, number>;
  lastUpdate: number;
}

let healthMetrics: HealthMetrics = {
  requests: 0,
  successes: 0,
  failures: 0,
  avgLatency: 0,
  circuitBreakerState: {},
  queueSizes: {},
  lastUpdate: Date.now()
};

const updateHealthMetrics = (success: boolean, latency: number) => {
  healthMetrics.requests++;
  if (success) {
    healthMetrics.successes++;
  } else {
    healthMetrics.failures++;
  }
  
  // Simple running average
  const alpha = 0.1;
  healthMetrics.avgLatency = alpha * latency + (1 - alpha) * healthMetrics.avgLatency;
  healthMetrics.lastUpdate = Date.now();
  
  // Update circuit breaker states
  for (const [key, state] of Object.entries(circuitBreakers)) {
    healthMetrics.circuitBreakerState[key] = state.state;
  }
  
  // Update queue sizes
  for (const [provider, state] of Object.entries(providerConcurrency)) {
    healthMetrics.queueSizes[provider] = state.queue.length;
  }
};

// Input validation and sanitization
const validateAndSanitizeInput = (input: string): { isValid: boolean; sanitized: string; reason?: string } => {
  if (!input || typeof input !== 'string') {
    return { isValid: false, sanitized: '', reason: 'Empty or invalid input' };
  }
  
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return { isValid: false, sanitized: '', reason: 'Empty message' };
  }
  
  if (trimmed.length > 4000) {
    return { isValid: false, sanitized: '', reason: 'Message too long' };
  }
  
  // Remove potentially harmful patterns
  const sanitized = trimmed
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Control characters
    .replace(/javascript:/gi, '') // XSS prevention
    .replace(/<script[^>]*>.*?<\/script>/gi, '') // Script tags
    .slice(0, 4000);
  
  // Check for spam patterns
  const spamPatterns = [
    /(.)\1{10,}/, // Repeated characters
    /^[A-Z\s!]{20,}$/, // All caps
    /(\b\w+\b.*?){5,}\1/ // Repeated words
  ];
  
  for (const pattern of spamPatterns) {
    if (pattern.test(sanitized)) {
      return { isValid: false, sanitized: '', reason: 'Spam detected' };
    }
  }
  
  return { isValid: true, sanitized };
};

// Alert system for critical issues
interface AlertConfig {
  errorRateThreshold: number;
  latencyThreshold: number;
  queueSizeThreshold: number;
  lastAlertTime: Record<string, number>;
  cooldownMs: number;
}

const alertConfig: AlertConfig = {
  errorRateThreshold: 0.5, // 50% error rate
  latencyThreshold: 10000, // 10s latency
  queueSizeThreshold: 50, // 50 items in queue
  lastAlertTime: {},
  cooldownMs: 300000 // 5 minute cooldown
};

const checkAndSendAlerts = () => {
  const now = Date.now();
  const errorRate = healthMetrics.requests > 0 ? healthMetrics.failures / healthMetrics.requests : 0;
  
  // High error rate alert
  if (errorRate > alertConfig.errorRateThreshold && healthMetrics.requests >= 10) {
    const alertKey = 'high_error_rate';
    if (!alertConfig.lastAlertTime[alertKey] || (now - alertConfig.lastAlertTime[alertKey]) > alertConfig.cooldownMs) {
      console.error(`🚨 ALERT: High error rate detected: ${(errorRate * 100).toFixed(1)}% (${healthMetrics.failures}/${healthMetrics.requests})`);
      alertConfig.lastAlertTime[alertKey] = now;
    }
  }
  
  // High latency alert
  if (healthMetrics.avgLatency > alertConfig.latencyThreshold) {
    const alertKey = 'high_latency';
    if (!alertConfig.lastAlertTime[alertKey] || (now - alertConfig.lastAlertTime[alertKey]) > alertConfig.cooldownMs) {
      console.error(`🚨 ALERT: High latency detected: ${healthMetrics.avgLatency.toFixed(0)}ms`);
      alertConfig.lastAlertTime[alertKey] = now;
    }
  }
  
  // High queue size alert
  for (const [provider, queueSize] of Object.entries(healthMetrics.queueSizes)) {
    if (queueSize > alertConfig.queueSizeThreshold) {
      const alertKey = `high_queue_${provider}`;
      if (!alertConfig.lastAlertTime[alertKey] || (now - alertConfig.lastAlertTime[alertKey]) > alertConfig.cooldownMs) {
        console.error(`🚨 ALERT: High queue size for ${provider}: ${queueSize} items`);
        alertConfig.lastAlertTime[alertKey] = now;
      }
    }
  }
};

// Graceful degradation responses
const getDegradedResponse = (reason: string): string => {
  const responses = {
    'high_load': 'Estamos com um volume alto de mensagens no momento. Sua solicitação está sendo processada, mas pode demorar um pouco mais.',
    'circuit_open': 'Nosso serviço de IA está temporariamente indisponível. Tente novamente em alguns minutos ou aguarde que um atendente humano irá te ajudar.',
    'validation_failed': 'Não consegui processar sua mensagem. Por favor, reformule sua pergunta de forma mais clara.',
    'cache_miss': 'Processando sua solicitação...',
    'api_key_expired': 'Nosso serviço de IA está sendo atualizado. Por favor, aguarde alguns minutos ou entre em contato com um atendente.',
    'fallback': 'Estou com dificuldades técnicas no momento. Por favor, tente novamente ou aguarde que um atendente humano irá te ajudar.'
  };
  
  return responses[reason] || responses['fallback'];
};

// API Key rotation and validation system
interface ApiKeyInfo {
  key: string;
  isValid: boolean;
  lastChecked: number;
  errorCount: number;
  provider: 'openai' | 'gemini';
}

const apiKeyRegistry: Map<string, ApiKeyInfo> = new Map();
const KEY_VALIDATION_INTERVAL = 300000; // 5 minutes
const MAX_KEY_ERRORS = 3;

const markApiKeyInvalid = async (apiKey: string, provider: 'openai' | 'gemini', error: any): Promise<void> => {
  const keyInfo = apiKeyRegistry.get(apiKey) || {
    key: apiKey,
    isValid: true,
    lastChecked: 0,
    errorCount: 0,
    provider
  };

  keyInfo.errorCount++;
  keyInfo.lastChecked = Date.now();

  // Check if this is a permanent invalidity (expired, revoked, etc.)
  const permanentErrors = [
    /API key expired/i,
    /API key not valid/i,
    /invalid api key/i,
    /unauthorized/i,
    /API_KEY_INVALID/i
  ];

  const isPermanentError = permanentErrors.some(pattern => 
    pattern.test(error.message || '') || 
    pattern.test(JSON.stringify(error.errorDetails || []))
  );

  if (isPermanentError || keyInfo.errorCount >= MAX_KEY_ERRORS) {
    keyInfo.isValid = false;
    console.error(`🔑 API Key marked as invalid for ${provider}: ${apiKey.slice(0, 8)}... (${keyInfo.errorCount} errors)`);
    
    // Try to update the database to mark this key as invalid
    try {
      // Prefer to deactivate instead of null to preserve history
      const [count] = await Prompt.update(
        { isActive: false },
        { where: { apiKey } }
      );
      if (count === 0) {
        // Fallback: if model still requires non-null and update failed, attempt null (now allowed)
        await Prompt.update(
          { apiKey: null, isActive: false },
          { where: { apiKey } }
        );
        console.log(`📝 Cleared invalid API key (set null) in database`);
      } else {
        console.log(`📝 Deactivated invalid API key (isActive=false) in database`);
      }
    } catch (dbError) {
      console.error('Failed to deactivate invalid key:', dbError);
    }
  }

  apiKeyRegistry.set(apiKey, keyInfo);
};

const isApiKeyValid = (apiKey: string): boolean => {
  const keyInfo = apiKeyRegistry.get(apiKey);
  if (!keyInfo) return true; // Assume valid if not tracked yet
  
  const now = Date.now();
  if (now - keyInfo.lastChecked > KEY_VALIDATION_INTERVAL) {
    // Reset error count after validation interval
    keyInfo.errorCount = Math.max(0, keyInfo.errorCount - 1);
    keyInfo.lastChecked = now;
    apiKeyRegistry.set(apiKey, keyInfo);
  }
  
  return keyInfo.isValid && keyInfo.errorCount < MAX_KEY_ERRORS;
};

// Heuristics to distinguish provider key formats
const isLikelyOpenAIKey = (key: string) => /^sk-[A-Za-z0-9]{20,}/.test(key);
const isLikelyGeminiKey = (key: string) => /^AIza[0-9A-Za-z_\-]{10,}/.test(key);

// Enhanced API key retrieval with fallback mechanism
const getValidApiKey = async (
  ticket: Ticket, 
  openAiSettings: IOpenAi, 
  provider: 'openai' | 'gemini'
): Promise<string | null> => {
  const candidateKeys: string[] = [];
  
  // Collect potential API keys from various sources
  if (ticket.queueId) {
    try {
      const promptFromDB = await Prompt.findOne({
        where: {
          queueId: ticket.queueId,
          companyId: ticket.companyId,
          isActive: true
        }
      });
      
      if (promptFromDB && promptFromDB.apiKey) {
        candidateKeys.push(promptFromDB.apiKey);
      }
    } catch (error) {
      console.error("Error fetching prompt from database:", error);
    }
  }

  // Add openAiSettings key as fallback (only if matches provider heuristic or heuristic unknown)
  if (openAiSettings.apiKey) {
    const k = openAiSettings.apiKey.trim();
    if (
      (provider === 'openai' && (isLikelyOpenAIKey(k) || !isLikelyGeminiKey(k))) ||
      (provider === 'gemini' && (isLikelyGeminiKey(k) || !isLikelyOpenAIKey(k)))
    ) {
      candidateKeys.push(k);
    } else {
      console.log(`🔎 Skipping settings apiKey (pattern mismatch for provider ${provider})`);
    }
  }

  // Add any other keys from settings
  if (provider === 'openai' && openAiSettings.openAiApiKey) {
    const k = openAiSettings.openAiApiKey.trim();
    if (isLikelyOpenAIKey(k) || !isLikelyGeminiKey(k)) candidateKeys.push(k); else console.log('🔎 Skipping openAiApiKey (pattern mismatch)');
  }

  // Deduplicate
  let uniqueKeys = Array.from(new Set(candidateKeys.filter(k => !!k)));

  // Filter by heuristic to reduce wrong-provider usage
  uniqueKeys = uniqueKeys.filter(k => {
    if (provider === 'openai') {
      if (isLikelyGeminiKey(k) && !isLikelyOpenAIKey(k)) {
        console.log(`🚫 Excluding Gemini-looking key from OpenAI candidate list (${k.slice(0,4)}...)`);
        return false;
      }
    } else if (provider === 'gemini') {
      if (isLikelyOpenAIKey(k) && !isLikelyGeminiKey(k)) {
        console.log(`🚫 Excluding OpenAI-looking key from Gemini candidate list (${k.slice(0,4)}...)`);
        return false;
      }
    }
    return true;
  });

  // Try to find a valid key
  for (const rawKey of uniqueKeys) {
    const cleanKey = rawKey.trim().replace(/\s+/g, '');
    if (cleanKey && isApiKeyValid(cleanKey)) {
      console.log(`🔑 Using valid ${provider} API key: ${cleanKey.slice(0, 8)}...`);
      return cleanKey;
    }
  }

  console.error(`❌ No valid ${provider} API key found. Checked ${uniqueKeys.length} keys.`);
  return null;
};

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

// Augment messages with summary if available
const augmentWithSummary = (ticketId: number, messagesAI: any[], promptSystem: string, isGeminiModel: boolean): any[] => {
  const summary = conversationSummaries.get(ticketId);
  if (summary) {
    if (isGeminiModel) {
      // Gemini: will be inserted as first user message if model lacks systemInstruction
      messagesAI.unshift({ role: 'user', content: summary });
    } else {
      // OpenAI: summary after system prompt
      const idx = messagesAI.findIndex(m => m.role === 'system');
      if (idx >= 0) {
        messagesAI.splice(idx + 1, 0, { role: 'system', content: summary });
      } else {
        messagesAI.unshift({ role: 'system', content: `${promptSystem}\n${summary}` });
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

  // Detect repetitive greeting and suppress after first time
  const isGreeting = (txt: string) => /assistente virtual|sou o galpãobot|sou o galpao ?bot/i.test(txt);
  if (isGreeting(response)) {
    try {
      const recentAssistant = await Message.count({
        where: { ticketId: ticket.id, fromMe: true }
      });
      if (recentAssistant > 0) {
        // Replace with concise follow-up prompt instead of repeating intro
        response = "Como posso ajudar? Pode detalhar melhor sua necessidade?";
      }
    } catch (e) {
      console.error('Error checking recent assistant messages for greeting suppression:', e);
    }
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
    const respHash = hashText(response);
    const lastAi = lastAiResponse.get(ticket.id);
    const looksGreeting = /assistente virtual|sou o galpãobot|sou o galpao ?bot/i.test(response);
    if (lastAi && lastAi.hash === respHash && (Date.now() - lastAi.ts) < AI_DUPLICATE_WINDOW_MS) {
      // Skip exact duplicate
      return;
    }
    if (looksGreeting && lastAi && (Date.now() - lastAi.ts) < AI_DUPLICATE_WINDOW_MS) {
      // Suppress repeated greeting style messages
      return;
    }
    const sentMessage = await wbot.sendMessage(msg.key.remoteJid!, { text: `\u200e ${response}` });
    await verifyMessage(sentMessage!, ticket, contact);
    lastAiResponse.set(ticket.id, { hash: respHash, ts: Date.now(), raw: response });
    trackProcessedMessage(sentMessage?.key?.id);
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
  const startTime = Date.now();
  try {
    const result = await executeWithRetries(
      async () => {
        return await withCircuitBreaker(`openai:${openAiSettings.model}`, async () => withProviderConcurrency('openai', async () => {
          const dynamicMax = adjustMaxTokens(openAiSettings.maxTokens, messagesAI);
          const chat = await openai.chat.completions.create({
            model: openAiSettings.model,
            messages: messagesAI,
            max_tokens: dynamicMax,
            temperature: openAiSettings.temperature,
          });
          return chat.choices[0].message?.content || "";
        }));
      },
      { providerKey: `openai:${openAiSettings.model}`, attempts: 5 }
    );
    
    const latency = Date.now() - startTime;
    updateHealthMetrics(true, latency);
    checkAndSendAlerts();
    
    return result;
  } catch (error: any) {
    const latency = Date.now() - startTime;
    updateHealthMetrics(false, latency);
    checkAndSendAlerts();
    
    // Mark API key as invalid if needed
    if (openAiSettings.apiKey) {
      await markApiKeyInvalid(openAiSettings.apiKey, 'openai', error);
    }
    
    console.error("OpenAI request error (after retries):", error);
    if (error.message === 'CircuitOpen') {
      throw new Error('Serviço do OpenAI temporariamente indisponível. (circuit breaker)');
    }
    if (error.status === 401 || /invalid api key/i.test(error.message) || /API key expired/i.test(error.message)) {
      throw new Error("Chave de API do OpenAI inválida ou expirada. Verifique as configurações.");
    }
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
  // Helper to detect low-quality / config style errors returned as "success"
  const isBadGeminiResponse = (text: string): boolean => {
    if (!text) return true;
    const lower = text.toLowerCase();
    const patterns = [
      'problema de configuração',
      'erro de configuração',
      'problema de configuracao',
      'erro interno',
      'issue with configuration',
      'configuration problem',
      'falha de configuração'
    ];
    if (patterns.some(p => lower.includes(p))) return true;
    // Very short generic apology often indicates provider-side soft failure
    if (lower.startsWith('desculpe') && lower.length < 120) return true;
    return false;
  };

  const startTime = Date.now();
  try {
    const coreCall = async () => {
      const supportsSystemInstruction = ["gemini-1.5-pro", "gemini-2.0-pro", "gemini-2.0-flash"].includes(openAiSettings.model);
      console.log(`🔧 Gemini model: ${openAiSettings.model}, supports systemInstruction: ${supportsSystemInstruction}`);
      // Build contents from history
      const contents = messagesAI.map(msg => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }]
      }));
      if (!supportsSystemInstruction) {
        // Prepend system instructions as user, add acknowledgement model
        contents.unshift({ role: 'user', parts: [{ text: promptSystem }] });
        contents.splice(1, 0, { role: 'model', parts: [{ text: 'Entendido. Seguirei estas instruções em todas as minhas respostas.' }] });
      }
      // Append current user message (already present as last user in messagesAI, but ensure)
      if (!contents.length || contents[contents.length - 1].role !== 'user') {
        contents.push({ role: 'user', parts: [{ text: bodyMessage }] });
      }
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${openAiSettings.model}:generateContent`;
      const payload: any = {
        contents
      };
      if (supportsSystemInstruction) {
        payload.systemInstruction = { parts: [{ text: promptSystem }] };
      }
      return await withCircuitBreaker(`gemini:${openAiSettings.model}`, async () => withProviderConcurrency('gemini', async () => {
        const { data } = await axios.post(url, payload, {
          headers: {
            'Content-Type': 'application/json',
            'X-goog-api-key': gemini.apiKey
          },
          timeout: 30000
        });
        const text = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('\n') || '';
        return text;
      }));
    };
    
    let result = await executeWithRetries(coreCall, { providerKey: `gemini:${openAiSettings.model}`, attempts: 5 });

    // Automatic fallback if response looks like a config error disguised as success
    if (isBadGeminiResponse(result)) {
      console.warn(`⚠️ Gemini returned a low-quality/config-style response. Initiating fallback sequence. Raw: ${result.slice(0,140)}...`);
      const originalModel = openAiSettings.model;
      const fallbackModels = [
        'gemini-1.5-flash',
        'gemini-1.5-pro'
      ].filter(m => m !== originalModel);
      for (const fbModel of fallbackModels) {
        try {
          console.log(`🔄 Trying fallback Gemini model: ${fbModel}`);
          const tempSettings = { ...openAiSettings, model: fbModel } as IOpenAi;
          const fbResult = await executeWithRetries(async () => {
            const supportsSystemInstruction = ["gemini-1.5-pro", "gemini-2.0-pro", "gemini-2.0-flash"].includes(tempSettings.model);
            const history = messagesAI.map(msg => ({
              role: msg.role === 'assistant' ? 'model' : 'user',
              parts: [{ text: msg.content }]
            }));
            if (!supportsSystemInstruction && history.length > 0) {
              history.unshift({ role: 'user', parts: [{ text: promptSystem }] });
              history.splice(1, 0, { role: 'model', parts: [{ text: 'Entendido. Seguirei estas instruções.' }] });
            }
            const urlFb = `https://generativelanguage.googleapis.com/v1beta/models/${tempSettings.model}:generateContent`;
            const payloadFb: any = { contents: history };
            if (supportsSystemInstruction) {
              payloadFb.systemInstruction = { parts: [{ text: promptSystem }] };
            }
            const { data } = await axios.post(urlFb, payloadFb, {
              headers: {
                'Content-Type': 'application/json',
                'X-goog-api-key': gemini.apiKey
              },
              timeout: 30000
            });
            return data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('\n') || '';
          }, { providerKey: `gemini:${fbModel}`, attempts: 3 });
          if (!isBadGeminiResponse(fbResult)) {
            console.log(`✅ Fallback Gemini model succeeded: ${fbModel}`);
            result = fbResult;
            break;
          } else {
            console.warn(`⚠️ Fallback model ${fbModel} also produced low-quality response.`);
          }
        } catch (fbErr) {
          console.error(`❌ Fallback model ${fbModel} failed:`, fbErr.message || fbErr);
          continue;
        }
      }
      if (isBadGeminiResponse(result)) {
        // Final graceful degraded message
        result = 'Desculpe, tive um problema técnico momentâneo ao processar sua solicitação. Pode repetir ou reformular a pergunta?';
      }
    }
    
    const latency = Date.now() - startTime;
    updateHealthMetrics(true, latency);
    checkAndSendAlerts();
    
    return result;
  } catch (error: any) {
    const latency = Date.now() - startTime;
    updateHealthMetrics(false, latency);
    checkAndSendAlerts();
    
    // Mark API key as invalid if needed
    if (openAiSettings.apiKey) {
      await markApiKeyInvalid(openAiSettings.apiKey, 'gemini', error);
    }
    
    console.error("Gemini request error (after retries):", error);
    if (error.message === 'CircuitOpen') {
      throw new Error('Serviço do Gemini temporariamente indisponível. (circuit breaker)');
    }
    if (error.message?.includes('API key not valid') || error.status === 400 || /API key expired/i.test(error.message) || error.errorDetails?.some((detail: any) => detail.reason === 'API_KEY_INVALID')) {
      throw new Error("Chave de API do Gemini inválida ou expirada. Verifique as configurações.");
    }
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
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent`;
        const payload = {
          systemInstruction: { parts: [{ text: promptSystem }] },
          contents: [
            {
              role: 'user',
              parts: [
                { text: 'Gere uma transcrição precisa deste áudio.' },
                { inlineData: { mimeType, data: audioFileBase64 } }
              ]
            }
          ]
        };
        const { data } = await axios.post(url, payload, {
          headers: {
            'Content-Type': 'application/json',
            'X-goog-api-key': gemini.apiKey
          },
          timeout: 60000
        });
        const text = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('\n') || '';
        return text || null;
      } catch (e) {
        console.error('Gemini audio transcription failed:', (e as any).message);
        return null;
      }
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
          companyId: ticket.companyId,
          isActive: true
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
            companyId: ticket.companyId,
            isActive: true
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
            companyId: ticket.companyId,
            isActive: true
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

  // If still no key, fallback to env for selected provider
  if ((!apiKey || apiKey.trim() === '') && isGeminiModel) {
    // Support multiple keys comma/semicolon separated
    const rawEnvKeys = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY;
    if (rawEnvKeys) {
      const envKeys = rawEnvKeys.split(/[;,]/).map(k => k.trim()).filter(k => k.length > 0 && isLikelyGeminiKey(k));
      for (const k of envKeys) {
        if (isApiKeyValid(k)) {
          apiKey = k;
          console.log(`🌐 Using GEMINI_API_KEY from environment (candidate list size=${envKeys.length})`);
          break;
        }
      }
      if (!apiKey && envKeys.length > 0) {
        apiKey = envKeys[0]; // take first even if tracked invalid to force re-test later
        console.log(`🌐 Using first GEMINI_API_KEY (force test) list size=${envKeys.length}`);
      }
    }
  } else if ((!apiKey || apiKey.trim() === '') && isOpenAIModel) {
    if (process.env.OPENAI_API_KEY) {
      const envKey = process.env.OPENAI_API_KEY.trim();
      if (isLikelyOpenAIKey(envKey)) {
        apiKey = envKey;
        console.log("🌐 Using OPENAI_API_KEY from environment as early fallback");
      } else {
        console.log("🚫 OPENAI_API_KEY in env doesn't look like an OpenAI key, ignoring pattern");
      }
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
        // Test API key validity before creating session
        const testOpenAI = new OpenAI({ apiKey });
        try {
          await testOpenAI.models.list();
        } catch (testError: any) {
          if (testError.status === 401 || /invalid api key/i.test(testError.message) || /API key expired/i.test(testError.message)) {
            await markApiKeyInvalid(apiKey, 'openai', testError);
            // Try to get a valid key
            const validKey = await getValidApiKey(ticket, openAiSettings, 'openai');
            if (validKey) {
              openai = new OpenAI({ apiKey: validKey }) as SessionOpenAi;
            } else {
              // Final fallback environment variable
              const envKey = process.env.OPENAI_API_KEY?.trim();
              if (envKey) {
                console.log("🌐 Using fallback OPENAI_API_KEY from environment");
                try {
                  const envTestOpenAI = new OpenAI({ apiKey: envKey });
                  await envTestOpenAI.models.list();
                  openai = new OpenAI({ apiKey: envKey }) as SessionOpenAi;
                } catch (envErr) {
                  console.error("Environment OPENAI_API_KEY also invalid:", envErr);
                  return { openai: null, gemini: null };
                }
              } else {
                console.error("No valid OpenAI API key available");
                return { openai: null, gemini: null };
              }
            }
          } else {
            throw testError;
          }
        }
        
        if (!openai) {
          openai = new OpenAI({ apiKey }) as SessionOpenAi;
        }
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
    // Reuse existing stored session (by ticket id) just to store apiKey
    const geminiIndex = sessionsGemini.findIndex(s => s.id === ticket.id);
    if (geminiIndex === -1) {
      // Quick validation request
      try {
        const testUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent`;
        await axios.post(testUrl, { contents: [{ role: 'user', parts: [{ text: 'teste' }] }] }, {
          headers: { 'Content-Type': 'application/json', 'X-goog-api-key': apiKey },
          timeout: 15000
        });
        gemini = { id: ticket.id, apiKey };
        sessionsGemini.push(gemini);
      } catch (testError: any) {
        if (testError.status === 400 && (testError.message?.includes('API key not valid') || /API key expired/i.test(testError.message) || testError.response?.data?.error?.message?.includes('API key not valid'))) {
          await markApiKeyInvalid(apiKey, 'gemini', testError);
          const validKey = await getValidApiKey(ticket, openAiSettings, 'gemini');
          if (validKey) {
            gemini = { id: ticket.id, apiKey: validKey };
            sessionsGemini.push(gemini);
          } else {
            const rawEnvKeys = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY;
            if (rawEnvKeys) {
              const envKeys = rawEnvKeys.split(/[;,]/).map(k => k.trim()).filter(k => k.length > 0);
              let found = false;
              for (const envKey of envKeys) {
                try {
                  const testEnvUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent`;
                  await axios.post(testEnvUrl, { contents: [{ role: 'user', parts: [{ text: 'teste' }] }] }, { headers: { 'Content-Type': 'application/json', 'X-goog-api-key': envKey }, timeout: 15000 });
                  gemini = { id: ticket.id, apiKey: envKey };
                  sessionsGemini.push(gemini);
                  console.log(`🌐 Using fallback GEMINI_API_KEY from environment pool (index=${envKeys.indexOf(envKey)})`);
                  found = true;
                  break;
                } catch (envErr: any) {
                  await markApiKeyInvalid(envKey, 'gemini', envErr);
                  console.error(`Environment GEMINI_API_KEY candidate invalid (${envKey.slice(0,4)}...):`, envErr.message);
                }
              }
              if (!found) {
                console.error('All environment Gemini keys invalid');
                return { openai: null, gemini: null };
              }
            } else {
              console.error('No valid Gemini API key available');
              return { openai: null, gemini: null };
            }
          }
        } else {
          console.error('Gemini validation error (non-key):', testError.message);
          gemini = { id: ticket.id, apiKey }; // proceed anyway
          sessionsGemini.push(gemini);
        }
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
    // Loop prevention guards
    const incomingId = msg?.key?.id;
    if (alreadyProcessed(incomingId)) {
      return; // Already processed this message
    }
    if (isLoopMessage(msg)) {
      trackProcessedMessage(incomingId); // mark to avoid reprocessing
      return;
    }
    // User repeat suppression
    const userBody = (msg.message?.conversation || msg.message?.extendedTextMessage?.text || '').trim();
    if (!msg.key.fromMe && userBody) {
      const prev = lastUserMessage.get(ticket.id);
      if (prev && normalize(prev.text) === normalize(userBody) && (Date.now() - prev.ts) < USER_REPEAT_WINDOW_MS) {
        trackProcessedMessage(incomingId);
        return; // ignore rapid identical user re-send
      }
      lastUserMessage.set(ticket.id, { text: userBody, ts: Date.now() });
    }
    const existing = ticketsProcessing.get(ticket.id);
    const now = Date.now();
    if (existing && (now - existing.startedAt) < DEDUPE_WINDOW_MS) {
      if ((now - existing.lastNotifyAt) > NOTIFY_COOLDOWN_MS) {
        try {
          const waitMsg = await wbot.sendMessage(msg.key.remoteJid!, { text: '⏳ Estamos processando sua mensagem, aguarde um instante...' });
          await verifyMessage(waitMsg!, ticket, contact);
          existing.lastNotifyAt = now;
        } catch {}
      }
      return; // drop duplicate fast burst message
    } else {
      ticketsProcessing.set(ticket.id, { startedAt: now, lastNotifyAt: existing?.lastNotifyAt || 0 });
      // Clean up after 10s automatically
      setTimeout(() => {
        const info = ticketsProcessing.get(ticket.id);
        if (info && (Date.now() - info.startedAt) >= DEDUPE_WINDOW_MS) {
          ticketsProcessing.delete(ticket.id);
        }
      }, 10000);
    }
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

    // Validate and sanitize input
    if (bodyMessage) {
      const validation = validateAndSanitizeInput(bodyMessage);
      if (!validation.isValid) {
        console.warn(`Invalid input rejected: ${validation.reason}`);
        try {
          const rejectionMessage = await wbot.sendMessage(msg.key.remoteJid!, {
            text: getDegradedResponse('validation_failed'),
          });
          await verifyMessage(rejectionMessage!, ticket, contact);
        } catch (error) {
          console.error("Failed to send validation rejection:", error);
        }
        return;
      }
    }

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

    // Summarize if large
    if (messages.length >= SUMMARY_THRESHOLD) {
      const summary = buildSummary(messages);
      conversationSummaries.set(ticket.id, summary);
    }

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
        // Check cache first
        const cacheKey = getCacheKey(settings.prompt, bodyMessage!);
        const cachedResponse = getCachedResponse(cacheKey);
        
        if (cachedResponse) {
          console.log("📄 Serving cached response for:", bodyMessage!.slice(0, 50));
          await processResponse(cachedResponse, wbot, msg, ticket, contact, settings, ticketTraking);
          return;
        }
        
        const messagesAI = prepareMessagesAI(messages, isGeminiModel, promptSystem);
  augmentWithSummary(ticket.id, messagesAI, promptSystem, isGeminiModel);
        
        // Add current message to conversation
        messagesAI.push({ role: "user", content: bodyMessage! });
        
        let responseText: string | null = null;

        // Get response from appropriate AI model
        if (isOpenAIModel && openai) {
          try {
            responseText = await handleOpenAIRequest(openai, messagesAI, settings);
          } catch (err: any) {
            if (/Limite de requisições|temporariamente indisponível|circuit breaker/i.test(err.message)) {
              // fallback attempt to smaller/cheaper model if available
              const fallbackModel = settings.model === 'gpt-4o' ? 'gpt-3.5-turbo-1106' : null;
              if (fallbackModel) {
                console.warn(`Falling back from ${settings.model} to ${fallbackModel}`);
                const fallbackSettings = { ...settings, model: fallbackModel, maxTokens: Math.min(512, settings.maxTokens) };
                try {
                  responseText = await handleOpenAIRequest(openai, messagesAI, fallbackSettings as any);
                } catch (fallbackErr) {
                  console.error('Fallback model failed:', fallbackErr);
                  throw err; // rethrow original
                }
              } else {
                throw err;
              }
            } else {
              throw err;
            }
          }
        } else if (isGeminiModel && gemini) {
          console.log("🔄 Sending request to Gemini with prompt system");
          try {
            responseText = await handleGeminiRequest(gemini, messagesAI, settings, bodyMessage!, promptSystem);
          } catch (err: any) {
            if (/Limite de requisições|temporariamente indisponível|circuit breaker/i.test(err.message)) {
              const fallbackModelMap: Record<string,string> = {
                'gemini-2.0-pro': 'gemini-2.0-flash',
                'gemini-1.5-pro': 'gemini-1.5-flash'
              };
              const fallbackModel = fallbackModelMap[settings.model];
              if (fallbackModel) {
                console.warn(`Falling back from ${settings.model} to ${fallbackModel}`);
                const fallbackSettings = { ...settings, model: fallbackModel, maxTokens: Math.min(512, settings.maxTokens) };
                try {
                  responseText = await handleGeminiRequest(gemini, messagesAI, fallbackSettings as any, bodyMessage!, promptSystem);
                } catch (fallbackErr) {
                  console.error('Fallback model failed:', fallbackErr);
                  throw err;
                }
              } else {
                throw err;
              }
            } else {
              throw err;
            }
          }
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

        // Cache successful response
        setCachedResponse(cacheKey, responseText);

        // Process and send the response
        await processResponse(responseText, wbot, msg, ticket, contact, settings, ticketTraking);
      } catch (error: any) {
        console.error("AI request failed:", error);
        // Só envia mensagem de erro específica se for realmente erro de chave ou limite
        let userMessage = null;
        if (error.message?.includes('Chave de API')) {
          userMessage = "Há um problema com a configuração da IA. Por favor, entre em contato com o suporte.";
        } else if (error.message?.includes('Limite de requisições')) {
          userMessage = getDegradedResponse('high_load');
        } else if (error.message?.includes('temporariamente indisponível')) {
          userMessage = getDegradedResponse('circuit_open');
        } else if (error.message?.includes('High load')) {
          userMessage = getDegradedResponse('high_load');
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
  augmentWithSummary(ticket.id, messagesAI, promptSystem, isGeminiModel);
        messagesAI.push({ role: "user", content: transcription });
        
        let responseText: string | null = null;

        // Get response from appropriate AI model
        if (isOpenAIModel && openai) {
          try {
            responseText = await handleOpenAIRequest(openai, messagesAI, settings);
          } catch (err: any) {
            if (/Limite de requisições|temporariamente indisponível|circuit breaker/i.test(err.message)) {
              const fallbackModel = settings.model === 'gpt-4o' ? 'gpt-3.5-turbo-1106' : null;
              if (fallbackModel) {
                const fallbackSettings = { ...settings, model: fallbackModel, maxTokens: Math.min(512, settings.maxTokens) };
                try {
                  responseText = await handleOpenAIRequest(openai, messagesAI, fallbackSettings as any);
                } catch (fallbackErr) { console.error('Fallback model failed:', fallbackErr); throw err; }
              } else { throw err; }
            } else { throw err; }
          }
        } else if (isGeminiModel && gemini) {
            try {
              responseText = await handleGeminiRequest(gemini, messagesAI, settings, transcription, promptSystem);
            } catch (err: any) {
              if (/Limite de requisições|temporariamente indisponível|circuit breaker/i.test(err.message)) {
                const fallbackModelMap: Record<string,string> = {
                  'gemini-2.0-pro': 'gemini-2.0-flash',
                  'gemini-1.5-pro': 'gemini-1.5-flash'
                };
                const fallbackModel = fallbackModelMap[settings.model];
                if (fallbackModel) {
                  const fallbackSettings = { ...settings, model: fallbackModel, maxTokens: Math.min(512, settings.maxTokens) };
                  try {
                    responseText = await handleGeminiRequest(gemini, messagesAI, fallbackSettings as any, transcription, promptSystem);
                  } catch (fallbackErr) { console.error('Fallback model failed:', fallbackErr); throw err; }
                } else { throw err; }
              } else { throw err; }
            }
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
          userMessage = getDegradedResponse('high_load');
        } else if (error.message?.includes('temporariamente indisponível')) {
          userMessage = getDegradedResponse('circuit_open');
        } else if (error.message?.includes('High load')) {
          userMessage = getDegradedResponse('high_load');
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
        text: getDegradedResponse('fallback'),
      });
      await verifyMessage(fallbackMessage!, ticket, contact);
    } catch (finalError) {
      // Se nem isso funcionar, apenas loga o erro
      console.error("Final fallback failed:", finalError);
    }
  } finally {
    // Clean up processing state
    const processingInfo = ticketsProcessing.get(ticket.id);
    if (processingInfo) {
      const elapsed = Date.now() - processingInfo.startedAt;
      if (elapsed >= DEDUPE_WINDOW_MS) {
        ticketsProcessing.delete(ticket.id);
      }
    }
  }
};