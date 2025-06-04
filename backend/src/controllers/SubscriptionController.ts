import { Request, Response } from "express";
import * as Yup from "yup";
import { MercadoPagoConfig, Preference } from "mercadopago";
import AppError from "../errors/AppError";
import Company from "../models/Company";
import Invoices from "../models/Invoices";
import Setting from "../models/Setting";
import { getIO } from "../libs/socket";
import axios from "axios";

// Endpoint para criar uma nova assinatura
export const createSubscription = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { companyId } = req.user;

  // Schema de validação
  const schema = Yup.object().shape({
    price: Yup.string().required(),
    users: Yup.string().required(),
    connections: Yup.string().required()
  });

  // Validação do payload
  try {
    await schema.validate(req.body);
  } catch (err: any) {
    throw new AppError("Validation fails: " + err.message, 400);
  }

  const { price, invoiceId } = req.body;
  const unitPrice = parseFloat(price);

  // Buscar o accessToken da tabela Settings
  let accessToken;

  // Primeiro tenta buscar com companyId = 1
  const setting = await Setting.findOne({
    where: { companyId: 1, key: 'mpaccesstoken' },
    attributes: ['value']
  });

  if (setting?.value) {
    accessToken = setting.value;
    console.log('[MP] Usando access token do banco:', accessToken.substring(0, 8) + '...');
  } else {
    accessToken = process.env.MP_ACCESS_TOKEN;
    if (!accessToken) {
      throw new AppError("Mercado Pago access token not found in settings or environment", 400);
    }
    console.log('[MP] Usando access token do .env:', accessToken.substring(0, 8) + '...');
  }

  // Instancia o SDK do Mercado Pago
  const mpClient = new MercadoPagoConfig({ accessToken });

  // Dados para criar a preferência de pagamento
  const preference = {
    back_urls: {
      success: `${process.env.FRONTEND_URL}/financeiro`,
      failure: `${process.env.FRONTEND_URL}/financeiro`
    },
    auto_return: "approved",
    items: [
      {
        id: `${invoiceId}`,
        title: `#Fatura:${invoiceId}`,
        quantity: 1,
        currency_id: 'BRL',
        unit_price: unitPrice
      }
    ]
  };

  try {
    console.log('[MP] Criando preferência:', JSON.stringify(preference));
    const preferenceClient = new Preference(mpClient);
    const response = await preferenceClient.create({ body: preference });
    console.log('[MP] Preferência criada:', response.init_point);
    return res.json({ urlMcPg: response.init_point });
  } catch (error: any) {
    console.error("[MP] Erro Mercado Pago:", error.response?.data || error.message || error);
    throw new AppError("Problema encontrado ao gerar link de pagamento, entre em contato com o suporte!", 400);
  }
};

// Webhook do Mercado Pago
export const webhook = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { evento, data } = req.body;

  // Resposta para testes de webhook
  if (evento === "teste_webhook") {
    return res.json({ ok: true });
  }

  if (data && data.id) {
    try {
      // Buscar o accessToken da tabela Settings
      let accessToken;
      const setting = await Setting.findOne({
        where: { companyId: 1, key: 'mpaccesstoken' },
        attributes: ['value']
      });

      if (setting?.value) {
        accessToken = setting.value;
      } else {
        accessToken = process.env.MP_ACCESS_TOKEN;
        if (!accessToken) {
          console.error("MP access token not found for webhook");
          return res.json({ ok: false });
        }
      }

      const paymentResponse = await axios.get(`https://api.mercadopago.com/v1/payments/${data.id}`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        }
      });

      const paymentDetails = paymentResponse.data;

      // Processar pagamento aprovado
      if (paymentDetails.status === "approved") {
        const invoiceID = paymentDetails.additional_info.items[0].title.replace("#Fatura:", "");
        const invoice = await Invoices.findByPk(invoiceID);

        if (invoice) {
          const companyId = invoice.companyId;
          const company = await Company.findByPk(companyId);

          if (company) {
            const expiresAt = new Date(company.dueDate);
            expiresAt.setDate(expiresAt.getDate() + 30);
            const newDueDate = expiresAt.toISOString().split("T")[0];

            await company.update({ dueDate: newDueDate });
            await invoice.update({ status: "paid" });

            const io = getIO();
            const companyUpdate = await Company.findOne({ where: { id: companyId } });

            io.emit(`company-${companyId}-payment`, {
              action: paymentDetails.status,
              company: companyUpdate
            });
          }
        }
      }
    } catch (error) {
      console.error("Erro no webhook Mercado Pago:", error);
      // Não lance erro, apenas logue e retorne ok para evitar retries infinitos
      return res.json({ ok: false });
    }
  }

  return res.json({ ok: true });
}

// Função não implementada
export function createWebhook(arg0: string, createWebhook: any) {
  throw new Error("Function not implemented.");
}