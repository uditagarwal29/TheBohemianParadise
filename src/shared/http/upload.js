const multer = require("multer");
const { config } = require("../../config");
const { ALLOWED_MIME } = require("../../infrastructure/storage");
const { badRequest } = require("../errors");

// Files are held in memory and handed to the storage driver; nothing is written
// to the request path, so there is no user-controlled filename on disk.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.storage.maxUploadMb * 1024 * 1024, files: 10 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME[file.mimetype]) return cb(badRequest(`Unsupported image type ${file.mimetype}`));
    cb(null, true);
  },
});

// Translate multer's own errors into our JSON shape.
function uploadErrors(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    const msg = err.code === "LIMIT_FILE_SIZE" ? `Image larger than ${config.storage.maxUploadMb} MB` : err.message;
    return next(badRequest(msg));
  }
  next(err);
}

module.exports = { upload, uploadErrors };
