import dbConnection from "./db";
import { User, Beneficiary } from "./models";
import dotenv from "dotenv";
import nodemailer from "nodemailer";

dotenv.config();
dbConnection();

let transporter: nodemailer.Transporter;

async function mailerSetup() {
  if (!transporter) {
    console.log("Initializing Ethereal Test Account..");
    const testAccount = await nodemailer.createTestAccount();

    transporter = nodemailer.createTransport({
      host: "smtp.ethereal.email",
      port: 587,
      secure: false,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });
    console.log("Transporter ready.");
  }
}

mailerSetup().catch(console.error);

/**
 * Im using Ethereal Mail to simulate the real-world notification. (Production SMTP has payments).
 * Mock SMTP email to tell the beneficiary that the user's assets have been released.
 */
async function sendNotification(beneficiaryEmail: string, userName: string) {
  if (!transporter) await mailerSetup(); //This ensures the transporter is ready before sending

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
  gracePeriodDays: number,
) {
  if (!transporter) await mailerSetup();

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
                       I'm here!!!
                    </a>
                </div>

                <p style="color: #666; font-size: 12px;">If you do not click this button within ${gracePeriodDays} days, your vault will be automatically triggered and released to your heirs.</p>
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

    const activeUsers = await User.find({ account_status: "active" });

    for (const user of activeUsers) {
      const thresholdDays = (user as any).dms_threshold || 60;
      const gracePeriodDays = (user as any).dms_grace_period || 14;

      // converting the days into ms, so it can be calculated
      const thresholdMS = thresholdDays * 24 * 60 * 60 * 1000;

      // Calculates how long it has been since the user was last logged in or uploading something
      const lastActive = now.getTime() - new Date(user.last_active).getTime();

      if (lastActive > thresholdMS) {
        user.account_status = "pending acknowledgement";
        await user.save();

        await sendAckEmail(
          user.email,
          user.username,
          `${user._id}`,
          gracePeriodDays,
        );
        console.log(
          `System Alert! The user ${user.username} is pending acknowledgement. Overdue by: ${thresholdDays}`,
        );
      }
    }

    const pendingUsers = await User.find({
      account_status: "pending acknowledgement",
    });

    for (const user of pendingUsers) {
      const thresholdDays = (user as any).dms_threshold || 60;
      const gracePeriodDays = (user as any).dms_grace_period || 14;

      // deadline is the threshold and the grace period combined in milliseconds
      const deadlineMs =
        (thresholdDays + gracePeriodDays) * 24 * 60 * 60 * 1000;
      const lastActive = now.getTime() - new Date(user.last_active).getTime();

      // If the user hasn't clicked the link after grace period, the vault will be unlocked
      if (lastActive > deadlineMs) {
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
        console.log(
          `Critical! Dead Man's Switch has been triggered for ${user.username}. Asset will now be released to heirs.`,
        );
      }
    }
  } catch (err) {
    console.error("[Monitor Error]", err);
  }
}

checkInactivity();
setInterval(checkInactivity, 10000);
