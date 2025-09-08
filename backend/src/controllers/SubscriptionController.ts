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

// Função para buscar o token do Mercado Pago
async function getMercadoPagoToken(): Promise<string> {
  console.log("🔍 Iniciando busca do token do Mercado Pago...");
  
  // Primeiro, tenta buscar nas variáveis de ambiente
  let accessToken = process.env.MP_ACCESS_TOKEN;
  
  if (!accessToken || accessToken.trim() === '') {
    console.log("🔍 Token não encontrado ou vazio no .env, buscando no banco de dados...");
    
    try {
      // Busca no banco de dados na tabela Settings
      const setting = await Setting.findOne({
        where: { key: "mpaccesstoken" }
      });
      
      if (setting && setting.value && setting.value.trim() !== '') {
        accessToken = setting.value;
        console.log("✅ Token do Mercado Pago encontrado no banco de dados");
      } else {
        console.log("❌ Token do Mercado Pago não encontrado ou vazio no banco de dados");
      }
    } catch (error) {
      console.error("❌ Erro ao buscar token no banco:", error);
    }
  } else {
    console.log("✅ Token do Mercado Pago encontrado no .env");
  }
  
  if (!accessToken || accessToken.trim() === '') {
    console.log("❌ Nenhum token válido encontrado!");
    console.log("💡 Configure o token via:");
    console.log("   1. Arquivo .env: MP_ACCESS_TOKEN=seu_token_aqui");
    console.log("   2. API: POST /mercadopago/set-token");
    console.log("   3. Banco: tabela Settings, key='mpaccesstoken'");
    
    throw new AppError("Token do Mercado Pago não configurado. Configure MP_ACCESS_TOKEN no .env ou use a API /mercadopago/set-token.", 500);
  }
  
  // Validação básica do formato do token
  if (!accessToken.startsWith('APP_USR-') && !accessToken.startsWith('TEST-')) {
    console.log("⚠️ Token pode estar em formato incorreto. Tokens do MP começam com APP_USR- ou TEST-");
  }
  
  console.log("✅ Token encontrado, formato:", accessToken.substring(0, 10) + "...");
  return accessToken;
}

// Endpoint para criar uma nova assinatura
export const createSubscription = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { companyId } = req.user;

  // Schema de validação (agora com mensagens explícitas)
  const schema = Yup.object().shape({
    price: Yup.mixed().test('is-number-string', 'price deve ser número ou string numérica', v => v !== undefined && v !== null && /^\d+(\.\d+)?$/.test(String(v))).required('price é obrigatório'),
    users: Yup.mixed().required('users é obrigatório'),
    connections: Yup.mixed().required('connections é obrigatório'),
    invoiceId: Yup.mixed().notRequired()
  });

  try {
    await schema.validate(req.body, { abortEarly: false });
  } catch (validationErr: any) {
    const details = validationErr.errors?.join('; ') || 'payload inválido';
    throw new AppError(`Validation fails: ${details}`, 400);
  }

  const { price, invoiceId } = req.body;
  const unitPrice = Number(price);
  if (Number.isNaN(unitPrice) || unitPrice <= 0) {
    throw new AppError('price inválido (deve ser > 0)', 400);
  }

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
    // Buscar o token do Mercado Pago
    const accessToken = await getMercadoPagoToken();

    console.log("🔄 Criando preferência de pagamento no Mercado Pago...");
    console.log("💰 Valor:", unitPrice);
    console.log("📋 Invoice ID:", invoiceId);

    // Chamada para criar a preferência no Mercado Pago
    const response = await axios.post('https://api.mercadopago.com/checkout/preferences', data, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      }
    });
    
    console.log("✅ Preferência criada com sucesso!");
    console.log("🔗 URL de pagamento:", response.data.init_point);
    
    const urlMcPg = response.data.init_point;

    return res.json({ urlMcPg });
  } catch (error) {
    console.error("❌ Erro ao criar preferência de pagamento:", error.response?.data || error.message);
    
    if (error.response?.status === 401) {
      throw new AppError("Token do Mercado Pago inválido. Verifique as credenciais.", 400);
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
      // Buscar o token do Mercado Pago
      const accessToken = await getMercadoPagoToken();

      console.log("🔍 Consultando pagamento ID:", data.id);
      
      const paymentResponse = await axios.get(`https://api.mercadopago.com/v1/payments/${data.id}`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
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

            // Casting to any due to sequelize-typescript Model generic typing mismatch
            await (company as any).update({ dueDate: newDueDate });
            await (invoice as any).update({ status: "paid" });

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

// Endpoint para testar o token do Mercado Pago
export const testMercadoPagoToken = async (req: Request, res: Response): Promise<Response> => {
  try {
    console.log("🔍 Testando token do Mercado Pago...");
    
    const accessToken = await getMercadoPagoToken();
    console.log("Token encontrado:", accessToken ? "Sim" : "Não");
    
    // Testar o token fazendo uma requisição para a API do MP
    const testResponse = await axios.get('https://api.mercadopago.com/users/me', {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });
    
    console.log("✅ Token válido! Usuário:", testResponse.data.email);
    
    return res.json({ 
      valid: true, 
      user: testResponse.data.email,
      message: "Token do Mercado Pago válido!"
    });
  } catch (error) {
    console.error("❌ Erro ao testar token:", error.response?.data || error.message);
    
    if (error.response?.status === 401) {
      return res.status(401).json({ 
        valid: false, 
        error: "Token inválido ou expirado",
        message: "Verifique se o token está correto e não expirou"
      });
    }
    
    return res.status(500).json({ 
      valid: false, 
      error: error.message,
      message: "Erro ao validar token"
    });
  }
};

// Endpoint para configurar o token do Mercado Pago no banco
export const setMercadoPagoToken = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { token } = req.body;
    const { companyId } = req.user;
    
    if (!token) {
      throw new AppError("Token é obrigatório", 400);
    }
    
    console.log("🔄 Configurando token do Mercado Pago no banco...");
    
    // Primeiro, testar se o token é válido
    const testResponse = await axios.get('https://api.mercadopago.com/users/me', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    console.log("✅ Token válido! Salvando no banco...");
    
    // Salvar no banco
    const [setting] = await Setting.findOrCreate({
      where: { 
        key: "mpaccesstoken",
        companyId
      },
      defaults: {
        key: "mpaccesstoken",
        value: token,
        companyId
      }
    });
    
    if (!(setting as any).isNewRecord) {
      await (setting as any).update({ value: token });
    }
    
    console.log("✅ Token salvo com sucesso!");
    
    return res.json({ 
      success: true, 
      user: testResponse.data.email,
      message: "Token configurado com sucesso!"
    });
  } catch (error) {
    console.error("❌ Erro ao configurar token:", error.response?.data || error.message);
    
    if (error.response?.status === 401) {
      throw new AppError("Token inválido. Verifique se o token está correto.", 400);
    }
    
    throw new AppError("Erro ao configurar token: " + error.message, 500);
  }
};

