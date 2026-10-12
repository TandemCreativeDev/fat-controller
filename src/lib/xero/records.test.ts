import { describe, expect, it } from "vitest"

import {
  bankTransactionSchema,
  invoiceSchema,
  mapBankTransaction,
  mapInvoice,
  mapPayment,
  maxUpdated,
  paymentSchema,
} from "./records"

// Shapes follow Xero's documented JSON, trimmed to what we read plus one unread field.
const invoiceJson = {
  Type: "ACCREC",
  InvoiceID: "243216c5-369e-4056-ac67-05388f86dc81",
  InvoiceNumber: "OIT00546",
  Reference: "Ref 1",
  Contact: {
    ContactID: "025867f1-d741-4d6b-b1af-9ac774b59ba7",
    Name: "City Agency",
  },
  Date: "/Date(1518652800000+0000)/",
  DateString: "2018-02-15T00:00:00",
  DueDate: "/Date(1519948800000+0000)/",
  DueDateString: "2018-03-02T00:00:00",
  Status: "AUTHORISED",
  LineAmountTypes: "Exclusive",
  LineItems: [
    {
      LineItemID: "52208ff9-528a-4985-a9ad-b2b1d4210e38",
      Description: "Consulting",
      Quantity: 1.5,
      UnitAmount: 1000,
      TaxType: "OUTPUT2",
      TaxAmount: 300,
      LineAmount: 1500,
      AccountCode: "200",
      Tracking: [{ Name: "Project", Option: "Alpha" }],
    },
  ],
  SubTotal: 1500,
  TotalTax: 300,
  Total: 1800,
  AmountDue: 1800,
  AmountPaid: 0,
  AmountCredited: 0,
  CurrencyCode: "GBP",
  CurrencyRate: 1,
  UpdatedDateUTC: "/Date(1518685950940+0000)/",
  HasAttachments: false,
}

describe("mapInvoice", () => {
  const { invoice, lines } = mapInvoice(invoiceSchema.parse(invoiceJson))

  it("maps header fields with exact money strings", () => {
    expect(invoice).toMatchObject({
      invoiceId: invoiceJson.InvoiceID,
      type: "ACCREC",
      contactId: invoiceJson.Contact.ContactID,
      date: "2018-02-15",
      dueDate: "2018-03-02",
      subTotal: "1500.00",
      totalTax: "300.00",
      total: "1800.00",
      currencyRate: "1",
      fullyPaidOnDate: null,
    })
    expect(invoice.updatedAt?.toISOString()).toBe("2018-02-15T09:12:30.940Z")
  })

  it("keeps unread fields in raw", () => {
    expect(invoice.raw).toHaveProperty("HasAttachments", false)
  })

  it("maps line items with tracking", () => {
    expect(lines).toEqual([
      {
        lineItemId: "52208ff9-528a-4985-a9ad-b2b1d4210e38",
        invoiceId: invoiceJson.InvoiceID,
        description: "Consulting",
        accountCode: "200",
        quantity: "1.5",
        unitAmount: "1000",
        lineAmount: "1500.00",
        taxAmount: "300.00",
        taxType: "OUTPUT2",
        tracking: [{ Name: "Project", Option: "Alpha" }],
      },
    ])
  })

  it("rounds float noise to pence", () => {
    const { invoice } = mapInvoice(
      invoiceSchema.parse({ ...invoiceJson, Total: 0.1 + 0.2 })
    )
    expect(invoice.total).toBe("0.30")
  })
})

describe("mapPayment", () => {
  it("links the invoice and bank account", () => {
    const p = mapPayment(
      paymentSchema.parse({
        PaymentID: "b26fd49a-cbae-470a-a8f8-bcbc119e0379",
        Date: "/Date(1518652800000+0000)/",
        Amount: 500,
        Invoice: {
          InvoiceID: invoiceJson.InvoiceID,
          InvoiceNumber: "OIT00546",
        },
        Account: {
          AccountID: "ac993f75-035b-433c-82e0-7b7a2d40802c",
          Code: "090",
        },
        Status: "AUTHORISED",
      })
    )
    expect(p).toMatchObject({
      invoiceId: invoiceJson.InvoiceID,
      bankAccountId: "ac993f75-035b-433c-82e0-7b7a2d40802c",
      creditNoteId: null,
      date: "2018-02-15",
      amount: "500.00",
      updatedAt: null,
    })
  })
})

describe("mapBankTransaction", () => {
  it("tolerates a missing contact", () => {
    const b = mapBankTransaction(
      bankTransactionSchema.parse({
        BankTransactionID: "d20b6c54-7f5d-4ce6-ab83-55f609719126",
        Type: "SPEND",
        BankAccount: { AccountID: "ac993f75-035b-433c-82e0-7b7a2d40802c" },
        DateString: "2024-01-31T00:00:00",
        Total: 12.5,
      })
    )
    expect(b).toMatchObject({
      contactId: null,
      date: "2024-01-31",
      total: "12.50",
    })
  })
})

describe("maxUpdated", () => {
  it("returns the newest timestamp, skipping blanks", () => {
    expect(
      maxUpdated([
        { UpdatedDateUTC: "/Date(1000+0000)/" },
        { UpdatedDateUTC: null },
        { UpdatedDateUTC: "/Date(3000+0000)/" },
        { UpdatedDateUTC: "/Date(2000+0000)/" },
      ])?.getTime()
    ).toBe(3000)
  })
  it("returns null for an empty page", () => {
    expect(maxUpdated([])).toBeNull()
  })
})
