// Image storage behind one interface so the catalog module never knows where files live.
//   put({ buffer, mimetype, originalName }) -> { url, key, width?, height? }
//   remove(key) -> void
const path = require("path");
const fs = require("fs/promises");
const crypto = require("crypto");
const { config } = require("../../config");

const ALLOWED = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };

function localDriver() {
  const dir = path.resolve(process.cwd(), config.storage.localDir);
  return {
    name: "local",
    publicPath: "/uploads",
    dir,
    async put({ buffer, mimetype }) {
      await fs.mkdir(dir, { recursive: true });
      const key = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}.${ALLOWED[mimetype]}`;
      await fs.writeFile(path.join(dir, key), buffer);
      return { url: `/uploads/${key}`, key };
    },
    async remove(key) {
      if (!key || key.includes("/") || key.includes("..")) return;
      await fs.rm(path.join(dir, key), { force: true });
    },
  };
}

function cloudinaryDriver() {
  const cloudinary = require("cloudinary").v2;
  cloudinary.config({ secure: true }); // reads CLOUDINARY_URL
  return {
    name: "cloudinary",
    async put({ buffer }) {
      return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: config.storage.cloudinaryFolder, resource_type: "image", transformation: [{ quality: "auto", fetch_format: "auto" }] },
          (err, res) => (err ? reject(err) : resolve({ url: res.secure_url, key: res.public_id, width: res.width, height: res.height }))
        );
        stream.end(buffer);
      });
    },
    async remove(key) {
      if (key) await cloudinary.uploader.destroy(key);
    },
  };
}

let driver;
function storage() {
  if (!driver) driver = config.storage.driver === "cloudinary" ? cloudinaryDriver() : localDriver();
  return driver;
}

module.exports = { storage, ALLOWED_MIME: ALLOWED };
