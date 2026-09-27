// PM2 - Gestor de procesos para OSK APPS
// Uso:
//   pm2 start ecosystem.config.cjs   -> arrancar
//   pm2 status                        -> ver estado
//   pm2 logs osk-apps                 -> ver logs en vivo
//   pm2 restart osk-apps              -> reiniciar
//   pm2 stop osk-apps                 -> detener
//   pm2 save                          -> guardar lista de procesos
module.exports = {
  apps: [
    {
      name: "osk-apps",
      cwd: "/home/z/my-project",
      // Ejecuta el binario de Next.js directamente (evita el pipe con tee de npm run dev)
      script: "node_modules/next/dist/bin/next",
      args: "dev -p 3000",
      interpreter: "none",
      // PM2 escribe los logs del servidor en dev.log (compatible con diagnóstico del proyecto)
      out_file: "/home/z/my-project/dev.log",
      error_file: "/home/z/my-project/dev.log",
      merge_logs: true,
      time: true,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      env: {
        NODE_ENV: "development",
        PORT: "3000",
      },
    },
  ],
};
