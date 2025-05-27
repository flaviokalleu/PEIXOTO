import { Request, Response } from "express";
import express from "express";
import * as Yup from "yup";
import mercadopago from 'mercadopago'; // Mantenha se necessário para outras funções
import AppError from "../errors/AppError";
import Company from "../models/Company";
import Invoices from "../models/Invoices";
import Setting from "../models/Setting";
import { getIO } from "../libs/socket";
import axios from 'axios';

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
  if (!(await schema.isValid(req.body))) {
    throw new AppError("Validation fails", 400);
  }

  const { price, invoiceId } = req.body;
  const unitPrice = parseFloat(price);

  // Buscar o accessToken da tabela Settings
  const setting = await Setting.findOne({
    where: { companyId, key: 'mpaccesstoken' },
    attributes: ['value'] // Buscar apenas a coluna value
  });

  if (!setting || !setting.value) {
    throw new AppError("Mercado Pago access token not found in settings", 400);
  }

  const accessToken = setting.value;

  // Dados para criar a preferência de pagamento
  const data = {
    back_urls: {
      success: `${process.env.FRONTEND_URL}/financeiro`,
      failure: `${process.env.FRONTEND_URL}/financeiro`
    },
    auto_return: "approved",
    items: [
      {
        title: `#Fatura:${invoiceId}`,
        quantity: 1,
        currency_id: 'BRL',
        unit_price: unitPrice
      }
    ]
  };

  try {
    // Chamada para criar a preferência no Mercado Pago
    const response = await axios.post('https://api.mercadopago.com/checkout/preferences', data, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      }
    });
    
    const urlMcPg = response.data.init_point;

    return res.json({ urlMcPg });
  } catch (error) {
    console.error(error);
    throw new AppError("Problema encontrado, entre em contato com o suporte!", 400);
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
      const setting = await Setting.findOne({
        where: { key: 'mpaccesstoken' }, // Ajuste companyId se necessário
        attributes: ['value'] // Buscar apenas a coluna value
      });

      if (!setting || !setting.value) {
        throw new AppError("Mercado Pago access token not found in settings", 400);
      }

      const accessToken = setting.value;

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
      console.error(error);
      throw new AppError("Erro ao processar pagamento.", 400);
    }
  }

  return res.json({ ok: true });
};

export function createWebhook(arg0: string, createWebhook: any) {
  throw new Error("Function not implemented.");
}