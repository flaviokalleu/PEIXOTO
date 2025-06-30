/** 
 * @TercioSantos-0 |
 * serviço/atualizar 1 configuração da empresa |
 * @params:companyId/column(name)/data
 */
import sequelize from "../../database";
import CompaniesSettings from "../../models/CompaniesSettings";

type Params = {
  companyId: number,
  column:string,
  data:string
};


const UpdateCompanySettingsService = async ({companyId, column, data}:Params): Promise<any> => {
  if (!column || column === 'undefined') {
    throw new Error('O parâmetro "column" está indefinido ou inválido ao atualizar CompaniesSettings.');
  }
  const [results, metadata] = await sequelize.query(`UPDATE "CompaniesSettings" SET "${column}"='${data}' WHERE "companyId"=${companyId}`);
  return results;
};

export default UpdateCompanySettingsService;