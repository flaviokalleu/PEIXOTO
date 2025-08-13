import { Router } from "express";
import isAuth from "../middleware/isAuth";

const heartbeatRoutes = Router();

// Endpoint para heartbeat - mantém a sessão ativa
heartbeatRoutes.post("/heartbeat", isAuth, async (req, res) => {
  try {
    const { companyId, id: userId } = req.user;
    
    // Atualiza último acesso do usuário
    const now = new Date();
    
    // Pode ser usado para logging ou estatísticas
    console.log(`Heartbeat received from user ${userId} (company ${companyId}) at ${now.toISOString()}`);
    
    // Resposta simples para manter conexão
    res.json({
      status: "alive",
      timestamp: now.toISOString(),
      userId,
      companyId
    });
    
  } catch (error) {
    console.error("Heartbeat error:", error);
    res.status(500).json({ 
      error: "Internal server error",
      status: "error"
    });
  }
});

// Endpoint para verificar status da sessão
heartbeatRoutes.get("/session-status", isAuth, async (req, res) => {
  try {
    const { companyId, id: userId, profile } = req.user;
    
    res.json({
      status: "active",
      user: {
        id: userId,
        companyId,
        profile
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error("Session status error:", error);
    res.status(500).json({ 
      error: "Internal server error",
      status: "error"
    });
  }
});

// Endpoint para notificações pendentes
heartbeatRoutes.get("/pending-notifications", isAuth, async (req, res) => {
  try {
    const { companyId, id: userId } = req.user;
    
    // Aqui você pode implementar a lógica para buscar notificações pendentes
    // Por exemplo, tickets não lidos, mensagens, etc.
    
    res.json({
      notifications: [],
      count: 0,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error("Pending notifications error:", error);
    res.status(500).json({ 
      error: "Internal server error",
      notifications: [],
      count: 0
    });
  }
});

export default heartbeatRoutes;
