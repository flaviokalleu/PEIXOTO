import api from './api';

class WavoipService {
  constructor() {
    this.baseURL = process.env.REACT_APP_WAVOIP_URL || 'https://api.wavoip.com';
  }

  async makeCall(data) {
    try {
      const response = await api.post('/wavoip/call', data);
      return response.data;
    } catch (error) {
      console.error('Erro ao fazer chamada WaVoIP:', error);
      throw error;
    }
  }

  async getCallStatus(callId) {
    try {
      const response = await api.get(`/wavoip/call/${callId}/status`);
      return response.data;
    } catch (error) {
      console.error('Erro ao obter status da chamada:', error);
      throw error;
    }
  }

  async endCall(callId) {
    try {
      const response = await api.post(`/wavoip/call/${callId}/end`);
      return response.data;
    } catch (error) {
      console.error('Erro ao finalizar chamada:', error);
      throw error;
    }
  }

  async getCallHistory() {
    try {
      const response = await api.get('/wavoip/calls/history');
      return response.data;
    } catch (error) {
      console.error('Erro ao obter histórico de chamadas:', error);
      throw error;
    }
  }
}

export default new WavoipService();