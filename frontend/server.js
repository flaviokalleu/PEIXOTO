//simple express server to run frontend production build;
const express = require("express");
const path = require("path");
const app = express();

// Configurar headers para PWA e Service Worker
app.use((req, res, next) => {
  // Headers de segurança para PWA
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // Headers específicos para Service Worker
  if (req.url.endsWith('service-worker.js')) {
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Service-Worker-Allowed', '/');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  }
  
  // Headers para manifest.json
  if (req.url.endsWith('manifest.json')) {
    res.setHeader('Content-Type', 'application/manifest+json');
  }
  
  next();
});

app.use(express.static(path.join(__dirname, "build")));

// Servir service worker da pasta public para desenvolvimento
if (process.env.NODE_ENV !== 'production') {
  app.use(express.static(path.join(__dirname, "public")));
}

app.get("/*", function (req, res) {
	res.sendFile(path.join(__dirname, "build", "index.html"));
});

app.listen(3000);

