const { StorageAdapter } = require("./StorageAdapter");

// Production adapter: Cloudinary CDN with on-the-fly optimisation.
class CloudinaryStorageAdapter extends StorageAdapter {
  constructor({ folder }) {
    super();
    this.cloudinary = require("cloudinary").v2;
    this.cloudinary.config({ secure: true }); // reads CLOUDINARY_URL
    this.folder = folder;
  }
  get name() {
    return "cloudinary";
  }
  put({ buffer }) {
    return new Promise((resolve, reject) => {
      const stream = this.cloudinary.uploader.upload_stream(
        { folder: this.folder, resource_type: "image", transformation: [{ quality: "auto", fetch_format: "auto" }] },
        (err, res) => (err ? reject(err) : resolve({ url: res.secure_url, key: res.public_id, width: res.width, height: res.height }))
      );
      stream.end(buffer);
    });
  }
  async remove(key) {
    if (key) await this.cloudinary.uploader.destroy(key);
  }
}

module.exports = { CloudinaryStorageAdapter };
