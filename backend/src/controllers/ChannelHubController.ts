import { Request, Response } from "express";
import CreateChannelsService from "../services/HubServices/CreateHubChannelsService";
import { setChannelWebhook } from "../helpers/setChannelHubWebhook";
import { getIO } from "../libs/socket";
import ListChannels from "../services/HubServices/ListHubChannels";

// Define user interface to match isAuth middleware
interface IUser {
  id: string;
  profile: string;
  companyId: number;
}

// Extend Request for req.user
interface CustomRequest extends Request {
  user: IUser; // Make user required (remove ?)
}

// Align IChannel with service
export interface IChannel {
  allowGroup?: boolean;
  name: string;
  status?: string;
  isDefault?: boolean;
  qrcode?: string;
  type?: string;
  channel?: string;
  id?: string | number;
  companyId?: number; // Optional, as it’s added from req.user
  token?: string;
}

export const store = async (req: CustomRequest, res: Response): Promise<Response> => {
  const { channels = [] } = req.body;
  const { companyId } = req.user; // user is guaranteed by isAuth

  // Validate inputs
  if (!companyId) {
    return res.status(401).json({ error: "Unauthorized: Company ID not found" });
  }

  if (!Array.isArray(channels)) {
    return res.status(400).json({ error: "Channels must be an array" });
  }

  if (channels.some((ch: IChannel) => !ch.name || !ch.channel)) {
    return res.status(400).json({ error: "Channel name and type are required" });
  }

  // Add companyId to each channel
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

    // Emit socket update
    const io = getIO();
    whatsapps.forEach(whatsapp => {
      io.emit(`company-${companyId}-whatsapp`, {
        action: "update",
        whatsapp,
      });
    });

    return res.status(200).json(whatsapps);
  } catch (error) {
    console.error("Error in hub-channel store:", error);
    return res.status(500).json({ error: error.message });
  }
};

export const index = async (req: CustomRequest, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user; // user is guaranteed by isAuth

    if (!companyId) {
      return res.status(401).json({ error: "Unauthorized: Company ID not found" });
    }

    const channels = await ListChannels(companyId);
    return res.status(200).json(channels);
  } catch (error) {
    console.error("Error in hub-channel index:", error);
    return res.status(500).json({ error: error.message });
  }
};