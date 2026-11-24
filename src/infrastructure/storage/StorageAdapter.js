// Adapter interface for image storage. Concrete adapters (local disk, Cloudinary, S3...)
// implement the same two operations so the catalog service depends only on this shape
// (Dependency Inversion, Liskov: any adapter can replace another).
class StorageAdapter {
  /** @returns {string} short driver name reported by /api/health and the admin UI */
  get name() {
    throw new Error("not implemented");
  }
  /** @param {{buffer: Buffer, mimetype: string, originalName?: string}} file  @returns {Promise<{url: string, key: string}>} */
  async put(file) {
    void file;
    throw new Error("not implemented");
  }
  /** @param {string} key */
  async remove(key) {
    void key;
    throw new Error("not implemented");
  }
  /** Express middleware to serve files, or null when the provider serves them itself. */
  staticHandler() {
    return null;
  }
}

const ALLOWED_MIME = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };

module.exports = { StorageAdapter, ALLOWED_MIME };
