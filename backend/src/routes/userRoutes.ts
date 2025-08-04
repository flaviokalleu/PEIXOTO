import { Router } from "express";

import isAuth from "../middleware/isAuth";
import * as UserController from "../controllers/UserController";
import multer from "multer";
import uploadConfig from "../config/upload";

const upload = multer(uploadConfig);

const userRoutes = Router();

userRoutes.get("/users", isAuth, UserController.index);

userRoutes.get("/users/list", isAuth, UserController.list);

userRoutes.post("/users", isAuth, UserController.store);

userRoutes.put("/users/:userId", isAuth, UserController.update);

userRoutes.get("/users/:userId", isAuth, UserController.show);

userRoutes.delete("/users/:userId", isAuth, UserController.remove);

// Middleware de log para debug
const logUploadRequest = (req: any, res: any, next: any) => {
  console.log("📥 Requisição de upload recebida:");
  console.log("  - URL:", req.url);
  console.log("  - Method:", req.method);
  console.log("  - Headers:", req.headers);
  console.log("  - User Agent:", req.get('User-Agent'));
  console.log("  - Origin:", req.get('Origin'));
  console.log("  - Content-Type:", req.get('Content-Type'));
  next();
};

// Middleware de tratamento de erro de upload
const handleUploadError = (err: any, req: any, res: any, next: any) => {
  console.error("❌ Erro no upload:", err);
  
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'Arquivo muito grande. Máximo 10MB.' });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ error: 'Muitos arquivos. Máximo 5 arquivos.' });
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({ error: 'Campo de arquivo inesperado.' });
    }
  }
  
  return res.status(500).json({ error: 'Erro interno no upload.' });
};

userRoutes.post("/users/:userId/media-upload", logUploadRequest, isAuth, upload.array("profileImage"), handleUploadError, UserController.mediaUpload);

userRoutes.put("/users/toggleChangeWidht/:userId", isAuth, UserController.toggleChangeWidht);

export default userRoutes;
