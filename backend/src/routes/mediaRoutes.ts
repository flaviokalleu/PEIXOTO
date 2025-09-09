import { Router } from "express";
import path from "path";
import fs from "fs";
import mime from "mime-types";
import isAuth from "../middleware/isAuth";
import Message from "../models/Message";
import { ensureCompanyMediaDir } from "../helpers/media";

const mediaRoutes = Router();

// GET /media/:companyId/:filename - authenticated media fetch
mediaRoutes.get("/media/:companyId/:filename", isAuth, async (req, res) => {
  try {
    const { companyId, filename } = req.params;
    if (!companyId || !filename) {
      return res.status(400).json({ error: "Missing params" });
    }
    const baseDir = ensureCompanyMediaDir(Number(companyId));
    const absPath = path.join(baseDir, filename);
    if (!fs.existsSync(absPath)) {
      return res.status(404).json({ error: "File not found" });
    }
    // Optional: verify the requesting user belongs to the same company already ensured by isAuth + user.companyId
    if (req.user && Number(req.user.companyId) !== Number(companyId)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const ctype = mime.lookup(filename) || "application/octet-stream";
    res.setHeader("Content-Type", ctype);
    res.setHeader("Content-Disposition", `inline; filename=\"${filename}\"`);
    const stream = fs.createReadStream(absPath);
    stream.on("error", () => res.status(500).end());
    stream.pipe(res);
  } catch (e) {
    return res.status(500).json({ error: "Internal error" });
  }
});

export default mediaRoutes;