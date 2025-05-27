import path from "path";
import fs from "fs";

// Force reload environment variables
import dotenv from 'dotenv';
dotenv.config();

// Debug environment loading
console.log("=== ENVIRONMENT VARIABLES DEBUG ===");
console.log("NODE_ENV:", process.env.NODE_ENV);
console.log("GERENCIANET_SANDBOX:", process.env.GERENCIANET_SANDBOX);
console.log("GERENCIANET_CLIENT_ID:", process.env.GERENCIANET_CLIENT_ID ? `${process.env.GERENCIANET_CLIENT_ID.substr(0, 15)}...` : "NOT SET");
console.log("GERENCIANET_CLIENT_SECRET:", process.env.GERENCIANET_CLIENT_SECRET ? `${process.env.GERENCIANET_CLIENT_SECRET.substr(0, 15)}...` : "NOT SET");
console.log("GERENCIANET_PIX_CERT:", process.env.GERENCIANET_PIX_CERT);
console.log("=== END ENV DEBUG ===");

// Certificate path
const certFileName = process.env.GERENCIANET_PIX_CERT || "certificadoEfi";
const cert = path.join(__dirname, `../../certs/${certFileName}.p12`);

// Validate certificate path and try alternatives if needed
let finalCertPath = cert;

if (!fs.existsSync(cert)) {
  console.log(`Primary certificate path not found: ${cert}`);
  
  const alternatives = [
    path.join(process.cwd(), 'certs', 'certificadoEfi.p12'),
    path.join(__dirname, '../../../certs/certificadoEfi.p12'),
    'C:\\Users\\Flavio\\Documents\\GitHub\\PARNAZAPOK\\Witicket\\backend\\certs\\certificadoEfi.p12'
  ];
  
  for (const altPath of alternatives) {
    if (fs.existsSync(altPath)) {
      finalCertPath = altPath;
      console.log(`Using alternative certificate path: ${altPath}`);
      break;
    }
  }
}

// Validate credentials
if (!process.env.GERENCIANET_CLIENT_ID) {
  console.error("❌ ERROR: GERENCIANET_CLIENT_ID is not set!");
} else {
  console.log("✅ GERENCIANET_CLIENT_ID is set");
}

if (!process.env.GERENCIANET_CLIENT_SECRET) {
  console.error("❌ ERROR: GERENCIANET_CLIENT_SECRET is not set!");
} else {
  console.log("✅ GERENCIANET_CLIENT_SECRET is set");
}

// Validate certificate
if (!fs.existsSync(finalCertPath)) {
  console.error(`❌ ERROR: Certificate not found at: ${finalCertPath}`);
} else {
  console.log(`✅ Certificate found at: ${finalCertPath}`);
  const stats = fs.statSync(finalCertPath);
  console.log(`Certificate size: ${stats.size} bytes`);
}

const config = {
  sandbox: process.env.GERENCIANET_SANDBOX === "true",
  client_id: process.env.GERENCIANET_CLIENT_ID as string,
  client_secret: process.env.GERENCIANET_CLIENT_SECRET as string,
  certificate: finalCertPath
};

// Final validation
console.log("=== FINAL CONFIG VALIDATION ===");
console.log("Sandbox mode:", config.sandbox);
console.log("Client ID valid:", !!config.client_id && config.client_id.length > 0);
console.log("Client Secret valid:", !!config.client_secret && config.client_secret.length > 0);
console.log("Certificate valid:", fs.existsSync(config.certificate));
console.log("=== END VALIDATION ===");

export = config;