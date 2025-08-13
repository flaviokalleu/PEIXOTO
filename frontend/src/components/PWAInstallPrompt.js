import React, { useState, useEffect } from 'react';
import { Button, Snackbar, IconButton } from '@material-ui/core';
import { Close as CloseIcon, GetApp as InstallIcon } from '@material-ui/icons';

const PWAInstallPrompt = () => {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Verificar se já está instalado
    const checkInstalled = () => {
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
      const isNavigatorStandalone = window.navigator.standalone === true;
      setIsInstalled(isStandalone || isNavigatorStandalone);
    };

    checkInstalled();

    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallPrompt(true);
      console.log('PWA install prompt available');
    };

    const handleAppInstalled = () => {
      console.log('PWA was installed');
      setIsInstalled(true);
      setShowInstallPrompt(false);
      setDeferredPrompt(null);
    };

    const handlePWAInstallAvailable = (e) => {
      setDeferredPrompt(e.detail);
      setShowInstallPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    window.addEventListener('pwa-install-available', handlePWAInstallAvailable);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      window.removeEventListener('pwa-install-available', handlePWAInstallAvailable);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    try {
      // Solicitar permissão de notificação antes da instalação
      if ('Notification' in window && Notification.permission === 'default') {
        await Notification.requestPermission();
      }

      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      
      console.log(`PWA install outcome: ${outcome}`);
      
      if (outcome === 'accepted') {
        console.log('User accepted the install prompt');
        
        // Solicitar permissão de notificação após instalação se ainda não foi concedida
        if ('Notification' in window && Notification.permission === 'default') {
          setTimeout(async () => {
            await Notification.requestPermission();
          }, 2000);
        }
      } else {
        console.log('User dismissed the install prompt');
      }
      
      setDeferredPrompt(null);
      setShowInstallPrompt(false);
    } catch (error) {
      console.error('Error during PWA installation:', error);
    }
  };

  const handleClose = () => {
    setShowInstallPrompt(false);
  };

  // Não mostrar se já instalado
  if (isInstalled) {
    return null;
  }

  return (
    <Snackbar
      open={showInstallPrompt}
      message="Instalar MetaBot como aplicativo"
      action={
        <>
          <Button
            color="secondary"
            size="small"
            onClick={handleInstallClick}
            startIcon={<InstallIcon />}
          >
            Instalar
          </Button>
          <IconButton
            size="small"
            aria-label="close"
            color="inherit"
            onClick={handleClose}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </>
      }
      anchorOrigin={{
        vertical: 'bottom',
        horizontal: 'center',
      }}
    />
  );
};

export default PWAInstallPrompt;
