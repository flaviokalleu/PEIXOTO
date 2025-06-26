import { verify } from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";

import AppError from "../errors/AppError";
import authConfig from "../config/auth";

import { getIO } from "../libs/socket";
import ShowUserService from "../services/UserServices/ShowUserService";
import { updateUser } from "../helpers/updateUser";
// import { moment} from "moment-timezone"

interface TokenPayload {
  id: string;
  username: string;
  profile: string;
  companyId: number;
  iat: number;
  exp: number;
}

const isAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    throw new AppError("ERR_SESSION_EXPIRED", 401);
  }

  // const check = await verifyHelper();

  // if (!check) {
  //   throw new AppError("ERR_SYSTEM_INVALID", 401);
  // }

  const [, token] = authHeader.split(" ");

  try {
    const decoded = verify(token, authConfig.secret);
    const { id, profile, companyId } = decoded as TokenPayload;

    updateUser(id, companyId);

    req.user = {
      id,
      profile,
      companyId
    };
  } catch (err: any) {
    console.error("Erro de autenticação:", err.message);
    
    if (err.name === "TokenExpiredError") {
      console.log("Token expirado, retornando erro 403 para renovação");
      throw new AppError("ERR_SESSION_EXPIRED", 403);
    } else if (err.name === "JsonWebTokenError") {
      console.log("Token inválido, retornando erro 401");
      throw new AppError("ERR_SESSION_EXPIRED", 401);
    } else if (err.message === "ERR_SESSION_EXPIRED" && err.statusCode === 401) {
      throw new AppError(err.message, 401);
    } else {
      console.log("Erro desconhecido de token, tentando renovar");
      throw new AppError(
        "Invalid token. We'll try to assign a new one on next request",
        403
      );
    }
  }

  return next();
};

export default isAuth;