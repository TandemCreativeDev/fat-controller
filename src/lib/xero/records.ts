import { z } from "zod"

import type {
  xeroAccount,
  xeroBankTransaction,
  xeroBankTransfer,
  xeroContact,
  xeroCreditNote,
  xeroInvoice,
  xeroInvoiceLine,
  xeroManualJournal,
  xeroOrganisation,
  xeroPayment,
} from "@/db/schema"
import { parseXeroDate, parseXeroTimestamp } from "./dates"

/**
 * Zod schemas for the parts of Xero's Accounting API responses we use, and
 * pure mappers from a parsed record to table rows. Every record keeps its full
 * JSON in `raw`, so unparsed fields are never lost.
 */

const num = z.number().nullish()
const str = z.string().nullish()
const ref = (key: string) => z.looseObject({ [key]: z.string() }).nullish()

const money = (n: number | null | undefined) =>
  n == null ? null : n.toFixed(2)
const decimal = (n: number | null | undefined) => (n == null ? null : String(n))
const day = (s: string | null | undefined) => (s ? parseXeroDate(s) : null)
const stamp = (s: string | null | undefined) =>
  s ? parseXeroTimestamp(s) : null
/** Prefer Xero's ISO DateString over the Microsoft-format Date when both exist. */
const pickDate = (
  iso: string | null | undefined,
  ms: string | null | undefined
) => day(iso ?? ms)

// ------------------------------------------------------------------ schemas

export const organisationSchema = z.looseObject({
  OrganisationID: z.string(),
  Name: z.string(),
  BaseCurrency: z.string(),
  FinancialYearEndDay: num,
  FinancialYearEndMonth: num,
})

export const accountSchema = z.looseObject({
  AccountID: z.string(),
  Code: str,
  Name: z.string(),
  Type: z.string(),
  Class: str,
  TaxType: str,
  Status: str,
  UpdatedDateUTC: str,
})

export const contactSchema = z.looseObject({
  ContactID: z.string(),
  Name: z.string(),
  IsCustomer: z.boolean().nullish(),
  IsSupplier: z.boolean().nullish(),
  ContactStatus: str,
  UpdatedDateUTC: str,
})

const lineItemSchema = z.looseObject({
  LineItemID: z.string(),
  Description: str,
  AccountCode: str,
  Quantity: num,
  UnitAmount: num,
  LineAmount: num,
  TaxAmount: num,
  TaxType: str,
  Tracking: z.array(z.unknown()).nullish(),
})

export const invoiceSchema = z.looseObject({
  InvoiceID: z.string(),
  Type: z.string(),
  InvoiceNumber: str,
  Reference: str,
  Contact: ref("ContactID"),
  Date: str,
  DateString: str,
  DueDate: str,
  DueDateString: str,
  Status: z.string(),
  LineAmountTypes: str,
  SubTotal: num,
  TotalTax: num,
  Total: num,
  AmountDue: num,
  AmountPaid: num,
  AmountCredited: num,
  CurrencyCode: str,
  CurrencyRate: num,
  FullyPaidOnDate: str,
  UpdatedDateUTC: str,
  LineItems: z.array(lineItemSchema).nullish(),
})

export const creditNoteSchema = z.looseObject({
  CreditNoteID: z.string(),
  Type: z.string(),
  CreditNoteNumber: str,
  Contact: ref("ContactID"),
  Date: str,
  DateString: str,
  Status: z.string(),
  SubTotal: num,
  TotalTax: num,
  Total: num,
  RemainingCredit: num,
  CurrencyCode: str,
  CurrencyRate: num,
  UpdatedDateUTC: str,
})

export const paymentSchema = z.looseObject({
  PaymentID: z.string(),
  Date: str,
  Amount: num,
  CurrencyRate: num,
  PaymentType: str,
  Status: str,
  UpdatedDateUTC: str,
  Invoice: ref("InvoiceID"),
  CreditNote: ref("CreditNoteID"),
  Account: ref("AccountID"),
})

export const bankTransactionSchema = z.looseObject({
  BankTransactionID: z.string(),
  Type: z.string(),
  Contact: ref("ContactID"),
  BankAccount: ref("AccountID"),
  Date: str,
  DateString: str,
  Status: str,
  Reference: str,
  IsReconciled: z.boolean().nullish(),
  SubTotal: num,
  TotalTax: num,
  Total: num,
  CurrencyCode: str,
  CurrencyRate: num,
  UpdatedDateUTC: str,
})

export const manualJournalSchema = z.looseObject({
  ManualJournalID: z.string(),
  Date: str,
  Status: str,
  Narration: str,
  UpdatedDateUTC: str,
})

