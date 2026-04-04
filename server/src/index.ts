import express from "express";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";
import sodium from "libsodium-wrappers-sumo";
import https from "https";
import fs from "fs";
import path from "path";
import dbConnection from "./db";
import { User, Asset, Beneficiary } from "./models";
import nodemailer from "nodemailer";
import crypto from "crypto";
import rateLimit from "express-rate-limit";
import jwt from "jsonwebtoken";
import { z } from "zod";

/**
 * Validation schema using zod
 * This ensures that if the data that the user is inputting looks bad
 * The server will reject it with a 400 bad request to prevent crashing
 */
const loginSchema = z.object({
  email: z.string().email().max(100),
  password: z.string().min(6).max(100),
});

/**
 *
 * @param req
 * @param res
 * @param next
 *
 * Security Middle for anti IDOR vulnerability
 * This verify token function will act as the security guard for the api endpoints.
 * Instead of trusting the URL to verify the user, this asks for a cryptography signed JSON web token from the user.
 */
const verifyToken = (req: any, res: any, next: any) => {
  // The frontend sends the token in the Auth header
  const authenticationHeader = req.headers.authorization;
  const token = authenticationHeader && authenticationHeader.split(" ")[1];

  // If they didn't bring their token, they are denied access.
  if (!token) {
    return res.status(401).json({ error: "Access denied. No session token." });
  }

  try {
    // Uses the secret key in the .env file to verify the token
    const verified = jwt.verify(token, process.env.JWT_SECRET as string);

    // If verified, this will get the actual user's ID from the token payload and attaches it to the get request.
    // All the routes will finally know which specific user is making the request.
    req.userId = (verified as any).id;

    // Proceeds the user to their desired endpoint request
    next();
  } catch (err) {
    // If the token is fake or expired.
    res.status(403).json({ error: "Invalid or expired session token." });
  }
};

// Loading my environment variables from the .env file, like my database URL and port.
dotenv.config();
// This function from my db.ts file will connect to my MongoDB database.
dbConnection();

// Creating my main Express application.
const app = express();

// This will tell express to trust my proxy.
// I'm getting terminal errors because the rate limiter header doensn't trust React
app.set("trust proxy", 1);

// Gets the port from my .env file, or just use 5050 if it's not set.
const PORT = process.env.PORT || 5050;

const SHARD_KEY = process.env.SHARD_KEY;
const AES_ALGO = "aes-256-gcm";

console.log(`Shard Key Loaded! ${SHARD_KEY?.length}`);

/**
 * This is my encryption at rest.
 * Even if someone is able to steal my database, the Shamir Shards are encrypted with AES-256 using a
 * master key that only exists in my server's .env file (which I also configured to be a difficult password).
 */
function encryptionAtRest(text: string): string {
  const key = SHARD_KEY?.trim();

  if (!key || key.length !== 32)
    throw new Error("Invalid Shard Encryption Key in .env");

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(AES_ALGO, Buffer.from(key), iv);

  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");

  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

/**
 * This method will then decrypt the shard stored at rest back into its plain hex format.
 */
function decryptionAtRest(encryptedData: string): string {
  const key = SHARD_KEY?.trim();

  if (!key || key.length !== 32) {
    throw new Error(
      `Invalid Shard Encryption Key. Expected 32 chars, got ${key?.length || 0}`,
    );
  }

  const [ivHex, authTagHex, encryptedText] = encryptedData.split(":");
  const decipher = crypto.createDecipheriv(
    AES_ALGO,
    Buffer.from(key!),
    Buffer.from(ivHex, "hex"),
  );

  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));

  let decrypted = decipher.update(encryptedText, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

// Adding some security headers with helmet() to protect against common web vulnerabilities.
app.use(helmet());
app.use(
  cors({
    // I need to tell my server to accept requests from my frontend, which is running on a different address.
    origin: [
      "https://localhost:3000",
      "http://127.0.0.1:5500",
      "http://localhost:5500",
    ],
    credentials: true, // This allows cookies and authorization headers to be sent.
  }),
);
// This middleware lets my server understand and parse incoming JSON data from requests.
// This also contains a limit to how big the payload's maximum size is
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));

const authenticationRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, //15 minute window
  max: 10, // Limits each IP to 10 requests per window set (15 mins)
  message: {
    error:
      "Locked! Too many attempts from this IP. Please try again after 15 minutes.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Applying the rate limiter to the authenticaton routes
app.use("/api/login", authenticationRateLimiter);
app.use("/api/register", authenticationRateLimiter);
app.use("/api/otp/verify-otp", authenticationRateLimiter);
app.use("/api/forgot-password", authenticationRateLimiter);
app.use("/api/reset-password", authenticationRateLimiter);
app.use("/api/beneficiary/request-otp", authenticationRateLimiter);

// This is
// To run the server on HTTPS, this loads the key and certificate files that in the .env file.
const HttpsOptions = {
  key: fs.readFileSync(path.join(__dirname, "../security/localhost+2-key.pem")),
  cert: fs.readFileSync(path.join(__dirname, "../security/localhost+2.pem")),
};

// Creating a single, reusable transporter for sending emails.
// It will use a real SMTP service if you provide credentials in your .env file.
// Otherwise, it falls back to Ethereal for local development.
let transporter: nodemailer.Transporter;

const setupMailer = async () => {
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    // Use a real SMTP service if configured in .env
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === "true", // e.g., true for port 465, false for others
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
    await transporter.verify();
    console.log(
      "[MAIL] SMTP transporter is configured and ready to send emails.",
    );
  } else {
    // Fallback to a temporary Ethereal account for development
    const testAccount = await nodemailer.createTestAccount();
    transporter = nodemailer.createTransport({
      host: "smtp.ethereal.email",
      port: 587,
      secure: false,
      auth: { user: testAccount.user, pass: testAccount.pass },
    });
    console.log(
      "[MAIL] SMTP .env variables not set. Using Ethereal for email. Emails will NOT be sent to real inboxes.",
    );
  }
};

// Initialize the mailer when the server starts
setupMailer().catch(console.error);

// This is a helper function I wrote to send a one-time password (OTP) to a user's email.
async function sendOTPToEmail(email: string, otp: string) {
  console.log(`[DEBUG] Sending OTP to: "${email}"`);

  if (!email) throw new Error("No email address provided for OTP.");
  if (!transporter) throw new Error("Email transporter is not initialized.");

  // Here I define what the email will look like and then send it.
  const info = await transporter.sendMail({
    from: '"SureWill Security" <security@surewill.com>',
    to: email,
    subject: "Your 6-Digit Verification Code",
    html: `<h3>Security Verification</h3><p>Your code is: <b>${otp}</b></p>`,
  });

  // log the preview URL, otherwise, just log the message ID.
  if (
    "host" in transporter.options &&
    transporter.options.host === "smtp.ethereal.email"
  ) {
    console.log(
      `[OTP] Ethereal email sent to ${email}. Preview: ${nodemailer.getTestMessageUrl(info)}`,
    );
  } else {
    console.log(`[OTP] Email sent to ${email}. Message ID: ${info.messageId}`);
  }
}

// This function is very similar to the OTP one, but it's for sending a password reset link.
async function sendResetEmail(email: string, resetURL: string) {
  console.log(`[DEBUG] Sending reset email to: "${email}"`);

  if (!email) throw new Error("No email address provided for reset.");
  if (!transporter) throw new Error("Email transporter is not initialized.");

  const info = await transporter.sendMail({
    from: '"SureWill Security" <security@surewill.com>',
    to: email,
    subject: "Password Reset Request",
    html: `
      <div style="font-family: sans-serif; padding: 20px; border: 1px solid #ddd;">
        <h2>Password Reset</h2>
        <p>You requested a password reset for your SureWill vault.</p>
        <p>Please click the button below to set a new password. This link expires in 1 hour.</p>
        <a href="${resetURL}" style="background: #e74c3c; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
          Reset My Password
        </a>
        <p style="margin-top: 20px; font-size: 12px; color: #777;">
          If you didn't request this, you can safely ignore this email.
        </p>
      </div>
    `,
  });

  if (
    "host" in transporter.options &&
    transporter.options.host === "smtp.ethereal.email"
  ) {
    console.log(
      `[RESET] Ethereal reset email sent to ${email}. Preview: ${nodemailer.getTestMessageUrl(info)}`,
    );
  } else {
    console.log(
      `[RESET] Reset email sent to ${email}. Message ID: ${info.messageId}`,
    );
  }
}

