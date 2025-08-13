import api from './api';

class HeartbeatService {
    constructor() {
        this.intervalId = null;
        this.isActive = false;
        this.interval = 30000; // 30 segundos
        this.failureCount = 0;
        this.maxFailures = 3;
    }

    start() {
        if (this.isActive) return;
        
        this.isActive = true;
        this.failureCount = 0;
        
        // Primeira execução imediata
        this.sendHeartbeat();
        
        // Configurar intervalo
        this.intervalId = setInterval(() => {
            this.sendHeartbeat();
        }, this.interval);
        
        console.log('Heartbeat service started');
    }

    stop() {
        if (!this.isActive) return;
        
        this.isActive = false;
        
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        
        console.log('Heartbeat service stopped');
    }

    async sendHeartbeat() {
        try {
            const response = await api.post('/heartbeat');
            
            if (response.status === 200) {
                this.failureCount = 0;
                console.log('Heartbeat successful:', response.data);
                
                // Notificar service worker sobre sucesso
                this.notifyServiceWorker('HEARTBEAT_SUCCESS', response.data);
            }
            
        } catch (error) {
            this.failureCount++;
            console.error('Heartbeat failed:', error);
            
            // Notificar service worker sobre falha
            this.notifyServiceWorker('HEARTBEAT_FAILED', {
                error: error.message,
                failureCount: this.failureCount
            });
            
            // Se exceder max falhas, parar o serviço
            if (this.failureCount >= this.maxFailures) {
                console.error('Max heartbeat failures reached, stopping service');
                this.stop();
                
                // Notificar sobre falha crítica
                this.notifyServiceWorker('HEARTBEAT_CRITICAL_FAILURE', {
                    failureCount: this.failureCount
                });
            }
        }
    }

    async checkSessionStatus() {
        try {
            const response = await api.get('/session-status');
            return response.data;
        } catch (error) {
            console.error('Session status check failed:', error);
            throw error;
        }
    }

    async getPendingNotifications() {
        try {
            const response = await api.get('/pending-notifications');
            return response.data;
        } catch (error) {
            console.error('Failed to get pending notifications:', error);
            throw error;
        }
    }

    notifyServiceWorker(type, data) {
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({
                type,
                data,
                timestamp: Date.now()
            });
        }
    }

    setInterval(newInterval) {
        this.interval = newInterval;
        
        if (this.isActive) {
            this.stop();
            this.start();
        }
    }

    getStatus() {
        return {
            isActive: this.isActive,
            interval: this.interval,
            failureCount: this.failureCount,
            maxFailures: this.maxFailures
        };
    }
}

// Singleton instance
const heartbeatService = new HeartbeatService();

export default heartbeatService;
