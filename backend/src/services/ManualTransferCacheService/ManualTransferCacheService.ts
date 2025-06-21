import logger from "../../utils/logger";

class ManualTransferCacheService {
  private manualTransfers: Map<number, { timestamp: Date; userId: number; queueId: number }> = new Map();
  private readonly PROTECTION_TIME = 10 * 60 * 1000; // 10 minutos em milliseconds

  // Marcar ticket como transferido manualmente
  markManualTransfer(ticketId: number, userId: number, queueId: number): void {
    const transferData = {
      timestamp: new Date(),
      userId,
      queueId
    };
    
    this.manualTransfers.set(ticketId, transferData);
    logger.info(`🔄 Ticket ${ticketId} marcado como transferência manual para usuário ${userId}`);
    
    // Auto-limpeza após o tempo de proteção
    setTimeout(() => {
      this.removeProtection(ticketId);
    }, this.PROTECTION_TIME);
  }

  // Verificar se ticket está protegido contra randomização
  isProtected(ticketId: number): boolean {
    const transfer = this.manualTransfers.get(ticketId);
    
    if (!transfer) {
      return false;
    }

    const now = new Date();
    const timeDiff = now.getTime() - transfer.timestamp.getTime();

    // Se passou do tempo de proteção, remove da cache
    if (timeDiff > this.PROTECTION_TIME) {
      this.removeProtection(ticketId);
      return false;
    }

    return true;
  }

  // Verificar há quanto tempo foi transferido
  getTransferTime(ticketId: number): number | null {
    const transfer = this.manualTransfers.get(ticketId);
    
    if (!transfer) {
      return null;
    }

    const now = new Date();
    return Math.floor((now.getTime() - transfer.timestamp.getTime()) / (60 * 1000)); // em minutos
  }

  // Remover proteção de um ticket
  removeProtection(ticketId: number): void {
    if (this.manualTransfers.has(ticketId)) {
      this.manualTransfers.delete(ticketId);
      logger.info(`🔓 Proteção removida do ticket ${ticketId}`);
    }
  }

  // Limpar transferências antigas (executar periodicamente)
  cleanOldTransfers(): void {
    const now = new Date();
    let cleanedCount = 0;

    for (const [ticketId, transfer] of this.manualTransfers.entries()) {
      const timeDiff = now.getTime() - transfer.timestamp.getTime();
      
      if (timeDiff > this.PROTECTION_TIME) {
        this.manualTransfers.delete(ticketId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.info(`🧹 ${cleanedCount} transferências antigas removidas da cache`);
    }
  }

  // Obter estatísticas
  getStats(): { total: number; protected: number } {
    const now = new Date();
    let protectedCount = 0;

    for (const transfer of this.manualTransfers.values()) {
      const timeDiff = now.getTime() - transfer.timestamp.getTime();
      if (timeDiff <= this.PROTECTION_TIME) {
        protectedCount++;
      }
    }

    return {
      total: this.manualTransfers.size,
      protected: protectedCount
    };
  }
}

// Singleton instance
export const manualTransferCache = new ManualTransferCacheService();