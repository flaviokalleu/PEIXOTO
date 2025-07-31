import axios from "axios";

const api = axios.create({
	baseURL: process.env.REACT_APP_BACKEND_URL,
	withCredentials: true,
	timeout: 30000, // Timeout de 30 segundos para requisições
});

// Interceptor para log de requisições que estão demorando
api.interceptors.request.use(
  (config) => {
    config.metadata = { startTime: new Date() };
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

api.interceptors.response.use(
  (response) => {
    const endTime = new Date();
    const duration = endTime.getTime() - response.config.metadata.startTime.getTime();
    
    if (duration > 5000) {
      console.warn(`[API] Requisição lenta detectada: ${response.config.url} (${duration}ms)`);
    }
    
    return response;
  },
  (error) => {
    if (error.code === 'ECONNABORTED') {
      console.error('[API] Timeout da requisição:', error.config?.url);
    }
    return Promise.reject(error);
  }
);

export const openApi = axios.create({
	baseURL: process.env.REACT_APP_BACKEND_URL,
	timeout: 30000, // Timeout de 30 segundos para API aberta
});

export default api;
