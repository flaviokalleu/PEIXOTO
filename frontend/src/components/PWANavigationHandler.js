import { useEffect } from 'react';
import { useHistory } from 'react-router-dom';

const PWANavigationHandler = () => {
  const history = useHistory();

  useEffect(() => {
    // Handle service worker messages
    const handleSWMessage = (event) => {
      const { type, data } = event.data;
      
      switch (type) {
        case 'NOTIFICATION_CLICKED':
          console.log('PWA: Notification clicked, navigating to:', data.url);
          if (data.url) {
            history.push(data.url);
          }
          break;
          
        case 'SW_HEARTBEAT_SUCCESS':
          console.log('PWA: Heartbeat successful');
          break;
          
        case 'SW_HEARTBEAT_FAILED':
          console.log('PWA: Heartbeat failed');
          break;
          
        case 'SESSION_EXPIRED':
          console.log('PWA: Session expired');
          history.push('/login');
          break;
          
        default:
          console.log('PWA: Unknown message type:', type);
      }
    };

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', handleSWMessage);
    }

    return () => {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', handleSWMessage);
      }
    };
  }, [history]);

  // Component doesn't render anything
  return null;
};

export default PWANavigationHandler;
