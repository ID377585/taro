import { hash, compare } from "bcryptjs";

const ROUNDS = 10;

export const hashPassword = async (value: string) => hash(value, ROUNDS);
export const verifyPassword = async (value: string, hashedValue: string) =>
  compare(value, hashedValue);
