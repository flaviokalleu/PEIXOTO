import { WAMessage, AnyMessageContent } from "@whiskeysockets/baileys";
import * as Sentry from "@sentry/node";
import fs from "fs";
import { exec } from "child_process";
import path from "path";
import ffmpegPath from "@ffmpeg-installer/ffmpeg";
import os from "os";
import crypto from "crypto";

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

interface ProcessingMetrics {
  count: number;
  totalSize: number;
  totalDuration: number;
  successCount: number;
  errorCount: number;
  avgProcessingTime: number;
}

interface QueueItem {
  process: () => void;
  priority: number;
  timestamp: number;
  fileSize: number;
  retries: number;
}

interface CacheInfo {
  path: string;
  lastAccess: number;
  size: number;
  type: string;
  originalName: string;
}

const publicFolder = path.resolve(__dirname, "..", "..", "..", "public");
// Cache em diretório fora da pasta de código para evitar restart do nodemon
const cacheBaseDir = process.env.CACHE_DIR || path.resolve(process.cwd(), "..", "media-cache");

// Utilitário para gerar hash de arquivos
// Melhoria na função generateFileHash para ser mais inteligente
const generateFileHash = (filePath: string, originalName?: string): string => {
  try {
    // Para arquivos do FlowBuilder, usar o nome original como base
    if (originalName && (filePath.includes('flowbuilder') || filePath.includes('typebot'))) {
      const fileBuffer = fs.readFileSync(filePath);
      // Usar nome original + tamanho + hash do conteúdo para garantir unicidade
      const contentHash = crypto.createHash('sha256').update(fileBuffer).digest('hex').substring(0, 16);
      return crypto.createHash('md5').update(`${originalName}_${fileBuffer.length}_${contentHash}`).digest('hex');
    }
    
    const fileBuffer = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(fileBuffer).digest('hex');
  } catch (error) {
    console.error('Erro ao gerar hash do arquivo:', error);
    const stats = fs.statSync(filePath);
    const baseName = originalName || path.basename(filePath);
    return crypto.createHash('md5').update(`${baseName}_${stats.size}_${stats.mtimeMs}`).digest('hex');
  }
};

// Cache Manager otimizado para reutilização de arquivos
class MediaCacheManager {
  private static instance: MediaCacheManager;
  private cacheDir: string;
  private cacheIndex: Map<string, CacheInfo> = new Map();
  private maxCacheSize: number = 1024 * 1024 * 1024; // 1GB
  private cleanupInterval: NodeJS.Timeout;
  private saveTimeout: NodeJS.Timeout | null = null;

  constructor() {
    this.cacheDir = cacheBaseDir;
    this.ensureCacheDir();
    this.loadCacheIndex();
    this.startCleanupRoutine();
  }

  static getInstance(): MediaCacheManager {
    if (!MediaCacheManager.instance) {
      MediaCacheManager.instance = new MediaCacheManager();
    }
    return MediaCacheManager.instance;
  }

  private ensureCacheDir(): void {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
    
    // Criar subdiretórios por tipo
    ['audio', 'image', 'video', 'document'].forEach(type => {
      const typeDir = path.join(this.cacheDir, type);
      if (!fs.existsSync(typeDir)) {
        fs.mkdirSync(typeDir, { recursive: true });
      }
    });
  }

  private loadCacheIndex(): void {
    const indexFile = path.join(this.cacheDir, 'cache-index.json');
    try {
      if (fs.existsSync(indexFile)) {
        const data = fs.readFileSync(indexFile, 'utf8');
        const index = JSON.parse(data);
        
        // Verificar se os arquivos ainda existem
        for (const [hash, info] of Object.entries(index as any)) {
          const cacheInfo = info as CacheInfo;
          if (fs.existsSync(cacheInfo.path)) {
            this.cacheIndex.set(hash, cacheInfo);
          }
        }
        
        console.log(`Cache carregado: ${this.cacheIndex.size} arquivos (${this.getCacheSizeFormatted()})`);
      }
    } catch (error) {
      console.warn('Erro ao carregar índice do cache:', error);
    }
  }

  private saveCacheIndex(): void {
    // Usar timeout para evitar escritas muito frequentes
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    this.saveTimeout = setTimeout(() => {
      const indexFile = path.join(this.cacheDir, 'cache-index.json');
      try {
        const indexData = Object.fromEntries(this.cacheIndex);
        fs.writeFileSync(indexFile, JSON.stringify(indexData, null, 2));
      } catch (error) {
        console.warn('Erro ao salvar índice do cache:', error);
      }
      this.saveTimeout = null;
    }, 2000); // Salvar após 2 segundos de inatividade
  }

  getCachedFile(hash: string): string | null {
    const cached = this.cacheIndex.get(hash);
    
    if (cached && fs.existsSync(cached.path)) {
      // Atualizar último acesso
      cached.lastAccess = Date.now();
      this.cacheIndex.set(hash, cached);
      
      console.log(`Arquivo reutilizado do cache: ${hash.substring(0, 8)}... (${cached.originalName})`);
      return cached.path;
    }
    
    if (cached && !fs.existsSync(cached.path)) {
      // Remover entrada inválida
      this.cacheIndex.delete(hash);
      this.saveCacheIndex();
    }
    
    return null;
  }

  // Método específico para arquivos do FlowBuilder
  getCachedFlowBuilderFile(originalName: string, fileSize: number, type: string): string | null {
    // Buscar por arquivos similares no cache baseado no nome original e tamanho
    for (const [hash, cacheInfo] of this.cacheIndex.entries()) {
      if (cacheInfo.type === type && 
          cacheInfo.originalName === originalName && 
          Math.abs(cacheInfo.size - fileSize) < 1024) { // Tolerância de 1KB
        
        if (fs.existsSync(cacheInfo.path)) {
          // Atualizar último acesso
          cacheInfo.lastAccess = Date.now();
          this.cacheIndex.set(hash, cacheInfo);
          
          console.log(`FlowBuilder: Arquivo reutilizado do cache: ${originalName} (${this.formatBytes(cacheInfo.size)})`);
          return cacheInfo.path;
        } else {
          // Remover entrada inválida
          this.cacheIndex.delete(hash);
          this.saveCacheIndex();
        }
      }
    }
    
    return null;
  }

