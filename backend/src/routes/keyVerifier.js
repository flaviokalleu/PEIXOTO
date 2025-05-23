const axios = require("axios");
require("dotenv").config();

async function verifyKey() {
  try {
    // Fetch key from meu.site.com/key.json
    const response = await axios.get("https://meu.site.com/key.json");
    const remoteKey = response.data.key; // Assuming key.json has a "key" field

    // Get key from .env
    const envKey = process.env.APP_KEY;

    // Compare keys
    if (!remoteKey || !envKey || remoteKey !== envKey) {
      throw new Error("Key verification failed: Keys do not match or are missing.");
    }
    console.log("Key verification successful.");
    return true;
  } catch (error) {
    console.error("Key verification error:", error.message);
    return false;
  }
}

module.exports = { verifyKey };