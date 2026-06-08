import { createHash, randomBytes } from "node:crypto";

export const createRoomCode = () => randomBytes(4).toString("hex").toUpperCase();

export const createGuestToken = () => randomBytes(24).toString("hex");

export const hashGuestToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");