  // Método para adicionar arquivo do FlowBuilder ao cache de forma inteligente
  addFlowBuilderToCache(filePath: string, type: string, originalName: string): string {
    const stats = fs.statSync(filePath);
    
    // Verificar se já existe arquivo similar no cache
    const existingFile = this.getCachedFlowBuilderFile(originalName, stats.size, type);
    if (existingFile) {
      return existingFile;
    }

    // Gerar hash usando nome original
    const fileHash = generateFileHash(filePath, originalName);
    
    // Adicionar ao cache normalmente
    return this.addToCache(fileHash, filePath, type, originalName);
  }

  addToCache(hash: string, filePath: string, type: string, originalName: string): string {
    if (this.cacheIndex.has(hash)) {
      const existing = this.getCachedFile(hash);
      if (existing) return existing;
    }

    try {
      const stats = fs.statSync(filePath);
      const ext = path.extname(filePath);
      const cacheFileName = `${hash.substring(0, 16)}${ext}`;
      const cachePath = path.join(this.cacheDir, type, cacheFileName);

      // Verificar se o arquivo já existe no cache (evitar cópia desnecessária)
      if (!fs.existsSync(cachePath)) {
        fs.copyFileSync(filePath, cachePath);
      }

      // Adicionar ao índice
      this.cacheIndex.set(hash, {
        path: cachePath,
        lastAccess: Date.now(),
        size: stats.size,
        type,
        originalName
      });

      console.log(`Arquivo adicionado ao cache: ${hash.substring(0, 8)}... (${originalName}, ${this.formatBytes(stats.size)})`);
      
      // Salvar índice com delay e verificar tamanho
      this.saveCacheIndex();
      this.checkCacheSize();
      
      return cachePath;

    } catch (error) {
      console.warn('Erro ao adicionar arquivo ao cache:', error);
      return filePath; // Retornar arquivo original se falhar
    }
  }

  private checkCacheSize(): void {
    const totalSize = Array.from(this.cacheIndex.values())
      .reduce((sum, info) => sum + info.size, 0);

    if (totalSize > this.maxCacheSize) {
      console.log(`Cache excedeu limite (${this.formatBytes(totalSize)}), iniciando limpeza...`);
      this.cleanOldFiles();
    }
  }

  private cleanOldFiles(): void {
    // Ordenar por último acesso (mais antigos primeiro)
    const entries = Array.from(this.cacheIndex.entries())
      .sort(([, a], [, b]) => a.lastAccess - b.lastAccess);

    let totalSize = entries.reduce((sum, [, info]) => sum + info.size, 0);
    const targetSize = this.maxCacheSize * 0.8; // Reduzir para 80% do limite

    for (const [hash, info] of entries) {
      if (totalSize <= targetSize) break;

      try {
        if (fs.existsSync(info.path)) {
          fs.unlinkSync(info.path);
        }
        this.cacheIndex.delete(hash);
        totalSize -= info.size;
        console.log(`Arquivo removido do cache: ${hash.substring(0, 8)}... (${info.originalName})`);
      } catch (error) {
        console.warn(`Erro ao remover arquivo do cache: ${error.message}`);
      }
    }

    this.saveCacheIndex();
    console.log(`Limpeza do cache concluída. Tamanho atual: ${this.getCacheSizeFormatted()}`);
  }

  private startCleanupRoutine(): void {
    // Limpeza automática a cada 1 hora (reduzido para evitar problemas)
    this.cleanupInterval = setInterval(() => {
      this.checkCacheSize();
      this.cleanOrphanedFiles();
    }, 60 * 60 * 1000); // 1 hora
  }

