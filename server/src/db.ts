import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

/**
 * Built this connection script for 2 separate scenarios
 * It tries to connect to my MongoDB Atlas cloud database first.
 * If that doesn't work then, theres a failsafe, that it will connect to the local db that I have.
 * This was created because the university wifi often whitelists my IP so atlas doesn't work.
 */
const dbConnection = async () => {
  try {
    await mongoose.connect(process.env.DATABASE_URL as string);
    console.log("MongoDB Atlas Successfully Connected!");
  } catch (err) {
    console.warn("MongoDB Connection Failed. Initializing Local Backup.");

    try {
      await mongoose.connect(process.env.LOCAL_DB_URL as string);
      console.log("Local MongoDB Successfully Connected!");
    } catch (localErr) {
      console.error("Error Connecting to Local and Atlas DB.", localErr);
      process.exit(1);
    }
  }
};

export default dbConnection;
