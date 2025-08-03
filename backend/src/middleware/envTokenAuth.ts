import { Request, Response, NextFunction } from "express";

import AppError from "../errors/AppError";

type TokenPayload = {
  token: string | undefined;
};

const envTokenAuth = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  try {
    const { token: bodyToken } = req.body as TokenPayload;
    const { token: queryToken } = req.query as TokenPayload;
    const { settingKey } = req.params;

    console.log("|========= | middleware | ========|", req.query)

    // Permitir acesso público à configuração userCreation
    if (settingKey === "userCreation") {
      return next();
    }
    
    if (queryToken === process.env.ENV_TOKEN) {
      return next();
    }

    if (bodyToken === process.env.ENV_TOKEN) {
      return next();
    }
  

  } catch (e) {
    console.log(e);
  }

  throw new AppError("Token inválido", 403);
};

export default envTokenAuth;