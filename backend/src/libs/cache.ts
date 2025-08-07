import util from "util";
import Redis from "ioredis";
import hmacSHA512 from "crypto-js/hmac-sha512";
import Base64 from "crypto-js/enc-base64";
import { REDIS_URI_CONNECTION } from "../config/redis";

class CacheSingleton {
  private redis: Redis;

  private keys: (pattern: string) => Promise<string[]>;

  private static instance: CacheSingleton;

  private constructor(redisInstance: Redis) {
    this.redis = redisInstance;

    this.set = util.promisify(this.redis.set).bind(this.redis);
    this.get = util.promisify(this.redis.get).bind(this.redis);
    this.keys = util.promisify(this.redis.keys).bind(this.redis);
    this.del = util.promisify(this.redis.del).bind(this.redis);
  }

  public static getInstance(redisInstance: Redis): CacheSingleton {
    if (!CacheSingleton.instance) {
      CacheSingleton.instance = new CacheSingleton(redisInstance);
    }
    return CacheSingleton.instance;
  }

  private static encryptParams(params: any) {
    const str = JSON.stringify(params);
    const key = Base64.stringify(hmacSHA512(params, str));
    return key;
  }

  public async set(
    key: string,
    value: string,
    option?: string,
    optionValue?: string | number
  ): Promise<string> {
    try {
      const setPromisefy = util.promisify(this.redis.set).bind(this.redis);
      if (option !== undefined && optionValue !== undefined) {
        return setPromisefy(key, value, option, optionValue);
      }

      return setPromisefy(key, value);
    } catch (error: any) {
      if (error.message?.includes('READONLY') || error.message?.includes('read only replica')) {
        console.warn(`Redis is in read-only mode. Skipping set operation for key: ${key}`);
        return 'OK';
      }
      throw error;
    }
  }

  public async get(key: string): Promise<string | null> {
    const getPromisefy = util.promisify(this.redis.get).bind(this.redis);
    return getPromisefy(key);
  }

  public async getKeys(pattern: string): Promise<string[]> {
    const getKeysPromisefy = util.promisify(this.redis.keys).bind(this.redis);
    return getKeysPromisefy(pattern);
  }

  public async del(key: string): Promise<number> {
    try {
      const delPromisefy = util.promisify(this.redis.del).bind(this.redis);
      return delPromisefy(key);
    } catch (error: any) {
      if (error.message?.includes('READONLY') || error.message?.includes('read only replica')) {
        console.warn(`Redis is in read-only mode. Skipping del operation for key: ${key}`);
        return 0;
      }
      throw error;
    }
  }

  public async delFromPattern(pattern: string): Promise<void> {
    try {
      const all = await this.getKeys(pattern);
      await Promise.all(all.map(item => this.del(item)));
    } catch (error: any) {
      if (error.message?.includes('READONLY') || error.message?.includes('read only replica')) {
        console.warn(`Redis is in read-only mode. Skipping delFromPattern operation for pattern: ${pattern}`);
        return;
      }
      throw error;
    }
  }

  public async setFromParams(
    key: string,
    params: any,
    value: string,
    option?: string,
    optionValue?: string | number
  ): Promise<string> {
    try {
      const finalKey = `${key}:${CacheSingleton.encryptParams(params)}`;
      if (option !== undefined && optionValue !== undefined) {
        return this.set(finalKey, value, option, optionValue);
      }
      return this.set(finalKey, value);
    } catch (error: any) {
      if (error.message?.includes('READONLY') || error.message?.includes('read only replica')) {
        console.warn(`Redis is in read-only mode. Skipping setFromParams operation for key: ${key}`);
        return 'OK';
      }
      throw error;
    }
  }

  public async getFromParams(key: string, params: any): Promise<string | null> {
    const finalKey = `${key}:${CacheSingleton.encryptParams(params)}`;
    return this.get(finalKey);
  }

  public async delFromParams(key: string, params: any): Promise<number> {
    try {
      const finalKey = `${key}:${CacheSingleton.encryptParams(params)}`;
      return this.del(finalKey);
    } catch (error: any) {
      if (error.message?.includes('READONLY') || error.message?.includes('read only replica')) {
        console.warn(`Redis is in read-only mode. Skipping delFromParams operation for key: ${key}`);
        return 0;
      }
      throw error;
    }
  }

  public getRedisInstance(): Redis {
    return this.redis;
  }
}

const redisInstance = new Redis(REDIS_URI_CONNECTION, {
  retryDelayOnFailover: 100,
  enableReadyCheck: false,
  maxRetriesPerRequest: null,
  lazyConnect: true,
  connectTimeout: 60000,
  commandTimeout: 5000,
  readOnly: false,
  enableOfflineQueue: false
});

// Adicionar event listeners para tratar reconexão em caso de falha
redisInstance.on('error', (error) => {
  console.error('Redis connection error:', error);
});

redisInstance.on('ready', () => {
  console.log('Redis connection ready');
});

redisInstance.on('reconnecting', () => {
  console.log('Redis reconnecting...');
});

export default CacheSingleton.getInstance(redisInstance);