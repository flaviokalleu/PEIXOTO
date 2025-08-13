import io from "socket.io-client";

class SocketWorker {
  constructor(companyId , userId) {
    if (!SocketWorker.instance) {
      this.companyId = companyId
      this.userId = userId
      this.socket = null;
      this.configureSocket();
      this.eventListeners = {}; // Armazena os ouvintes de eventos registrados
      SocketWorker.instance = this;

    } 

    return SocketWorker.instance;
  }

  configureSocket() {
    // Buscar token dos cookies em vez do localStorage
    const getTokenFromCookies = () => {
      console.log('SocketWorker: Raw document.cookie:', document.cookie);
      const cookies = document.cookie.split(';');
      console.log('SocketWorker: Parsed cookies array:', cookies);
      
      for (let cookie of cookies) {
        const [name, value] = cookie.trim().split('=');
        console.log(`SocketWorker: Checking cookie - ${name}: ${value}`);
        if (name === 'token' || name === 'authToken' || name === 'public-token') {
          console.log(`SocketWorker: Found token in cookie ${name}:`, value);
          return value;
        }
      }
      
      // Fallback para localStorage (compatibilidade)
      const localToken = localStorage.getItem('token') || localStorage.getItem('public-token');
      console.log('SocketWorker: Fallback localStorage token:', localToken ? 'FOUND' : 'NOT FOUND');
      return localToken;
    };

    const token = getTokenFromCookies();
    console.log('SocketWorker: Final token for socket connection:', token ? 'FOUND' : 'NOT FOUND');
    console.log('SocketWorker: Connecting with token from cookies:', !!token);

    this.socket = io(`${process.env.REACT_APP_BACKEND_URL}/${this?.companyId}` , {
      autoConnect: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: Infinity,
      query: { 
        userId: this.userId,
        token: token // Adicionar token na query
      },
      auth: {
        token: token // Adicionar token na auth também
      },
      withCredentials: true, // Importante para enviar cookies
      transports: ['websocket', 'polling'] // Garantir compatibilidade
    });

    this.socket.on("connect", () => {
      console.log("SocketWorker: Conectado ao servidor Socket.IO", {
        companyId: this.companyId,
        userId: this.userId,
        socketId: this.socket.id
      });
    });

    this.socket.on("disconnect", () => {
      console.log("SocketWorker: Desconectado do servidor Socket.IO");
      this.reconnectAfterDelay();
    });

    this.socket.on("connect_error", (error) => {
      console.error("SocketWorker: Erro de conexão:", error);
    });
  }

  // Adiciona um ouvinte de eventos
  on(event, callback) {
    this.connect();
    this.socket.on(event, callback);

    // Armazena o ouvinte no objeto de ouvintes
    if (!this.eventListeners[event]) {
      this.eventListeners[event] = [];
    }
    this.eventListeners[event].push(callback);
  }

  // Emite um evento
  emit(event, data) {
    this.connect();
    this.socket.emit(event, data);
  }

  // Desconecta um ou mais ouvintes de eventos
  off(event, callback) {
    this.connect();
    if (this.eventListeners[event]) {
      // console.log("Desconectando do servidor Socket.IO:", event, callback);
      if (callback) {
        // Desconecta um ouvinte específico
        this.socket.off(event, callback);
        this.eventListeners[event] = this.eventListeners[event].filter(cb => cb !== callback);
      } else {
        // console.log("DELETOU EVENTOS DO SOCKET:", this.eventListeners[event]);

        // Desconecta todos os ouvintes do evento
        this.eventListeners[event].forEach(cb => this.socket.off(event, cb));
        delete this.eventListeners[event];
      }
      // console.log("EVENTOS DO SOCKET:", this.eventListeners);
    }
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null
      this.instance = null
      console.log("Socket desconectado manualmente");
    }
  }

  reconnectAfterDelay() {
    setTimeout(() => {
      if (!this.socket || !this.socket.connected) {
        console.log("Tentando reconectar após desconexão");
        this.connect();
      }
    }, 1000);
  }

  // Garante que o socket esteja conectado
  connect() {
    if (!this.socket) {
      this.configureSocket();
    }
  }

  forceReconnect() {

  }
}

// const instance = (companyId, userId) => new SocketWorker(companyId,userId);
const instance = (companyId, userId) => new SocketWorker(companyId, userId);

export default instance;