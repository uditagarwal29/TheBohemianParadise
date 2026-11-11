const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const addressSchema = new mongoose.Schema(
  {
    label: { type: String, trim: true, maxlength: 40 },
    fullName: { type: String, required: true, trim: true, maxlength: 80 },
    phone: { type: String, required: true, trim: true, maxlength: 20 },
    line1: { type: String, required: true, trim: true, maxlength: 120 },
    line2: { type: String, trim: true, maxlength: 120 },
    city: { type: String, required: true, trim: true, maxlength: 60 },
    state: { type: String, required: true, trim: true, maxlength: 60 },
    postalCode: { type: String, required: true, trim: true, maxlength: 12 },
    country: { type: String, required: true, trim: true, maxlength: 2, uppercase: true, default: "IN" },
  },
  { _id: true }
);

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    // Absent for accounts created through Google sign-in until they set a password.
    passwordHash: { type: String, select: false },
    googleId: { type: String, index: true, sparse: true },
    avatar: { type: String },
    emailVerified: { type: Boolean, default: false },
    isAdmin: { type: Boolean, default: false },
    disabled: { type: Boolean, default: false },
    // Bumped on password change: invalidates every token issued before.
    tokenVersion: { type: Number, default: 0 },
    addresses: { type: [addressSchema], default: [] },
  },
  { timestamps: true }
);

userSchema.methods.setPassword = async function (plain) {
  this.passwordHash = await bcrypt.hash(plain, 12);
  this.tokenVersion = (this.tokenVersion || 0) + 1;
};

userSchema.methods.verifyPassword = function (plain) {
  return bcrypt.compare(plain, this.passwordHash || "");
};

userSchema.methods.toPublic = function () {
  return {
    id: this._id,
    name: this.name,
    email: this.email,
    isAdmin: this.isAdmin,
    avatar: this.avatar,
    hasPassword: Boolean(this.passwordHash),
    googleLinked: Boolean(this.googleId),
    addresses: this.addresses,
    createdAt: this.createdAt,
  };
};

userSchema.set("toJSON", {
  transform(doc, ret) {
    delete ret.passwordHash;
    delete ret.tokenVersion;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model("User", userSchema);
module.exports.addressSchema = addressSchema;
