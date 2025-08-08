import { Request, Response } from "express";
import * as Yup from "yup";
import { getIO } from "../libs/socket";
import AppError from "../errors/AppError";
import User from "../models/User";
import Company from "../models/Company";
import { SendMail } from "../helpers/SendMail";
import { v4 as uuidv4 } from "uuid";
import bcrypt from "bcryptjs";
import { Op } from "sequelize";

interface ForgotPasswordData {
  email: string;
}

interface ResetPasswordData {
  token: string;
  password: string;
}

export const forgotPassword = async (req: Request, res: Response): Promise<Response> => {
  const { email }: ForgotPasswordData = req.body;

  const schema = Yup.object().shape({
    email: Yup.string().email().required(),
  });

  try {
    await schema.validate({ email });
  } catch (err: any) {
    throw new AppError(err.message);
  }

  const user = await User.findOne({
    where: { email },
    include: [{ model: Company, as: "company" }]
  });

  if (!user) {
    throw new AppError("ERR_USER_NOT_FOUND", 404);
  }

  // Gerar token de reset
  const resetToken = uuidv4();
  const resetTokenExpiry = new Date();
  resetTokenExpiry.setHours(resetTokenExpiry.getHours() + 1); // Token válido por 1 hora

  // Salvar token no usuário
  await user.update({
    resetToken,
    resetTokenExpiry
  });

  // Enviar email
  const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;
  
  const emailData = {
    to: email,
    subject: `Redefinição de senha - ${user.company.name}`,
    text: `<!DOCTYPE html>
<html xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" lang="en">

<head>
	<title></title>
	<meta http-equiv="Content-Type" content="text/html; charset=utf-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0"><!--[if mso]>
<xml><w:WordDocument xmlns:w="urn:schemas-microsoft-com:office:word"><w:DontUseAdvancedTypographyReadingMail/></w:WordDocument>
<o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch><o:AllowPNG/></o:OfficeDocumentSettings></xml>
<![endif]--><!--[if !mso]><!--><!--<![endif]-->
	<style>
		* {
			box-sizing: border-box;
		}

		body {
			margin: 0;
			padding: 0;
		}

		a[x-apple-data-detectors] {
			color: inherit !important;
			text-decoration: inherit !important;
		}

		#MessageViewBody a {
			color: inherit;
			text-decoration: none;
		}

		p {
			line-height: inherit
		}

		.desktop_hide,
		.desktop_hide table {
			mso-hide: all;
			display: none;
			max-height: 0px;
			overflow: hidden;
		}

		.image_block img+div {
			display: none;
		}

		sup,
		sub {
			font-size: 75%;
			line-height: 0;
		}

		@media (max-width:620px) {
			.social_block.desktop_hide .social-table {
				display: inline-block !important;
			}

			.mobile_hide {
				display: none;
			}

			.row-content {
				width: 100% !important;
			}

			.stack .column {
				width: 100%;
				display: block;
			}

			.mobile_hide {
				min-height: 0;
				max-height: 0;
				max-width: 0;
				overflow: hidden;
				font-size: 0px;
			}

			.desktop_hide,
			.desktop_hide table {
				display: table !important;
				max-height: none !important;
			}
		}
	</style><!--[if mso ]><style>sup, sub { font-size: 100% !important; } sup { mso-text-raise:10% } sub { mso-text-raise:-10% }</style> <![endif]-->
</head>

<body class="body" style="background-color: #d9dffa; margin: 0; padding: 0; -webkit-text-size-adjust: none; text-size-adjust: none;">
	<table class="nl-container" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt; background-color: #d9dffa;">
		<tbody>
			<tr>
				<td>
					<table class="row row-1" align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt; background-color: #b3e5fc;">
						<tbody>
							<tr>
								<td>
									<table class="row-content stack" align="center" border="0" cellpadding="0" cellspacing="0" role="presentation" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt; color: #000000; width: 600px; margin: 0 auto;" width="600">
										<tbody>
											<tr>
												<td class="column column-1" width="100%" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt; font-weight: 400; text-align: left; padding-top: 20px; vertical-align: top;">
													<table class="image_block block-1" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt;">
														<tr>
															<td class="pad" style="width:100%;">
																<div class="alignment" align="center">
																	<div style="max-width: 600px;"><img src="https://d1oco4z2z1fhwp.cloudfront.net/templates/default/3991/animated_header.gif" style="display: block; height: auto; border: 0; width: 100%;" width="600" alt="Card Header with Border and Shadow Animated" title="Card Header with Border and Shadow Animated" height="auto"></div>
																</div>
															</td>
														</tr>
													</table>
												</td>
											</tr>
										</tbody>
									</table>
								</td>
							</tr>
						</tbody>
					</table>
					<table class="row row-2" align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt; background-color: #b3e5fc; background-image: url('https://d1oco4z2z1fhwp.cloudfront.net/templates/default/3991/body_background_2.png'); background-position: top center; background-repeat: repeat;">
						<tbody>
							<tr>
								<td>
									<table class="row-content stack" align="center" border="0" cellpadding="0" cellspacing="0" role="presentation" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt; color: #000000; width: 600px; margin: 0 auto;" width="600">
										<tbody>
											<tr>
												<td class="column column-1" width="100%" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt; font-weight: 400; text-align: left; padding-bottom: 15px; padding-left: 50px; padding-right: 50px; padding-top: 15px; vertical-align: top;">
													<table class="paragraph_block block-1" width="100%" border="0" cellpadding="10" cellspacing="0" role="presentation" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt; word-break: break-word;">
														<tr>
															<td class="pad">
																<div style="color:#37474f;font-family:Helvetica Neue, Helvetica, Arial, sans-serif;font-size:38px;line-height:1.2;text-align:left;mso-line-height-alt:46px;">
																	<p style="margin: 0; word-break: break-word;"><strong><span style="word-break: break-word;">Esqueceu sua senha?</span></strong></p>
																</div>
															</td>
														</tr>
													</table>
													<table class="paragraph_block block-2" width="100%" border="0" cellpadding="10" cellspacing="0" role="presentation" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt; word-break: break-word;">
														<tr>
															<td class="pad">
																<div style="color:#40507a;font-family:Helvetica Neue, Helvetica, Arial, sans-serif;font-size:16px;line-height:1.2;text-align:left;mso-line-height-alt:19px;">
																	<p style="margin: 0; word-break: break-word;">Olá, recebemos uma solicitação para redefinir sua senha.</p>
																</div>
															</td>
														</tr>
													</table>
													<table class="paragraph_block block-3" width="100%" border="0" cellpadding="10" cellspacing="0" role="presentation" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt; word-break: break-word;">
														<tr>
															<td class="pad">
																<div style="color:#40507a;font-family:Helvetica Neue, Helvetica, Arial, sans-serif;font-size:16px;line-height:1.2;text-align:left;mso-line-height-alt:19px;">
																	<p style="margin: 0; word-break: break-word;"><span style="word-break: break-word;">Clique no botão abaixo para prosseguir</span></p>
																</div>
															</td>
														</tr>
													</table>
													<table class="button_block block-4" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt;">
														<tr>
															<td class="pad" style="padding-bottom:20px;padding-left:10px;padding-right:10px;padding-top:20px;text-align:left;">
																<div class="alignment" align="left"><a href="${resetUrl}" target="_blank" style="color:#ffffff;text-decoration:none;"><!--[if mso]>
<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word"  href="http://www.example.com/"  style="height:46px;width:205px;v-text-anchor:middle;" arcsize="35%" fillcolor="#4fc3f7">
<v:stroke dashstyle="Solid" weight="0px" color="TRANSPARENT"/>
<w:anchorlock/>
<v:textbox inset="5px,0px,0px,0px">
<center dir="false" style="color:#ffffff;font-family:sans-serif;font-size:15px">
<![endif]--><span class="button" style="background-color: #4fc3f7; border-bottom: 0px solid TRANSPARENT; border-left: 0px solid TRANSPARENT; border-radius: 16px; border-right: 0px solid TRANSPARENT; border-top: 0px solid TRANSPARENT; color: #ffffff; display: inline-block; font-family: Helvetica Neue, Helvetica, Arial, sans-serif; font-size: 15px; font-weight: undefined; mso-border-alt: none; padding-bottom: 8px; padding-top: 8px; padding-left: 25px; padding-right: 20px; text-align: center; width: auto; word-break: keep-all; letter-spacing: normal;"><span style="word-break: break-word;"><span style="word-break: break-word; line-height: 30px;" data-mce-style><strong>Redefinir minha senha</strong></span></span></span><!--[if mso]></center></v:textbox></v:roundrect><![endif]--></a></div>
															</td>
														</tr>
													</table>
													<table class="paragraph_block block-5" width="100%" border="0" cellpadding="10" cellspacing="0" role="presentation" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt; word-break: break-word;">
														<tr>
															<td class="pad">
																<div style="color:#40507a;font-family:Helvetica Neue, Helvetica, Arial, sans-serif;font-size:14px;line-height:1.2;text-align:left;mso-line-height-alt:17px;">
																	<p style="margin: 0; word-break: break-word;">
																		Link não funciona? Copie e cole este endereço no seu navegador:<br>
																		<a href="${resetUrl}" style="color: #007bff; text-decoration: none;">${resetUrl}</a>																	
																	</p>
																</div>
															</td>
														</tr>
													</table>
													<table class="paragraph_block block-6" width="100%" border="0" cellpadding="10" cellspacing="0" role="presentation" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt; word-break: break-word;">
														<tr>
															<td class="pad">
																<div style="color:#40507a;font-family:Helvetica Neue, Helvetica, Arial, sans-serif;font-size:14px;line-height:1.2;text-align:left;mso-line-height-alt:17px;">
																	<p style="margin: 0; word-break: break-word;">Não solicitou uma redefinição de senha? Ignore esta mensagem.</p>
																</div>
															</td>
														</tr>
													</table>
												</td>
											</tr>
										</tbody>
									</table>
								</td>
							</tr>
						</tbody>
					</table>
					<table class="row row-3" align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt;">
						<tbody>
							<tr>
								<td>
									<table class="row-content stack" align="center" border="0" cellpadding="0" cellspacing="0" role="presentation" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt; color: #000000; width: 600px; margin: 0 auto;" width="600">
										<tbody>
											<tr>
												<td class="column column-1" width="100%" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt; font-weight: 400; text-align: left; padding-bottom: 5px; vertical-align: top;">
													<table class="image_block block-1" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt;">
														<tr>
															<td class="pad" style="width:100%;">
																<div class="alignment" align="center">
																	<div style="max-width: 600px;"><img src="https://d1oco4z2z1fhwp.cloudfront.net/templates/default/3991/bottom_img.png" style="display: block; height: auto; border: 0; width: 100%;" width="600" alt="Card Bottom with Border and Shadow Image" title="Card Bottom with Border and Shadow Image" height="auto"></div>
																</div>
															</td>
														</tr>
													</table>
												</td>
											</tr>
										</tbody>
									</table>
								</td>
							</tr>
						</tbody>
					</table>
					<table class="row row-4" align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt;">
						<tbody>
							<tr>
								<td>
									<table class="row-content stack" align="center" border="0" cellpadding="0" cellspacing="0" role="presentation" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt; color: #000000; width: 600px; margin: 0 auto;" width="600">
										<tbody>
											<tr>
												<td class="column column-1" width="100%" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt; font-weight: 400; text-align: left; padding-bottom: 20px; padding-left: 10px; padding-right: 10px; padding-top: 10px; vertical-align: top;">
													<table class="image_block block-1" width="100%" border="0" cellpadding="10" cellspacing="0" role="presentation" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt;">
														<tr>
															<td class="pad">
																<div class="alignment" align="center">
																	<div style="max-width: 261px;"><a href="https://app.metatechbot.site/" target="_blank" style="outline:none" tabindex="-1"><img src="https://d15k2d11r6t6rl.cloudfront.net/pub/bfra/jdkg1kv7/v13/8hj/9m2/logo%20HD2.png" style="display: block; height: auto; border: 0; width: 100%;" width="261" alt="Your Logo" title="Your Logo" height="auto"></a></div>
																</div>
															</td>
														</tr>
													</table>
													<!--table class="social_block block-2" width="100%" border="0" cellpadding="10" cellspacing="0" role="presentation" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt;">
														<tr>
															<td class="pad">
																<div class="alignment" align="center">
																	<table class="social-table" width="72px" border="0" cellpadding="0" cellspacing="0" role="presentation" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt; display: inline-block;">
																		<tr>
																			<td style="padding:0 2px 0 2px;"><a href="https://www.instagram.com" target="_blank"><img src="https://app-rsrc.getbee.io/public/resources/social-networks-icon-sets/t-only-logo-dark-gray/instagram@2x.png" width="32" height="auto" alt="Instagram" title="instagram" style="display: block; height: auto; border: 0;"></a></td>
																			<td style="padding:0 2px 0 2px;"><a href="https://www.twitter.com" target="_blank"><img src="https://app-rsrc.getbee.io/public/resources/social-networks-icon-sets/t-only-logo-dark-gray/twitter@2x.png" width="32" height="auto" alt="Twitter" title="twitter" style="display: block; height: auto; border: 0;"></a></td>
																		</tr>
																	</table>
																</div>
															</td>
														</tr>
													</table-->
													<table class="paragraph_block block-3" width="100%" border="0" cellpadding="10" cellspacing="0" role="presentation" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt; word-break: break-word;">
														<tr>
															<td class="pad">
																<div style="color:#97a2da;font-family:Helvetica Neue, Helvetica, Arial, sans-serif;font-size:14px;line-height:1.2;text-align:center;mso-line-height-alt:17px;">
																	<p style="margin: 0; word-break: break-word;">Este link expirará nas próximas 30 minutos.<br>Entre em contato conosco pelo Whatsapp <a href="http://wa.me/558521369438" target="_blank" title="Whatsapp" style="text-decoration: underline; color: #97a2da;" rel="noopener">+55 85 99280-0700</a>.</p>
																</div>
															</td>
														</tr>
													</table>
													<table class="paragraph_block block-4" width="100%" border="0" cellpadding="10" cellspacing="0" role="presentation" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt; word-break: break-word;">
														<tr>
															<td class="pad">
																<div style="color:#97a2da;font-family:Helvetica Neue, Helvetica, Arial, sans-serif;font-size:12px;line-height:1.2;text-align:center;mso-line-height-alt:14px;">
																	<p style="margin: 0; word-break: break-word;"><span style="word-break: break-word;">Copyright© 2025 - MetaTech Bots</span></p>
																</div>
															</td>
														</tr>
													</table>
												</td>
											</tr>
										</tbody>
									</table>
								</td>
							</tr>
						</tbody>
					</table>
				</td>
			</tr>
		</tbody>
	</table><!-- End -->
</body>

</html>`
  };

  try {
    await SendMail(emailData);
  } catch (error) {
    console.log('Erro ao enviar email de reset:', error);
    throw new AppError("ERR_SENDING_EMAIL", 500);
  }

  return res.status(200).json({ message: "Email de redefinição enviado com sucesso!" });
};

