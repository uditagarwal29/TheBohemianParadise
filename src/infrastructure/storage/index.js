// Factory Method: pick the storage adapter from configuration. Adding a provider means
// adding an adapter class and one case here; nothing in the modules changes.
const { LocalStorageAdapter } = require("./LocalStorageAdapter");
const { CloudinaryStorageAdapter } = require("./CloudinaryStorageAdapter");
const { StorageAdapter, ALLOWED_MIME } = require("./StorageAdapter");

function createStorage(storageConfig) {
  switch (storageConfig.driver) {
    case "cloudinary":
      return new CloudinaryStorageAdapter({ folder: storageConfig.cloudinaryFolder });
    case "local":
      return new LocalStorageAdapter({ dir: storageConfig.localDir });
    default:
      throw new Error(`Unknown storage driver "${storageConfig.driver}"`);
  }
}

module.exports = { createStorage, StorageAdapter, ALLOWED_MIME };
