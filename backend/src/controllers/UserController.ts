import { Request, Response } from "express";
import { getIO } from "../libs/socket";
import { isEmpty, isNil } from "lodash";
import CheckSettingsHelper from "../helpers/CheckSettings";
import AppError from "../errors/AppError";

import CreateUserService from "../services/UserServices/CreateUserService";
import ListUsersService from "../services/UserServices/ListUsersService";
import UpdateUserService from "../services/UserServices/UpdateUserService";
import ShowUserService from "../services/UserServices/ShowUserService";
import DeleteUserService from "../services/UserServices/DeleteUserService";
import SimpleListService from "../services/UserServices/SimpleListService";
import CreateCompanyService from "../services/CompanyService/CreateCompanyService";
import { SendMail } from "../helpers/SendMail";
import { useDate } from "../utils/useDate";
import ShowCompanyService from "../services/CompanyService/ShowCompanyService";
import { getWbot } from "../libs/wbot";
import FindCompaniesWhatsappService from "../services/CompanyService/FindCompaniesWhatsappService";
import User from "../models/User";

import { head } from "lodash";
import ToggleChangeWidthService from "../services/UserServices/ToggleChangeWidthService";
import APIShowEmailUserService from "../services/UserServices/APIShowEmailUserService";
import Setting from "../models/Setting";


type IndexQuery = {
  searchParam: string;
  pageNumber: string;
};


export const index = async (req: Request, res: Response): Promise<Response> => {
  const { searchParam, pageNumber } = req.query as IndexQuery;
  const { companyId, profile } = req.user;

  const { users, count, hasMore } = await ListUsersService({
    searchParam,
    pageNumber,
    companyId,
    profile
  });

  return res.json({ users, count, hasMore });
};

