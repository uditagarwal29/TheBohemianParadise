// One-off migration from the v1 schema to v2. Safe to re-run.
//   node scripts/migrate-v2.js            -> dry run, prints what would change
//   node scripts/migrate-v2.js --apply    -> writes changes
// Users: v1 stored passwords AES-encrypted with PASS_SEC. If PASS_SEC is set we
// decrypt and re-hash with bcrypt; otherwise the account keeps no usable password
// and the customer must register again (there is no reset flow yet).
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const { config, assertConfig } = require("../src/config");
const { slugify } = require("../src/modules/catalog/product.model");

const APPLY = process.argv.includes("--apply");

async function migrateProducts(db) {
  const col = db.collection("products");
  const docs = await col.find({}).toArray();
  let changed = 0;
  for (const p of docs) {
    const $set = {};
    const $unset = {};
    if (typeof p.categories === "string") $set.categories = p.categories ? [p.categories.toLowerCase()] : [];
    if (!Array.isArray(p.images)) $set.images = Array.isArray(p.img) ? p.img : [];
    if (typeof p.stock !== "number") $set.stock = p.inStock === false ? 0 : 1;
    if (typeof p.active !== "boolean") $set.active = true;
    if (!p.slug) $set.slug = slugify(p.title);
    if (!Array.isArray(p.variants)) $set.variants = [];
    if (!Array.isArray(p.size)) $set.size = p.size ? [p.size] : [];
    if (typeof p.sold !== "number") $set.sold = 0;
    if ("inStock" in p) $unset.inStock = ""; // now derived from stock
    if (!Object.keys($set).length && !Object.keys($unset).length) continue;
    changed++;
    console.log(`product ${p._id} "${p.title}":`, JSON.stringify({ $set, $unset }));
    if (APPLY) {
      const update = {};
      if (Object.keys($set).length) update.$set = $set;
      if (Object.keys($unset).length) update.$unset = $unset;
      await col.updateOne({ _id: p._id }, update);
    }
  }
  // Slugs must be unique; resolve collisions by suffixing the id.
  const dupes = await col.aggregate([{ $group: { _id: "$slug", ids: { $push: "$_id" }, n: { $sum: 1 } } }, { $match: { n: { $gt: 1 } } }]).toArray();
  for (const d of dupes) {
    for (const id of d.ids.slice(1)) {
      console.log(`product ${id}: slug collision on "${d._id}"`);
      if (APPLY) await col.updateOne({ _id: id }, { $set: { slug: `${d._id}-${String(id).slice(-6)}` } });
    }
  }
  console.log(`products: ${changed}/${docs.length} need changes`);
}

async function migrateUsers(db) {
  const col = db.collection("users");
  const docs = await col.find({ passwordHash: { $exists: false } }).toArray();
  let CryptoJS = null;
  if (process.env.PASS_SEC) {
    try {
      CryptoJS = require("crypto-js");
    } catch {
      console.log("PASS_SEC set but crypto-js not installed: run `npm i --no-save crypto-js` to re-hash v1 passwords");
    }
  }
  let rehashed = 0;
  for (const u of docs) {
    const $set = { tokenVersion: 1, disabled: false, addresses: [] };
    const $unset = { password: "", username: "" };
    if (CryptoJS && typeof u.password === "string") {
      const plain = CryptoJS.AES.decrypt(u.password, process.env.PASS_SEC).toString(CryptoJS.enc.Utf8);
      if (plain) {
        $set.passwordHash = await bcrypt.hash(plain, 12);
        rehashed++;
      }
    }
    if (!$set.passwordHash) {
      // Unusable hash: login always fails until the customer re-registers.
      $set.passwordHash = "!migrated-no-password";
    }
    console.log(`user ${u._id} ${u.email}: ${$set.passwordHash.startsWith("!") ? "NO usable password" : "password re-hashed"}`);
    if (APPLY) await col.updateOne({ _id: u._id }, { $set, $unset });
  }
  console.log(`users: ${docs.length} to migrate, ${rehashed} passwords re-hashed`);
}

async function migrateOrdersAndCarts(db) {
  // v1 orders/carts don't match the new item shape; they were test data in practice.
  const orders = await db.collection("orders").countDocuments({ orderNumber: { $exists: false } });
  const carts = await db.collection("carts").countDocuments({ "items.0.qty": { $exists: false }, "items.0": { $exists: true } });
  if (orders) console.log(`orders: ${orders} legacy documents will be left untouched (not readable by v2); archive or delete them manually`);
  if (carts) {
    console.log(`carts: ${carts} legacy carts will be emptied`);
    if (APPLY) await db.collection("carts").updateMany({ "items.0.qty": { $exists: false } }, { $set: { items: [] } });
  }
}

async function main() {
  assertConfig();
  await mongoose.connect(config.db.url);
  const db = mongoose.connection.db;
  console.log(APPLY ? "APPLYING changes" : "DRY RUN (pass --apply to write)");
  await migrateProducts(db);
  await migrateUsers(db);
  await migrateOrdersAndCarts(db);
  if (APPLY) {
    // Make sure new indexes exist.
    await require("../src/modules/catalog/product.model").syncIndexes();
    await require("../src/modules/orders/order.model").syncIndexes();
    await require("../src/modules/cart/cart.model").syncIndexes();
  }
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
