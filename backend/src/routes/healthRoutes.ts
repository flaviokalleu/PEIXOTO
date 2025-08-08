import express from "express";
import * as HealthController from "../controllers/HealthController";
import isAuth from "../middleware/isAuth";

const healthRoutes = express.Router();

// Rota pública para verificar saúde do sistema
healthRoutes.get("/health", HealthController.getHealthStatus);

// Rota protegida para reset do contador de erros
healthRoutes.post("/health/reset", isAuth, HealthController.resetErrorCount);

export default healthRoutes;