// This is my endpoint for when a new user signs up.
app.post("/api/register", async (req, res) => {
  // I'm getting the user's details from the body of the POST request.
  const { username, email, password, publicKey, estatePreference } = req.body;

  if (typeof password !== "string") {
    return res.status(400).json({
      error: "Invalid password format, Please don't use numbers only",
    });
  }

  if (password.length < 6) {
    return res
      .status(400)
      .json({ error: "Password must have at least 6 characters." });
  }

  if (!/\d/.test(password)) {
    return res
      .status(400)
      .json({ error: "Password must contain at least one number." });
  }

  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    return res
      .status(400)
      .json({ error: "Password must contain at least one special character." });
  }

  try {
    // I have to make sure the crypto library is loaded and ready before I use it.
    await sodium.ready;

    // I'm using libsodium to securely hash the password. I should never store passwords in plain text!
    const hashedPassword = sodium.crypto_pwhash_str(
      password,
      sodium.crypto_pwhash_OPSLIMIT_INTERACTIVE,
      sodium.crypto_pwhash_MEMLIMIT_INTERACTIVE,
    );

    // Now I create a new user document using my Mongoose model and save it to the database.
    const newUser = new User({
      username,
      email,
      password_hash: hashedPassword,
      public_key: publicKey,
      estate_preference: estatePreference || "standard",
    });
    await newUser.save();

    // I'll send back a success message.
    res.status(201).json({
      message: "User Registered Successfully!",
      user: { id: newUser._id, username: newUser.username },
    });
  } catch (err) {
    // I'll wrap this all in a try...catch block to handle errors, like if the email is already registered.
    console.error(err);
    res.status(500).json({
      error: "Registration Failed. User login credentials may already exist.",
    });
  }
});

// Fetch User Profile
// The frontend needs this so it can show the Sharia Will Generator (if the user is Muslim).
app.get("/api/user/profile", verifyToken, async (req: any, res: any) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    res.json({
      username: user.username,
      email: user.email,
      estatePreference: user.estate_preference,
    });
  } catch (err) {
    res.status(500).json({ error: "Server Error!" });
  }
});

// This endpoint is going to update the Dead Man's Switch to allow the user to set a customizable threshold/grace period.
app.put("/api/user/dms-settings", verifyToken, async (req: any, res: any) => {
  const { dms_threshold, dms_grace_period } = req.body;

  if (
    typeof dms_threshold !== "number" ||
    typeof dms_grace_period !== "number"
  ) {
    return res.status(400).json({ error: "Invalid input format." });
  }

  if (dms_threshold < 7 || dms_threshold > 365) {
    return res.status(400).json({
      error: "Inactivity threshold can only be between 7 days upto a year.",
    });
  }

  // Grace period cap to around 3 to a month
  if (dms_grace_period < 3 || dms_grace_period > 30) {
    return res
      .status(400)
      .json({ error: "Grace period can only be between 3 days upto a month" });
  }

  // Updating the user's preferences
  try {
    await User.findByIdAndUpdate(req.userId, {
      dms_threshold: dms_threshold,
      dms_grace_period: dms_grace_period,
    });

    res.json({ message: "Threshold and Grace period Updated!" });
  } catch (err) {
    console.error("Dead Man's Switch error.");
    res.status(500).json({ error: "Server error. Failed to save." });
  }
});

// This is just a simple endpoint to check if my server is running and if the crypto library is loaded correctly.
app.get("/health", async (req, res) => {
  await sodium.ready;
  res.json({
    status: "SureWill Secure Vault Status: Active",
    protocol: "HTTPS/TLS 1.2",
    crypto: `libsodium ${sodium.sodium_version_string()} ready`,
  });
});

// This is my endpoint for when a user tries to log in.
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;

  if (typeof email !== "string" || typeof password !== "string") {
    return res.status(400).json({
      error:
        "Invalid credentials entered! Please use your email and password only.",
    });
  }

  try {
    const dataValid = loginSchema.parse(req.body);
    const { email, password } = dataValid;

    await sodium.ready;
    // Find the user in my database by their email.
    const user = await User.findOne({ email });

    // Check if a user was found and if the password they provided matches the hash in my db.
    if (
      !user ||
      !sodium.crypto_pwhash_str_verify(user.password_hash, password)
    ) {
      // If not, it'll send a generic error message for security.
      return res.status(401).json({ error: "Invalid Email or Password." });
    }

    // If the password is correct, This generates a random otp using Libsodium.
    // It doesn't use math.random for safety
    const otp = crypto.randomInt(100000, 999999).toString();
    user.otp_code = otp;
    user.otp_expires = new Date(Date.now() + 10 * 60000); // The OTP will expire in 10 minutes.

    await user.save(); // Saves the OTP and its expiration time to the user's document.
    // Now it'll send the otp as an email to the user
    await sendOTPToEmail(user.email, otp);

    // Sending it the frontend to let the user know.
    res.json({ message: "OTP has been sent to your email.", userId: user._id });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: err.message });
    }
    console.error("Error! An error occurred during login:", err);
    res
      .status(500)
      .json({ error: "Login failed. Could not send verification email." });
  }
});