export const store = async (req: Request, res: Response): Promise<Response> => {
  const {
    email,
    password,
    name,
    phone,
    profile,
    companyId: bodyCompanyId,
    queueIds,
    companyName,
    planId,
    startWork,
    endWork,
    whatsappId,
    allTicket,
    defaultTheme,
    defaultMenu,
    allowGroup,
    allHistoric,
    allUserChat,
    userClosePendingTicket,
    showDashboard,
    defaultTicketsManagerWidth = 550,
    allowRealTime,
    allowConnections
  } = req.body;
  let userCompanyId: number | null = null;

  const { dateToClient } = useDate();

  if (req.user !== undefined) {
    const { companyId: cId } = req.user;
    userCompanyId = cId;
  }

  if (
    req.url === "/signup" &&
    (await CheckSettingsHelper("userCreation")) === "disabled"
  ) {
    throw new AppError("ERR_USER_CREATION_DISABLED", 403);
  } else if (req.url !== "/signup" && req.user.profile !== "admin") {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }

  if (process.env.DEMO === "ON") {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }

  const companyUser = bodyCompanyId || userCompanyId;

  if (!companyUser) {

    const trialDays = parseInt(process.env.APP_TRIALEXPIRATION || "3", 10);

    const dataNowMoreTrialDays = new Date();
    dataNowMoreTrialDays.setDate(dataNowMoreTrialDays.getDate() + trialDays);

    const date = dataNowMoreTrialDays.toISOString().split("T")[0];

    const companyData = {
      name: companyName,
      email: email,
      phone: phone,
      planId: planId,
      status: true,
      dueDate: date,
      recurrence: "",
      document: "",
      paymentMethod: "",
      password: password,
      companyUserName: name,
      startWork: startWork,
      endWork: endWork,
      defaultTheme: 'light',
      defaultMenu: 'closed',
      allowGroup: false,
      allHistoric: false,
      userClosePendingTicket: 'enabled',
      showDashboard: 'disabled',
      defaultTicketsManagerWidth: 550,
      allowRealTime: 'disabled',
      allowConnections: 'disabled'
    };

    const user = await CreateCompanyService(companyData);

    try {
      const _email = {
        to: email,
        subject: `Login e senha da Empresa ${companyName}`,
        text: `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bem-vindo(a) à MetaBot</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Arial', sans-serif; background-color: #f0f4f8; color: #333;">
  <table role="presentation" style="width: 100%; max-width: 600px; margin: 20px auto; background-color: #ffffff; border-radius: 12px; box-shadow: 0 6px 18px rgba(0, 0, 0, 0.1);">
    <tr>
      <td style="padding: 40px 30px; text-align: center;">
        <!-- Header -->
        <h1 style="font-size: 26px; color: #2c3e50; margin: 0 0 20px; font-weight: 600;">Bem-vindo(a) ${companyName}!</h1>
        <p style="font-size: 16px; line-height: 1.6; color: #555; margin: 0 0 25px;">
          Olá, ${name},<br>
          Estamos entusiasmados por tê-lo(a) conosco! Seu cadastro foi realizado com sucesso. Confira os detalhes da sua conta abaixo:
        </p>

        <!-- Company Details -->
        <table style="width: 100%; margin: 20px 0; font-size: 16px; color: #555; border-collapse: collapse;">
          <tr>
            <td style="padding: 10px 0; text-align: left; font-weight: bold; border-bottom: 1px solid #eee;">Empresa:</td>
            <td style="padding: 10px 0; text-align: right; border-bottom: 1px solid #eee;">${companyName}</td>
          </tr>
          <tr>
            <td style="padding: 10px 0; text-align: left; font-weight: bold; border-bottom: 1px solid #eee;">E-mail:</td>
            <td style="padding: 10px 0; text-align: right; border-bottom: 1px solid #eee;">${email}</td>
          </tr>
          <tr>
            <td style="padding: 10px 0; text-align: left; font-weight: bold; border-bottom: 1px solid #eee;">Senha:</td>
            <td style="padding: 10px 0; text-align: right; border-bottom: 1px solid #eee;">${password}</td>
          </tr>
          <tr>
            <td style="padding: 10px 0; text-align: left; font-weight: bold;">Vencimento do Trial:</td>
            <td style="padding: 10px 0; text-align: right;">${dateToClient(date)}</td>
          </tr>
        </table>

        <!-- Call to Action Button -->
        <a href="${process.env.FRONTEND_URL}/login" style="display: inline-block; padding: 12px 30px; background-color: #6c5ce7; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: bold; border-radius: 8px; transition: background-color 0.3s ease;">
          Acessar Minha Conta
        </a>
        <style>
          a:hover {
            background-color: #5a4cd1;
          }
        </style>

        <!-- Additional Info -->
        <p style="font-size: 14px; color: #777; margin: 25px 0 0; line-height: 1.5;">
          Para começar, clique no botão acima para acessar sua conta. Caso tenha dúvidas, nossa equipe de suporte está pronta para ajudar.
        </p>
        <p style="font-size: 14px; color: #777; margin: 10px 0 0;">
          Link não funciona? Copie e cole este endereço no seu navegador:<br>
          <a href="${process.env.FRONTEND_URL}/login" style="color: #6c5ce7; text-decoration: none;">${process.env.FRONTEND_URL}/login</a>
        </p>
      </td>
    </tr>
    <!-- Footer -->
    <tr>
      <td style="padding: 20px 30px; background-color: #f0f4f8; text-align: center; font-size: 12px; color: #999; border-radius: 0 0 12px 12px;">
        <p style="margin: 0;">© ${new Date().getFullYear()} Sua Empresa. Todos os direitos reservados.</p>
        <p style="margin: 5px 0 0;">
          <a href="https://suaempresa.com/suporte" style="color: #6c5ce7; text-decoration: none;">Suporte</a> | 
          <a href="https://suaempresa.com/privacidade" style="color: #6c5ce7; text-decoration: none;">Política de Privacidade</a>
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`
      }

      await SendMail(_email)
    } catch (error) {
      console.log('Não consegui enviar o email')
    }

    try {
      const company = await ShowCompanyService(1);
      const whatsappCompany = await FindCompaniesWhatsappService(company.id)

      if (whatsappCompany.whatsapps[0].status === "CONNECTED" && (phone !== undefined || !isNil(phone) || !isEmpty(phone))) {
        const whatsappId = whatsappCompany.whatsapps[0].id
        const wbot = getWbot(whatsappId);

        const body = `Olá ${name}, este é uma mensagem sobre o cadastro da ${companyName}!\n\nSegue os dados da sua empresa:\n\nNome: ${companyName}\nEmail: ${email}\nSenha: ${password}\nData Vencimento Trial: ${dateToClient(date)}`

        await wbot.sendMessage(`55${phone}@s.whatsapp.net`, { text: body });
      }
    } catch (error) {
      console.log('Não consegui enviar a mensagem')
    }

    return res.status(200).json(user);
  }

  if (companyUser) {
    const user = await CreateUserService({
      email,
      password,
      name,
      profile,
      companyId: companyUser,
      queueIds,
      startWork,
      endWork,
      whatsappId,
      allTicket,
      defaultTheme,
      defaultMenu,
      allowGroup,
      allHistoric,
      allUserChat,
      userClosePendingTicket,
      showDashboard,
      defaultTicketsManagerWidth,
      allowRealTime,
      allowConnections
    });

    const io = getIO();
    io.of(userCompanyId.toString())
      .emit(`company-${userCompanyId}-user`, {
        action: "create",
        user
      });

    return res.status(200).json(user);
  }
};

// export const store = async (req: Request, res: Response): Promise<Response> => {
//   const {
//     email,
//     password,
//     name,
//     profile,
//     companyId: bodyCompanyId,
//     queueIds
//   } = req.body;
//   let userCompanyId: number | null = null;

