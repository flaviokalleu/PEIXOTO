import { Request, Response } from "express";
import CreateChannelsService from "../services/HubServices/CreateHubChannelsService";
import { setChannelWebhook } from "../helpers/setChannelHubWebhook";
import { getIO } from "../libs/socket";
import ListChannels from "../services/HubServices/ListHubChannels";

interface IUser {
  id: string;
  profile: string;
  companyId: number;
}

interface CustomRequest extends Request {
  user: IUser;
}

export interface IChannel {
  allowGroup?: boolean;
  name: string;
  status?: string;
  isDefault?: boolean;
  qrcode?: string;
  type?: string;
  channel?: string;
  id?: string | number;
  companyId: number;
  token?: string;
}

export const store = async (req: CustomRequest, res: Response): Promise<Response> => {
  const { channels = [] } = req.body;
  const { companyId } = req.user;

  // Validate channels
  if (channels.some((ch: IChannel) => !ch.name || !ch.channel)) {
    return res.status(400).json({ error: "Channel name and type are required" });
  }

  const channelsWithCompanyId = channels.map((channel: IChannel) => ({
    ...channel,
    companyId,
  }));

  try {
    const { whatsapps } = await CreateChannelsService({
      companyId,
      channels: channelsWithCompanyId,
    });

    whatsapps.forEach(whatsapp => {
      setTimeout(() => {
        setChannelWebhook(whatsapp, whatsapp.id.toString());
      }, 2000);
    });

    const io = getIO();
    whatsapps.forEach(whatsapp => {
      io.emit(`company-${companyId}-whatsapp`, {
        action: "update",
        whatsapp,
      });
    });

    return res.status(200).json(whatsapps);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

export const index = async (req: CustomRequest, res: Response): Promise<Response> => {
  const { companyId } = req.user;

  try {
    const channels = await ListChannels(companyId); // Remove .toString()
    return res.status(200).json(channels);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};