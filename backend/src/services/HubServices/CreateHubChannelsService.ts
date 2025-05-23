import Whatsapp from "../../models/Whatsapp";
import Setting from "../../models/Setting";
import { Client } from "notificamehubsdk";
import { getIO } from "../../libs/socket";

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

interface Request {
  companyId: number;
  channels: IChannel[];
}

interface Response {
  whatsapps: Whatsapp[];
}

const CreateChannelsService = async ({ companyId, channels }: Request): Promise<Response> => {
  if (!Array.isArray(channels)) {
    throw new Error("Channels must be an array");
  }

  if (channels.length === 0) {
    return { whatsapps: [] };
  }

  const whatsapps: Whatsapp[] = [];

  for (const channel of channels) {
    const { name, type, channel: channelType, allowGroup, isDefault, token } = channel;

    if (!companyId) {
      throw new Error("Company ID is required for channel creation");
    }

    const setting = await Setting.findOne({
      where: { key: "hubToken", companyId },
      attributes: ["value"],
    });

    if (!setting || !setting.value) {
      throw new Error(`NOTIFICAMEHUB_TOKEN_NOT_FOUND for company ${companyId}`);
    }

    const hubToken = setting.value;
    const client = new Client(hubToken);

    const hubResponse = {
      status: "PENDING",
      name: name || "Unnamed Channel",
    };

    const uniqueIdentifier = new Date().getTime().toString();

    const whatsappData = {
      name: name || hubResponse.name || "Unnamed Channel",
      qrcode: uniqueIdentifier,
      status: hubResponse.status || "PENDING",
      session: "",
      battery: "",
      plugged: false,
      retries: 0,
      number: "",
      greetingMessage: "",
      greetingMediaAttachment: "",
      farewellMessage: "",
      complationMessage: "",
      outOfHoursMessage: "",
      type: type || channelType || "facebook",
      provider: "stable",
      isDefault: isDefault || false,
      allowGroup: allowGroup || false,
      channel: channelType || "facebook",
      maxUseBotQueues: 3,
      timeUseBotQueues: "0",
      expiresTicket: "0",
      timeSendQueue: 0,
      groupAsTicket: "disabled",
      companyId,
      token: token || "",
      facebookUserId: "",
      facebookUserToken: "",
      facebookPageUserId: "",
      tokenMeta: "",
      timeInactiveMessage: "",
      inactiveMessage: "",
      ratingMessage: "",
      maxUseBotQueuesNPS: 3,
      expiresTicketNPS: 0,
      whenExpiresTicket: "",
      expiresInactiveMessage: "",
      importOldMessages: null,
      importRecentMessages: null,
      statusImportMessages: "",
      closedTicketsPostImported: false,
      importOldMessagesGroups: false,
      timeCreateNewTicket: 0,
      schedules: [],
      collectiveVacationMessage: "",
      collectiveVacationStart: "",
      collectiveVacationEnd: "",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const whatsapp = await Whatsapp.create(whatsappData);
    whatsapps.push(whatsapp);

    const io = getIO();
    io.emit(`company-${companyId}-whatsapp`, {
      action: "update",
      whatsapp,
    });
  }

  return { whatsapps };
};

export default CreateChannelsService;