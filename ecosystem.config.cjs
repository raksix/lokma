/** PM2 ecosystem for Lokma Phase 0 — Vite SPA + Fastify */
module.exports = {
  apps: [
    {
      name: 'lokma-server',
      cwd: '/mnt/apopic/lokma',
      script: '/usr/local/bin/bun',
      args: 'packages/lokma-web/server/dist/index.js --port 3456',
      interpreter: 'none',
      env: { NODE_ENV: 'production', PORT: '3456' },
      watch: false,
      max_memory_restart: '300M',
    },
    {
      name: 'lokma-web',
      cwd: '/mnt/apopic/lokma/packages/lokma-web/web',
      script: '/usr/local/bin/bun',
      args: 'x vite preview --host 127.0.0.1 --port 3457',
      interpreter: 'none',
      env: { NODE_ENV: 'production', PORT: '3457' },
      watch: false,
      max_memory_restart: '400M',
    },
  ],
};