  private cleanOrphanedFiles(): void {
    // Remover arquivos órfãos que não estão no índice
    try {
      const types = ['audio', 'image', 'video', 'document'];
      
      for (const type of types) {
        const typeDir = path.join(this.cacheDir, type);
        if (!fs.existsSync(typeDir)) continue;

        const files = fs.readdirSync(typeDir);
        const indexedFiles = Array.from(this.cacheIndex.values())
          .filter(info => info.type === type)
          .map(info => path.basename(info.path));

        for (const file of files) {
          if (!indexedFiles.includes(file)) {
            const filePath = path.join(typeDir, file);
            try {
              fs.unlinkSync(filePath);
              console.log(`Arquivo órfão removido: ${file}`);
            } catch (error) {
              console.warn(`Erro ao remover arquivo órfão: ${error.message}`);
            }
          }
        }
      }
    } catch (error) {
      console.warn('Erro na limpeza de arquivos órfãos:', error);
    }
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  private getCacheSizeFormatted(): string {
    const totalSize = Array.from(this.cacheIndex.values())
      .reduce((sum, info) => sum + info.size, 0);
    return this.formatBytes(totalSize);
  }

  getStatus() {
    const totalSize = Array.from(this.cacheIndex.values())
      .reduce((sum, info) => sum + info.size, 0);
    
    const typeStats = Array.from(this.cacheIndex.values())
      .reduce((acc, info) => {
        acc[info.type] = (acc[info.type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

    return {
      totalFiles: this.cacheIndex.size,
      totalSize: this.formatBytes(totalSize),
      maxSize: this.formatBytes(this.maxCacheSize),
      utilization: `${((totalSize / this.maxCacheSize) * 100).toFixed(1)}%`,
      typeBreakdown: typeStats,
      cacheDir: this.cacheDir
    };
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      // Salvar imediatamente antes de destruir
      const indexFile = path.join(this.cacheDir, 'cache-index.json');
      try {
        const indexData = Object.fromEntries(this.cacheIndex);
        fs.writeFileSync(indexFile, JSON.stringify(indexData, null, 2));
      } catch (error) {
        console.warn('Erro ao salvar índice final do cache:', error);
      }
    }
  }
}

// Validação robusta de arquivos por tipo
const validateMediaFile = (media: Express.Multer.File): void => {
  const typeMessage = media.mimetype.split("/")[0];
  const supportedTypes = ["image", "audio", "video", "document", "application"];
  
  if (!supportedTypes.includes(typeMessage)) {
    throw new AppError("Tipo de arquivo não suportado", 400);
  }

  // Validações por tipo com limites realistas
  switch (typeMessage) {
    case "image":
      if (media.size > 10 * 1024 * 1024) { // 10MB
        throw new AppError("Imagem muito grande (máximo 10MB)", 400);
      }
      if (media.size < 100) { // 100 bytes mínimo
        throw new AppError("Arquivo de imagem inválido", 400);
      }
      break;
      
    case "audio":
      if (media.size > 50 * 1024 * 1024) { // 50MB
        throw new AppError("Áudio muito grande (máximo 50MB)", 400);
      }
      if (media.size < 1000) { // 1KB mínimo
        throw new AppError("Arquivo de áudio inválido", 400);
      }
      break;
      
    case "video":
      if (media.size > 100 * 1024 * 1024) { // 100MB
        throw new AppError("Vídeo muito grande (máximo 100MB)", 400);
      }
      if (media.size < 10000) { // 10KB mínimo
        throw new AppError("Arquivo de vídeo inválido", 400);
      }
      break;
      
    case "document":
    case "application":
      if (media.size > 50 * 1024 * 1024) { // 50MB
        throw new AppError("Documento muito grande (máximo 50MB)", 400);
      }
      break;
  }
};

// Monitor de métricas de processamento
class MediaProcessingMonitor {
  private static instance: MediaProcessingMonitor;
  private metrics: Map<string, ProcessingMetrics> = new Map();
  private alerts: Array<{ type: string; message: string; timestamp: number }> = [];
  private cacheHits: number = 0;
  private cacheMisses: number = 0;

  static getInstance(): MediaProcessingMonitor {
    if (!MediaProcessingMonitor.instance) {
      MediaProcessingMonitor.instance = new MediaProcessingMonitor();
    }
    return MediaProcessingMonitor.instance;
  }

  recordCacheHit(): void {
    this.cacheHits++;
  }

  recordCacheMiss(): void {
    this.cacheMisses++;
  }

  getCacheStats() {
    const total = this.cacheHits + this.cacheMisses;
    return {
      hits: this.cacheHits,
      misses: this.cacheMisses,
      hitRate: total > 0 ? `${((this.cacheHits / total) * 100).toFixed(1)}%` : '0%',
      total
    };
  }

  recordProcessing(type: string, size: number, duration: number, success: boolean) {
    const key = `${type}_${new Date().toISOString().split('T')[0]}`;
    
    if (!this.metrics.has(key)) {
      this.metrics.set(key, {
        count: 0,
        totalSize: 0,
        totalDuration: 0,
        successCount: 0,
        errorCount: 0,
        avgProcessingTime: 0
      });
    }

    const metric = this.metrics.get(key)!;
    metric.count++;
    metric.totalSize += size;
    metric.totalDuration += duration;
    
    if (success) {
      metric.successCount++;
    } else {
      metric.errorCount++;
      
      // Adicionar alerta se taxa de erro for alta
      const errorRate = metric.errorCount / metric.count;
      if (errorRate > 0.2 && metric.count > 10) { // 20% de erro
        this.addAlert('HIGH_ERROR_RATE', `Alta taxa de erro para ${type}: ${(errorRate * 100).toFixed(1)}%`);
      }
    }
    
    metric.avgProcessingTime = metric.totalDuration / metric.count;
  }

  private addAlert(type: string, message: string) {
    this.alerts.push({ type, message, timestamp: Date.now() });
    
    // Manter apenas últimos 50 alertas
    if (this.alerts.length > 50) {
      this.alerts = this.alerts.slice(-50);
    }
    
    console.warn(`[ALERT] ${type}: ${message}`);
  }

  getMetrics() {
    return Object.fromEntries(this.metrics);
  }

  getAlerts() {
    return this.alerts.slice(-10); // Últimos 10 alertas
  }

  cleanup() {
    // Limpar métricas antigas (mais de 7 dias)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const cutoffDate = sevenDaysAgo.toISOString().split('T')[0];

    for (const [key] of this.metrics) {
      const [, date] = key.split('_');
      if (date < cutoffDate) {
        this.metrics.delete(key);
      }
    }
  }
}

// Pool otimizado para processamento de mídia
class MediaDownloadPool {
  private activeDownloads = 0;
  private readonly maxDownloads: number;
  private queue: Array<QueueItem> = [];
  private processingTimes: Array<number> = [];
  private monitor = MediaProcessingMonitor.getInstance();
  private cacheManager = MediaCacheManager.getInstance();

  constructor() {
    // Ajustar baseado em recursos do sistema
    const totalMemory = os.totalmem() / (1024 * 1024 * 1024); // GB
    this.maxDownloads = totalMemory > 8 ? 8 : totalMemory > 4 ? 6 : 4;
    console.log(`Pool de mídia inicializado com ${this.maxDownloads} downloads máximos`);
  }

  async processMedia(mediaPath: string, fileSize: number = 0, type: string = 'media'): Promise<string> {
    // Gerar hash do arquivo para verificar cache
    const fileHash = generateFileHash(mediaPath);
    
    // Verificar cache primeiro
    const cachedFile = this.cacheManager.getCachedFile(fileHash);
    if (cachedFile) {
      this.monitor.recordCacheHit();
      return cachedFile;
    }

    this.monitor.recordCacheMiss();

    return new Promise((resolve, reject) => {
      const priority = this.getMediaPriority(fileSize);
      
      const processDownload = () => {
        this.activeDownloads++;
        const startTime = Date.now();
        
        console.log(`Processando mídia: ${path.basename(mediaPath)} (${this.activeDownloads}/${this.maxDownloads})`);
        
        // Timeout baseado no tamanho do arquivo
        const timeout = this.calculateTimeout(fileSize);
        const timeoutHandle = setTimeout(() => {
          this.activeDownloads--;
          this.processQueue();
          const error = new Error(`Timeout no processamento de mídia após ${timeout}ms`);
          this.monitor.recordProcessing(type, fileSize, Date.now() - startTime, false);
          reject(error);
        }, timeout);

        // Processamento assíncrono real
        setImmediate(() => {
          try {
            if (!fs.existsSync(mediaPath)) {
              throw new Error('Arquivo não encontrado');
            }

            const stats = fs.statSync(mediaPath);
            if (stats.size === 0) {
              throw new Error('Arquivo vazio');
            }

            // Validação adicional baseada no tipo de arquivo
            this.validateFileIntegrity(mediaPath, stats.size);
            
            // Adicionar ao cache
            const cachedPath = this.cacheManager.addToCache(
              fileHash, 
              mediaPath, 
              type, 
              path.basename(mediaPath)
            );
            
            const processingTime = Date.now() - startTime;
            this.processingTimes.push(processingTime);
            
            // Manter apenas últimas 50 medições
            if (this.processingTimes.length > 50) {
              this.processingTimes = this.processingTimes.slice(-50);
            }

            console.log(`Mídia processada: ${path.basename(mediaPath)} (${stats.size} bytes, ${processingTime}ms)`);
            this.monitor.recordProcessing(type, stats.size, processingTime, true);
            resolve(cachedPath);

          } catch (error) {
            console.error(`Erro no processamento: ${error.message}`);
            this.monitor.recordProcessing(type, fileSize, Date.now() - startTime, false);
            reject(error);
          } finally {
            clearTimeout(timeoutHandle);
            this.activeDownloads--;
            this.processQueue();
          }
        });
      };

      if (this.activeDownloads < this.maxDownloads) {
        processDownload();
      } else {
        this.queue.push({ 
          process: processDownload, 
          priority, 
          timestamp: Date.now(),
          fileSize,
          retries: 0
        });
        
        this.sortQueue();
        console.log(`Mídia adicionada à fila: ${path.basename(mediaPath)} (posição ${this.queue.length}, prioridade ${priority})`);
      }
    });
  }

  async processFlowBuilderMedia(mediaPath: string, originalName: string, fileSize: number = 0, type: string = 'media'): Promise<string> {
    // Verificar cache primeiro usando nome original
    const cachedFile = this.cacheManager.getCachedFlowBuilderFile(originalName, fileSize, type);
    if (cachedFile) {
      this.monitor.recordCacheHit();
      console.log(`FlowBuilder: Reutilizando arquivo ${originalName} do cache`);
      return cachedFile;
    }

    this.monitor.recordCacheMiss();

    return new Promise((resolve, reject) => {
      const priority = this.getMediaPriority(fileSize);
      
      const processDownload = () => {
        this.activeDownloads++;
        const startTime = Date.now();
        
        console.log(`FlowBuilder: Processando ${originalName} pela primeira vez (${this.activeDownloads}/${this.maxDownloads})`);
        
        const timeout = this.calculateTimeout(fileSize);
        const timeoutHandle = setTimeout(() => {
          this.activeDownloads--;
          this.processQueue();
          const error = new Error(`Timeout no processamento de mídia após ${timeout}ms`);
          this.monitor.recordProcessing(type, fileSize, Date.now() - startTime, false);
          reject(error);
        }, timeout);

        setImmediate(() => {
          try {
            if (!fs.existsSync(mediaPath)) {
              throw new Error('Arquivo não encontrado');
            }

            const stats = fs.statSync(mediaPath);
            if (stats.size === 0) {
              throw new Error('Arquivo vazio');
            }

            this.validateFileIntegrity(mediaPath, stats.size);

            // Adicionar ao cache usando método específico do FlowBuilder
            const cachedPath = this.cacheManager.addFlowBuilderToCache(
              mediaPath, 
              type, 
              originalName
            );
            
            const processingTime = Date.now() - startTime;
            this.processingTimes.push(processingTime);
            
            if (this.processingTimes.length > 50) {
              this.processingTimes = this.processingTimes.slice(-50);
            }

            console.log(`FlowBuilder: ${originalName} adicionado ao cache (${MediaCacheManager.getInstance()['formatBytes'](stats.size)}, ${processingTime}ms)`);
            this.monitor.recordProcessing(type, stats.size, processingTime, true);
            resolve(cachedPath);

          } catch (error) {
            console.error(`Erro no processamento: ${error.message}`);
            this.monitor.recordProcessing(type, fileSize, Date.now() - startTime, false);
            reject(error);
          } finally {
            clearTimeout(timeoutHandle);
            this.activeDownloads--;
            this.processQueue();
          }
        });
      };

      if (this.activeDownloads < this.maxDownloads) {
        processDownload();
      } else {
        this.queue.push({ 
          process: processDownload, 
          priority, 
          timestamp: Date.now(),
          fileSize,
          retries: 0
        });
        
        this.sortQueue();
        console.log(`FlowBuilder: ${originalName} adicionado à fila (posição ${this.queue.length}, prioridade ${priority})`);
      }
    });
  }

  private calculateTimeout(fileSize: number): number {
    const baseTimeout = 5000; // 5 segundos base
    const sizeMultiplier = Math.min(fileSize / (1024 * 1024), 10); // Máximo 10x para arquivos grandes
    return baseTimeout + (sizeMultiplier * 1000);
  }

  private validateFileIntegrity(filePath: string, fileSize: number): void {
    const ext = path.extname(filePath).toLowerCase();
    const mimeType = mime.lookup(filePath);
    
    if (!mimeType) {
      throw new Error('Tipo de arquivo não reconhecido');
    }

    // Validações específicas por extensão
    const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    const videoExts = ['.mp4', '.avi', '.mov', '.mkv', '.webm'];
    const audioExts = ['.mp3', '.wav', '.aac', '.ogg', '.m4a'];

    if (imageExts.includes(ext) && fileSize < 100) {
      throw new Error('Arquivo de imagem muito pequeno');
    }
    
    if (videoExts.includes(ext) && fileSize < 10000) {
      throw new Error('Arquivo de vídeo muito pequeno');
    }
    
    if (audioExts.includes(ext) && fileSize < 1000) {
      throw new Error('Arquivo de áudio muito pequeno');
    }
  }

  private getMediaPriority(fileSize: number): number {
    if (fileSize < 1024 * 1024) return 5; // <1MB = máxima prioridade
    if (fileSize < 5 * 1024 * 1024) return 4; // <5MB = alta prioridade
    if (fileSize < 10 * 1024 * 1024) return 3; // <10MB = média prioridade
    if (fileSize < 25 * 1024 * 1024) return 2; // <25MB = baixa prioridade
    return 1; // >=25MB = mínima prioridade
  }

  private sortQueue() {
    this.queue.sort((a, b) => {
      // Prioridade primeiro
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }
      // Depois por timestamp (FIFO)
      return a.timestamp - b.timestamp;
    });
  }

  private processQueue() {
    if (this.queue.length > 0 && this.activeDownloads < this.maxDownloads) {
      const nextItem = this.queue.shift();
      if (nextItem) {
        nextItem.process();
      }
    }
  }

  getStatus() {
    const avgProcessingTime = this.processingTimes.length > 0 
      ? this.processingTimes.reduce((sum, time) => sum + time, 0) / this.processingTimes.length 
      : 0;

    return {
      activeDownloads: this.activeDownloads,
      queueSize: this.queue.length,
      maxDownloads: this.maxDownloads,
      avgProcessingTime: Math.round(avgProcessingTime),
      systemMemory: `${(os.totalmem() / (1024 * 1024 * 1024)).toFixed(1)}GB`,
      cacheStats: this.monitor.getCacheStats()
    };
  }
}

// Pool ultra-otimizado para processamento de áudio
class AudioProcessingPool {
  private activeProcesses = 0;
  private readonly maxProcesses: number;
  private queue: Array<QueueItem> = [];
  private processingHistory: Map<string, number> = new Map();
  private monitor = MediaProcessingMonitor.getInstance();
  private cacheManager = MediaCacheManager.getInstance();

  constructor() {
    const cpuCount = os.cpus().length;
    const totalMemory = os.totalmem() / (1024 * 1024 * 1024); // GB
    
    // Algoritmo inteligente para determinar máximo de processos
    let maxProcs = Math.max(2, Math.min(cpuCount - 1, 6));
    if (totalMemory < 4) maxProcs = Math.min(maxProcs, 3);
    if (totalMemory > 16) maxProcs = Math.min(maxProcs + 2, 8);
    
    this.maxProcesses = maxProcs;
    console.log(`Pool de áudio inicializado com ${this.maxProcesses} processos máximos (CPU: ${cpuCount}, RAM: ${totalMemory.toFixed(1)}GB)`);
  }

  async processAudio(inputPath: string, outputPath: string, priority: number = 1): Promise<string> {
    // Gerar hash do arquivo para verificar cache
    const fileHash = generateFileHash(inputPath);
    
    // Verificar cache primeiro
    const cachedFile = this.cacheManager.getCachedFile(fileHash);
    if (cachedFile) {
      this.monitor.recordCacheHit();
      // Copiar do cache para o local desejado
      fs.copyFileSync(cachedFile, outputPath);
      console.log(`Áudio reutilizado do cache: ${fileHash.substring(0, 8)}...`);
      return outputPath;
    }

    this.monitor.recordCacheMiss();
    
    // Processar áudio e adicionar ao cache
    await this.processAudioWithRetry(inputPath, outputPath, priority, fileHash);
    
    // Adicionar resultado ao cache
    this.cacheManager.addToCache(
      fileHash,
      outputPath,
      'audio',
      path.basename(inputPath)
    );
    
    return outputPath;
  }

  private async processAudioWithRetry(
    inputPath: string, 
    outputPath: string, 
    priority: number, 
    fileHash: string,
    maxRetries: number = 3
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const processId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const processAudio = (retryCount: number = 0) => {
        this.activeProcesses++;
        const startTime = Date.now();
        
        console.log(`[${processId}] Iniciando processamento de áudio (tentativa ${retryCount + 1}/${maxRetries + 1}) (${this.activeProcesses}/${this.maxProcesses} ativos)`);
        
        const timeout = setTimeout(() => {
          this.activeProcesses--;
          this.processQueue();
          console.error(`[${processId}] Timeout após 35 segundos`);
          
          if (retryCount < maxRetries) {
            console.log(`[${processId}] Tentando novamente (${retryCount + 1}/${maxRetries})`);
            setTimeout(() => processAudio(retryCount + 1), 1000 * (retryCount + 1));
          } else {
            this.monitor.recordProcessing('audio', 0, Date.now() - startTime, false);
            reject(new Error('Timeout no processamento de áudio - todas as tentativas falharam'));
          }
        }, 35000);

        // Comando FFmpeg ultra-otimizado para máxima qualidade
        const command = `"${ffmpegPath.path}" -i "${inputPath}" ` +
          `-threads ${Math.min(4, os.cpus().length)} ` + // Usar múltiplas threads
          `-af "` +
          `highpass=f=85, ` +                           // Filtro passa-alta otimizado
          `lowpass=f=7800, ` +                          // Filtro passa-baixa otimizado
          `afftdn=nr=12:nf=-25, ` +                     // Redução de ruído melhorada
          `compand=attacks=0.3:decays=0.8:points=-80/-80|-65/-65|-35/-20|-20/-12|-4/-4:soft-knee=6:gain=0:volume=-3:delay=0.05, ` + // Compressor avançado
          `aresample=44100:resampler=soxr, ` +          // Reamostragem de alta qualidade
          `dynaudnorm=f=500:g=31:p=0.95:m=10.0:r=0.0:n=1:c=1, ` + // Normalização dinâmica
          `volume=1.15" ` +                             // Volume otimizado
          `-vn -ar 44100 -ac 2 -b:a 320k ` +           // Bitrate máximo (320k)
          `-q:a 0 ` +                                   // Qualidade máxima
          `-compression_level 6 ` +                     // Compressão otimizada
          `"${outputPath}" -y`;

        exec(command, { 
          timeout: 30000,
          maxBuffer: 1024 * 1024 * 15, // 15MB buffer
          killSignal: 'SIGKILL'
        }, (error, stdout, stderr) => {
          clearTimeout(timeout);
          this.activeProcesses--;
          const processingTime = Date.now() - startTime;
          
          this.processingHistory.set(processId, processingTime);
          this.processQueue();
          
          if (error) {
            console.error(`[${processId}] Erro FFmpeg (tentativa ${retryCount + 1}):`, error.message);
            if (stderr) console.error(`[${processId}] FFmpeg stderr:`, stderr);
            
            if (retryCount < maxRetries) {
              console.log(`[${processId}] Tentando novamente em ${(retryCount + 1) * 1000}ms`);
              setTimeout(() => processAudio(retryCount + 1), 1000 * (retryCount + 1));
            } else {
              this.monitor.recordProcessing('audio', 0, processingTime, false);
              reject(new Error(`Erro no processamento de áudio após ${maxRetries + 1} tentativas: ${error.message}`));
            }
          } else {
            console.log(`[${processId}] Áudio processado com sucesso em ${processingTime}ms`);
            this.monitor.recordProcessing('audio', fs.statSync(inputPath).size, processingTime, true);
            resolve();
          }
        });
      };

      if (this.activeProcesses < this.maxProcesses) {
        processAudio();
      } else {
        this.queue.push({ 
          process: () => processAudio(), 
          priority, 
          timestamp: Date.now(),
          fileSize: fs.statSync(inputPath).size,
          retries: 0
        });
        
        this.sortQueue();
        console.log(`Processo adicionado à fila. Posição: ${this.queue.length}, Prioridade: ${priority}`);
      }
    });
  }

  private sortQueue() {
    this.queue.sort((a, b) => {
      // Prioridade primeiro
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }
      // Arquivos menores primeiro (processamento mais rápido)
      if (Math.abs(a.fileSize - b.fileSize) > 1024 * 1024) { // Diferença > 1MB
        return a.fileSize - b.fileSize;
      }
      // FIFO para arquivos similares
      return a.timestamp - b.timestamp;
    });
  }

