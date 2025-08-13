import { useState, useEffect, useContext } from "react";
import { useHistory } from "react-router-dom";
import { has, isArray } from "lodash";

import { toast } from "react-toastify";

import { i18n } from "../../translate/i18n";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import { socketConnection } from "../../services/socket";
import tokenManager from "../../utils/tokenManager";
import heartbeatService from "../../services/heartbeatService";
import socketToSWBridge from "../../services/socketToSWBridge";
import moment from "moment";

const useAuth = () => {
  const history = useHistory();
  const [isAuth, setIsAuth] = useState(false);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState({});
  const [socket, setSocket] = useState({});

  useEffect(() => {
    // Configurar interceptors apenas uma vez
    tokenManager.setupAxiosInterceptors();
    
    (async () => {
      try {
        // Tentar verificar se está autenticado fazendo uma chamada para /auth/me
        await api.get("/auth/me");
        setIsAuth(true);
        
        // Se conseguiu verificar, buscar dados do usuário
        const { data } = await api.post("/auth/refresh_token");
        setUser(data.user);
      } catch (err) {
        console.error("Usuário não autenticado:", err);
        setIsAuth(false);
      }
      setLoading(false);
    })();
  }, []);

  // Verificar sessão quando a aba ganha foco novamente
  useEffect(() => {
    if (isAuth) {
      const handleVisibilityChange = async () => {
        if (!document.hidden) {
          try {
            await api.get("/auth/me");
            console.log("Sessão verificada após foco da aba");
          } catch (error) {
            console.error("Erro ao verificar sessão após foco:", error);
            if (error?.response?.status === 401 || error?.response?.status === 403) {
              console.log("Sessão inválida detectada após foco, realizando logout");
              setIsAuth(false);
              setUser({});
              history.push("/login");
            }
          }
        }
      };

      document.addEventListener('visibilitychange', handleVisibilityChange);
      return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }
  }, [isAuth, history]);

  useEffect(() => {
    if (Object.keys(user).length && user.id > 0) {
      // console.log("Entrou useWhatsapp com user", Object.keys(user).length, Object.keys(socket).length ,user, socket)
      let io;
      if (!Object.keys(socket).length) {
        io = socketConnection({ user });
        setSocket(io);
        
        // Conectar o bridge para notificações em tempo real
        socketToSWBridge.setUser(user);
        socketToSWBridge.connectSocket(io);
        console.log('Bridge conectado para notificações em tempo real', {
          userId: user.id,
          companyId: user.companyId,
          socketConnected: !!io.connected
        });
      } else {
        io = socket
      }
      io.on(`company-${user.companyId}-user`, (data) => {
        if (data.action === "update" && data.user.id === user.id) {
          setUser(data.user);
        }
      });

      return () => {
        // console.log("desconectou o company user ", user.id)
        io.off(`company-${user.companyId}-user`);
        // io.disconnect();
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }
  }, [user]);

  // Heartbeat para manter conexão ativa
  useEffect(() => {
    if (isAuth && user.id) {
      const heartbeatInterval = setInterval(async () => {
        // Só fazer heartbeat se a aba estiver visível
        if (!document.hidden) {
          try {
            await api.get("/auth/me");
            console.log("Heartbeat: Sessão mantida ativa");
          } catch (error) {
            console.error("Heartbeat: Erro ao verificar sessão:", error);
            if (error?.response?.status === 401) {
              console.log("Heartbeat: Sessão expirada, será tratada pelo interceptor");
            }
          }
        }
      }, 5 * 60 * 1000); // Verificar a cada 5 minutos

      return () => clearInterval(heartbeatInterval);
    }
  }, [isAuth, user.id]);

  const handleLogin = async (userData) => {
    setLoading(true);

    try {
      const { data } = await api.post("/auth/login", userData);
      const {
        user: { company },
      } = data;

      if (has(company, "companieSettings") && isArray(company.companieSettings[0])) {
        const setting = company.companieSettings[0].find(
          (s) => s.key === "campaignsEnabled"
        );
        if (setting && setting.value === "true") {
          localStorage.setItem("cshow", null); //regra pra exibir campanhas
        }
      }

      if (has(company, "companieSettings") && isArray(company.companieSettings[0])) {
        const setting = company.companieSettings[0].find(
          (s) => s.key === "sendSignMessage"
        );

        const signEnable = setting.value === "enable";

        if (setting && setting.value === "enabled") {
          localStorage.setItem("sendSignMessage", signEnable); //regra pra exibir campanhas
        }
      }
      localStorage.setItem("profileImage", data.user.profileImage); //regra pra exibir imagem contato

      moment.locale('pt-br');
      let dueDate;
      if (data.user.company.id === 1) {
        dueDate = '2999-12-31T00:00:00.000Z'
      } else {
        dueDate = data.user.company.dueDate;
      }
      const hoje = moment(moment()).format("DD/MM/yyyy");
      const vencimento = moment(dueDate).format("DD/MM/yyyy");

      var diff = moment(dueDate).diff(moment(moment()).format());

      var before = moment(moment().format()).isBefore(dueDate);
      var dias = moment.duration(diff).asDays();

      if (before === true) {
        localStorage.setItem("companyDueDate", vencimento);
        setUser(data.user);
        setIsAuth(true);
        
        // Iniciar heartbeat service após login bem-sucedido
        heartbeatService.start();
        
        toast.success(i18n.t("auth.toasts.success"));
        if (Math.round(dias) < 5) {
          toast.warn(`Sua assinatura vence em ${Math.round(dias)} ${Math.round(dias) === 1 ? 'dia' : 'dias'} `);
        }

        history.push("/tickets");
        setLoading(false);
      } else {
        setIsAuth(true);
        toastError(`Opss! Sua assinatura venceu ${vencimento}.
Entre em contato com o Suporte para mais informações! `);
        history.push("/financeiro");
        setLoading(false);
      }

    } catch (err) {
      toastError(err);
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    setLoading(true);

    try {
      // Parar heartbeat service antes do logout
      heartbeatService.stop();
      
      await tokenManager.logout();
      setIsAuth(false);
      setUser({});
      localStorage.removeItem("cshow");
      localStorage.removeItem("profileImage");
      localStorage.removeItem("companyDueDate");
      localStorage.removeItem("sendSignMessage");
      setLoading(false);
    } catch (err) {
      toastError(err);
      setLoading(false);
    }
  };

  const getCurrentUserInfo = async () => {
    try {
      const { data } = await api.get("/auth/me");
      console.log(data)
      return data;
    } catch (_) {
      return null;
    }
  };

  return {
    isAuth,
    user,
    loading,
    handleLogin,
    handleLogout,
    getCurrentUserInfo,
    socket
  };
};

export default useAuth;