import { useState, useEffect, useCallback } from 'react';

export const usePWABackground = () => {
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [isInstalled, setIsInstalled] = useState(false);
    const [isBackground, setIsBackground] = useState(false);
    const [swReady, setSwReady] = useState(false);

    useEffect(() => {
        // Detecta se é um PWA instalado
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
        const isNavigatorStandalone = window.navigator.standalone === true;
        setIsInstalled(isStandalone || isNavigatorStandalone);

        // Listeners para conexão
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        // Service Worker listeners
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.addEventListener('message', (event) => {
                const { type, data } = event.data;
                
                switch (type) {
                    case 'SW_READY':
                        setSwReady(true);
                        break;
                    case 'BACKGROUND_STATE':
                        setIsBackground(data.isBackground);
                        break;
                    case 'NOTIFICATION_RECEIVED':
                        console.log('Nova notificação recebida:', data);
                        break;
                    default:
                        break;
                }
            });

            // Verifica se SW está ativo
            if (navigator.serviceWorker.controller) {
                setSwReady(true);
            }
        }

        // Visibility API
        const handleVisibilityChange = () => {
            setIsBackground(document.hidden);
            
            if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
                navigator.serviceWorker.controller.postMessage({
                    type: 'VISIBILITY_CHANGE',
                    isHidden: document.hidden,
                    timestamp: Date.now()
                });
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, []);

    const requestNotificationPermission = useCallback(async () => {
        if ('Notification' in window) {
            const permission = await Notification.requestPermission();
            return permission === 'granted';
        }
        return false;
    }, []);

    const sendMessageToSW = useCallback((message) => {
        if (swReady && navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage(message);
        }
    }, [swReady]);

    const enableBackgroundSync = useCallback(() => {
        sendMessageToSW({
            type: 'ENABLE_BACKGROUND_SYNC',
            timestamp: Date.now()
        });
    }, [sendMessageToSW]);

    const disableBackgroundSync = useCallback(() => {
        sendMessageToSW({
            type: 'DISABLE_BACKGROUND_SYNC',
            timestamp: Date.now()
        });
    }, [sendMessageToSW]);

    const syncData = useCallback(() => {
        sendMessageToSW({
            type: 'SYNC_REQUEST',
            timestamp: Date.now()
        });
    }, [sendMessageToSW]);

    return {
        isOnline,
        isInstalled,
        isBackground,
        swReady,
        requestNotificationPermission,
        enableBackgroundSync,
        disableBackgroundSync,
        syncData,
        sendMessageToSW
    };
};
