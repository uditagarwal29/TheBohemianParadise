// Starts an in-memory MongoDB, seeds demo data and runs the server on 127.0.0.1.
// Zero external services; for local demos and screenshots.
//   node scripts/dev-stack.js [port]
const { MongoMemoryServer } = require("mongodb-memory-server");
const { spawn } = require("child_process");
const path = require("path");

(async () => {
  const port = process.argv[2] || "5000";
  const mongod = await MongoMemoryServer.create();
  const env = { ...process.env, MONGO_URL: mongod.getUri("tbp"), JWT_SECRET: "dev-only-secret-dev-only-secret-0123456789", PORT: port, HOST: "127.0.0.1", SEED_DEMO: "1" };
  const root = path.join(__dirname, "..");
  // Async spawn: a blocking spawnSync would stop draining mongod's log pipe and stall it.
  const runSeed = () =>
    new Promise((resolve) => spawn("node", ["scripts/seed-demo.js"], { cwd: root, env, stdio: "inherit" }).on("exit", resolve));
  const seedStatus = await runSeed();
  if (seedStatus !== 0) {
    await mongod.stop();
    process.exit(seedStatus || 1);
  }
  const server = spawn("node", ["index.js"], { cwd: root, env, stdio: "inherit" });
  const stop = () => { server.kill("SIGTERM"); mongod.stop().finally(() => process.exit(0)); };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  server.on("exit", () => mongod.stop().finally(() => process.exit(0)));
})();