//   if (req.user !== undefined) {
//     const { companyId: cId } = req.user;
//     userCompanyId = cId;
//   }

//   if (
//     req.url === "/signup" &&
//     (await CheckSettingsHelper("userCreation")) === "disabled"
//   ) {
//     throw new AppError("ERR_USER_CREATION_DISABLED", 403);
//   } else if (req.url !== "/signup" && req.user.profile !== "admin") {
//     throw new AppError("ERR_NO_PERMISSION", 403);
//   }

//   const user = await CreateUserService({
//     email,
//     password,
//     name,
//     profile,
//     companyId: bodyCompanyId || userCompanyId,
//     queueIds
//   });

//   const io = getIO();
//   io.of(String(companyId))
//  .emit(`company-${userCompanyId}-user`, {
//     action: "create",
//     user
//   });

//   return res.status(200).json(user);
// };

export const show = async (req: Request, res: Response): Promise<Response> => {
  const { userId } = req.params;
  const { companyId } = req.user;

  const user = await ShowUserService(userId, companyId);

  return res.status(200).json(user);
};

export const showEmail = async (req: Request, res: Response): Promise<Response> => {
  const { email } = req.params;

  const user = await APIShowEmailUserService(email);

  return res.status(200).json(user);
};

export const update = async (
  req: Request,
  res: Response
): Promise<Response> => {

  // if (req.user.profile !== "admin") {
  //   throw new AppError("ERR_NO_PERMISSION", 403);
  // }

  if (process.env.DEMO === "ON") {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }

  const { id: requestUserId, companyId } = req.user;
  const { userId } = req.params;
  const userData = req.body;

  const user = await UpdateUserService({
    userData,
    userId,
    companyId,
    requestUserId: +requestUserId
  });


  const io = getIO();
  io.of(String(companyId))
    .emit(`company-${companyId}-user`, {
      action: "update",
      user
    });

  return res.status(200).json(user);
};

export const remove = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { userId } = req.params;
  const { companyId, id, profile } = req.user;

  if (profile !== "admin") {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }

  if (process.env.DEMO === "ON") {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }

  const user = await User.findOne({
    where: { id: userId }
  });

  if (companyId !== user.companyId) {
    return res.status(400).json({ error: "Você não possui permissão para acessar este recurso!" });
  } else {
    await DeleteUserService(userId, companyId);

    const io = getIO();
    io.of(String(companyId))
      .emit(`company-${companyId}-user`, {
        action: "delete",
        userId
      });

    return res.status(200).json({ message: "User deleted" });
  }

};

export const list = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.query;
  const { companyId: userCompanyId } = req.user;

  const users = await SimpleListService({
    companyId: companyId ? +companyId : userCompanyId
  });

  return res.status(200).json(users);
};

export const mediaUpload = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { userId } = req.params;
  const { companyId } = req.user;
  const files = req.files as Express.Multer.File[];
  const file = head(files);

  try {
    let user = await User.findByPk(userId);
    user.profileImage = file.filename.replace('/', '-');

    await user.save();

    user = await ShowUserService(userId, companyId);
    
    const io = getIO();
    io.of(String(companyId))
      .emit(`company-${companyId}-user`, {
        action: "update",
        user
      });


    return res.status(200).json({ user, message: "Imagem atualizada" });
  } catch (err: any) {
    throw new AppError(err.message);
  }
};

export const toggleChangeWidht = async (req: Request, res: Response): Promise<Response> => {
  var { userId } = req.params;
  const { defaultTicketsManagerWidth } = req.body;

  const { companyId } = req.user;
  const user = await ToggleChangeWidthService({ userId, defaultTicketsManagerWidth });

  const io = getIO();
  io.of(String(companyId))
    .emit(`company-${companyId}-user`, {
      action: "update",
      user
    });

  return res.status(200).json(user);
};
export const getUserCreationStatus = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const setting = await Setting.findOne({
      where: {
        companyId: 1,
        key: "userCreation",
      },
    });

    if (!setting) {
      return res.status(200).json({ userCreation: "disabled" }); // Valor padrão
    }

    return res.status(200).json({ userCreation: setting.value });
  } catch (error) {
    return res
      .status(500)
      .json({ error: "Failed to fetch user creation status" });
  }
};
export const updateLanguage = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { userId } = req.params;
    const { language } = req.body;

    // Validação básica do idioma
    const validLanguages = ["pt-BR", "en", "es", "tr"];
    if (!language || !validLanguages.includes(language)) {
      return res.status(400).json({ error: "Invalid language. Must be one of: pt-BR, en, es, tr" });
    }

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    await user.update({ language });
    return res.status(200).json({ id: user.id, language: user.language });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};