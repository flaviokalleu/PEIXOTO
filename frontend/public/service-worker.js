const CACHE_NAME = 'metabot-realtime-v1';
const API_BASE_URL = 'https://localhost:8443';

// URLs essenciais para cache
const urlsToCache = [
    '/',
    '/static/css/main.css',
    '/static/js/main.js',
    '/manifest.json',
    '/favicon.ico'
];

// Configuração de notificações em tempo real
let isBackgroundMode = false;
let heartbeatInterval = null;
let notificationQueue = [];
let clientConnections = new Map();

// Install Event
self.addEventListener('install', event => {
    console.log('SW: Installing...');
    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('SW: Cache opened');
                return cache.addAll(urlsToCache);
            })
            .then(() => {
                console.log('SW: Skip waiting');
                return self.skipWaiting();
            })
            .catch(error => {
                console.error('SW: Cache failed', error);
            })
    );
});

// Activate Event
self.addEventListener('activate', event => {
    console.log('SW: Activating...');
    
    event.waitUntil(
        Promise.all([
            // Limpar caches antigos
            caches.keys().then(cacheNames => {
                return Promise.all(
                    cacheNames.map(cacheName => {
                        if (cacheName !== CACHE_NAME) {
                            console.log('SW: Deleting old cache', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            }),
            // Assumir controle imediatamente
            self.clients.claim()
        ]).then(() => {
            console.log('SW: Activated successfully');
            notifyClients('SW_READY', { timestamp: Date.now() });
        })
    );
});

// Message Handler - Comunicação com o frontend
self.addEventListener('message', event => {
    const { type, data } = event.data;
    
    console.log('SW: Message received:', type);
    
    switch (type) {
        case 'SOCKET_MESSAGE':
            handleSocketMessage(data);
            break;
            
        case 'CLIENT_FOCUS':
            handleClientFocus(event.source.id);
            break;
            
        case 'CLIENT_BLUR':
            handleClientBlur(event.source.id);
            break;
            
        case 'ENABLE_BACKGROUND_MODE':
            enableBackgroundMode();
            break;
            
        case 'DISABLE_BACKGROUND_MODE':
            disableBackgroundMode();
            break;
            
        case 'NEW_MESSAGE':
            handleNewMessage(data);
            break;
            
        case 'TICKET_UPDATE':
            handleTicketUpdate(data);
            break;
            
        case 'USER_NOTIFICATION':
            handleUserNotification(data);
            break;
            
        case 'HEARTBEAT_RESPONSE':
            console.log('SW: Heartbeat response received');
            break;
            
        default:
            console.log('SW: Unknown message type:', type);
    }
});

// Push Notifications
self.addEventListener('push', event => {
    console.log('SW: Push notification received');
    
    let notificationData = {
        title: 'MetaBot',
        body: 'Nova mensagem recebida',
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        tag: 'metabot-message',
        requireInteraction: true,
        data: {
            timestamp: Date.now(),
            url: '/tickets'
        }
    };
    
    if (event.data) {
        try {
            const pushData = event.data.json();
            notificationData = { ...notificationData, ...pushData };
        } catch (error) {
            console.error('SW: Error parsing push data:', error);
        }
    }
    
    event.waitUntil(
        self.registration.showNotification(notificationData.title, notificationData)
    );
});

// Notification Click
self.addEventListener('notificationclick', event => {
    console.log('SW: Notification clicked');
    
    event.notification.close();
    
    const urlToOpen = event.notification.data?.url || '/tickets';
    
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then(clientList => {
                // Tentar focar em uma janela existente
                for (let client of clientList) {
                    if (client.url.includes(self.location.origin) && 'focus' in client) {
                        client.postMessage({
                            type: 'NOTIFICATION_CLICKED',
                            data: event.notification.data
                        });
                        return client.focus();
                    }
                }
                
                // Abrir nova janela se necessário
                if (clients.openWindow) {
                    return clients.openWindow(urlToOpen);
                }
            })
    );
});

// Fetch Handler
self.addEventListener('fetch', event => {
    // Estratégia simples: Network first, fallback para cache
    event.respondWith(
        fetch(event.request)
            .then(response => {
                // Se a resposta é válida, cache e retorne
                if (response && response.status === 200 && response.type === 'basic') {
                    const responseToCache = response.clone();
                    
                    caches.open(CACHE_NAME)
                        .then(cache => {
                            cache.put(event.request, responseToCache);
                        });
                }
                
                return response;
            })
            .catch(() => {
                // Se offline, tentar cache
                return caches.match(event.request)
                    .then(response => {
                        if (response) {
                            return response;
                        }
                        
                        // Fallback para página inicial
                        if (event.request.destination === 'document') {
                            return caches.match('/');
                        }
                    });
            })
    );
});

// Funções auxiliares
function handleSocketMessage(data) {
    console.log('SW: Socket message received:', data);
    
    // Se estamos em background, mostrar notificação
    if (isBackgroundMode) {
        showNotificationForMessage(data);
    }
    
    // Sempre repassar para clientes ativos
    notifyClients('SOCKET_MESSAGE', data);
}

function handleNewMessage(data) {
    console.log('SW: New message:', data);
    
    // Verificar se há clientes focados
    const hasActiveClients = Array.from(clientConnections.values()).some(client => client.isFocused);
    
    if (!hasActiveClients || isBackgroundMode) {
        // Mostrar notificação se não há clientes ativos ou estamos em background
        showNotificationForMessage(data);
    }
    
    // Sempre notificar clientes
    notifyClients('NEW_MESSAGE', data);
}

function handleTicketUpdate(data) {
    console.log('SW: Ticket update:', data);
    
    if (isBackgroundMode) {
        showNotificationForTicket(data);
    }
    
    notifyClients('TICKET_UPDATE', data);
}

function handleUserNotification(data) {
    console.log('SW: User notification:', data);
    
    showCustomNotification(data);
    notifyClients('USER_NOTIFICATION', data);
}

function handleClientFocus(clientId) {
    console.log('SW: Client focused:', clientId);
    
    if (clientConnections.has(clientId)) {
        clientConnections.get(clientId).isFocused = true;
    } else {
        clientConnections.set(clientId, { isFocused: true });
    }
    
    // Se algum cliente está focado, desativar modo background
    if (isBackgroundMode) {
        disableBackgroundMode();
    }
}

function handleClientBlur(clientId) {
    console.log('SW: Client blurred:', clientId);
    
    if (clientConnections.has(clientId)) {
        clientConnections.get(clientId).isFocused = false;
    }
    
    // Se nenhum cliente está focado, ativar modo background
    const hasActiveClients = Array.from(clientConnections.values()).some(client => client.isFocused);
    if (!hasActiveClients) {
        enableBackgroundMode();
    }
}

function enableBackgroundMode() {
    isBackgroundMode = true;
    console.log('SW: Background mode enabled');
    
    notifyClients('BACKGROUND_MODE_ENABLED', { timestamp: Date.now() });
    
    // Iniciar heartbeat mais agressivo
    startBackgroundHeartbeat();
}

function disableBackgroundMode() {
    isBackgroundMode = false;
    console.log('SW: Background mode disabled');
    
    notifyClients('BACKGROUND_MODE_DISABLED', { timestamp: Date.now() });
    
    // Parar heartbeat background
    stopBackgroundHeartbeat();
}

function startBackgroundHeartbeat() {
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
    }
    
    heartbeatInterval = setInterval(() => {
        performBackgroundSync();
    }, 15000); // A cada 15 segundos em background
    
    console.log('SW: Background heartbeat started');
}

function stopBackgroundHeartbeat() {
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
        console.log('SW: Background heartbeat stopped');
    }
}

async function performBackgroundSync() {
    try {
        console.log('SW: Performing background sync...');
        
        // Verificar se estamos online antes de tentar fetch
        if (!navigator.onLine) {
            console.log('SW: Offline, skipping background sync');
            return;
        }
        
        // Verificar mensagens pendentes - corrigindo URL
        const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
            credentials: 'include',
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (response.ok) {
            console.log('SW: Background sync successful - user authenticated');
        } else {
            console.log('SW: Background sync - auth check failed:', response.status);
        }
        
    } catch (error) {
        console.log('SW: Background sync failed (expected when app is not logged in):', error.message);
    }
}

function showNotificationForMessage(messageData) {
    const title = `Nova mensagem - ${messageData.contact?.name || 'Contato'}`;
    const body = messageData.body || 'Você recebeu uma nova mensagem';
    
    const options = {
        body: body.length > 100 ? body.substring(0, 100) + '...' : body,
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        tag: `message-${messageData.ticketId || messageData.id}`,
        requireInteraction: true,
        data: {
            messageId: messageData.id,
            ticketId: messageData.ticketId,
            url: `/tickets/${messageData.ticketId}`,
            timestamp: Date.now()
        },
        actions: [
            {
                action: 'reply',
                title: 'Responder'
            },
            {
                action: 'view',
                title: 'Visualizar'
            }
        ]
    };
    
    self.registration.showNotification(title, options);
}

function showNotificationForTicket(ticketData) {
    const title = `Ticket ${ticketData.status || 'atualizado'}`;
    const body = `Ticket #${ticketData.id} - ${ticketData.contact?.name || 'Contato'}`;
    
    const options = {
        body,
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        tag: `ticket-${ticketData.id}`,
        requireInteraction: false,
        data: {
            ticketId: ticketData.id,
            url: `/tickets/${ticketData.id}`,
            timestamp: Date.now()
        }
    };
    
    self.registration.showNotification(title, options);
}

function showCustomNotification(notificationData) {
    const options = {
        body: notificationData.body || 'Notificação do sistema',
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        tag: notificationData.tag || 'system-notification',
        requireInteraction: notificationData.requireInteraction || false,
        data: {
            ...notificationData.data,
            timestamp: Date.now()
        }
    };
    
    self.registration.showNotification(notificationData.title || 'MetaBot', options);
}

function notifyClients(type, data) {
    self.clients.matchAll({ includeUncontrolled: true })
        .then(clients => {
            clients.forEach(client => {
                client.postMessage({
                    type,
                    data,
                    timestamp: Date.now()
                });
            });
        });
}

console.log('SW: Real-time Service Worker loaded');
