import { z } from "zod"

/** Shapes shared by the forecast's forms. Amounts stay strings until the database. */
export const blankToNull = (v: unknown) =>
  v === undefined || (typeof v === "string" && v.trim() === "") ? null : v

export const moneyField = z
  .string()
  .trim()
  .regex(/^-?\d+(\.\d{1,2})?$/, "Enter an amount, such as 1250.00")

export const optionalMoney = z.preprocess(blankToNull, moneyField.nullable())
export const optionalDate = z.preprocess(blankToNull, z.iso.date().nullable())
export const optionalUuid = z.preprocess(blankToNull, z.uuid().nullable())
export const optionalInt = z.preprocess(
  blankToNull,
  z.coerce.number().int().nullable()
)
export const optionalText = z.preprocess(
  blankToNull,
  z.string().trim().nullable()
)

/** "2026-01-02, 2026-02-03" → a list of dates; anything else fails. */
export const dateList = z
  .string()
  .transform((v) =>
    v
      .split(/[\s,]+/)
      .map((d) => d.trim())
      .filter(Boolean)
  )
  .pipe(z.array(z.iso.date()))

export const firstError = (e: z.ZodError) =>
  e.issues[0]?.message ?? "Check the values and try again."