  private processQueue() {
    if (this.queue.length > 0 && this.activeProcesses < this.maxProcesses) {
      const nextItem = this.queue.shift();
      if (nextItem) {
        nextItem.process();
      }
    }
  }

  getStatus() {
    const recentTimes = Array.from(this.processingHistory.values()).slice(-20);
    const avgProcessingTime = recentTimes.length > 0 
      ? recentTimes.reduce((sum, time) => sum + time, 0) / recentTimes.length 
      : 0;

    return {
      activeProcesses: this.activeProcesses,
      queueSize: this.queue.length,
      maxProcesses: this.maxProcesses,
      avgProcessingTime: Math.round(avgProcessingTime),
      cpuCores: os.cpus().length,
      systemLoad: os.loadavg()[0].toFixed(2),
      cacheStats: this.monitor.getCacheStats()
    };
  }

  cleanHistory() {
    if (this.processingHistory.size > 200) {
      const entries = Array.from(this.processingHistory.entries()).slice(-100);
      this.processingHistory.clear();
      entries.forEach(([key, value]) => this.processingHistory.set(key, value));
    }
  }
}

// Instâncias dos pools
const audioPool = new AudioProcessingPool();
const mediaPool = new MediaDownloadPool();
const monitor = MediaProcessingMonitor.getInstance();
const cacheManager = MediaCacheManager.getInstance();

