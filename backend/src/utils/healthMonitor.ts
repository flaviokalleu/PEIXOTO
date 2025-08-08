import logger from "./logger";

interface HealthStatus {
  uptime: number;
  memory: NodeJS.MemoryUsage;
  errorCount: number;
  lastError?: string;
  timestamp: Date;
}

class HealthMonitor {
  private errorCount = 0;
  private maxErrors = 50; // Máximo de erros antes de tentar limpeza
  private cleanupInterval = 5 * 60 * 1000; // 5 minutos
  private healthCheckInterval = 30 * 1000; // 30 segundos

  constructor() {
    this.startHealthCheck();
    this.startPeriodicCleanup();
  }

  public logError(error: Error | string, context?: string): void {
    this.errorCount++;
    const errorMessage = error instanceof Error ? error.message : error;
    
    logger.error("Application error logged", {
      error: errorMessage,
      context,
      errorCount: this.errorCount,
      timestamp: new Date().toISOString()
    });

    // Se muitos erros, tenta limpeza
    if (this.errorCount >= this.maxErrors) {
      this.performCleanup();
    }
  }

  public getHealthStatus(): HealthStatus {
    return {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      errorCount: this.errorCount,
      timestamp: new Date()
    };
  }

  private startHealthCheck(): void {
    setInterval(() => {
      const health = this.getHealthStatus();
      
      // Log saúde do sistema
      logger.info("System health check", {
        uptime: health.uptime,
        memoryUsage: {
          rss: Math.round(health.memory.rss / 1024 / 1024) + ' MB',
          heapUsed: Math.round(health.memory.heapUsed / 1024 / 1024) + ' MB',
          heapTotal: Math.round(health.memory.heapTotal / 1024 / 1024) + ' MB'
        },
        errorCount: health.errorCount
      });

      // Verifica uso de memória excessivo
      const memoryUsageGB = health.memory.rss / 1024 / 1024 / 1024;
      if (memoryUsageGB > 2) { // Mais de 2GB
        logger.warn("High memory usage detected", {
          memoryUsageGB: Math.round(memoryUsageGB * 100) / 100
        });
        
        // Força garbage collection se disponível
        if (global.gc) {
          global.gc();
          logger.info("Garbage collection forced");
        }
      }
    }, this.healthCheckInterval);
  }

  private startPeriodicCleanup(): void {
    setInterval(() => {
      this.performCleanup();
    }, this.cleanupInterval);
  }

  private performCleanup(): void {
    try {
      logger.info("Performing system cleanup", {
        errorCount: this.errorCount,
        memoryBefore: process.memoryUsage()
      });

      // Reset contador de erros
      this.errorCount = 0;

      // Força garbage collection se disponível
      if (global.gc) {
        global.gc();
      }

      // Limpa timers não utilizados
      this.cleanupTimers();

      logger.info("System cleanup completed", {
        memoryAfter: process.memoryUsage()
      });
    } catch (error) {
      logger.error("Error during cleanup", { error });
    }
  }

  private cleanupTimers(): void {
    // Implementação para limpeza de timers se necessário
    // Por enquanto apenas log
    logger.debug("Timer cleanup performed");
  }

  public gracefulShutdown(): void {
    logger.info("Starting graceful shutdown");
    
    // Aqui você pode adicionar lógica para fechar conexões, salvar dados, etc.
    setTimeout(() => {
      logger.info("Graceful shutdown completed");
      process.exit(0);
    }, 5000); // 5 segundos para limpeza
  }
}

export const healthMonitor = new HealthMonitor();

// Wrapper para funções que podem gerar erros
export const safeAsyncWrapper = <T extends any[], R>(
  fn: (...args: T) => Promise<R>,
  context?: string
) => {
  return async (...args: T): Promise<R | null> => {
    try {
      return await fn(...args);
    } catch (error) {
      healthMonitor.logError(error as Error, context);
      return null;
    }
  };
};

// Wrapper para funções síncronas
export const safeSyncWrapper = <T extends any[], R>(
  fn: (...args: T) => R,
  context?: string
) => {
  return (...args: T): R | null => {
    try {
      return fn(...args);
    } catch (error) {
      healthMonitor.logError(error as Error, context);
      return null;
    }
  };
};