export const bankTransferSchema = z.looseObject({
  BankTransferID: z.string(),
  Date: str,
  DateString: str,
  Amount: num,
  FromBankAccount: ref("AccountID"),
  ToBankAccount: ref("AccountID"),
  FromBankTransactionID: str,
  ToBankTransactionID: str,
  Status: str,
})

// ------------------------------------------------------------------ mappers

type Row<T extends { $inferInsert: unknown }> = T["$inferInsert"]

export function mapOrganisation(
  o: z.infer<typeof organisationSchema>
): Row<typeof xeroOrganisation> {
  return {
    organisationId: o.OrganisationID,
    name: o.Name,
    baseCurrency: o.BaseCurrency,
    financialYearEndDay: o.FinancialYearEndDay ?? null,
    financialYearEndMonth: o.FinancialYearEndMonth ?? null,
    raw: o,
    syncedAt: new Date(),
  }
}

export function mapAccount(
  a: z.infer<typeof accountSchema>
): Row<typeof xeroAccount> {
  return {
    accountId: a.AccountID,
    code: a.Code ?? null,
    name: a.Name,
    type: a.Type,
    class: a.Class ?? null,
    taxType: a.TaxType ?? null,
    status: a.Status ?? null,
    updatedAt: stamp(a.UpdatedDateUTC),
    raw: a,
  }
}

export function mapContact(
  c: z.infer<typeof contactSchema>
): Row<typeof xeroContact> {
  return {
    contactId: c.ContactID,
    name: c.Name,
    isCustomer: c.IsCustomer ?? false,
    isSupplier: c.IsSupplier ?? false,
    status: c.ContactStatus ?? null,
    updatedAt: stamp(c.UpdatedDateUTC),
    raw: c,
  }
}

export function mapInvoice(i: z.infer<typeof invoiceSchema>): {
  invoice: Row<typeof xeroInvoice>
  lines: Row<typeof xeroInvoiceLine>[]
} {
  return {
    invoice: {
      invoiceId: i.InvoiceID,
      type: i.Type,
      invoiceNumber: i.InvoiceNumber ?? null,
      reference: i.Reference ?? null,
      contactId: i.Contact?.ContactID ?? null,
      date: pickDate(i.DateString, i.Date),
      dueDate: pickDate(i.DueDateString, i.DueDate),
      status: i.Status,
      lineAmountTypes: i.LineAmountTypes ?? null,
      subTotal: money(i.SubTotal),
      totalTax: money(i.TotalTax),
      total: money(i.Total),
      amountDue: money(i.AmountDue),
      amountPaid: money(i.AmountPaid),
      amountCredited: money(i.AmountCredited),
      currencyCode: i.CurrencyCode ?? null,
      currencyRate: decimal(i.CurrencyRate),
      fullyPaidOnDate: day(i.FullyPaidOnDate),
      updatedAt: stamp(i.UpdatedDateUTC),
      raw: i,
    },
    lines: (i.LineItems ?? []).map((l) => ({
      lineItemId: l.LineItemID,
      invoiceId: i.InvoiceID,
      description: l.Description ?? null,
      accountCode: l.AccountCode ?? null,
      quantity: decimal(l.Quantity),
      unitAmount: decimal(l.UnitAmount),
      lineAmount: money(l.LineAmount),
      taxAmount: money(l.TaxAmount),
      taxType: l.TaxType ?? null,
      tracking: l.Tracking ?? [],
    })),
  }
}

export function mapCreditNote(
  c: z.infer<typeof creditNoteSchema>
): Row<typeof xeroCreditNote> {
  return {
    creditNoteId: c.CreditNoteID,
    type: c.Type,
    creditNoteNumber: c.CreditNoteNumber ?? null,
    contactId: c.Contact?.ContactID ?? null,
    date: pickDate(c.DateString, c.Date),
    status: c.Status,
    subTotal: money(c.SubTotal),
    totalTax: money(c.TotalTax),
    total: money(c.Total),
    remainingCredit: money(c.RemainingCredit),
    currencyCode: c.CurrencyCode ?? null,
    currencyRate: decimal(c.CurrencyRate),
    updatedAt: stamp(c.UpdatedDateUTC),
    raw: c,
  }
}

export function mapPayment(
  p: z.infer<typeof paymentSchema>
): Row<typeof xeroPayment> {
  return {
    paymentId: p.PaymentID,
    invoiceId: p.Invoice?.InvoiceID ?? null,
    creditNoteId: p.CreditNote?.CreditNoteID ?? null,
    paymentType: p.PaymentType ?? null,
    date: day(p.Date),
    amount: money(p.Amount),
    currencyRate: decimal(p.CurrencyRate),
    bankAccountId: p.Account?.AccountID ?? null,
    status: p.Status ?? null,
    updatedAt: stamp(p.UpdatedDateUTC),
    raw: p,
  }
}

