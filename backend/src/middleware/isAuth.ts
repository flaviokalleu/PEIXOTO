import { verify } from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";

import AppError from "../errors/AppError";
import authConfig from "../config/auth";

import { getIO } from "../libs/socket";
import ShowUserService from "../services/UserServices/ShowUserService";
import { updateUser } from "../helpers/updateUser";

interface TokenPayload {
  id: string;
  username: string;
  profile: string;
  companyId: number;
  iat: number;
  exp: number;
}

interface RefreshTokenPayload {
  id: string;
  tokenVersion: number;
  companyId: number;
}

const isAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  // Primeiro tentar pegar o token do header Authorization (para compatibilidade)
  const authHeader = req.headers.authorization;
  
  // Se não tiver no header, tentar pegar do cookie
  const refreshToken = req.cookies.jrt;

  if (!authHeader && !refreshToken) {
    throw new AppError("ERR_SESSION_EXPIRED", 401);
  }

  try {
    if (authHeader) {
      // Usar token do header (modo antigo)
      const [, token] = authHeader.split(" ");
      const decoded = verify(token, authConfig.secret);
      const { id, profile, companyId } = decoded as TokenPayload;

      updateUser(id, companyId);

      req.user = {
        id,
        profile,
        companyId
      };
    } else if (refreshToken) {
      // Usar refresh token do cookie
      const decoded = verify(refreshToken, authConfig.refreshSecret);
      const { id, companyId } = decoded as RefreshTokenPayload;

      // Verificar se o usuário existe e buscar o perfil
      const user = await ShowUserService(id, companyId);
      
      updateUser(id, companyId);

      req.user = {
        id,
        profile: user.profile,
        companyId
      };
    }
  } catch (err: any) {
    if (err.message === "ERR_SESSION_EXPIRED" && err.statusCode === 401) {
      throw new AppError(err.message, 401);
    } else {
      throw new AppError(
        "Invalid token. We'll try to assign a new one on next request",
        403
      );
    }
  }

  return next();
};

export default isAuth;