import express from "express";
import isAuth from "../middleware/isAuth";

import * as SubscriptionController from "../controllers/SubscriptionController";

const subscriptionRoutes = express.Router();
subscriptionRoutes.post("/subscription", isAuth, SubscriptionController.createSubscription);
subscriptionRoutes.post("/subscription/webhook/:type?", SubscriptionController.webhook);
// Rota específica para webhook do Mercado Pago
subscriptionRoutes.post("/subscription/mercadopagowebhook", SubscriptionController.webhook);

export default subscriptionRoutes;
