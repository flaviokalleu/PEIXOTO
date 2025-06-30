import CompaniesSettings from "../models/CompaniesSettings";
import logger from "../utils/logger";

export const showHubToken = async (companyId: number): Promise<string | null> => {
  try {
    const companySettings = await CompaniesSettings.findOne({
      where: { companyId }
    });
    if (!companySettings || !companySettings.hubToken) {
      logger.warn(`hubToken não encontrado em CompaniesSettings para a empresa ${companyId}`);
      return null;
    }
    return companySettings.hubToken;
  } catch (err) {
    logger.error(`Erro ao buscar hubToken em CompaniesSettings: ${err.message}`);
    return null;
  }
};