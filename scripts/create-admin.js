// Promote an existing account to admin, or create one.
// Usage: ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='...' ADMIN_NAME='Udit' node scripts/create-admin.js
const mongoose = require("mongoose");
const { config, assertConfig } = require("../src/config");
const User = require("../src/modules/users/user.model");

async function main() {
  assertConfig();
  const email = (process.env.ADMIN_EMAIL || "").toLowerCase().trim();
  if (!email) throw new Error("ADMIN_EMAIL is required");
  await mongoose.connect(config.db.url);
  let user = await User.findOne({ email }).select("+passwordHash");
  if (user) {
    user.isAdmin = true;
    if (process.env.ADMIN_PASSWORD) await user.setPassword(process.env.ADMIN_PASSWORD);
    await user.save();
    console.log(`Promoted ${email} to admin`);
  } else {
    if (!process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD.length < 8) throw new Error("ADMIN_PASSWORD (>= 8 chars) is required to create a new admin");
    user = new User({ name: process.env.ADMIN_NAME || "Admin", email, isAdmin: true });
    await user.setPassword(process.env.ADMIN_PASSWORD);
    await user.save();
    console.log(`Created admin ${email}`);
  }
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
