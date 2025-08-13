class SocketToSWBridge {
    constructor() {
        this.socket = null;
        this.isServiceWorkerReady = false;
        this.messageQueue = [];
        this.user = null;
        this.companyId = null;
        this.setupServiceWorkerBridge();
    }

    setUser(user) {
        this.user = user;
        this.companyId = user?.companyId;
        console.log('SocketBridge: User set', { userId: user?.id, companyId: this.companyId });
    }

    setupServiceWorkerBridge() {
        if ('serviceWorker' in navigator) {
            // Verificar se SW está pronto
            navigator.serviceWorker.ready.then(() => {
                this.isServiceWorkerReady = true;
                console.log('SocketBridge: Service Worker ready');
                
                // Enviar mensagens da fila
                this.flushMessageQueue();
            });

            // Escutar mensagens do SW
            navigator.serviceWorker.addEventListener('message', (event) => {
                this.handleServiceWorkerMessage(event);
            });

            // Detectar mudanças de foco
            window.addEventListener('focus', () => {
                this.sendToServiceWorker('CLIENT_FOCUS', { timestamp: Date.now() });
            });

            window.addEventListener('blur', () => {
                this.sendToServiceWorker('CLIENT_BLUR', { timestamp: Date.now() });
            });

            // Detectar visibilidade
            document.addEventListener('visibilitychange', () => {
                if (document.hidden) {
                    this.sendToServiceWorker('ENABLE_BACKGROUND_MODE', { timestamp: Date.now() });
                } else {
                    this.sendToServiceWorker('DISABLE_BACKGROUND_MODE', { timestamp: Date.now() });
                }
            });
        }
    }

    connectSocket(socket) {
        this.socket = socket;
        console.log('SocketBridge: Socket connected, setting up listeners...');
        this.setupSocketListeners();
        console.log('SocketBridge: Socket connected and listeners set up');
    }

    setupSocketListeners() {
        if (!this.socket || !this.socket.socket) {
            console.warn('SocketBridge: Socket not ready');
            return;
        }

        if (!this.companyId) {
            console.warn('SocketBridge: No company ID found');
            return;
        }

        console.log(`SocketBridge: Setting up listeners for company-${this.companyId}`);

        // Escutar mensagens específicas da empresa
        this.socket.on(`company-${this.companyId}-appMessage`, (data) => {
            console.log(`SocketBridge: Message received on company-${this.companyId}-appMessage`, data);
            this.sendToServiceWorker('NEW_MESSAGE', {
                type: 'appMessage',
                companyId: this.companyId,
                ...data
            });
        });

        // Escutar atualizações de ticket da empresa
        this.socket.on(`company-${this.companyId}-ticket`, (data) => {
            console.log('SocketBridge: Company ticket update received', data);
            this.sendToServiceWorker('TICKET_UPDATE', {
                type: 'ticket',
                companyId: this.companyId,
                ...data
            });
        });

        // Escutar atualizações de contato da empresa
        this.socket.on(`company-${this.companyId}-contact`, (data) => {
            console.log('SocketBridge: Company contact update received', data);
            this.sendToServiceWorker('SOCKET_MESSAGE', {
                type: 'contact',
                companyId: this.companyId,
                ...data
            });
        });

        // Escutar notificações gerais (fallback)
        this.socket.on('appMessage', (data) => {
            console.log('SocketBridge: General message received', data);
            this.sendToServiceWorker('NEW_MESSAGE', {
                type: 'generalMessage',
                ...data
            });
        });

        this.socket.on('ticket', (data) => {
            console.log('SocketBridge: General ticket update received', data);
            this.sendToServiceWorker('TICKET_UPDATE', {
                type: 'generalTicket',
                ...data
            });
        });

        this.socket.on('notification', (data) => {
            console.log('SocketBridge: Notification received', data);
            this.sendToServiceWorker('USER_NOTIFICATION', {
                type: 'notification',
                ...data
            });
        });

        // Eventos de conexão
        this.socket.on('connect', () => {
            console.log('SocketBridge: Socket connected');
            this.sendToServiceWorker('SOCKET_CONNECTED', { 
                companyId: this.companyId,
                timestamp: Date.now() 
            });
        });

        this.socket.on('disconnect', () => {
            console.log('SocketBridge: Socket disconnected');
            this.sendToServiceWorker('SOCKET_DISCONNECTED', { 
                companyId: this.companyId,
                timestamp: Date.now() 
            });
        });

        console.log(`SocketBridge: All listeners set up for company ${this.companyId}`);
    }

    sendToServiceWorker(type, data) {
        const message = {
            type,
            data,
            timestamp: Date.now()
        };

        if (this.isServiceWorkerReady && navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage(message);
        } else {
            // Adicionar à fila se SW não estiver pronto
            this.messageQueue.push(message);
        }
    }

    flushMessageQueue() {
        while (this.messageQueue.length > 0) {
            const message = this.messageQueue.shift();
            if (navigator.serviceWorker.controller) {
                navigator.serviceWorker.controller.postMessage(message);
            }
        }
    }

    handleServiceWorkerMessage(event) {
        const { type, data } = event.data;
        
        console.log('SocketBridge: Message from SW:', type, data);

        switch (type) {
            case 'SW_READY':
                console.log('SocketBridge: Service Worker is ready');
                break;
                
            case 'BACKGROUND_MODE_ENABLED':
                console.log('SocketBridge: Background mode enabled');
                break;
                
            case 'BACKGROUND_MODE_DISABLED':
                console.log('SocketBridge: Background mode disabled');
                break;
                
            case 'NOTIFICATION_CLICKED':
                console.log('SocketBridge: Notification clicked, data:', data);
                // Aqui você pode implementar navegação ou outras ações
                break;
                
            case 'NEW_MESSAGE':
                console.log('SocketBridge: New message from SW, forwarding to socket listeners:', data);
                // Simular um evento de socket para que os componentes recebam a mensagem
                this.forwardMessageToComponents(data);
                break;
                
            case 'TICKET_UPDATE':
                console.log('SocketBridge: Ticket update from SW, forwarding to socket listeners:', data);
                this.forwardTicketUpdateToComponents(data);
                break;
                
            default:
                console.log('SocketBridge: Unknown SW message:', type);
        }
    }

    // Método para enviar notificação personalizada
    sendNotification(title, body, options = {}) {
        this.sendToServiceWorker('USER_NOTIFICATION', {
            title,
            body,
            ...options
        });
    }

    // Método para sinalizar nova mensagem manualmente
    signalNewMessage(messageData) {
        this.sendToServiceWorker('NEW_MESSAGE', messageData);
    }

    // Método para sinalizar update de ticket manualmente  
    signalTicketUpdate(ticketData) {
        this.sendToServiceWorker('TICKET_UPDATE', ticketData);
    }

    // Métodos para encaminhar mensagens do SW para os componentes
    forwardMessageToComponents(messageData) {
        console.log('SocketBridge: Forwarding message to components via socket event simulation');
        
        if (this.socket && this.socket.socket && this.companyId) {
            // Simular o evento de socket que os componentes esperam
            const eventData = {
                action: 'create',
                message: messageData,
                ticket: { id: messageData.ticketId, status: 'open' }, // dados mínimos do ticket
                contact: messageData.contact || {}
            };
            
            console.log('SocketBridge: Emitting simulated company-appMessage event:', eventData);
            
            // Disparar o evento manualmente para todos os listeners
            this.socket.emit(`company-${this.companyId}-appMessage`, eventData);
        } else {
            console.warn('SocketBridge: Cannot forward message - socket not ready or no companyId');
        }
    }

    forwardTicketUpdateToComponents(ticketData) {
        console.log('SocketBridge: Forwarding ticket update to components via socket event simulation');
        
        if (this.socket && this.socket.socket && this.companyId) {
            const eventData = {
                action: 'update',
                ticket: ticketData
            };
            
            console.log('SocketBridge: Emitting simulated company-ticket event:', eventData);
            this.socket.emit(`company-${this.companyId}-ticket`, eventData);
        } else {
            console.warn('SocketBridge: Cannot forward ticket update - socket not ready or no companyId');
        }
    }
}

// Singleton instance
const socketToSWBridge = new SocketToSWBridge();

export default socketToSWBridge;
