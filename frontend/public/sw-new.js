const CACHE_NAME = 'metabot-pwa-v1';
const API_BASE_URL = 'https://localhost:8443';

// URLs para cache offline
const urlsToCache = [
    '/',
    '/static/css/main.css',
    '/static/js/main.js',
    '/manifest.json',
    '/favicon.ico'
];

// Configuração de heartbeat
let heartbeatInterval = null;
let isBackgroundMode = false;
let clientConnected = false;

// Install Service Worker
self.addEventListener('install', event => {
    console.log('Service Worker installing...');
    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Cache opened');
                return cache.addAll(urlsToCache);
            })
            .then(() => {
                return self.skipWaiting();
            })
    );
});

// Activate Service Worker
self.addEventListener('activate', event => {
    console.log('Service Worker activating...');
    
    event.waitUntil(
        Promise.all([
            caches.keys().then(cacheNames => {
                return Promise.all(
                    cacheNames.map(cacheName => {
                        if (cacheName !== CACHE_NAME) {
                            console.log('Deleting old cache:', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            }),
            self.clients.claim()
        ]).then(() => {
            console.log('Service Worker activated');
            notifyClients('SW_READY', { timestamp: Date.now() });
            startBackgroundHeartbeat();
        })
    );
});

// Message Handler
self.addEventListener('message', event => {
    const { type, data } = event.data;
    
    console.log('SW received message:', type);
    
    switch (type) {
        case 'ENABLE_BACKGROUND_MODE':
            enableBackgroundMode();
            break;
            
        case 'DISABLE_BACKGROUND_MODE':
            disableBackgroundMode();
            break;
            
        case 'VISIBILITY_CHANGE':
            handleVisibilityChange(data.isHidden);
            break;
            
        case 'SYNC_REQUEST':
            performSync();
            break;
            
        case 'HEARTBEAT_SUCCESS':
            console.log('Heartbeat successful from client');
            break;
            
        case 'HEARTBEAT_FAILED':
            console.log('Heartbeat failed from client:', data);
            handleHeartbeatFailure(data);
            break;
            
        case 'HEARTBEAT_CRITICAL_FAILURE':
            console.log('Critical heartbeat failure:', data);
            handleCriticalFailure();
            break;
            
        case 'CLIENT_CONNECTED':
            clientConnected = true;
            console.log('Client connected');
            break;
            
        case 'CLIENT_DISCONNECTED':
            clientConnected = false;
            console.log('Client disconnected');
            break;
            
        default:
            console.log('Unknown message type:', type);
    }
});

// Background Sync
self.addEventListener('sync', event => {
    console.log('Background sync triggered:', event.tag);
    
    if (event.tag === 'content-sync') {
        event.waitUntil(performSync());
    } else if (event.tag === 'heartbeat-sync') {
        event.waitUntil(performHeartbeat());
    }
});

// Push Notifications
self.addEventListener('push', event => {
    console.log('Push notification received');
    
    let title = 'MetaBot';
    let options = {
        body: 'Nova mensagem recebida',
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        tag: 'metabot-notification',
        requireInteraction: true,
        persistent: true,
        data: {
            timestamp: Date.now(),
            url: '/'
        }
    };
    
    if (event.data) {
        try {
            const data = event.data.json();
            title = data.title || title;
            options.body = data.body || options.body;
            options.data = { ...options.data, ...data };
        } catch (error) {
            console.error('Error parsing push data:', error);
        }
    }
    
    event.waitUntil(
        self.registration.showNotification(title, options)
    );
});

// Notification Click
self.addEventListener('notificationclick', event => {
    console.log('Notification clicked');
    
    event.notification.close();
    
    const urlToOpen = event.notification.data?.url || '/';
    
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then(clientList => {
                for (let client of clientList) {
                    if (client.url.includes(self.location.origin) && 'focus' in client) {
                        client.postMessage({
                            type: 'NOTIFICATION_CLICKED',
                            data: event.notification.data
                        });
                        return client.focus();
                    }
                }
                
                if (clients.openWindow) {
                    return clients.openWindow(urlToOpen);
                }
            })
    );
});

// Fetch Handler
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);
    
    if (url.origin !== location.origin) {
        return;
    }
    
    if (event.request.destination === 'style' || 
        event.request.destination === 'script' || 
        event.request.destination === 'image') {
        
        event.respondWith(
            caches.match(event.request)
                .then(response => {
                    return response || fetch(event.request)
                        .then(fetchResponse => {
                            const responseClone = fetchResponse.clone();
                            caches.open(CACHE_NAME)
                                .then(cache => {
                                    cache.put(event.request, responseClone);
                                });
                            return fetchResponse;
                        });
                })
                .catch(() => {
                    if (event.request.destination === 'image') {
                        return caches.match('/favicon.ico');
                    }
                })
        );
        return;
    }
    
    if (url.pathname.startsWith('/api/') || url.pathname.includes('heartbeat')) {
        event.respondWith(
            fetch(event.request)
                .catch(() => {
                    return caches.match(event.request);
                })
        );
        return;
    }
    
    event.respondWith(
        fetch(event.request)
            .catch(() => {
                return caches.match(event.request)
                    .then(response => {
                        return response || caches.match('/');
                    });
            })
    );
});

// Background Functions
function enableBackgroundMode() {
    isBackgroundMode = true;
    console.log('Background mode enabled');
    
    notifyClients('BACKGROUND_STATE', { isBackground: true });
    startBackgroundHeartbeat();
}

function disableBackgroundMode() {
    isBackgroundMode = false;
    console.log('Background mode disabled');
    
    notifyClients('BACKGROUND_STATE', { isBackground: false });
    stopBackgroundHeartbeat();
}

function handleVisibilityChange(isHidden) {
    if (isHidden) {
        enableBackgroundMode();
    } else {
        disableBackgroundMode();
    }
}

function startBackgroundHeartbeat() {
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
    }
    
    heartbeatInterval = setInterval(() => {
        performHeartbeat();
    }, 30000);
    
    console.log('Background heartbeat started');
}

