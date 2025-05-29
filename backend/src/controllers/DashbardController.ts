import { Request, Response } from "express";
import DashboardDataService from "../services/ReportService/DashbardDataService";
import { TicketsAttendance } from "../services/ReportService/TicketsAttendance";
import { TicketsDayService } from "../services/ReportService/TicketsDayService";
import TicketsQueuesService from "../services/TicketServices/TicketsQueuesService";

// Interfaces
interface Params {
  date_from?: string;
  date_to?: string;
  [key: string]: any;
}

interface Attendant {
  id: number;
  name: string;
  online: boolean;
  rating: number; // Pontuação (ex: 7.5)
  tickets: number; // Total de Atendimentos
  avgWaitTime: number | null; // T.M. de Espera em minutos
  countRating: number; // Atendimentos avaliados
  avgSupportTime: number | null; // T.M. de Atendimento em minutos
}

interface Counters {
  leads: number;
  npsScore: number;
  percRating: number;
  waitRating: number;
  withRating: number;
  avgWaitTime: number | null;
  activeTickets: number;
  supportGroups: number;
  withoutRating: number;
  avgSupportTime: number | null;
  npsPassivePerc: number;
  passiveTickets: number;
  supportPending: number;
  supportFinished: number;
  npsPromotersPerc: number;
  supportHappening: number;
  npsDetractorsPerc: number;
}

interface DashboardData {
  counters: Counters;
  attendants: Attendant[];
}

// Função simples para calcular NPS baseado na tabela de atendentes
const calculateSimpleNPS = (attendants: Attendant[]) => {
  console.log("🔢 Calculando NPS com dados dos atendentes:");

  const attendantsWithRatings = attendants.filter(att => att.countRating > 0 && att.rating > 0);

  if (attendantsWithRatings.length === 0) {
    console.log("❌ Nenhum atendente com avaliações encontrado");
    return {
      totalRatings: 0,
      totalTickets: 0,
      npsScore: 0,
      npsPromotersPerc: 0,
      npsPassivePerc: 0,
      npsDetractorsPerc: 0,
      avgWaitTime: null,
      avgSupportTime: null,
      percRating: 0
    };
  }

  let totalPromotores = 0;
  let totalNeutros = 0;
  let totalDetratores = 0;
  let totalAvaliacoes = 0;
  let totalAtendimentos = 0;
  let temposEspera: number[] = [];
  let temposAtendimento: number[] = [];

  attendantsWithRatings.forEach(attendant => {
    const { name, rating, countRating, tickets, avgWaitTime, avgSupportTime } = attendant;

    console.log(`👤 ${name}: Nota ${rating}, ${countRating} avaliações de ${tickets} atendimentos`);

    totalAvaliacoes += countRating;
    totalAtendimentos += tickets;

    // Classificação com base em notas de 1 a 3
    if (rating === 3) {
      totalPromotores += countRating;
      console.log(`  ✅ ${countRating} promotores (nota ${rating})`);
    } else if (rating === 2) {
      totalNeutros += countRating;
      console.log(`  😐 ${countRating} neutros (nota ${rating})`);
    } else {
      totalDetratores += countRating;
      console.log(`  ❌ ${countRating} detratores (nota ${rating})`);
    }

    if (avgWaitTime && avgWaitTime > 0) {
      temposEspera.push(avgWaitTime);
    }
    if (avgSupportTime && avgSupportTime > 0) {
      temposAtendimento.push(avgSupportTime);
    }
  });

  const promotoresPerc = totalAvaliacoes > 0 ? Math.round((totalPromotores / totalAvaliacoes) * 100) : 0;
  const neutrosPerc = totalAvaliacoes > 0 ? Math.round((totalNeutros / totalAvaliacoes) * 100) : 0;
  const detratoresPerc = totalAvaliacoes > 0 ? Math.round((totalDetratores / totalAvaliacoes) * 100) : 0;

  const npsScore = promotoresPerc - detratoresPerc;

  const avgWaitTime = temposEspera.length > 0 
    ? Math.round(temposEspera.reduce((a, b) => a + b, 0) / temposEspera.length) 
    : null;

  const avgSupportTime = temposAtendimento.length > 0 
    ? Math.round(temposAtendimento.reduce((a, b) => a + b, 0) / temposAtendimento.length) 
    : null;

  const percRating = totalAtendimentos > 0 ? Math.round((totalAvaliacoes / totalAtendimentos) * 100) : 0;

  console.log("📊 Resultado final:");
  console.log(`  📈 NPS Score: ${npsScore}`);
  console.log(`  💚 Promotores: ${totalPromotores} (${promotoresPerc}%)`);
  console.log(`  😐 Neutros: ${totalNeutros} (${neutrosPerc}%)`);
  console.log(`  💔 Detratores: ${totalDetratores} (${detratoresPerc}%)`);
  console.log(`  📋 Total avaliações: ${totalAvaliacoes} de ${totalAtendimentos} atendimentos (${percRating}%)`);

  return {
    totalRatings: totalAvaliacoes,
    totalTickets: totalAtendimentos,
    npsScore,
    npsPromotersPerc: promotoresPerc,
    npsPassivePerc: neutrosPerc,
    npsDetractorsPerc: detratoresPerc,
    avgWaitTime,
    avgSupportTime,
    percRating
  };
};

