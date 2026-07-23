import { Queue } from "bullmq";
import { connection } from "./connection.js";

export const campaignQueue = new Queue("campaign-send", { connection });

/**
 * Schedules (or immediately enqueues) a campaign send.
 * Using the campaign id as the BullMQ job id means:
 *  - re-scheduling a still-pending campaign is a safe upsert (remove + re-add)
 *  - we can look the job up later to cancel it
 * The delay is computed from wall-clock time; BullMQ persists the job (with
 * its delay) in Redis, so a server/worker restart does not lose it -- when
 * the worker process comes back up it resumes watching the delayed set. This
 * is the reason we didn't reach for setTimeout/setInterval: those live only
 * in process memory and evaporate on restart or deploy.
 */
export async function scheduleCampaignSend(campaignId, sendAt) {
  const delay = Math.max(0, new Date(sendAt).getTime() - Date.now());
  await campaignQueue.add(
    "send",
    { campaignId },
    {
      jobId: campaignId,
      delay,
      removeOnComplete: true,
      removeOnFail: false,
      attempts: 3,
      backoff: { type: "exponential", delay: 30_000 },
    }
  );
}

export async function cancelCampaignSend(campaignId) {
  const job = await campaignQueue.getJob(campaignId);
  if (job) {
    const state = await job.getState();
    if (state === "delayed" || state === "waiting") {
      await job.remove();
    }
  }
}
