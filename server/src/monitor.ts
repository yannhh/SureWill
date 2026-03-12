import dbConnection from "./db";
import { User, Beneficiary } from "./models";
import dotenv from "dotenv";
import nodemailer from "nodemailer";

dotenv.config();
dbConnection();

/**
 * Im using Ethereal Mail to simulate the real-world notification. (Production SMTP has payments).
 * SMTP email to tell the beneficiary that the user's assets have been released.
 */
async function sendNotification(beneficiaryEmail: string, userName: string) {
  // Creating a test account
  let testAccount = await nodemailer.createTestAccount();

  // Configuring the SMTP transporter
  let transporter = nodemailer.createTransport({
    host: "smtp.ethereal.email",
    port: 587,
    secure: false,
    auth: {
      user: testAccount.user,
      pass: testAccount.pass,
    },
  });

  // Defining the email content and then sending it
  let info = await transporter.sendMail({
    from: '"SureWill Digital Company" <no-reply@surewill.com>',
    to: beneficiaryEmail,
    subject: "Action Required: Digital Asset Transfer",
    text: `Dear ${userName}, a digital asset has been released to you. Please log in to SureWill to view its contents.`,
    html: `<b>Dear ${userName}, </b><p> A digital asset has been released to you.</p><p>Please log in to SureWill to claim the assets.</p>`,
  });

  console.log(`[EMAIL] Notification has been sent to ${beneficiaryEmail}`);
  console.log(`[EMAIL] Preview URL: ${nodemailer.getTestMessageUrl(info)}`);
}

/**
 * Sends notification to user.
 * This confirms if they are still active and well.
 */
async function sendAckEmail(
  userEmail: string,
  userName: string,
  userId: string,
) {
  let testAccount = await nodemailer.createTestAccount();
  let transporter = nodemailer.createTransport({
    host: "smtp.ethereal.email",
    port: 587,
    secure: false,
    auth: {
      user: testAccount.user,
      pass: testAccount.pass,
    },
  });

  const ackURL = `https://localhost:5050/api/acknowledge/${userId}`;

  let info = await transporter.sendMail({
    from: '"SureWill Security" <security@surewill.com>',
    to: userEmail,
    subject: "Urgent: Confirm Your SureWill Activity",
    html: `
            <div style="font-family: sans-serif; max-width: 600px; border: 1px solid #eee; padding: 20px;">
                <h2>Hello ${userName},</h2>
                <p>We noticed you haven't been active on SureWill recently.</p>
                <p>To prevent early release of your digital assets, please confirm your wellbeing by clicking the button below.</p>
                
                <div style="text-align: center; margin: 30px 0;">
                    <a href="${ackURL}" 
                       style="background-color: #007bff; color: white; padding: 15px 25px; border-radius: 5px; font-weight: bold;">
                       Im here!!!
                    </a>
                </div>

                <p style="color: #666; font-size: 12px;">If you do not click this button within 48 hours, your vault will be automatically triggered.</p>
            </div>
        `,
  });

  console.log(`Email Link: ${nodemailer.getTestMessageUrl(info)}`);
}

/**
 * The core Heartbeat of SureWill! Which I configured to run every 10 seconds
 * It finds two particular stages of inactivity.
 * The first is the Threshold. If the user hasn't logged in for 1 minute, they are moved to pending
 * The second is the Grace Period. If the user hasn't responded to the pending email which asks if they're still here,
 * the vault will then be triggered and beneficiaries will have access_granted to true for all heirs assigned.
 */
async function checkInactivity() {
  console.log("[Backend Monitoring] Checking users accounts for inactivity.");

  try {
    const now = new Date();

    //1 min threshold for testing
    const thresholdDate = new Date(now.getTime() - 1 * 60000);

    //48 hr grace period after threshold
    const gracePeriod = new Date(now.getTime() - 48 * 60 * 60000);

    const overdue = await User.find({
      account_status: "active",
      last_active: { $lt: thresholdDate },
    });

    for (const user of overdue) {
      user.account_status = "pending acknowledgement";
      await user.save();

      await sendAckEmail(user.email, user.username, `${user._id}`);
      console.log(`[ALARM] User ${user.username} moved to pending.`);
    }

    const triggered = await User.find({
      account_status: "pending acknowledgement",
      last_active: { $lt: gracePeriod },
    });

    for (const user of triggered) {
      user.account_status = "inactivity triggered";
      await user.save();

      await Beneficiary.updateMany(
        { userId: user._id },
        { access_granted: true },
      );

      const heirs = await Beneficiary.find({ userId: user._id });

      for (const heir of heirs) {
        if (heir.email) {
          await sendNotification(heir.email, user.username);
        }
      }
      console.log(`[CRITICAL] Switch triggered for ${user.username}.`);
    }
  } catch (err) {
    console.error("[Monitor Error]", err);
  }
}

checkInactivity();
setInterval(checkInactivity, 10000);
