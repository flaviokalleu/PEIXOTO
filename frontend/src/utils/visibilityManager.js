class VisibilityManager {
    constructor() {
        this.isVisible = !document.hidden;
        this.handlers = {
            visible: [],
            hidden: []
        };
        
        this.init();
    }

    init() {
        document.addEventListener('visibilitychange', () => {
            this.isVisible = !document.hidden;
            
            if (this.isVisible) {
                this.trigger('visible');
                this.syncWithServer();
            } else {
                this.trigger('hidden');
                this.enableBackgroundMode();
            }
        });

        // Page lifecycle events
        window.addEventListener('beforeunload', () => {
            this.enableBackgroundMode();
        });

        window.addEventListener('pagehide', () => {
            this.enableBackgroundMode();
        });

        // Focus events
        window.addEventListener('focus', () => {
            this.trigger('visible');
            this.syncWithServer();
        });

        window.addEventListener('blur', () => {
            this.trigger('hidden');
        });
    }

    on(event, handler) {
        if (this.handlers[event]) {
            this.handlers[event].push(handler);
        }
    }

    off(event, handler) {
        if (this.handlers[event]) {
            const index = this.handlers[event].indexOf(handler);
            if (index > -1) {
                this.handlers[event].splice(index, 1);
            }
        }
    }

    trigger(event) {
        if (this.handlers[event]) {
            this.handlers[event].forEach(handler => {
                try {
                    handler();
                } catch (error) {
                    console.error('Error in visibility handler:', error);
                }
            });
        }
    }

    syncWithServer() {
        // Sincroniza dados quando a página fica visível
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({
                type: 'SYNC_REQUEST',
                timestamp: Date.now()
            });
        }
    }

    enableBackgroundMode() {
        // Ativa modo de segundo plano
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({
                type: 'ENABLE_BACKGROUND_MODE',
                timestamp: Date.now()
            });
        }
    }

    getVisibilityState() {
        return {
            isVisible: this.isVisible,
            documentHidden: document.hidden,
            documentVisibilityState: document.visibilityState,
            hasFocus: document.hasFocus()
        };
    }
}

// Singleton instance
const visibilityManager = new VisibilityManager();

export default visibilityManager;
