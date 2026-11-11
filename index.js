const mongoose = require("mongoose");
const { config, assertConfig } = require("./src/config");
const { buildApp } = require("./src/app");
const stock = require("./src/modules/inventory/stock.service");

async function main() {
  assertConfig();
  await mongoose.connect(config.db.url, { serverSelectionTimeoutMS: 10_000 });
  console.log("MongoDB connected");

  const app = buildApp();
  const server = app.listen(config.port, config.host, () => {
    console.log(`TBP backend listening on http://${config.host}:${config.port} (${config.env})`);
  });

  stock.startSweeper();

  const shutdown = async (signal) => {
    console.log(`${signal} received, shutting down`);
    stock.stopSweeper();
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
