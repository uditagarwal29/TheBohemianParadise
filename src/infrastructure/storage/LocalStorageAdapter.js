const path = require("path");
const fs = require("fs/promises");
const crypto = require("crypto");
const express = require("express");
const { StorageAdapter, ALLOWED_MIME } = require("./StorageAdapter");

// Development adapter: files on local disk, served from /uploads.
class LocalStorageAdapter extends StorageAdapter {
  constructor({ dir, publicPath = "/uploads" }) {
    super();
    this.dir = path.resolve(process.cwd(), dir);
    this.publicPath = publicPath;
  }
  get name() {
    return "local";
  }
  async put({ buffer, mimetype }) {
    await fs.mkdir(this.dir, { recursive: true });
    const key = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}.${ALLOWED_MIME[mimetype]}`;
    await fs.writeFile(path.join(this.dir, key), buffer);
    return { url: `${this.publicPath}/${key}`, key };
  }
  async remove(key) {
    if (!key || key.includes("/") || key.includes("..")) return;
    await fs.rm(path.join(this.dir, key), { force: true });
  }
  staticHandler() {
    return express.static(this.dir, { maxAge: "7d", immutable: true });
  }
}

module.exports = { LocalStorageAdapter };
