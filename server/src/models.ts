import mongoose, { Schema } from "mongoose";

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
});

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
  created_at: { type: Date, default: Date.now },
  file_hash: { type: String, required: true },
  signature: { type: String, required: true },
  public_key: { type: String, required: true },
});

const benefeciarySchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  full_name: String,
  email: String,
  relationship: String,
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
export const Beneficiary = mongoose.model("Beneficiary", benefeciarySchema);
