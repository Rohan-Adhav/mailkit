import IORedis from "ioredis";
import "dotenv/config";

export const connection = new IORedis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null,
  tls: {},
});

connection.on("connect", () => {
  console.log("Redis connected");
});

connection.on("error", (err) => {
  console.error("Redis error:", err.message);
});