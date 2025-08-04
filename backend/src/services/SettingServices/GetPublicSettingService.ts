import Setting from "../../models/Setting";

interface Request {
  key: string;
}

const publicSettingsKeys = [
  "allowSignup",
  "userCreation",
  "primaryColorLight",
  "primaryColorDark",
  "appLogoLight",
  "appLogoDark",
  "appLogoFavicon",
  "appName"
]

const GetPublicSettingService = async ({
  key
}: Request): Promise<string | undefined> => {
  

  console.log("|======== GetPublicSettingService ========|")
  console.log("key", key)
  console.log("publicSettingsKeys", publicSettingsKeys)
  console.log("key included?", publicSettingsKeys.includes(key))
  console.log("|=========================================|")

  if (!publicSettingsKeys.includes(key)) {
    console.log("Key not in public settings, returning null")
    return null;
  }
  
  const setting = await Setting.findOne({
    where: {
      companyId: 1,
      key
    }
  });

  console.log("Found setting:", setting ? setting.toJSON() : "null");
  console.log("Setting value:", setting?.value);

  return setting?.value;
};

export default GetPublicSettingService;
