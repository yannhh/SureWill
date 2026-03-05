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
import * as QRCode from "qrcode";
import { authenticator } from "@otplib/preset-default";
import { assert } from "console";

// I'm defining a 'shape' for the data I expect when a user uploads a file. This helps prevent errors.
interface VaultUploadRequest {
  userId: number;
  nonce: string;
  fileName?: string;
  fileType?: string;
  fileSize?: number;
}

// I'm loading my environment variables from the .env file (like my database URL and port).
dotenv.config();
// This function from my db.ts file will connect to my MongoDB database.
dbConnection();

// Creating my main Express application.
const app = express();
// Gets the port from my .env file, or just use 5050 if it's not set.
const PORT = process.env.PORT || 5050;

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
app.use(express.json());

// To run my server on HTTPS, I need to load the key and certificate files that I generated.
const HttpsOptions = {
  key: fs.readFileSync(path.join(__dirname, "../security/localhost+2-key.pem")),
  cert: fs.readFileSync(path.join(__dirname, "../security/localhost+2.pem")),
};

// I'm creating a single, reusable transporter for sending emails.
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

  // If using Ethereal, log the preview URL. Otherwise, just log the message ID.
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
  const { username, email, password } = req.body;

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

// This is just a simple endpoint to check if my server is running and if the crypto library is loaded correctly.
app.get("/health", async (req, res) => {
  await sodium.ready;
  res.json({
    status: "SureWill Secure Vault Status: Active",
    protocol: "HTTPS/TLS 1.3",
    crypto: `libsodium ${sodium.sodium_version_string()} ready`,
  });
});

// This is my endpoint for when a user tries to log in.
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    await sodium.ready;
    // First, I'll find the user in my database by their email.
    const user = await User.findOne({ email });

    // I'll check if a user was found AND if the password they provided matches the hash I have stored.
    if (
      !user ||
      !sodium.crypto_pwhash_str_verify(user.password_hash, password)
    ) {
      // If not, I'll send a generic error message for security.
      return res.status(401).json({ error: "Invalid Email or Password." });
    }

    // If the password is correct, I'll generate a random 6-digit OTP for the second factor of authentication.
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.otp_code = otp;
    user.otp_expires = new Date(Date.now() + 10 * 60000); // The OTP will expire in 10 minutes.

    await user.save(); // I'm saving the OTP and its expiration time to the user's document.
    // Now I'll use my helper function to email the OTP to the user.
    await sendOTPToEmail(user.email, otp);

    // I'll let the frontend know that the OTP was sent.
    res.json({ message: "OTP has been sent to your email.", userId: user._id });
  } catch (err) {
    console.error("[LOGIN ERROR] An error occurred during login:", err);
    res
      .status(500)
      .json({ error: "Login failed. Could not send verification email." });
  }
});

// After the user gets the OTP from their email, they send it here to be verified.
app.post("/api/totp/verify-otp", async (req, res) => {
  const { userId, otp } = req.body;
  try {
    const user = await User.findById(userId);

    // Here I'm checking three things: does the user exist, is the OTP they gave me the same as the one I stored, and has it not expired?
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
    // I'm also updating their last_active time, which is important for my dead man's switch logic.
    user.last_active = new Date();

    await user.save();

    console.log("Otp sent to: ", otp);

    // Finally, I grant them access.
    res.json({
      message: "MFA Success. Access Granted.",
      user: { id: user._id, username: user.username },
    });
  } catch (err) {
    res.status(500).json({ error: "Verification Failed." });
  }
});

// This endpoint is for verifying the 6-digit code from an authenticator app like Google or Microsoft Authenticator.
app.post("/api/totp/verify", async (req, res) => {
  const { userId, token } = req.body;
  try {
    const user = await User.findById(userId);
    if (!user || !user.totp_secret) {
      return res
        .status(400)
        .json({ error: "TOTP not configured for this user." });
    }

    // The otplib library does the hard work of checking if the 6-digit code is correct based on the secret I stored for the user.
    const isValid = authenticator.check(token, user.totp_secret);

    if (isValid) {
      // If the code is valid, I'll mark that TOTP is officially enabled for this user.
      user.totp_enabled = true;
      await user.save();
      res.json({ message: "TOTP Enabled Successfully!" });
    } else {
      res.status(401).json({ error: "Invalid authenticator code." });
    }
  } catch (err) {
    res.status(500).json({ error: "Server error during verification." });
  }
});

// This endpoint generates the secret and a QR Code for the user to scan with their authenticator app.
app.post("/api/totp/setup", async (req, res) => {
  const { userId } = req.body;
  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    // 1. I'll generate a new secret using the otplib library.
    const secret = authenticator.generateSecret();
    user.totp_secret = secret;
    await user.save();

    // 2. I'll create a special URL (a "key URI") that authenticator apps understand.
    // It contains the secret, the app name ('SureWillVault'), and the user's email.
    const otpauth = authenticator.keyuri(user.email, "SureWillVault", secret);

    // 3. Now, I'll turn that special URL into a QR code image.
    // The result is a long string of text (a "data URL") that browsers can render as an image.
    const qrCodeDataURL = await QRCode.toDataURL(otpauth);

    // I'll send this QR code data back to the frontend so it can be displayed to the user.
    res.json({ qrCode: qrCodeDataURL });
  } catch (err: any) {
    console.error("QR Generation Error:", err.message);
    res.status(500).json({ error: "Failed to generate QR code" });
  }
});

