import { Request, Response } from "express";
import express from "express";
import * as Yup from "yup";
import * as dotenv from 'dotenv';
import mercadopago from 'mercadopago'; // Remover se não estiver sendo usado
import AppError from "../errors/AppError";
import Company from "../models/Company";
import Invoices from "../models/Invoices";
import Setting from "../models/Setting";
import { getIO } from "../libs/socket";
import axios from 'axios';

dotenv.config();

// Configure Mercado Pago
const accessToken = process.env.MP_ACCESS_TOKEN;

// Verificar se o token está configurado
if (!accessToken) {
  console.error("❌ MP_ACCESS_TOKEN não está configurado nas variáveis de ambiente!");
}

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

  // Dados para criar a preferência de pagamento
  const data = {
    back_urls: {
      success: `${process.env.FRONTEND_URL}/financeiro`,
      failure: `${process.env.FRONTEND_URL}/financeiro`
    },
    auto_return: "approved",
    items: [
      {
        title: `#fservice Fatura:${invoiceId}`,
        quantity: 1,
        currency_id: 'BRL',
        unit_price: unitPrice
      }
    ]
  };

  try {
    // Verificar se o token está configurado
    if (!accessToken) {
      throw new AppError("Token do Mercado Pago não configurado. Configure MP_ACCESS_TOKEN nas variáveis de ambiente.", 500);
    }

    console.log("🔄 Criando preferência de pagamento no Mercado Pago...");
    console.log("💰 Valor:", unitPrice);
    console.log("📋 Invoice ID:", invoiceId);

    // Chamada para criar a preferência no Mercado Pago
    const response = await axios.post('https://api.mercadopago.com/checkout/preferences', data, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}` // Usando accessToken aqui
      }
    });
    
    console.log("✅ Preferência criada com sucesso!");
    console.log("🔗 URL de pagamento:", response.data.init_point);
    
    const urlMcPg = response.data.init_point;

    return res.json({ urlMcPg });
  } catch (error) {
    console.error("❌ Erro ao criar preferência de pagamento:", error.response?.data || error.message);
    
    if (error.response?.status === 401) {
      throw new AppError("Token do Mercado Pago inválido. Verifique as credenciais.", 401);
    }
    
    throw new AppError("Problema encontrado, entre em contato com o suporte!", 400);
  }
};

// Webhook do Mercado Pago
export const webhook = async (
  req: Request,
  res: Response
): Promise<Response> => {
  console.log("📥 Webhook recebido do Mercado Pago:", req.body);
  
  const { evento, data } = req.body;

  // Resposta para testes de webhook
  if (evento === "teste_webhook") {
    console.log("🧪 Teste de webhook recebido");
    return res.json({ ok: true });
  }

  if (data && data.id) {
    try {
      if (!accessToken) {
        throw new AppError("Token do Mercado Pago não configurado.", 500);
      }

      console.log("🔍 Consultando pagamento ID:", data.id);
      
      const paymentResponse = await axios.get(`https://api.mercadopago.com/v1/payments/${data.id}`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}` // Usando accessToken aqui
        }
      });

      const paymentDetails = paymentResponse.data;
      console.log("💳 Detalhes do pagamento:", paymentDetails.status);

      // Processar pagamento aprovado
      if (paymentDetails.status === "approved") {
        console.log("✅ Pagamento aprovado! Processando...");
        console.log("✅ Pagamento aprovado! Processando...");
        const invoiceID = paymentDetails.additional_info.items[0].title.replace("#fservice Fatura:", "");
        console.log("📄 Processando fatura ID:", invoiceID);
        
        const invoice = await Invoices.findByPk(invoiceID);

        if (invoice) {
          console.log("📋 Fatura encontrada, atualizando empresa...");
          const companyId = invoice.companyId;
          const company = await Company.findByPk(companyId);

          if (company) {
            const expiresAt = new Date(company.dueDate);
            expiresAt.setDate(expiresAt.getDate() + 30);
            const newDueDate = expiresAt.toISOString().split("T")[0];

            await company.update({ dueDate: newDueDate });
            await invoice.update({ status: "paid" });

            console.log("🏢 Empresa atualizada - Nova data de vencimento:", newDueDate);

            const io = getIO();
            const companyUpdate = await Company.findOne({ where: { id: companyId } });

            io.emit(`company-${companyId}-payment`, {
              action: paymentDetails.status,
              company: companyUpdate
            });
            
            console.log("📡 Evento emitido para empresa:", companyId);
          } else {
            console.log("❌ Empresa não encontrada para ID:", companyId);
          }
        } else {
          console.log("❌ Fatura não encontrada para ID:", invoiceID);
        }
      } else {
        console.log("⏳ Pagamento com status:", paymentDetails.status);
      }
    } catch (error) {
      console.error("❌ Erro ao processar webhook:", error.response?.data || error.message);
      throw new AppError("Erro ao processar pagamento.", 400);
    }
  } else {
    console.log("⚠️ Webhook sem dados de pagamento");
  }

  return res.json({ ok: true });
};