// Requesting SMS OTP for the heir portal
// This accommodates the heir portal access
app.post("/api/beneficiary/request-otp", async (req, res) => {
  const { email } = req.body;

  try {
    const beneficiary = await Beneficiary.findOne({ email });

    if (!beneficiary)
      return res.status(404).json({ error: "Beneficiary not found." });

    if (!beneficiary.access_granted) {
      return res.status(403).json({
        error: "Access Denied. The vault is still locked by the owner.",
      });
    }

    const otp = crypto.randomInt(100000, 999999).toString();
    beneficiary.otp_code = otp;
    beneficiary.otp_expires = new Date(Date.now() + 10 * 60000); // 10 minutes
    await beneficiary.save();

    // Mock twilio SMS integration (not production yet)
    // production would cost money, this should be enough for the dissertation
    console.log(`\nTwilio SMS: Sent to ${beneficiary.phone_number}:`);
    console.log(`"Your Heir Portal security code is: ${otp}"\n`);

    res.json({ message: "OTP has been sent to your phone." });
  } catch (err) {
    res.status(500).json({ error: "Error sending SMS." });
  }
});

/**
 * This is the heir portal logic.
 * I added a strict check here to ensure access_granted is true.
 * This prevents the heir from skipping the line and getting their shard before the owner is actually gone.
 * Basically, the Dead Man's Switch has to be triggered before they can claim.
 */
app.post("/api/beneficiary/claims", async (req, res) => {
  const { email, otp } = req.body;

  try {
    const beneficiary = await Beneficiary.findOne({ email });

    // Verify OTP matches and isn't expired yet
    if (
      !beneficiary ||
      beneficiary.otp_code !== otp ||
      new Date() > (beneficiary.otp_expires || 0)
    ) {
      return res.status(401).json({ error: "Invalid OTP!" });
    }

    // Clear OTP so it wont be reused ever
    beneficiary.otp_code = undefined;
    await beneficiary.save();

    const decryptedClaims = beneficiary.assigned_assets.map((claim: any) => ({
      assetId: claim.assetId,
      shard: decryptionAtRest(claim.shard),
    }));

    res.json({
      fullName: beneficiary.full_name,
      claims: decryptedClaims, // Send the decrypted claims
    });
  } catch (err) {
    res.status(500).json({ error: "Server error getting claims." });
  }
});

// After the user gets the OTP from their email, they send it here to be verified.
app.post("/api/otp/verify-otp", async (req, res) => {
  const { userId, otp } = req.body;
  try {
    const user = await User.findById(userId);

    // Here this checks three things: does the user exist, is the OTP they gave me the same as the one I stored, and has it not expired?
    if (
      !user ||
      user.otp_code !== otp ||
      new Date() > (user.otp_expires || 0)
    ) {
      return res
        .status(401)
        .json({ error: "Your OTP is invalid or has expired." });
    }

    // If the OTP is correct, I'll clear it from the database so it can't be used again.
    user.otp_code = undefined;
    // This also updates their last_active time, which is important for the dead man's switch logic.
    user.last_active = new Date();

    await user.save();

    /**
     * JWT when successfully accessing
     * This token is signed by the server and expires in 2 hours to limit hijack window
     */
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET as string, {
      expiresIn: "2h",
    });

    // Finally, granting them access.
    res.json({
      message: "MFA Success. Access Granted.",
      token: token,
      user: { id: user._id, username: user.username },
    });
  } catch (err) {
    res.status(500).json({ error: "Verification Failed." });
  }
});