// This is the first step of the password reset flow. The user provides their email.
app.post("/api/forgot-password", async (req, res) => {
  const { email } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ error: "User was not found." });

    // I'm generating a secure, random token that will be part of the reset link.
    const token = crypto.randomBytes(16).toString("hex");
    user.reset_token = token;
    user.reset_expires = new Date(Date.now() + 3600000); // The token will expire in 1 hour.
    await user.save();

    // I'll create the full reset URL and send it to the user's email.
    const resetURL = `http://127.0.0.1:5500/reset-password.html?token=${token}`;
    await sendResetEmail(user.email as string, resetURL);

    res.json({ messsage: "Password reset link has been sent to your email." });
  } catch (err) {
    res.status(500).json({ error: "Error resetting the password." });
  }
});

// This is the second step. The user has clicked the link in their email and is now submitting a new password.
app.post("/api/reset-password", async (req, res) => {
  const { token, newPassword } = req.body;

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
    // I'm clearing the reset token so it can't be used again. This is very important!
    user.reset_token = undefined;
    user.reset_expires = undefined;
    await user.save();

    res.json({ message: "Password updated succesfully" });
  } catch (err) {
    res.status(500).json({ error: "Error updating the password." });
  }
});

// This endpoint handles uploading a new (simulated) encrypted asset to the user's vault.
app.post("/api/vault/upload", async (req, res) => {
  const {
    userId,
    encryptedData,
    nonce,
    shards,
    threshold,
    totalShards,
    fileName,
    fileType,
    fileSize,
  } = req.body;

  try {
    // I'm creating a new document in my 'assets' collection with all the file details.
    const newAsset = new Asset({
      userId,
      encrypted_data: encryptedData,
      nonce,
      shards: shards,
      threshold: threshold,
      total_shards: totalShards,
      file_name: fileName,
      file_type: fileType,
      file_size: fileSize,
    });

    await newAsset.save();

    // Every time the user uploads, I'll update their 'last_active' timestamp.
    await User.findByIdAndUpdate(userId, { last_active: new Date() });

    res
      .status(201)
      .json({ message: "Asset Uploaded Successfully", asset: newAsset });
  } catch (err) {
    res.status(500).json({ error: "Error uploading asset." });
  }
});

// This endpoint lets the user see a list of all the files they own.
app.get("/api/vault/list/:userId", async (req, res) => {
  const { userId } = req.params;

  try {
    // I'll find all assets that belong to this user and sort them by creation date.
    const assets = await Asset.find({ userId }).sort({ created_at: -1 });
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
      "assigned_assets.assetId": asset._id,
    });

    let systemShard = null;

    // Security Point: The shard will only be released if the Dead Man's Switch has been triggered
    if (beneficiary && beneficiary.access_granted) {
      // Get the first shard remaining in the asset as the system shard
      systemShard = asset.shards[0];

      console.log(
        `[Authenticated] Dead Man's Switch triggered. Releasing System Shard for Asset: ${assetId}`,
      );
    } else {
      console.log(
        `[Security] Access Denied. System Shard remains locked for Asset: ${assetId}`,
      );
    }

    // This will now send the encrypted data, nonce and the system shard
    res.json({
      encrypted_data: asset.encrypted_data,
      nonce: asset.nonce,
      file_name: asset.file_name,
      file_type: asset.file_type,
      threshold: asset.threshold,
      systemShard: systemShard, // This will be null if access_granted is false
    });
  } catch (err) {
    console.error("Download  Error", err);
    res.status(500).json({ error: "Failed to get asset data." });
  }
});

// This endpoint allows a user to add a beneficiary to their account.
app.post("/api/beneficiaries", async (req, res) => {
  const { userId, fullName, email, relationship } = req.body;

  try {
    // I'm creating a new beneficiary document and linking it to the user.
    const newBeneficiary = new Beneficiary({
      userId,
      full_name: fullName,
      email,
      relationship,
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

// This endpoint is for assigning a specific asset to a specific beneficiary.
app.post("/api/vault/access", async (req, res) => {
  const { assetId, beneficiaryId } = req.body;

  try {
    // 1. Locate the asset in the vault
    const asset = await Asset.findById(assetId);
    if (!asset || !asset.shards || asset.shards.length === 0) {
      return res
        .status(400)
        .json({ error: "No cryptographic shards were found for this asset." });
    }

    //2. Find the beneficiary
    const beneficiary = await Beneficiary.findById(beneficiaryId);
    if (!beneficiary) {
      return res.status(400).json({ error: "Beneficiary not found." });
    }

    //3. Preventing duplicate assignments
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

// Get the assets and shards assigned to a specific beneficiary
app.get("/api/beneficiary/claims/:email", async (req, res) => {
  const { email } = req.params;

  try {
    const beneficiary = await Beneficiary.findOne({ email });

    if (!beneficiary) {
      return res.status(404).json({ error: "No beneficiary found." });
    }

    // This is a security check. It only returns the shards if the Dead Man's Switch has been triggered
    if (!beneficiary.access_granted) {
      return res.status(403).json({
        error: "Access Denied. The vault is still locked by the owner.",
      });
    }

    // Return the list of assets and the specific shards the heir has
    res.json({
      fullName: beneficiary.full_name,
      claims: beneficiary.assigned_assets, // This one returns the db array of assetId and the shar
    });
  } catch (err) {
    res.status(500).json({ error: "Server error getting the claims of user." });
  }
});

// This is the endpoint the user hits when they click the "I'm here!" button in the email from the monitor script.
app.get("/api/acknowledge/:userId", async (req, res) => {
  const { userId } = req.params;

  try {
    // I'll find the user by their ID and update their status back to "active" and reset their 'last_active' timestamp.
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

    // I'm just sending back a simple HTML page to confirm that everything is okay.
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

// Finally, I'm starting my server. Instead of app.listen, I'm using https.createServer to run it over HTTPS.
https.createServer(HttpsOptions, app).listen(PORT, () => {
  console.log(`[SECURE] SureWill Backend: https://localhost:${PORT}`);
});
