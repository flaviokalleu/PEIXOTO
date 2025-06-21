import multer from "multer";
import path from "path";
import fs from "fs";

const publicFolder = path.resolve(__dirname, "..", "..", "public");

export default {
  directory: publicFolder,

  storage: multer.diskStorage({
    destination: publicFolder,
    filename(req, file, cb) {
      const fileName = file.originalname;
      const filePath = path.join(publicFolder, fileName);
      
      // Log se arquivo será sobrescrito
      if (fs.existsSync(filePath)) {
        console.log(`🔄 [Upload] Sobrescrevendo arquivo existente: ${fileName}`);
      } else {
        console.log(`📁 [Upload] Novo arquivo: ${fileName}`);
      }

      return cb(null, fileName);
    }
  }),

  fileFilter: (req: any, file: any, cb: any) => {
    // Lista de extensões perigosas que devem ser bloqueadas
    const blockedExtensions = [
      '.exe', '.bat', '.cmd', '.com', '.pif', '.scr', '.vbs', '.js', '.jar',
      '.php', '.asp', '.aspx', '.jsp', '.sh', '.ps1', '.msi', '.dll'
    ];

    const ext = path.extname(file.originalname).toLowerCase();
    console.log(`🔍 [Upload] Verificando arquivo: ${file.originalname}, MIME: ${file.mimetype}, Extensão: ${ext}`);

    if (blockedExtensions.includes(ext)) {
      console.error(`❌ [Upload] Extensão bloqueada por segurança: ${ext}`);
      return cb(new Error(`Extensão de arquivo bloqueada por segurança: ${ext}`));
    }
    
    console.log(`✅ [Upload] Arquivo aceito: ${file.originalname}`);
    cb(null, true);
  },
};
