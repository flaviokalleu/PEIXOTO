import React, { useEffect } from 'react';
import { useHistory } from 'react-router-dom';

const PWANavigationHandler = () => {
  const history = useHistory();

  useEffect(() => {
    // Listener para mensagens do service worker
    const handleServiceWorkerMessage = (event) => {
      if (event.data && event.data.type === 'NAVIGATE_TO_TICKET') {
        const ticketId = event.data.ticketId;
        if (ticketId) {
          history.push(`/tickets/${ticketId}`);
        }
      }
    };

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', handleServiceWorkerMessage);
    }

    return () => {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', handleServiceWorkerMessage);
      }
    };
  }, [history]);

  return null; // Este componente não renderiza nada
};

export default PWANavigationHandler;
