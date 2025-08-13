import api from "../services/api";

class TokenManager {
  constructor() {
    this.isSetup = false;
  }

  setupAxiosInterceptors() {
    if (this.isSetup) return; // Evitar configurar múltiplas vezes
    this.isSetup = true;

    // Response interceptor para lidar com erros de autenticação
    api.interceptors.response.use(
      (response) => {
        return response;
      },
      async (error) => {
        const originalRequest = error.config;
        
        // Se for erro 403 (token expirado), tentar renovar
        if (error?.response?.status === 403 && !originalRequest._retry) {
          originalRequest._retry = true;
          
          try {
            console.log("Token expirado, tentando renovar...");
            await api.post("/auth/refresh_token");
            console.log("Token renovado com sucesso");
            return api(originalRequest);
          } catch (refreshError) {
            console.error("Erro ao renovar token:", refreshError);
            // Se falhar ao renovar, redirecionar para login
            if (window.location.pathname !== '/login') {
              window.location.href = "/login";
            }
          }
        }
        
        // Se for erro 401 (não autorizado)
        if (error?.response?.status === 401 && !originalRequest.url?.includes('/auth/refresh_token')) {
          console.log("Token inválido, redirecionando para login...");
          if (window.location.pathname !== '/login') {
            window.location.href = "/login";
          }
        }
        
        return Promise.reject(error);
      }
    );
  }

  // Verificar se o usuário está autenticado
  async isAuthenticated() {
    try {
      await api.get("/auth/me");
      return true;
    } catch (error) {
      return false;
    }
  }

  // Fazer logout
  async logout() {
    try {
      await api.delete("/auth/logout");
    } catch (error) {
      console.error("Erro no logout:", error);
    } finally {
      window.location.href = "/login";
    }
  }
}

export default new TokenManager();
