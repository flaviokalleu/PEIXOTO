import { Request, Response } from "express";
import DashboardDataService from "../services/ReportService/DashbardDataService"; // Use default import and fix typo in path
import { TicketsAttendance } from "../services/ReportService/TicketsAttendance";
import { TicketsDayService } from "../services/ReportService/TicketsDayService";
import TicketsQueuesService from "../services/TicketServices/TicketsQueuesService";

// Define the Params type (if not exported from DashboardDataService)
interface Params {
  date_from?: string;
  date_to?: string;
  [key: string]: any; // Allow additional query params
}

// Define the Attendant interface to match the data structure
interface Attendant {
  id: number;
  name: string;
  online: boolean;
  rating: number;
  tickets: number;
  avgWaitTime: number | null;
  countRating: number;
  avgSupportTime: number | null;
}

// Define the DashboardData interface to match the data structure
interface DashboardData {
  counters: {
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
  };
  attendants: Attendant[];
}

type IndexQuery = {
  initialDate: string;
  finalDate: string;
  companyId: number | any;
};

type IndexQueryPainel = {
  dateStart: string;
  dateEnd: string;
  status: string[];
  queuesIds: string[];
  showAll: string;
};

// Function to recalculate counters automatically
const recalculateCounters = (dashboardData: DashboardData): DashboardData => {
  const { attendants, counters } = dashboardData;

  // Calculate totals based on attendants
  const totalRatings = attendants.reduce((sum, att: Attendant) => sum + (att.countRating || 0), 0);
  const totalTickets = attendants.reduce((sum, att: Attendant) => sum + (att.tickets || 0), 0);

  // Calculate average wait and support times
  const validWaitTimes = attendants
    .map((att: Attendant) => att.avgWaitTime)
    .filter((time): time is number => time !== null && time !== undefined && !isNaN(time) && time > 0);

  const validSupportTimes = attendants
    .map((att: Attendant) => att.avgSupportTime)
    .filter((time): time is number => time !== null && time !== undefined && !isNaN(time) && time > 0);

  const avgWaitTime = validWaitTimes.length > 0
    ? Math.round(validWaitTimes.reduce((sum, time) => sum + time, 0) / validWaitTimes.length)
    : null;

  const avgSupportTime = validSupportTimes.length > 0
    ? Math.round(validSupportTimes.reduce((sum, time) => sum + time, 0) / validSupportTimes.length)
    : null;

  // Calculate NPS based on attendant ratings
  let npsScore = 0;
  let npsPromotersPerc = 0;
  let npsPassivePerc = 0;
  let npsDetractorsPerc = 0;

  if (totalRatings > 0) {
    let promoters = 0;
    let passive = 0;
    let detractors = 0;

    attendants.forEach((att: Attendant) => {
      if (att.countRating > 0) {
        if (att.rating >= 9) {
          promoters += att.countRating;
        } else if (att.rating >= 7 && att.rating <= 8) {
          passive += att.countRating;
        } else if (att.rating <= 6) {
          detractors += att.countRating;
        }
      }
    });

    npsPromotersPerc = Math.round((promoters / totalRatings) * 100);
    npsPassivePerc = Math.round((passive / totalRatings) * 100);
    npsDetractorsPerc = Math.round((detractors / totalRatings) * 100);
    npsScore = npsPromotersPerc - npsDetractorsPerc;
  }

  // Calculate percentage of ratings
  const percRating = totalTickets > 0 ? Math.round((totalRatings / totalTickets) * 100) : 0;

  // Recalculate corrected counters
  const correctedCounters = {
    ...counters,
    withRating: totalRatings,
    withoutRating: Math.max(0, totalTickets - totalRatings),
    percRating,
    avgWaitTime,
    avgSupportTime,
    npsScore,
    npsPromotersPerc,
    npsPassivePerc,
    npsDetractorsPerc,
    waitRating: avgWaitTime || 0
  };

  return {
    ...dashboardData,
    counters: correctedCounters
  };
};

export const index = async (req: Request, res: Response): Promise<Response> => {
  try {
    const params: Params = req.query;
    const { companyId } = req.user;

    console.log("Dashboard request params:", { companyId, params });

    // Fetch original data
    const originalData: DashboardData = await DashboardDataService(companyId, params);
    
    console.log("Original dashboard data:", originalData);

    // Recalculate counters automatically
    const correctedData = recalculateCounters(originalData);

    console.log("Corrected dashboard data:", correctedData);

    // Check for inconsistencies
    const hasInconsistencies = 
      correctedData.attendants.some((attendant: Attendant) => attendant.rating > 0 && attendant.countRating > 0) &&
      correctedData.counters.withRating === 0;

    if (hasInconsistencies) {
      console.warn("⚠️ Inconsistencies still detected after correction!");
    } else {
      console.log("✅ Counters corrected successfully!");
    }

    return res.status(200).json(correctedData);
  } catch (error) {
    console.error("Error in dashboard index:", error);
    return res.status(500).json({ error: "Failed to fetch dashboard data" });
  }
};

export const reportsUsers = async (req: Request, res: Response): Promise<Response> => {
  const { initialDate, finalDate, companyId } = req.query as IndexQuery;
  const { data } = await TicketsAttendance({ initialDate, finalDate, companyId });
  return res.json({ data });
};

export const reportsDay = async (req: Request, res: Response): Promise<Response> => {
  const { initialDate, finalDate, companyId } = req.query as IndexQuery;
  const { count, data } = await TicketsDayService({ initialDate, finalDate, companyId });
  return res.json({ count, data });
};

export const DashTicketsQueues = async (req: Request, res: Response): Promise<Response> => {
  const { companyId, profile, id: userId } = req.user;
  const { dateStart, dateEnd, status, queuesIds, showAll } = req.query as IndexQueryPainel;
  
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
};