// Limpeza automática a cada 30 minutos (reduzido)
setInterval(() => {
  audioPool.cleanHistory();
  monitor.cleanup();
}, 30 * 60 * 1000);

// Log de status a cada 30 minutos (reduzido para evitar spam)
setInterval(() => {
  const audioStatus = audioPool.getStatus();
  const mediaStatus = mediaPool.getStatus();
  const cacheStatus = cacheManager.getStatus();
  const cacheStats = monitor.getCacheStats();
  
  console.log(`[STATUS] Áudio: ${audioStatus.activeProcesses}/${audioStatus.maxProcesses} ativos, ${audioStatus.queueSize} na fila`);
  console.log(`[STATUS] Mídia: ${mediaStatus.activeDownloads}/${mediaStatus.maxDownloads} ativos, ${mediaStatus.queueSize} na fila`);
  console.log(`[STATUS] Cache: ${cacheStatus.totalFiles} arquivos (${cacheStatus.totalSize}), Hit Rate: ${cacheStats.hitRate}`);
  console.log(`[STATUS] Cache Dir: ${cacheStatus.cacheDir}`);
}, 30 * 60 * 1000);

// Cleanup no shutdown do processo
process.on('SIGINT', () => {
  console.log('Salvando cache antes de fechar...');
  cacheManager.destroy();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('Salvando cache antes de fechar...');
  cacheManager.destroy();
  process.exit(0);
});

