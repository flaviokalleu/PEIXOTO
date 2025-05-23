// middleware/keyVerification.js
import axios from 'axios';
import fs from 'fs';
import path from 'path';

class KeyVerificationService {
  constructor() {
    this.lastVerification = null;
    this.isKeyValid = false;
    this.verificationInterval = 15 * 60 * 60 * 1000; // 15 horas em ms
    this.cacheFile = path.join(process.cwd(), 'key_cache.json');
    this.loadCachedData();
  }

  loadCachedData() {
    try {
      if (fs.existsSync(this.cacheFile)) {
        const cached = JSON.parse(fs.readFileSync(this.cacheFile, 'utf8'));
        this.lastVerification = new Date(cached.lastVerification);
        this.isKeyValid = cached.isKeyValid;
      }
    } catch (error) {
      console.error('Erro ao carregar cache da chave:', error);
    }
  }

  saveCachedData() {
    try {
      const data = {
        lastVerification: this.lastVerification,
        isKeyValid: this.isKeyValid
      };
      fs.writeFileSync(this.cacheFile, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('Erro ao salvar cache da chave:', error);
    }
  }

  needsVerification() {
    if (!this.lastVerification) return true;
    
    const now = new Date();
    const timeDiff = now.getTime() - this.lastVerification.getTime();
    return timeDiff >= this.verificationInterval;
  }

  async verifyKeyFromEnv() {
    try {
      const envKey = process.env.SISTEMA_KEY;
      if (!envKey) {
        console.error('SISTEMA_KEY não encontrada no .env');
        return false;
      }
      
      return envKey;
    } catch (error) {
      console.error('Erro ao verificar chave do .env:', error);
      return false;
    }
  }

  async verifyKeyFromRemote() {
    try {
      const baseUrl = process.env.KEY_VALIDATION_URL || 'https://meusite.com.br';
      const response = await axios.get(`${baseUrl}/key.json`, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Sistema-Verificacao/1.0'
        }
      });

      if (response.data && response.data.keys) {
        return response.data.keys;
      }
      
      return null;
    } catch (error) {
      console.error('Erro ao verificar chave remota:', error);
      return null;
    }
  }

  async performVerification() {
    try {
      console.log('Iniciando verificação de chave...');
      
      // Obter chave do .env
      const envKey = await this.verifyKeyFromEnv();
      if (!envKey) {
        this.isKeyValid = false;
        this.lastVerification = new Date();
        this.saveCachedData();
        return false;
      }

      // Obter chaves válidas do servidor remoto
      const remoteKeys = await this.verifyKeyFromRemote();
      if (!remoteKeys || !Array.isArray(remoteKeys)) {
        // Se não conseguir verificar remotamente, manter estado anterior se existir
        if (this.lastVerification) {
          console.warn('Não foi possível verificar remotamente, mantendo estado anterior');
          return this.isKeyValid;
        }
        this.isKeyValid = false;
        this.lastVerification = new Date();
        this.saveCachedData();
        return false;
      }

      // Verificar se a chave do .env está na lista de chaves válidas
      const keyFound = remoteKeys.find(keyObj => {
        return keyObj.key === envKey && keyObj.active === true;
      });

      this.isKeyValid = !!keyFound;
      this.lastVerification = new Date();
      this.saveCachedData();

      if (this.isKeyValid) {
        console.log('Chave verificada com sucesso!');
      } else {
        console.error('Chave inválida ou inativa!');
      }

      return this.isKeyValid;
    } catch (error) {
      console.error('Erro durante verificação:', error);
      // Em caso de erro, manter estado anterior se existir
      if (this.lastVerification) {
        return this.isKeyValid;
      }
      return false;
    }
  }

  async isValidKey() {
    if (this.needsVerification()) {
      await this.performVerification();
    }
    return this.isKeyValid;
  }

  // Método para forçar nova verificação
  async forceVerification() {
    this.lastVerification = null;
    return await this.performVerification();
  }

  // Método para obter informações de status
  getStatus() {
    return {
      isValid: this.isKeyValid,
      lastVerification: this.lastVerification,
      nextVerification: this.lastVerification 
        ? new Date(this.lastVerification.getTime() + this.verificationInterval)
        : null,
      needsVerification: this.needsVerification()
    };
  }
}

// Instância singleton
const keyVerificationService = new KeyVerificationService();

// Middleware para verificação de chave
export const verifyKey = async (req, res, next) => {
  try {
    const isValid = await keyVerificationService.isValidKey();
    
    if (!isValid) {
      return res.status(403).json({
        error: 'Sistema não autorizado',
        message: 'Chave de acesso inválida ou expirada',
        code: 'INVALID_KEY'
      });
    }

    // Adicionar informações da chave ao request
    req.keyVerification = keyVerificationService.getStatus();
    next();
  } catch (error) {
    console.error('Erro no middleware de verificação:', error);
    return res.status(500).json({
      error: 'Erro interno do servidor',
      message: 'Falha na verificação da chave',
      code: 'VERIFICATION_ERROR'
    });
  }
};

// Middleware opcional para rotas que precisam de verificação menos frequente
export const verifyKeyLight = async (req, res, next) => {
  try {
    // Usa cache mesmo se expirado (para rotas menos críticas)
    const status = keyVerificationService.getStatus();
    
    if (!status.isValid && status.lastVerification) {
      // Se já foi válida antes e ainda não passou muito tempo, permitir
      const timeSinceVerification = new Date().getTime() - status.lastVerification.getTime();
      const maxCacheTime = 24 * 60 * 60 * 1000; // 24 horas
      
      if (timeSinceVerification < maxCacheTime) {
        req.keyVerification = status;
        return next();
      }
    }

    const isValid = await keyVerificationService.isValidKey();
    
    if (!isValid) {
      return res.status(403).json({
        error: 'Sistema não autorizado',
        code: 'INVALID_KEY'
      });
    }

    req.keyVerification = keyVerificationService.getStatus();
    next();
  } catch (error) {
    console.error('Erro no middleware light:', error);
    next(); // Em caso de erro, permitir acesso
  }
};

export default keyVerificationService;