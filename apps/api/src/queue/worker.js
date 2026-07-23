import "dotenv/config";
import { Worker } from "bullmq";
import { connection } from "./connection.js";
import { sendCampaign } from "../services/sendCampaign.js";

// Runs as a separate process from the API (npm run worker). This is what
// actually fires scheduled campaigns at the right time -- the API process
// only ever enqueues jobs, it never sends on its own timers.
const worker = new Worker(
  "campaign-send",
  async (job) => {
    console.log(`[worker] sending campaign ${job.data.campaignId}`);
    await sendCampaign(job.data.campaignId);
  },
  { connection, concurrency: 2 }
);

worker.on("completed", (job) => {
  console.log(`[worker] campaign ${job.data.campaignId} sent`);
});

worker.on("failed", (job, err) => {
  console.error(`[worker] campaign ${job?.data?.campaignId} failed:`, err.message);
});

console.log("Campaign worker started, waiting for jobs...");