// Função otimizada para processamento de áudio
const processAudio = async (audio: string, companyId: string, priority: number = 1): Promise<string> => {
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substr(2, 12);
  const outputAudio = `${publicFolder}/company${companyId}/${timestamp}_${randomId}.mp3`;

  try {
    // Validações robustas
    if (!fs.existsSync(audio)) {
      throw new Error('Arquivo de áudio não encontrado');
    }

    const stats = fs.statSync(audio);
    if (stats.size === 0) {
      throw new Error('Arquivo de áudio está vazio');
    }

    if (stats.size > 50 * 1024 * 1024) {
      throw new Error('Arquivo de áudio muito grande (máximo 50MB)');
    }

    // Verificar formato de áudio suportado (LISTA EXPANDIDA)
    const ext = path.extname(audio).toLowerCase();
    const supportedFormats = [
      '.mp3', '.wav', '.aac', '.ogg', '.m4a', '.webm', '.opus', 
      '.mpeg', '.mpga', '.mp2', '.m2a', '.mpa', '.3gp', '.amr', 
      '.flac', '.wma', '.ra', '.au', '.aiff'
    ];
    
    if (!supportedFormats.includes(ext)) {
      console.warn(`Formato não listado mas tentando processar: ${ext}`);
      // Não bloqueia mais, apenas avisa
    }

    // Criar diretório se não existir
    const outputDir = path.dirname(outputAudio);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    console.log(`Iniciando processamento de áudio: ${path.basename(audio)} (${stats.size} bytes, prioridade ${priority})`);

    const processedPath = await audioPool.processAudio(audio, outputAudio, priority);

    // Validar arquivo de saída
    if (!fs.existsSync(processedPath)) {
      throw new Error('Falha ao criar arquivo de áudio processado');
    }

    const outputStats = fs.statSync(processedPath);
    if (outputStats.size === 0) {
      throw new Error('Arquivo de áudio processado está vazio');
    }

    console.log(`Áudio processado com sucesso: ${outputStats.size} bytes (redução: ${((stats.size - outputStats.size) / stats.size * 100).toFixed(1)}%)`);
    return processedPath;

  } catch (error) {
    console.error('Erro no processAudio:', error);
    
    // Limpar arquivo de saída se existir
    try {
      if (fs.existsSync(outputAudio)) {
        fs.unlinkSync(outputAudio);
      }
    } catch (cleanupError) {
      console.warn('Erro ao limpar arquivo:', cleanupError);
    }
    
    throw error;
  }
};

// Função inteligente de limpeza com retry (reduzida)
const cleanupFile = (filePath: string, delay: number = 10000, maxRetries: number = 2) => {
  let retries = 0;
  
  const attemptCleanup = () => {
    setTimeout(() => {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.log(`Arquivo temporário removido: ${path.basename(filePath)}`);
        }
      } catch (error) {
        retries++;
        if (retries < maxRetries) {
          console.warn(`Tentativa ${retries} de limpeza falhou, tentando novamente em ${delay * 2}ms`);
          cleanupFile(filePath, delay * 2, maxRetries - retries);
        } else {
          console.warn(`Erro ao deletar arquivo temporário ${path.basename(filePath)} após ${maxRetries} tentativas:`, error.message);
        }
      }
    }, delay);
  };
  
  attemptCleanup();
};

