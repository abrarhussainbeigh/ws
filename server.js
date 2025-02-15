import express from "express";
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { getDatabase, ref, set } from "firebase/database";
import cron from "node-cron";
import dotenv from "dotenv";

dotenv.config();

// Firebase Config (Minimal)
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  databaseURL: process.env.FIREBASE_DATABASE_URL,
  projectId: process.env.FIREBASE_PROJECT_ID,
  appId: process.env.FIREBASE_APP_ID,
};

// Initialize Firebase
const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getDatabase(firebaseApp);

const app = express();
const PORT = process.env.PORT || 3000;

// Telegram Notification Function
async function sendTelegramMessage(message) {
  try {
    const url = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: process.env.TELEGRAM_CHAT_ID, text: message }),
    });
    const data = await response.json();
    if (!data.ok) throw new Error("Failed to send Telegram message");
    console.log("Telegram notification sent.");
  } catch (error) {
    console.error("Telegram Error:", error.message);
  }
}

// Dropbox Token Refresh Function
async function refreshDropboxToken() {
  try {
    console.log("Signing in to Firebase...");
    const userCredential = await signInWithEmailAndPassword(auth, process.env.FIREBASE_EMAIL, process.env.FIREBASE_PASSWORD);
    console.log("Signed in as:", userCredential.user.email);

    console.log("Refreshing Dropbox token...");
    const params = new URLSearchParams();
    params.append("grant_type", "refresh_token");
    params.append("refresh_token", process.env.DROPBOX_REFRESH_TOKEN);
    params.append("client_id", process.env.DROPBOX_CLIENT_ID);
    params.append("client_secret", process.env.DROPBOX_CLIENT_SECRET);

    const response = await fetch("https://api.dropboxapi.com/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params,
    });

    const data = await response.json();
    if (!data.access_token) throw new Error("Failed to refresh Dropbox token");

    console.log("New Dropbox Token:", data.access_token);

    // Save to Firebase Database
    await set(ref(db, "server/dbox/token"), data.access_token);
    console.log("Dropbox token saved to Firebase.");

    // Notify Telegram
    await sendTelegramMessage(`✅ Dropbox Token Updated Successfully: ${new Date().toLocaleString()}`);
  } catch (error) {
    console.error("Error:", error.message);
    await sendTelegramMessage(`❌ Dropbox Token Update Failed: ${error.message}`);
  }
}

// Schedule Task (Runs Every 3 Hours)
cron.schedule("0 */3 * * *", () => {
  refreshDropboxToken();
});

// Express Health Check Endpoint
app.get("/", (req, res) => {
  res.send("Dropbox Token Refresh Service Running...");
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
