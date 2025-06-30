import { showHubToken } from "../../helpers/showHubToken";
const { Client } = require("notificamehubsdk");
require("dotenv").config();

/*const ListChannels = async () => {
  try {
    const notificameHubToken = await showHubToken();*/

const ListChannels = async (companyId: number) => {
  try {
    const notificameHubToken = await showHubToken(companyId);

    if (!notificameHubToken) {
      throw new Error("NOTIFICAMEHUB_TOKEN_NOT_FOUND");
    }

    const client = new Client(notificameHubToken);

    const response = await client.listChannels();
    console.log("Response:", response);
    return response;
  } catch (error) {
    throw new Error('Error');
  }
};

export default ListChannels;