function stopBackgroundHeartbeat() {
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
        console.log('Background heartbeat stopped');
    }
}

async function performHeartbeat() {
    try {
        const response = await fetch(`${API_BASE_URL}/heartbeat`, {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            console.log('SW Heartbeat successful:', data);
            notifyClients('SW_HEARTBEAT_SUCCESS', data);
        } else {
            throw new Error(`HTTP ${response.status}`);
        }
        
    } catch (error) {
        console.error('SW Heartbeat failed:', error);
        notifyClients('SW_HEARTBEAT_FAILED', { error: error.message });
    }
}

async function performSync() {
    try {
        console.log('Performing background sync...');
        
        const sessionResponse = await fetch(`${API_BASE_URL}/session-status`, {
            credentials: 'include'
        });
        
        if (sessionResponse.ok) {
            const sessionData = await sessionResponse.json();
            notifyClients('SESSION_STATUS', sessionData);
        }
        
        const notificationsResponse = await fetch(`${API_BASE_URL}/pending-notifications`, {
            credentials: 'include'
        });
        
        if (notificationsResponse.ok) {
            const notificationsData = await notificationsResponse.json();
            
            if (notificationsData.count > 0) {
                notifyClients('PENDING_NOTIFICATIONS', notificationsData);
                
                if (isBackgroundMode) {
                    showBackgroundNotification(notificationsData);
                }
            }
        }
        
    } catch (error) {
        console.error('Background sync failed:', error);
    }
}

function handleHeartbeatFailure(data) {
    if (data.failureCount >= 2) {
        performSync();
    }
}

function handleCriticalFailure() {
    console.log('Handling critical failure - clearing heartbeat');
    stopBackgroundHeartbeat();
    
    notifyClients('SESSION_EXPIRED', {
        message: 'Sessão expirada. Faça login novamente.'
    });
}

function showBackgroundNotification(data) {
    const title = 'MetaBot - Novas Mensagens';
    const options = {
        body: `Você tem ${data.count} mensagem(ns) não lida(s)`,
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        tag: 'background-notification',
        requireInteraction: true,
        persistent: true,
        data: {
            timestamp: Date.now(),
            url: '/tickets',
            count: data.count
        }
    };
    
    self.registration.showNotification(title, options);
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

console.log('Service Worker loaded');
