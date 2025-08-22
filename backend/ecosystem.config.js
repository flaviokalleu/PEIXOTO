module.exports = [{
  script: 'dist/server.js',
  name: 'multipremium-back',
  exec_mode: 'fork',     // MUDANÇA CRÍTICA: fork ao invés de cluster
  instances: 1,          // MUDANÇA CRÍTICA: apenas 1 instância para evitar duplicação
  cron_restart: '05 00 * * *',
  autorestart: true,     // Reinicia automaticamente em caso de falhas
  watch: false,
  merge_logs: true,
  log_date_format: 'YYYY-MM-DD HH:mm:ss',
  env: {
    NODE_ENV: 'production'
  }
}]