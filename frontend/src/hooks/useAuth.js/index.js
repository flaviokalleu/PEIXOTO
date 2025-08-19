import { useState, useEffect, useContext } from "react";
import { useHistory } from "react-router-dom";
import { has, isArray } from "lodash";

import { toast } from "react-toastify";

import { i18n } from "../../translate/i18n";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import { socketConnection } from "../../services/socket";
// import { useDate } from "../../hooks/useDate";
import moment from "moment";

const useAuth = () => {
  const history = useHistory();
  const [isAuth, setIsAuth] = useState(false);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState({});
  const [socket, setSocket] = useState({})
 

  api.interceptors.request.use(
    (config) => {
      const token = localStorage.getItem("token");
      if (token) {
        config.headers["Authorization"] = `Bearer ${JSON.parse(token)}`;
        setIsAuth(true);
      }
      return config;
    },
    (error) => {
      Promise.reject(error);
    }
  );

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
          const { data } = await api.post("/auth/refresh_token");
          if (data && data.token) {
            localStorage.setItem("token", JSON.stringify(data.token));
            api.defaults.headers.Authorization = `Bearer ${data.token}`;
            console.log("Token renovado com sucesso");
            return api(originalRequest);
          }
        } catch (refreshError) {
          console.error("Erro ao renovar token:", refreshError);
          // Se falhar ao renovar, deslogar
          localStorage.removeItem("token");
          api.defaults.headers.Authorization = undefined;
          setIsAuth(false);
          setUser({});
          history.push("/login");
        }
      }
      
      // Se for erro 401 (não autorizado), deslogar apenas se não for uma tentativa de renovação
      if (error?.response?.status === 401 && !originalRequest.url?.includes('/auth/refresh_token')) {
        console.log("Token inválido, realizando logout...");
        localStorage.removeItem("token");
        api.defaults.headers.Authorization = undefined;
        setIsAuth(false);
        setUser({});
        history.push("/login");
      }
      
      return Promise.reject(error);
    }
  );

  useEffect(() => {
    const token = localStorage.getItem("token");
    (async () => {
      if (token) {
        try {
          const { data } = await api.post("/auth/refresh_token");
          api.defaults.headers.Authorization = `Bearer ${data.token}`;
          setIsAuth(true);
          setUser(data.user);
        } catch (err) {
          console.error("Erro ao verificar token:", err);
          localStorage.removeItem("token");
          api.defaults.headers.Authorization = undefined;
          setIsAuth(false);
          toastError(err);
        }
      }
      setLoading(false);
    })();
  }, []);

  // Verificar sessão quando a aba ganha foco novamente
  useEffect(() => {
    if (isAuth) {
      const handleVisibilityChange = async () => {
        if (!document.hidden) {
          // Aba ganhou foco novamente, verificar se a sessão ainda é válida
          try {
            const token = localStorage.getItem("token");
            if (token) {
              await api.get("/auth/me");
              console.log("Sessão verificada após foco da aba");
            }
          } catch (error) {
            console.error("Erro ao verificar sessão após foco:", error);
            if (error?.response?.status === 401 || error?.response?.status === 403) {
              console.log("Sessão inválida detectada após foco, realizando logout");
              localStorage.removeItem("token");
              api.defaults.headers.Authorization = undefined;
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
        setSocket(io)
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
            const token = localStorage.getItem("token");
            if (token) {
              // Fazer uma chamada simples e silenciosa
              await api.get("/auth/me");
              console.log("Heartbeat: Sessão mantida ativa");
            }
          } catch (error) {
            console.error("Heartbeat: Erro ao verificar sessão:", error);
            // Não fazer logout imediatamente no heartbeat, deixar o interceptor lidar
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
        localStorage.setItem("token", JSON.stringify(data.token));
        // localStorage.setItem("public-token", JSON.stringify(data.user.token));
        // localStorage.setItem("companyId", companyId);
        // localStorage.setItem("userId", id);
        localStorage.setItem("companyDueDate", vencimento);
        api.defaults.headers.Authorization = `Bearer ${data.token}`;
        setUser(data.user);
        setIsAuth(true);
        toast.success(i18n.t("auth.toasts.success"));
        if (Math.round(dias) < 5) {
          toast.warn(`Sua assinatura vence em ${Math.round(dias)} ${Math.round(dias) === 1 ? 'dia' : 'dias'} `);
        }

        // // Atraso para garantir que o cache foi limpo
        // setTimeout(() => {
        //   window.location.reload(true); // Recarregar a página
        // }, 1000);

        history.push("/tickets");
        setLoading(false);
      } else {
        // localStorage.setItem("companyId", companyId);
        api.defaults.headers.Authorization = `Bearer ${data.token}`;
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
      // socket.disconnect();
      await api.delete("/auth/logout");
      setIsAuth(false);
      setUser({});
      localStorage.removeItem("token");
      localStorage.removeItem("cshow");
      // localStorage.removeItem("public-token");
      api.defaults.headers.Authorization = undefined;
      setLoading(false);
      history.push("/login");
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