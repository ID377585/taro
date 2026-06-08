import { z } from "zod";

const serverEnvSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required."),
  AUTH_SECRET: z.string().min(1, "AUTH_SECRET is required."),
});

export const getServerEnvStatus = () =>
  serverEnvSchema.safeParse({
    DATABASE_URL: process.env.DATABASE_URL,
    AUTH_SECRET: process.env.AUTH_SECRET,
  });

export const getPublicRuntimeConfig = () => ({
  visionServiceUrl: process.env.VISION_SERVICE_URL || "http://localhost:8000",
});
