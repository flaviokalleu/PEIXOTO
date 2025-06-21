import path from "path";
import multer from "multer";
import fs from "fs";
import Whatsapp from "../models/Whatsapp";
import { isEmpty, isNil } from "lodash";

const publicFolder = path.resolve(__dirname, "..", "..", "public");

export default {
  directory: publicFolder,
  storage: multer.diskStorage({
    destination: async function (req, file, cb) {

      let companyId;
      companyId = req.user?.companyId
      const { typeArch, fileId } = req.body;

      if (companyId === undefined && isNil(companyId) && isEmpty(companyId)) {
        const authHeader = req.headers.authorization;
        const [, token] = authHeader.split(" ");
        const whatsapp = await Whatsapp.findOne({ where: { token } });
        companyId = whatsapp.companyId;
      }
      let folder;

      if (typeArch && typeArch !== "announcements" && typeArch !== "logo") {
        folder = path.resolve(publicFolder, `company${companyId}`, typeArch, fileId ? fileId : "")
      } else if (typeArch && typeArch === "announcements") {
        folder = path.resolve(publicFolder, typeArch)
      } else if (typeArch === "logo") {
        folder = path.resolve(publicFolder)
      }
      else {
        folder = path.resolve(publicFolder, `company${companyId}`)
      }

      if (!fs.existsSync(folder)) {
        fs.mkdirSync(folder, { recursive: true })
        fs.chmodSync(folder, 0o777)
      }
      return cb(null, folder);
    },
    filename(req, file, cb) {
      const { typeArch } = req.body;

      const fileName = typeArch && typeArch !== "announcements" ? file.originalname.replace('/', '-').replace(/ /g, "_") : new Date().getTime() + '_' + file.originalname.replace('/', '-').replace(/ /g, "_");
      return cb(null, fileName);
    }
  }),
  fileFilter: (req, file, cb) => {
    console.log(`🔍 [Upload] Verificando arquivo: ${file.originalname}, MIME: ${file.mimetype}`);
    
    // Verificar extensão
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif', '.mp4', '.mp3', '.wav', '.pdf', '.doc', '.docx'];
    
    if (!allowedExtensions.includes(ext)) {
      console.error(`❌ [Upload] Extensão não permitida: ${ext}`);
      return cb(new Error(`Extensão de arquivo não permitida: ${ext}`));
    }
    
    console.log(`✅ [Upload] Arquivo aceito: ${file.originalname}`);
    cb(null, true);
  },
  limits: {
    fileSize: 20 * 1024 * 1024, // 20MB
  }
};
