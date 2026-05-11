module.exports = {
  apps: [
    {
      name: "gestclass-frontend",
      cwd: "./frontend-escolar",
      script: "npm",
      args: "start",
      env: {
        NODE_ENV: "production",
        PORT: "3000",
      },
    },
  ],
};