// Função para corrigir os contadores
const fixDashboardCounters = (originalData: DashboardData): DashboardData => {
  const { attendants, counters } = originalData;

  console.log("🔧 Corrigindo contadores do dashboard...");
  console.log(`📋 Dados originais: ${attendants.length} atendentes`);

  // Calcular métricas corretas
  const metrics = calculateSimpleNPS(attendants);

  // Criar contadores corrigidos mantendo os valores originais que não calculamos
  const fixedCounters = {
    ...counters, // Manter valores originais
    // Sobrescrever apenas os que calculamos
    npsScore: metrics.npsScore,
    npsPromotersPerc: metrics.npsPromotersPerc,
    npsPassivePerc: metrics.npsPassivePerc,
    npsDetractorsPerc: metrics.npsDetractorsPerc,
    withRating: metrics.totalRatings,
    withoutRating: Math.max(0, metrics.totalTickets - metrics.totalRatings),
    percRating: metrics.percRating,
    avgWaitTime: metrics.avgWaitTime,
    avgSupportTime: metrics.avgSupportTime,
    waitRating: metrics.avgWaitTime || 0
  };

  console.log("✅ Contadores corrigidos com sucesso!");

  return {
    ...originalData,
    counters: fixedCounters
  };
};

// Controllers
export const index = async (req: Request, res: Response): Promise<Response> => {
  try {
    const params: Params = req.query;
    const { companyId } = req.user;

    console.log("📡 Requisição dashboard:", { companyId, params });

    // Buscar dados originais do serviço
    const originalData: DashboardData = await DashboardDataService(companyId, params);
    
    console.log("📊 Dados recebidos do serviço:");
    console.log(`  👥 Atendentes: ${originalData.attendants?.length || 0}`);
    console.log(`  📈 NPS original: ${originalData.counters?.npsScore || 0}`);
    
    // Exemplo de log dos primeiros atendentes para debug
    if (originalData.attendants?.length > 0) {
      console.log("👤 Primeiros atendentes:");
      originalData.attendants.slice(0, 3).forEach(att => {
        console.log(`  - ${att.name}: ${att.rating}/10, ${att.countRating} avaliações, ${att.tickets} atendimentos`);
      });
    }

    // Corrigir os dados usando nossa lógica simples
    const correctedData = fixDashboardCounters(originalData);

    return res.status(200).json(correctedData);

  } catch (error) {
    console.error("❌ Erro no dashboard:", error);
    return res.status(500).json({ 
      error: "Falha ao buscar dados do dashboard",
      message: error instanceof Error ? error.message : "Erro desconhecido"
    });
  }
};

export const reportsUsers = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { initialDate, finalDate, companyId } = req.query as unknown as {
      initialDate: string;
      finalDate: string;
      companyId: number;
    };
    
    const { data } = await TicketsAttendance({ initialDate, finalDate, companyId });
    return res.json({ data });
  } catch (error) {
    console.error("❌ Erro em reportsUsers:", error);
    return res.status(500).json({ error: "Falha ao buscar relatório de usuários" });
  }
};

export const reportsDay = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { initialDate, finalDate, companyId } = req.query as unknown as {
      initialDate: string;
      finalDate: string;
      companyId: number;
    };
    
    const { count, data } = await TicketsDayService({ initialDate, finalDate, companyId });
    return res.json({ count, data });
  } catch (error) {
    console.error("❌ Erro em reportsDay:", error);
    return res.status(500).json({ error: "Falha ao buscar relatório diário" });
  }
};

export const DashTicketsQueues = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId, profile, id: userId } = req.user;
    const { dateStart, dateEnd, status, queuesIds, showAll } = req.query as unknown as {
      dateStart: string;
      dateEnd: string;
      status: string[];
      queuesIds: string[];
      showAll: string;
    };
    
    const tickets = await TicketsQueuesService({
      showAll: profile === "admin" ? showAll : false,
      dateStart,
      dateEnd,
      status,
      queuesIds,
      userId,
      companyId,
      profile,
    });
    
    return res.status(200).json(tickets);
  } catch (error) {
    console.error("❌ Erro em DashTicketsQueues:", error);
    return res.status(500).json({ error: "Falha ao buscar tickets das filas" });
  }
};