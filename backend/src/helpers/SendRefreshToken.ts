import { Response } from "express";

export const SendRefreshToken = (res: Response, token: string): void => {
  res.cookie("jrt", token, { 
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 dias
  });
};
