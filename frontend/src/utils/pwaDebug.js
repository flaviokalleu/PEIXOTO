// PWA Debug Helper
window.PWADebug = {
  checkServiceWorker: () => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(registrations => {
        console.log('SW Registrations:', registrations);
        registrations.forEach(registration => {
          console.log('SW Registration:', {
            scope: registration.scope,
            active: registration.active,
            installing: registration.installing,
            waiting: registration.waiting,
            updateViaCache: registration.updateViaCache
          });
        });
      });
    } else {
      console.log('Service Worker not supported');
    }
  },

  checkManifest: () => {
    fetch('/manifest.json')
      .then(response => response.json())
      .then(manifest => {
        console.log('Manifest loaded:', manifest);
        
        // Verificar ícones
        if (manifest.icons) {
          manifest.icons.forEach(icon => {
            const img = new Image();
            img.onload = () => console.log(`Icon ${icon.src} loaded successfully`);
            img.onerror = () => console.error(`Icon ${icon.src} failed to load`);
            img.src = icon.src;
          });
        }
      })
      .catch(error => {
        console.error('Manifest failed to load:', error);
      });
  },

  checkPWAReadiness: () => {
    const isHTTPS = window.location.protocol === 'https:' || window.location.hostname === 'localhost';
    const hasManifest = document.querySelector('link[rel="manifest"]');
    const hasSW = 'serviceWorker' in navigator;
    
    console.log('PWA Readiness Check:');
    console.log('✓ HTTPS/Localhost:', isHTTPS);
    console.log('✓ Manifest link:', !!hasManifest);
    console.log('✓ Service Worker support:', hasSW);
    console.log('✓ Display mode:', window.matchMedia('(display-mode: standalone)').matches ? 'standalone' : 'browser');
    
    if (!isHTTPS) console.error('❌ PWA requires HTTPS or localhost');
    if (!hasManifest) console.error('❌ No manifest link found');
    if (!hasSW) console.error('❌ Service Worker not supported');
    
    return isHTTPS && hasManifest && hasSW;
  },

  simulateInstallPrompt: () => {
    if (window.deferredPrompt) {
      window.deferredPrompt.prompt();
      window.deferredPrompt.userChoice.then(result => {
        console.log('Install prompt result:', result.outcome);
      });
    } else {
      console.log('No deferred install prompt available');
    }
  },

  checkInstallable: () => {
    // Verificar critérios de instalação
    const manifest = document.querySelector('link[rel="manifest"]');
    const sw = 'serviceWorker' in navigator;
    const https = window.location.protocol === 'https:' || window.location.hostname === 'localhost';
    
    if (manifest && sw && https) {
      console.log('✅ PWA appears installable');
      
      // Verificar se beforeinstallprompt foi disparado
      let promptTriggered = false;
      window.addEventListener('beforeinstallprompt', (e) => {
        promptTriggered = true;
        console.log('✅ Install prompt triggered');
      });
      
      setTimeout(() => {
        if (!promptTriggered) {
          console.log('⚠️ Install prompt not triggered yet. Check:');
          console.log('- Wait a few seconds after page load');
          console.log('- Make sure site engagement heuristics are met');
          console.log('- Check that PWA is not already installed');
        }
      }, 3000);
      
    } else {
      console.log('❌ PWA not installable. Missing:');
      if (!manifest) console.log('- Manifest link');
      if (!sw) console.log('- Service Worker support');
      if (!https) console.log('- HTTPS/Localhost');
    }
  }
};

// Auto-run checks in development
if (process.env.NODE_ENV === 'development') {
  setTimeout(() => {
    console.log('🔍 PWA Debug - Auto checking...');
    window.PWADebug.checkPWAReadiness();
    window.PWADebug.checkServiceWorker();
    window.PWADebug.checkManifest();
    window.PWADebug.checkInstallable();
  }, 2000);
}