export function mapBankTransaction(
  b: z.infer<typeof bankTransactionSchema>
): Row<typeof xeroBankTransaction> {
  return {
    bankTransactionId: b.BankTransactionID,
    type: b.Type,
    contactId: b.Contact?.ContactID ?? null,
    bankAccountId: b.BankAccount?.AccountID ?? null,
    date: pickDate(b.DateString, b.Date),
    status: b.Status ?? null,
    reference: b.Reference ?? null,
    isReconciled: b.IsReconciled ?? null,
    subTotal: money(b.SubTotal),
    totalTax: money(b.TotalTax),
    total: money(b.Total),
    currencyCode: b.CurrencyCode ?? null,
    currencyRate: decimal(b.CurrencyRate),
    updatedAt: stamp(b.UpdatedDateUTC),
    raw: b,
  }
}

export function mapBankTransfer(
  t: z.infer<typeof bankTransferSchema>
): Row<typeof xeroBankTransfer> {
  return {
    bankTransferId: t.BankTransferID,
    date: pickDate(t.DateString, t.Date),
    fromAccountId: t.FromBankAccount?.AccountID ?? null,
    toAccountId: t.ToBankAccount?.AccountID ?? null,
    amount: money(t.Amount),
    fromBankTransactionId: t.FromBankTransactionID ?? null,
    toBankTransactionId: t.ToBankTransactionID ?? null,
    status: t.Status ?? null,
    raw: t,
  }
}

export function mapManualJournal(
  m: z.infer<typeof manualJournalSchema>
): Row<typeof xeroManualJournal> {
  return {
    manualJournalId: m.ManualJournalID,
    date: day(m.Date),
    status: m.Status ?? null,
    narration: m.Narration ?? null,
    updatedAt: stamp(m.UpdatedDateUTC),
    raw: m,
  }
}

/** Latest UpdatedDateUTC across a page of records, for advancing the sync cursor. */
export function maxUpdated(
  records: { UpdatedDateUTC?: string | null }[]
): Date | null {
  let max: Date | null = null
  for (const r of records) {
    if (!r.UpdatedDateUTC) continue
    const d = parseXeroTimestamp(r.UpdatedDateUTC)
    if (!max || d > max) max = d
  }
  return max
}

// ------------------------------------------------------------------ Bank Summary

const reportCell = z.looseObject({
  Value: z.string().nullish(),
  Attributes: z
    .array(z.looseObject({ Id: z.string().nullish(), Value: str }))
    .nullish(),
})
type ReportRow = {
  RowType?: string | null
  Cells?: z.infer<typeof reportCell>[] | null
  Rows?: ReportRow[] | null
}
const reportRow: z.ZodType<ReportRow> = z.lazy(() =>
  z.looseObject({
    RowType: str,
    Cells: z.array(reportCell).nullish(),
    Rows: z.array(reportRow).nullish(),
  })
)
const bankSummarySchema = z.looseObject({
  Reports: z.array(z.looseObject({ Rows: z.array(reportRow).nullish() })),
})

export type BankSummaryRow = {
  accountId: string
  opening: string
  closing: string
}

/**
 * Pull each account's opening and closing balance from a Bank Summary report.
 * Rows are identified by the `accountID` cell attribute, never by name. Columns
 * are found from the header, in case Xero reorders them.
 */
export function parseBankSummary(body: unknown): BankSummaryRow[] {
  const parsed = bankSummarySchema.safeParse(body)
  if (!parsed.success) return []
  const rows = parsed.data.Reports[0]?.Rows ?? []
  const header = rows.find((r) => r.RowType === "Header")?.Cells ?? []
  const column = (name: RegExp, fallback: number) => {
    const i = header.findIndex((c) => name.test(c.Value ?? ""))
    return i >= 0 ? i : fallback
  }
  const openingCol = column(/opening/i, 1)
  const closingCol = column(/closing/i, 4)

  const flatten = (list: ReportRow[]): ReportRow[] =>
    list.flatMap((r) => [r, ...flatten(r.Rows ?? [])])
  const out: BankSummaryRow[] = []
  for (const row of flatten(rows)) {
    if (row.RowType !== "Row") continue
    const cells = row.Cells ?? []
    const accountId = cells
      .flatMap((c) => c.Attributes ?? [])
      .find((a) => a.Id?.toLowerCase() === "accountid")?.Value
    if (!accountId) continue
    const amount = (i: number) => {
      const n = Number((cells[i]?.Value ?? "0").replace(/,/g, ""))
      return Number.isFinite(n) ? n.toFixed(2) : "0.00"
    }
    out.push({
      accountId,
      opening: amount(openingCol),
      closing: amount(closingCol),
    })
  }
  return out
}
