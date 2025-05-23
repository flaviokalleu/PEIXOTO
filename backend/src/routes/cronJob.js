const cron = require("node-cron");
const { verifyKey } = require("./keyVerifier");

// Schedule cron job to run every 15 hours
function startCronJob() {
  cron.schedule("0 */15 * * *", async () => {
    console.log("Running key verification cron job...");
    const isValid = await verifyKey();
    if (!isValid) {
      console.error("Cron job: Key verification failed. Consider stopping the application or notifying admin.");
      // Optionally, implement logic to notify admin or take action (e.g., send email, log alert)
    }
  });
}

module.exports = { startCronJob };