const multer = require("multer");
const { ALLOWED_MIME } = require("../../infrastructure/storage/StorageAdapter");
const { badRequest } = require("../errors");

// Factory: multer kept in memory and handed to the storage adapter; no user-controlled
// filename ever touches the disk.
function createUpload({ maxUploadMb }) {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxUploadMb * 1024 * 1024, files: 10 },
    fileFilter: (req, file, cb) => (ALLOWED_MIME[file.mimetype] ? cb(null, true) : cb(badRequest(`Unsupported image type ${file.mimetype}`))),
  });
  function errors(err, req, res, next) {
    if (err instanceof multer.MulterError) {
      return next(badRequest(err.code === "LIMIT_FILE_SIZE" ? `Image larger than ${maxUploadMb} MB` : err.message));
    }
    next(err);
  }
  return { images: (field = "images", max = 10) => [upload.array(field, max), errors] };
}

module.exports = { createUpload };
