const mongoose = require("mongoose");
const { config, assertConfig } = require("./src/config");
const { createContainer } = require("./src/bootstrap/container");
const { buildApp } = require("./src/app");

async function main() {
  assertConfig();
  await mongoose.connect(config.db.url, { serverSelectionTimeoutMS: 10_000 });
  console.log("MongoDB connected");

  const container = createContainer();
  const app = buildApp({ container });
  const server = app.listen(config.port, config.host, () => {
    console.log(`TBP backend listening on http://${config.host}:${config.port} (${config.env}, storage=${container.storage.name}, payments=${container.gateway.name})`);
  });
  container.sweeper.start();

  const shutdown = (signal) => {
    console.log(`${signal} received, shutting down`);
    container.sweeper.stop();
    server.close(async () => {
      await mongoose.disconnect();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err) => {
  console.error("Failed to start:", err.message);
  process.exit(1);
});