// Sistema inteligente de prioridades
const getAudioPriority = (fileSize: number): number => {
  if (fileSize < 512 * 1024) return 5;        // <512KB = máxima prioridade
  if (fileSize < 2 * 1024 * 1024) return 4;   // <2MB = alta prioridade
  if (fileSize < 5 * 1024 * 1024) return 3;   // <5MB = média prioridade
  if (fileSize < 15 * 1024 * 1024) return 2;  // <15MB = baixa prioridade
  return 1;                                    // >=15MB = mínima prioridade
};

const getMediaPriority = (fileSize: number): number => {
  if (fileSize < 1024 * 1024) return 5;       // <1MB = máxima prioridade
  if (fileSize < 5 * 1024 * 1024) return 4;   // <5MB = alta prioridade
  if (fileSize < 10 * 1024 * 1024) return 3;  // <10MB = média prioridade
  if (fileSize < 25 * 1024 * 1024) return 2;  // <25MB = baixa prioridade
  return 1;                                    // >=25MB = mínima prioridade
};

// Função otimizada getMessageOptions
export const getMessageOptions = async (
  fileName: string,
  pathMedia: string,
  companyId?: string,
  body: string = " "
): Promise<any> => {
  const mimeType = mime.lookup(pathMedia);

  if (!mimeType) {
    throw new Error("Tipo de arquivo inválido");
  }

  const typeMessage = mimeType.split("/")[0];
  const startTime = Date.now();

  try {
    let options: AnyMessageContent;
    const fileStats = fs.statSync(pathMedia);

    console.log(`Processando ${typeMessage}: ${fileName} (${fileStats.size} bytes)`);

    switch (typeMessage) {
      case "video":
        const videoPath = await mediaPool.processMedia(pathMedia, fileStats.size, 'video');
        options = {
          video: fs.readFileSync(videoPath),
          caption: body || null,
          fileName: fileName
        };
        break;

      case "audio":
        const audioPriority = getAudioPriority(fileStats.size);
        const convert = await processAudio(pathMedia, companyId!, audioPriority);

        try {
          options = {
            audio: fs.readFileSync(convert),
            mimetype: "audio/mpeg",
            ptt: true
          };
        } catch (readError) {
          cleanupFile(convert, 0);
          throw readError;
        }
        break;

      case "document":
      case "application":
        const docPath = await mediaPool.processMedia(pathMedia, fileStats.size, 'document');
        options = {
          document: fs.readFileSync(docPath),
          caption: body || null,
          fileName: fileName,
          mimetype: mimeType
        };
        break;

      default: // images
        const imagePath = await mediaPool.processMedia(pathMedia, fileStats.size, 'image');
        options = {
          image: fs.readFileSync(imagePath),
          caption: body || null,
        };
    }

    const processingTime = Date.now() - startTime;
    monitor.recordProcessing(typeMessage, fileStats.size, processingTime, true);
    
    return options;

  } catch (error) {
    const processingTime = Date.now() - startTime;
    monitor.recordProcessing(typeMessage, fs.statSync(pathMedia).size, processingTime, false);
    
    Sentry.captureException(error);
    console.error('Erro em getMessageOptions:', error);
    throw new AppError("Erro ao processar arquivo de mídia", 500);
  }
};

