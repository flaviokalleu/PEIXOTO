import { Request, Response } from "express";
import { healthMonitor } from "../utils/healthMonitor";

export const getHealthStatus = async (req: Request, res: Response): Promise<Response> => {
  try {
    const health = healthMonitor.getHealthStatus();
    
    const status = {
      status: "healthy",
      uptime: health.uptime,
      memory: {
        rss: Math.round(health.memory.rss / 1024 / 1024) + ' MB',
        heapUsed: Math.round(health.memory.heapUsed / 1024 / 1024) + ' MB',
        heapTotal: Math.round(health.memory.heapTotal / 1024 / 1024) + ' MB',
        external: Math.round(health.memory.external / 1024 / 1024) + ' MB'
      },
      errorCount: health.errorCount,
      timestamp: health.timestamp,
      pid: process.pid,
      version: process.version,
      platform: process.platform
    };

    return res.status(200).json(status);
  } catch (error) {
    return res.status(500).json({
      status: "error",
      message: "Failed to get health status",
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
};

export const resetErrorCount = async (req: Request, res: Response): Promise<Response> => {
  try {
    // Reset do contador de erros manualmente se necessário
    (healthMonitor as any).errorCount = 0;
    
    return res.status(200).json({
      status: "success",
      message: "Error count reset successfully"
    });
  } catch (error) {
    return res.status(500).json({
      status: "error",
      message: "Failed to reset error count",
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
};