export const resetPassword = async (req: Request, res: Response): Promise<Response> => {
  const { token, password }: ResetPasswordData = req.body;

  const schema = Yup.object().shape({
    token: Yup.string().required(),
    password: Yup.string().min(6).required(),
  });

  try {
    await schema.validate({ token, password });
  } catch (err: any) {
    throw new AppError(err.message);
  }

  const user = await User.findOne({
    where: { 
      resetToken: token,
      resetTokenExpiry: {
        [Op.gt]: new Date()
      }
    }
  });

  if (!user) {
    throw new AppError("ERR_INVALID_RESET_TOKEN", 400);
  }

  // Hash da nova senha
  const saltRounds = 8;
  const hashedPassword = await bcrypt.hash(password, saltRounds);

  // Atualizar senha e limpar token
  await user.update({
    passwordHash: hashedPassword,
    resetToken: null,
    resetTokenExpiry: null
  });

  return res.status(200).json({ message: "Senha redefinida com sucesso!" });
};

export const validateResetToken = async (req: Request, res: Response): Promise<Response> => {
  const { token } = req.params;

  const user = await User.findOne({
    where: { 
      resetToken: token,
      resetTokenExpiry: {
        [Op.gt]: new Date()
      }
    }
  });

  if (!user) {
    throw new AppError("ERR_INVALID_RESET_TOKEN", 400);
  }

  return res.status(200).json({ valid: true, email: user.email });
};