// Função principal otimizada para FlowBuilder
const SendWhatsAppMedia = async ({
  media,
  ticket,
  body = "",
  isPrivate = false,
  isForwarded = false
}: Request): Promise<WAMessage> => {
  let convertedAudioPath: string | null = null;
  const startTime = Date.now();

  try {
    // Validação inicial robusta
    validateMediaFile(media);

    const wbot = await getWbot(ticket.whatsappId);
    const companyId = ticket.companyId.toString();
    const pathMedia = media.path;
    const typeMessage = media.mimetype.split("/")[0];

    let options: AnyMessageContent;
    let bodyTicket = "";
    const bodyMedia = ticket ? formatBody(body, ticket) : body;

    console.log(`[Ticket ${ticket.id}] Processando mídia: ${media.originalname} (${media.mimetype}, ${media.size} bytes)`);

    // Verificar se é arquivo do FlowBuilder/TypeBot
    const isFlowBuilderFile = media.path.includes('flowbuilder') || 
                             media.path.includes('typebot') || 
                             media.path.includes('company' + companyId);

    // Processamento otimizado por tipo
    switch (typeMessage) {
      case "video":
        console.log(`[Ticket ${ticket.id}] Processando vídeo`);
        
        if (!fs.existsSync(pathMedia)) {
          throw new Error('Arquivo de vídeo não encontrado');
        }

        let videoPath;
        if (isFlowBuilderFile) {
          videoPath = await mediaPool.processFlowBuilderMedia(pathMedia, media.originalname, media.size, 'video');
        } else {
          videoPath = await mediaPool.processMedia(pathMedia, media.size, 'video');
        }
        
        options = {
          video: fs.readFileSync(videoPath),
          caption: bodyMedia,
          fileName: media.originalname.replace(/[/\\:*?"<>|]/g, '-'),
          contextInfo: { forwardingScore: isForwarded ? 2 : 0, isForwarded: isForwarded },
        };
        
        bodyTicket = "🎥 Arquivo de vídeo";
        break;

      case "audio":
        console.log(`[Ticket ${ticket.id}] Processando áudio`);
        
        if (isFlowBuilderFile) {
          // Para arquivos do FlowBuilder, tentar reutilizar primeiro
          const cachedAudio = cacheManager.getCachedFlowBuilderFile(media.originalname, media.size, 'audio');
          if (cachedAudio) {
            convertedAudioPath = cachedAudio;
            console.log(`[Ticket ${ticket.id}] Áudio reutilizado do cache: ${media.originalname}`);
          } else {
            const fileStats = fs.statSync(media.path);
            const priority = getAudioPriority(fileStats.size);
            convertedAudioPath = await processAudio(media.path, companyId, priority);
            
            // Adicionar ao cache
            cacheManager.addFlowBuilderToCache(convertedAudioPath, 'audio', media.originalname);
          }
        } else {
          const fileStats = fs.statSync(media.path);
          const priority = getAudioPriority(fileStats.size);
          convertedAudioPath = await processAudio(media.path, companyId, priority);
        }

        options = {
          audio: fs.readFileSync(convertedAudioPath),
          mimetype: "audio/mpeg",
          ptt: true,
          caption: bodyMedia,
          contextInfo: { forwardingScore: isForwarded ? 2 : 0, isForwarded: isForwarded },
        };

        bodyTicket = "🎵 Arquivo de áudio";
        break;

      case "document":
      case "text":
        let docPath;
        if (isFlowBuilderFile) {
          docPath = await mediaPool.processFlowBuilderMedia(pathMedia, media.originalname, media.size, 'document');
        } else {
          docPath = await mediaPool.processMedia(pathMedia, media.size, 'document');
        }
        
        options = {
          document: fs.readFileSync(docPath),
          caption: bodyMedia,
          fileName: media.originalname.replace(/[/\\:*?"<>|]/g, '-'),
          mimetype: media.mimetype,
          contextInfo: { forwardingScore: isForwarded ? 2 : 0, isForwarded: isForwarded },
        };
        bodyTicket = "📂 Documento";
        break;

      case "application":
        let appPath;
        if (isFlowBuilderFile) {
          appPath = await mediaPool.processFlowBuilderMedia(pathMedia, media.originalname, media.size, 'document');
        } else {
          appPath = await mediaPool.processMedia(pathMedia, media.size, 'document');
        }
        
        options = {
          document: fs.readFileSync(appPath),
          caption: bodyMedia,
          fileName: media.originalname.replace(/[/\\:*?"<>|]/g, '-'),
          mimetype: media.mimetype,
          contextInfo: { forwardingScore: isForwarded ? 2 : 0, isForwarded: isForwarded },
        };
        bodyTicket = "📎 Outros anexos";
        break;

      default: // Imagens
        console.log(`[Ticket ${ticket.id}] Processando imagem`);
        
        if (!fs.existsSync(pathMedia)) {
          throw new Error('Arquivo de imagem não encontrado');
        }

        let imagePath;
        if (isFlowBuilderFile) {
          imagePath = await mediaPool.processFlowBuilderMedia(pathMedia, media.originalname, media.size, 'image');
        } else {
          imagePath = await mediaPool.processMedia(pathMedia, media.size, 'image');
        }
        
        if (media.mimetype.includes("gif")) {
          options = {
            image: fs.readFileSync(imagePath),
            caption: bodyMedia,
            mimetype: "image/gif",
            contextInfo: { forwardingScore: isForwarded ? 2 : 0, isForwarded: isForwarded },
            gifPlayback: true
          };
        } else {
          options = {
            image: fs.readFileSync(imagePath),
            caption: bodyMedia,
            contextInfo: { forwardingScore: isForwarded ? 2 : 0, isForwarded: isForwarded },
          };
        }
        
        bodyTicket = "🖼️ Imagem";
    }

    // Processamento de mensagem privada
    if (isPrivate === true) {
      const messageData = {
        wid: `PVT${companyId}${ticket.id}${Date.now()}`,
        ticketId: ticket.id,
        contactId: undefined,
        body: bodyMedia || bodyTicket,
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

      const totalTime = Date.now() - startTime;
      console.log(`[Ticket ${ticket.id}] Mensagem privada processada em ${totalTime}ms`);
      return;
    }

    // Envio da mensagem
    const contactNumber = await Contact.findOne({ where: { id: ticket.contactId } });

    if (!contactNumber) {
      throw new AppError("Contato não encontrado", 404);
    }

    let number: string;
    if (contactNumber.remoteJid && contactNumber.remoteJid !== "" && contactNumber.remoteJid.includes("@")) {
      number = contactNumber.remoteJid;
    } else {
      number = `${contactNumber.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`;
    }

    console.log(`[Ticket ${ticket.id}] Enviando mensagem para ${number}`);
    const sentMessage = await wbot.sendMessage(number, { ...options });

    await ticket.update({
      lastMessage: body || bodyTicket,
      imported: null
    });

    const totalTime = Date.now() - startTime;
    console.log(`[Ticket ${ticket.id}] Mídia enviada com sucesso em ${totalTime}ms ${isFlowBuilderFile ? '(FlowBuilder)' : ''}`);
    
    monitor.recordProcessing('total_send', media.size, totalTime, true);
    
    return sentMessage;

  } catch (err) {
    const totalTime = Date.now() - startTime;
    console.error(`[Ticket ${ticket.id}] ERRO AO ENVIAR MÍDIA - Arquivo: ${media.originalname} (${totalTime}ms)`, err);

    monitor.recordProcessing('total_send', media.size, totalTime, false);
    Sentry.captureException(err);

    if (err instanceof AppError) {
      throw err;
    }

    throw new AppError("Erro ao enviar mídia. Tente novamente.", 500);
  }
};

// Arquivo: SendWhatsAppMediaFlow.ts
const sendMediaFile = async (fileName: string, mediaType: string) => {
  try {
    // Função helper para encontrar o arquivo correto
    const findMediaFile = (baseName: string, type: string): string => {
      const publicDir = '/home/deploy/zazap/backend/dist/public';
      const extensions = {
        video: ['mp4', 'avi', 'mov', 'mkv'],
        audio: ['mp3', 'wav', 'mpeg', 'aac'],
        image: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
        document: ['pdf', 'doc', 'docx', 'txt']
      };
      
      // Remover extensão duplicada se existir
      const cleanName = baseName.replace(/\.(mp4|jpg|png|gif|pdf|mp3|wav|mpeg|aac|avi|mov)$/, '');
      
      // Tentar encontrar o arquivo com diferentes extensões
      const possibleExtensions = extensions[type] || ['mp4'];
      
      for (const ext of possibleExtensions) {
        const fullPath = path.join(publicDir, `${cleanName}.${ext}`);
        if (fs.existsSync(fullPath)) {
          console.log(`✅ Arquivo encontrado: ${fullPath}`);
          return fullPath;
        }
      }
      
      throw new Error(`Arquivo não encontrado: ${cleanName} (tipo: ${type})`);
    };

    const filePath = findMediaFile(fileName, mediaType);
    const fileBuffer = fs.readFileSync(filePath);
    
    return fileBuffer;
    
  } catch (error) {
    console.error(`❌ Erro ao ler arquivo de mídia:`, error);
    throw new AppError("Arquivo de mídia não encontrado", 404);
  }
};

export default SendWhatsAppMedia;
