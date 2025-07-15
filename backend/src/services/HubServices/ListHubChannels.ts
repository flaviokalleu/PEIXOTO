import Setting  from "../../models/Setting";
import { Client } from "notificamehubsdk";

interface IChannel {
  name: string;
  status?: string;
  isDefault?: boolean;
  qrcode?: string;
  type?: string;
  channel?: string;
  id?: string;
}

export const ListChannels = async (companyId: number): Promise<IChannel[]> => {
  try {
    // Retrieve hubToken from Setting table for the specific company
    const setting = await Setting.findOne({
      where: { key: "hubToken", companyId },
      attributes: ["value"],
    });

    if (!setting || !setting.value) {
      throw new Error("NOTIFICAMEHUB_TOKEN_NOT_FOUND");
    }

    const hubToken = setting.value;

    // Initialize NotificameHub client
    const client = new Client(hubToken);

    // Fetch channels
    const response = await client.listChannels();

    // Validate and map response to IChannel interface
    if (!Array.isArray(response)) {
      throw new Error("INVALID_RESPONSE_FORMAT");
    }

    const channels: IChannel[] = response.map((channel: any) => ({
      name: channel.name || "",
      status: channel.status,
      isDefault: channel.isDefault,
      qrcode: channel.qrcode,
      type: channel.type,
      channel: channel.channel,
      id: channel.id,
    }));

    return channels;
  } catch (error) {
    throw new Error(`Failed to list hub channels: ${error.message}`);
  }
};

export default ListChannels;