// This is the first step of the password reset flow. The user provides their email.
app.post("/api/forgot-password", async (req, res) => {
  const { email } = req.body;

  if (typeof email !== "string") {
    return res.status(400).json({ error: "Invalid email entered!" });
  }

  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ error: "User was not found." });

    // Generating a secure, random token that will be part of the reset link.
    const token = crypto.randomBytes(16).toString("hex");
    user.reset_token = token;
    user.reset_expires = new Date(Date.now() + 3600000); // token will expire in 1 hour.
    await user.save();

    // hardcoded the full reset URL and send it to the user's email because I'm getting API
    const resetURL = `http://localhost:3000/reset-password?token=${token}`;
    await sendResetEmail(user.email as string, resetURL);

    res.json({ message: "Password reset link has been sent to your email." });
  } catch (err) {
    res.status(500).json({ error: "Error resetting the password." });
  }
});

// This is the second step. The user has clicked the link in their email and is now submitting a new password.
app.post("/api/reset-password", async (req, res) => {
  const { token, newPassword } = req.body;

  if (typeof newPassword !== "string") {
    return res.status(400).json({
      error: "Invalid password format, Please don't use numbers only",
    });
  }

  if (newPassword.length < 6) {
    return res
      .status(400)
      .json({ error: "Password must have at least 6 characters." });
  }

  if (!/\d/.test(newPassword)) {
    return res
      .status(400)
      .json({ error: "Password must contain at least one number." });
  }

  if (!/[!@#$%^&*(),.?":{}|<>]/.test(newPassword)) {
    return res
      .status(400)
      .json({ error: "Password must contain at least one special character." });
  }

  try {
    // This is a critical security check. I'm finding a user who has the matching token AND whose token has not expired.
    const user = await User.findOne({
      reset_token: token,
      reset_expires: { $gt: new Date() },
    });

    // If no user is found, the token was bad or it expired.
    if (!user)
      return res.status(404).json({ error: "Token is invalid or expired." });

    await sodium.ready; // Making sure the crypto library is ready.
    const hashedPassword = sodium.crypto_pwhash_str(
      newPassword,
      sodium.crypto_pwhash_OPSLIMIT_INTERACTIVE,
      sodium.crypto_pwhash_MEMLIMIT_INTERACTIVE,
    );

    user.password_hash = hashedPassword;
    // Clears the reset token so it CANT be used again.
    user.reset_token = undefined;
    user.reset_expires = undefined;
    await user.save();

    res.json({ message: "Password updated succesfully" });
  } catch (err) {
    res.status(500).json({ error: "Error updating the password." });
  }
});

/**
 * When a user uploads a file:
 * Their shards are encrypted before saving (which is the Encryption At Rest)
 * Store the file metadata.
 * Update their last_active timestamp so the Dead Man's Switch knows they are active and still present.
 */
app.post("/api/vault/upload", verifyToken, async (req: any, res: any) => {
  const {
    encryptedData,
    nonce,
    shards,
    threshold,
    totalShards,
    fileHash,
    signature,
    fileName,
    fileType,
    fileSize,
    ...rest
  } = req.body;

  const userId = req.userId;

  if (!shards || !Array.isArray(shards) || shards.length === 0) {
    return res.status(400).json({
      error: "Invalid request! Cryptographic shards are missing or invalid.",
    });
  }

  try {
    const encryptedShards = shards.map((s: string) => encryptionAtRest(s));
    // Creating a new document in my assets collection with all the file details.
    const newAsset = new Asset({
      userId,
      encrypted_data: encryptedData,
      nonce,
      shards: encryptedShards,
      threshold: threshold,
      total_shards: totalShards,
      file_hash: fileHash,
      signature: signature,
      public_key: req.body.publicKey,
      file_name: fileName,
      file_type: fileType,
      file_size: fileSize,
      category: rest.category,
      description: rest.description,
      unlock_condition: rest.unlockCondition,
    });

    await newAsset.save();

    // Every time the user uploads, This will update their last_active timestamp.
    await User.findByIdAndUpdate(userId, { last_active: new Date() });

    res
      .status(201)
      .json({ message: "Asset Uploaded Successfully", asset: newAsset });
  } catch (err) {
    console.error("[UPLOAD ERROR]:", err);
    res.status(500).json({ error: "Error uploading asset." });
  }
});

// This endpoint allows the user to delete their asset from the frontend
app.delete("/api/vault/delete/:id", verifyToken, async (req: any, res: any) => {
  try {
    const { id } = req.params;

    // Finds the asset the user wants to delete.
    const asset = await Asset.findById(id);

    if (!asset) {
      return res.status(404).json({ error: "Asset not found." });
    }

    // Checking if the user is the actual owner of the asset using their web token
    if (asset.userId.toString() !== req.userId) {
      console.warn(
        `Deletion attempt blocked. User ${req.userId} tried to delete Asset ${id}`,
      );
      return res
        .status(403)
        .json({ error: "Access Denied! You don't own this asset." });
    }

    // If the ownership check passes then the it will be deleted.
    await Asset.findByIdAndDelete(id);

    /**
     * Cascade delete update
     * In the previous version, when an asset is deleted the user still keeps their SSS shards
     * This will drop shards with the asset.
     */
    await Beneficiary.updateMany(
      { "assigned_assets.assetId": id },
      { $pull: { assigned_assets: { assetId: id } } },
    );

    res.status(200).json({ message: "Asset and Shards deleted successfully." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error deleting the asset." });
  }
});

// This endpoint lets the user see a list of all the files they own.
app.get("/api/vault/list", verifyToken, async (req: any, res: any) => {
  try {
    // Finds all assets that belong to this user and sort them by creation date.
    const assets = await Asset.find({ userId: req.userId }).sort({
      created_at: -1,
    });
    res.json(assets);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to get the assets." });
  }
});

// This endpoint is for "downloading" an asset. It sends the encrypted data and nonce for the frontend to decrypt.
// Update 5th March, 2026. This endpoint is now going to release the system shard automatically if the  Dead Man's Switch is triggered.
app.get("/api/vault/download/:assetId", async (req, res) => {
  const { assetId } = req.params;

  try {
    const asset = await Asset.findById(assetId);

    if (!asset) {
      return res.status(404).json({ error: "Asset could not be found." });
    }

    // Find the beneficiary record that has the specific asset id bound to them
    const beneficiary = await Beneficiary.findOne({
      "assigned_assets.assetId": assetId,
    });

    let systemShard = null;

    // Security; The shard will only be released if the Dead Man's Switch has been triggered
    if (beneficiary && beneficiary.access_granted) {
      // Get the first shard remaining in the asset as the system shard
      systemShard = decryptionAtRest(asset.shards[0]);

      console.log(
        `[Authenticated] Dead Man's Switch triggered. Releasing System Shard for Asset: ${assetId}`,
      );
    } else {
      console.log(
        `[Security] Access Denied. System Shard remains locked for Asset: ${assetId}`,
      );
    }

    const owner = await User.findById(asset.userId);

    // This will now send the encrypted data, nonce and the system shard
    res.json({
      encrypted_data: asset.encrypted_data,
      nonce: asset.nonce,
      file_name: asset.file_name,
      file_type: asset.file_type,
      threshold: asset.threshold,
      systemShard: systemShard, // This will be null if access_granted is false
      fileHash: asset.file_hash,
      signature: asset.signature,
      public_key: asset.public_key,
      ownerPublicKey: owner?.public_key,
      unlockCondition: asset.unlock_condition,
    });
  } catch (err) {
    console.error("Download  Error", err);
    res.status(500).json({ error: "Failed to get asset data." });
  }
});

// This endpoint allows a user to add a beneficiary to their account.
app.post("/api/beneficiaries", verifyToken, async (req: any, res: any) => {
  const { fullName, email, relationship, phone } = req.body;

  const userId = req.userId;

  if (!fullName || !email || !relationship || !phone) {
    return res.status(400).json({ error: "Please fill up all fields." });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: "Enter a valid email address." });
  }

  const phoneRegex = /^[\d\+\-\s\(\)]{7,20}$/;
  if (!phoneRegex.test(phone)) {
    return res.status(400).json({ error: "Invalid Phone Number Format." });
  }

  try {
    // Creating a new beneficiary document and linking it to the user.
    const newBeneficiary = new Beneficiary({
      userId,
      full_name: fullName,
      email,
      relationship,
      phone_number: phone,
    });

    await newBeneficiary.save();

    res.status(201).json({
      message: "Beneficiary Added Successfully.",
      beneficiary: newBeneficiary,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error adding the beneficiary." });
  }
});

// This endpoint allows the user to remove/delete a beneficiary.
app.delete(
  "/api/beneficiaries/:id",
  verifyToken,
  async (req: any, res: any) => {
    try {
      const { id } = req.params;

      // Find the beneficiary
      const beneficiary = await Beneficiary.findById(id);

      if (!beneficiary) {
        return res.status(404).json({ error: "Beneficiary not found." });
      }

      if (beneficiary.userId.toString() !== req.userId) {
        console.warn(
          `Delete attempt blocked. This beneficiary is not part of your account.`,
        );
        return res.status(403).json({
          error:
            "Access Denied! This beneficiary is not registered under your account.",
        });
      }

      // When removing a beneficiary, this ensures that the shard returns to the vault and doesn't just pop and disappear.
      // The shard will go back to the vault and can be assigned to someone else, instead of just disappearing with the delete heir.
      if (
        beneficiary?.assigned_assets &&
        beneficiary?.assigned_assets.length > 0
      ) {
        for (const claim of beneficiary.assigned_assets) {
          await Asset.findByIdAndUpdate(claim.assetId, {
            $push: { shards: claim.shard },
          });
        }
      }

      await Beneficiary.findByIdAndDelete(id);

      res.status(200).json({
        message:
          "Beneficiary has been removed and shard has been put back to the vault.",
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Error deleting the beneficiary" });
    }
  },
);

// This endpoint allows the user to see all the beneficiaries they have. Basically, a helper for assigning a specific asset
app.get("/api/beneficiaries", verifyToken, async (req: any, res: any) => {
  try {
    const list = await Beneficiary.find({ userId: req.userId });
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: "Failed to get beneficiaries." });
  }
});

// This endpoint is for assigning a specific asset to a specific beneficiary.
app.post("/api/vault/access", verifyToken, async (req: any, res: any) => {
  const { assetId, beneficiaryId } = req.body;

  try {
    // Locates the asset in the vault
    const asset = await Asset.findById(assetId);

    // Anti IDOR Patch
    if (asset && asset.userId.toString() !== req.userId) {
      return res
        .status(403)
        .json({ error: "Access Denied! You don't own this asset." });
    }

    // Updating this to stop the backend from popping the system shard (index 0)
    // Basically creating a permanent reserve of the last shard for the system here
    if (!asset || !asset.shards || asset.shards.length <= 1) {
      return res
        .status(400)
        .json({ error: "No cryptographic shards were found for this asset." });
    }

    // Find the beneficiary
    const beneficiary = await Beneficiary.findById(beneficiaryId);
    if (!beneficiary) {
      return res.status(400).json({ error: "Beneficiary not found." });
    }

    if (beneficiary.userId.toString() !== req.userId) {
      return res
        .status(403)
        .json({ error: "Access Denied! You don't own this beneficiary." });
    }

    // Prevents creating duplicate assignments
    const alreadyAssigned = beneficiary.assigned_assets.some(
      (a: any) => a.assetId?.toString() === assetId,
    );
    if (alreadyAssigned) {
      return res
        .status(400)
        .json({ error: "Asset is already assigned to this beneficiary." });
    }

    const shardToAssign = asset.shards.pop();
    await asset.save();

    beneficiary.assigned_assets.push({
      assetId: assetId,
      shard: shardToAssign,
    } as any);

    await beneficiary.save();

    res.status(201).json({
      message: "Cryptographic shard successfully assigned to beneficiary.",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error assigning shard to the asset." });
  }
});

// This is the endpoint the user hits when they click the "I'm here!" button in the email from the monitor script.
app.get("/api/acknowledge/:userId", async (req, res) => {
  const { userId } = req.params;

  try {
    // Finds the user by their ID and update their status back to active and reset their last_active timestamp.
    const user = await User.findByIdAndUpdate(
      userId,
      {
        account_status: "active",
        last_active: new Date(),
      },
      { new: true },
    );

    if (!user) {
      return res.status(404).send("<h1>Error!</h1><p>User not found.</p>");
    }

    // Just sending back a simple HTML page to confirm that everything is okay with the user.
    res.send(`
            <div style="text-align: center; margin-top: 50px; font-family: sans-serif;">
                <h1>Welcome Back, ${user.username}!</h1>
                <p>The Dead Man's Switch has been reset, and your vault remains secure.</p>
                <p>Threshold and grace period checker: Verified (MongoDB Atlas).</p>
            </div>
        `);
  } catch (err) {
    console.error("Ack Error.", err);
    res.status(500).send("<h1>Server Error</h1>");
  }
});

// Finally starting my server. Instead of app.listen, I'm using https.createServer to run it over HTTPS.
https.createServer(HttpsOptions, app).listen(PORT, () => {
  console.log(`[SECURE] SureWill Backend: https://localhost:${PORT}`);
});
