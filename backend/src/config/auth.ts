export default {
  secret: process.env.JWT_SECRET || "mysecret",
  expiresIn: "24h", // Aumentar para 24 horas
  refreshSecret: process.env.JWT_REFRESH_SECRET || "myanothersecret",
  refreshExpiresIn: "30d" // Aumentar refresh token para 30 dias
};
