// Local-development seed: demo products (using the bundled sample images) and an admin.
// Refuses to run unless SEED_DEMO=1 so it can never hit a real database by accident.
//   SEED_DEMO=1 MONGO_URL=... JWT_SECRET=... node scripts/seed-demo.js
const mongoose = require("mongoose");
const { config, assertConfig } = require("../src/config");
const Product = require("../src/modules/catalog/product.model");
const User = require("../src/modules/users/user.model");

const P = (n) => `/images/popularProducts/products_${n}.jpg`;
const demo = [
  { title: "Summer Waves", desc: "Acrylic on canvas. Rolling turquoise surf under a pale morning sky.", categories: ["seascapes"], price: 4500, stock: 1, isOriginal: true, medium: "Acrylic on canvas", dimensions: "18 × 24 in", images: [P(1), P(14)] },
  { title: "Cherry Blossom", desc: "Watercolour print. Soft pink blossoms against a wash of spring green.", categories: ["nature"], price: 1000, images: [P(2)], variants: [{ size: "A4", price: 1000, stock: 5 }, { size: "A3", price: 1500, stock: 2 }, { size: "A2", price: 2200, stock: 0 }] },
  { title: "Innocence and Love", desc: "A doe and her fawn at the edge of the forest.", categories: ["wildlife"], price: 1100, images: [P(3)], variants: [{ size: "A4", price: 1100, stock: 3 }, { size: "A3", price: 1600, stock: 1 }] },
  { title: "Untroubled", desc: "Abstract flow of indigo and gold leaf.", categories: ["abstract"], price: 3800, stock: 1, isOriginal: true, medium: "Mixed media on board", dimensions: "16 × 16 in", images: [P(4)] },
  { title: "Hoping to Breathe Again", desc: "Abstract. Layers of ochre and smoke.", categories: ["abstract"], price: 3200, stock: 0, isOriginal: true, medium: "Acrylic on canvas", dimensions: "12 × 18 in", images: [P(5)] },
  { title: "Bajirao Mastani", desc: "Portrait in charcoal and wash.", categories: ["potraits"], price: 1200, images: [P(6)], variants: [{ size: "A4", price: 1200, stock: 4 }, { size: "A3", price: 1800, stock: 4 }] },
  { title: "Fresh Air", desc: "A sunlit meadow after rain.", categories: ["nature"], price: 1000, images: [P(7)], variants: [{ size: "A5", price: 700, stock: 10 }, { size: "A4", price: 1000, stock: 6 }] },
  { title: "Under My Umbrella", desc: "Monsoon evening, abstract.", categories: ["abstract", "monochrome"], price: 2900, stock: 1, isOriginal: true, medium: "Ink on paper", dimensions: "11 × 14 in", images: [P(8)] },
  { title: "Pretty Pink", desc: "Valentine roses in soft focus.", categories: ["valentine"], price: 900, images: [P(9)], variants: [{ size: "A5", price: 600, stock: 8 }, { size: "A4", price: 900, stock: 8 }] },
  { title: "A Day in Flower Field", desc: "Wildflowers to the horizon.", categories: ["nature"], price: 1100, images: [P(10)], variants: [{ size: "A4", price: 1100, stock: 2 }] },
  { title: "Sagittarius", desc: "Zodiac series. The archer in deep blues.", categories: ["zodiac"], price: 1000, images: [P(11)], variants: [{ size: "A4", price: 1000, stock: 7 }, { size: "A3", price: 1500, stock: 3 }] },
  { title: "Warm Winters", desc: "Snow-dusted pines at golden hour.", categories: ["nature"], price: 4200, stock: 1, isOriginal: true, medium: "Oil on canvas", dimensions: "20 × 24 in", images: [P(12)] },
  { title: "Sunflower", desc: "A single sunflower, bold and bright.", categories: ["nature", "fruits"], price: 950, images: [P(13)], variants: [{ size: "A4", price: 950, stock: 9 }] },
  { title: "Water Dance", desc: "Seascape in motion.", categories: ["seascapes"], price: 1200, images: [P(14)], variants: [{ size: "A4", price: 1200, stock: 1 }, { size: "A3", price: 1700, stock: 0 }] },
  { title: "Ecological Balancer", desc: "An elephant at the waterhole.", categories: ["wildlife"], price: 5200, stock: 1, isOriginal: true, medium: "Acrylic on canvas", dimensions: "24 × 30 in", images: [P(15)] },
];

async function main() {
  if (process.env.SEED_DEMO !== "1") throw new Error("Refusing to seed: set SEED_DEMO=1 to confirm this is a development database");
  assertConfig();
  await mongoose.connect(config.db.url);
  await Product.deleteMany({});
  await Product.insertMany(demo.map((d) => new Product(d)));
  const email = process.env.ADMIN_EMAIL || "admin@example.com";
  if (!(await User.exists({ email }))) {
    const u = new User({ name: "Studio Admin", email, isAdmin: true });
    await u.setPassword(process.env.ADMIN_PASSWORD || "adminpass123");
    await u.save();
    console.log(`admin ${email} / ${process.env.ADMIN_PASSWORD || "adminpass123"}`);
  }
  console.log(`seeded ${demo.length} products`);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
