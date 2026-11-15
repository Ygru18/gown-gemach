import { z } from "zod";
import { isYmd } from "./dates";
import { parseMoneyToCents } from "./money";
import { AppError } from "./errors";

/** Trimmed optional text: "" → null. */
export const optText = (max = 2000) =>
  z.string().nullish()
    .transform((v) => (v == null ? null : v.trim() === "" ? null : v.trim()))
    .refine((v) => v == null || v.length <= max, `Must be at most ${max} characters`);

export const reqText = (label: string, max = 500) =>
  z
    .string({ error: `${label} is required` })
    .transform((v) => v.trim())
    .refine((v) => v.length > 0, `${label} is required`)
    .refine((v) => v.length <= max, `${label} must be at most ${max} characters`);

export const ymd = (label: string) =>
  z.string({ error: `${label} is required` }).refine((v) => isYmd(v), `${label} must be a valid date`);

export const optYmd = (label: string) =>
  z.string().nullish()
    .transform((v) => (v == null || v.trim() === "" ? null : v.trim()))
    .refine((v) => v == null || isYmd(v), `${label} must be a valid date`);

/** Money in dollars text → cents (required). */
export const moneyCents = (label: string, { allowZero = true } = {}) =>
  z
    .union([z.string(), z.number()])
    .transform((v, ctx) => {
      const cents = typeof v === "number" ? (Number.isInteger(v) ? v : NaN) : parseMoneyToCents(v);
      if (cents == null || Number.isNaN(cents)) {
        ctx.addIssue({ code: "custom", message: `${label} must be a valid amount, like 25 or 25.00` });
        return z.NEVER;
      }
      if (!allowZero && cents <= 0) {
        ctx.addIssue({ code: "custom", message: `${label} must be greater than zero` });
        return z.NEVER;
      }
      return cents;
    });

export const optMoneyCents = (label: string) =>
  z.string().nullish()
    .transform((v, ctx) => {
      if (v == null || v.trim() === "") return null;
      const cents = parseMoneyToCents(v);
      if (cents == null) {
        ctx.addIssue({ code: "custom", message: `${label} must be a valid amount, like 25 or 25.00` });
        return z.NEVER;
      }
      return cents;
    });

export const optEmail = z.string().nullish()
  .transform((v) => (v == null || v.trim() === "" ? null : v.trim().toLowerCase()))
  .refine((v) => v == null || z.email().safeParse(v).success, "Please enter a valid email address, or leave it blank");

/** Parse with zod and convert failures into a friendly AppError with field errors. */
export function parseInput<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const res = schema.safeParse(input);
  if (res.success) return res.data;
  const fieldErrors: Record<string, string> = {};
  for (const issue of res.error.issues) {
    const key = issue.path.join(".") || "_";
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  const first = Object.values(fieldErrors)[0] ?? "Please check the form.";
  throw new AppError(first, fieldErrors);
}

/** FormData → plain object (last value wins; keys ending in [] collect arrays). */
export function formToObject(fd: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of fd.entries()) {
    if (typeof value !== "string") continue;
    if (key.endsWith("[]")) {
      const k = key.slice(0, -2);
      (out[k] as string[] | undefined) ? (out[k] as string[]).push(value) : (out[k] = [value]);
    } else {
      out[key] = value;
    }
  }
  return out;
}
