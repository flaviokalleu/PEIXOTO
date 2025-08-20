import Prompt from "../models/Prompt";
import { createGroq } from "@ai-sdk/groq";
import OpenAI from "openai";
import Groq from "groq-sdk";

interface ApiKeyHealth {
  provider: 'openai' | 'groq';
  key: string;
  isValid: boolean;
  lastChecked: Date;
  lastError?: string;
  companyId?: number;
  queueId?: number;
}

class ApiKeyMonitor {
  private healthCache = new Map<string, ApiKeyHealth>();
  private checkInterval = 5 * 60 * 1000; // 5 minutes
  private isRunning = false;

  constructor() {
    this.startMonitoring();
  }

  private startMonitoring() {
    if (this.isRunning) return;
    this.isRunning = true;
    
    setInterval(async () => {
      await this.checkAllKeys();
    }, this.checkInterval);
  }

  private async checkAllKeys() {
    try {
      const prompts = await Prompt.findAll({
        where: {
          apiKey: { $ne: null }
        }
      });

      for (const prompt of prompts) {
        if (prompt.apiKey) {
          await this.checkApiKey(prompt.apiKey, 'openai', prompt.companyId, prompt.queueId);
          
          // Check if it's also a Groq key
          if (prompt.apiKey.startsWith('gsk_') || prompt.model?.includes('groq')) {
            await this.checkApiKey(prompt.apiKey, 'groq', prompt.companyId, prompt.queueId);
          }
        }
      }
    } catch (error) {
      console.error('Error monitoring API keys:', error);
    }
  }

  async checkApiKey(
    apiKey: string, 
    provider: 'openai' | 'groq', 
    companyId?: number, 
    queueId?: number
  ): Promise<boolean> {
    const cacheKey = `${provider}:${apiKey}`;
    
    try {
      let isValid = false;
      
      if (provider === 'openai') {
        const openai = new OpenAI({ apiKey });
        await openai.models.list();
        isValid = true;
      } else if (provider === 'groq') {
        const groq = createGroq({ apiKey });
        // Test Groq API with a simple request
        try {
          const { generateText } = await import('ai');
          await generateText({
            model: groq('llama-3.1-8b-instant'),
            prompt: 'test'
          });
          isValid = true;
        } catch (error) {
          console.error('Groq test failed:', error);
          isValid = false;
        }
      }

      this.healthCache.set(cacheKey, {
        provider,
        key: apiKey,
        isValid,
        lastChecked: new Date(),
        companyId,
        queueId
      });

      return isValid;
    } catch (error: any) {
      console.error(`API key validation failed for ${provider}:`, error.message);
      
      this.healthCache.set(cacheKey, {
        provider,
        key: apiKey,
        isValid: false,
        lastChecked: new Date(),
        lastError: error.message,
        companyId,
        queueId
      });

      // If key is invalid, mark it in database
      if (this.isKeyExpiredError(error)) {
        await this.markKeyInvalidInDB(apiKey, provider, error);
      }

      return false;
    }
  }

  private isKeyExpiredError(error: any): boolean {
    return (
      error.status === 401 ||
      error.status === 400 ||
      /API key expired/i.test(error.message) ||
      /invalid api key/i.test(error.message) ||
      /API key not valid/i.test(error.message) ||
      error.errorDetails?.some((detail: any) => detail.reason === 'API_KEY_INVALID')
    );
  }

  private async markKeyInvalidInDB(apiKey: string, provider: string, error: any) {
    try {
      await Prompt.update(
        { 
          apiKey: null,
          name: `${provider}_invalid_${Date.now()}`
        },
        { 
          where: { apiKey } 
        }
      );
      console.log(`Marked ${provider} API key as invalid in database`);
    } catch (dbError) {
      console.error('Error marking API key as invalid in database:', dbError);
    }
  }

  getKeyHealth(apiKey: string, provider: 'openai' | 'groq'): ApiKeyHealth | null {
    const cacheKey = `${provider}:${apiKey}`;
    return this.healthCache.get(cacheKey) || null;
  }

  getAllHealthyKeys(provider: 'openai' | 'groq'): ApiKeyHealth[] {
    return Array.from(this.healthCache.values())
      .filter(health => health.provider === provider && health.isValid);
  }

  getKeyStats() {
    const stats = {
      total: this.healthCache.size,
      valid: 0,
      invalid: 0,
      openai: { total: 0, valid: 0 },
      groq: { total: 0, valid: 0 }
    };

    for (const health of this.healthCache.values()) {
      if (health.isValid) {
        stats.valid++;
        stats[health.provider].valid++;
      } else {
        stats.invalid++;
      }
      stats[health.provider].total++;
    }

    return stats;
  }
}

export const apiKeyMonitor = new ApiKeyMonitor();
export { ApiKeyHealth };
