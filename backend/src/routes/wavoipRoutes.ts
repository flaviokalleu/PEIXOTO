import { Router } from "express";
import * as WaVoipController from "../controllers/WaVoipController";
import isAuth from "../middleware/isAuth";

const wavoipRoutes = Router();

wavoipRoutes.post("/call", isAuth, WaVoipController.initiateCall);
wavoipRoutes.post("/endCall", isAuth, WaVoipController.endCall);

export default wavoipRoutes;