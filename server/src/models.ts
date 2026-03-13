import mongoose, { Schema } from "mongoose";

/**
 * Store's basic user information.
 * The public_key is most important in this schema. It's the ED25519 key I used to verify the file uploaded was actually signed by that specific user.
 */
const userSchema = new Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password_hash: { type: String, required: true },
  last_active: { type: Date, default: Date.now },
  account_status: { type: String, default: "active" },
  otp_code: { type: String },
  otp_expires: { type: Date },
  reset_token: { type: String },
  reset_expires: { type: Date },
  public_key: { type: String }, //Storing the user's digital signature key (Ed25519)
  // For Muslim users and Sharia Inheritance
  estate_preference: {
    type: String,
    enum: ["standard", "sharia"],
    default: "standard",
  },
});

/**
 * Represents the vault assets.
 * I store the Shamir's Secret shards here as an array.
 * file_hash and signature are my security layers to prove that the file is not tampered while sitting in the database.
 */
const assetsSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  encrypted_data: { type: String, required: true },
  nonce: { type: String, required: true },
  shards: [{ type: String }],
  threshold: { type: Number, required: true, default: 2 },
  total_shards: { type: Number, required: true, default: 3 },
  file_name: String,
  file_type: String,
  file_size: Number,
  category: String,
  description: String,
  unlock_condition: { type: String },
  created_at: { type: Date, default: Date.now },
  file_hash: { type: String, required: true },
  signature: { type: String, required: true },
  public_key: { type: String, required: true },
});

/**
 * These are the heirs of the users.
 * The assigned_assets array is most important because it maps a specific beneficiary to a specific shard of a specific file.
 */
const beneficiarySchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  full_name: String,
  email: String,
  relationship: { type: String, required: "true" },
  phone_number: String,
  otp_code: { type: String },
  otp_expires: { type: Date },
  access_granted: { type: Boolean, default: false },
  assigned_assets: [
    {
      assetId: { type: Schema.Types.ObjectId, ref: "Asset" },
      shard: { type: String },
    },
  ],
});

export const User = mongoose.model("User", userSchema);
export const Asset = mongoose.model("Asset", assetsSchema);
export const Beneficiary = mongoose.model("Beneficiary", beneficiarySchema);
