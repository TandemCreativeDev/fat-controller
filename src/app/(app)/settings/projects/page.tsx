import { asc } from "drizzle-orm"
import Link from "next/link"

import { ActionForm } from "@/components/action-form"
import { Field, SelectField } from "@/components/form-fields"
import { PageHeader } from "@/components/page-header"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { db } from "@/db"
import {
  project,
  projectSolidtime,
  solidtimeProject,
  xeroContact,
} from "@/db/schema"
import { unmappedSolidtime } from "@/lib/forecast-store"
import { requireDirector } from "@/lib/session"
import { deleteProject, saveProject } from "../forecast-actions"

type Project = typeof project.$inferSelect
type Option = { value: string; label: string }

function ProjectForm({
  row,
  mapped,
  contacts,
  solidtime,
}: {
  row?: Project
  mapped: string[]
  contacts: Option[]
  solidtime: Option[]
}) {
  return (
    <ActionForm
      action={saveProject}
      submit={row ? "Save" : "Add project"}
      resetOnSuccess={!row}
    >
      {row && <input type="hidden" name="id" value={row.id} />}
      <div className="grid gap-3 sm:grid-cols-3">
        <Field name="name" label="Name" defaultValue={row?.name} required />
        <SelectField
          name="kind"
          label="Kind"
          defaultValue={row?.kind ?? "client"}
          options={[
            { value: "client", label: "Client" },
            { value: "internal", label: "Internal (no invoices)" },
          ]}
        />
        <Field
          name="code"
          label="Code"
          hint="Invoice number prefix: <code>-I<n>"
          defaultValue={row?.code ?? ""}
        />
        <SelectField
          name="xeroContactId"
          label="Xero contact"
          defaultValue={row?.xeroContactId ?? ""}
          options={[{ value: "", label: "None" }, ...contacts]}
        />
        <Field
          name="chargeRateGbp"
          label="Charge rate per day (£)"
          inputMode="decimal"
          defaultValue={row?.chargeRateGbp ?? ""}
        />
        <Field
          name="invoiceAnchorDate"
          label="Invoice anchor date"
          type="date"
          defaultValue={row?.invoiceAnchorDate ?? ""}
        />
        <Field
          name="invoiceIntervalDays"
          label="Invoice every (days)"
          type="number"
          min={1}
          defaultValue={row?.invoiceIntervalDays ?? 14}
        />
        <Field
          name="paymentTermsDays"
          label="Payment terms (days)"
          type="number"
          min={0}
          defaultValue={row?.paymentTermsDays ?? 30}
        />
        <Field
          name="extraInvoiceDates"
          label="Extra invoice dates"
          hint="YYYY-MM-DD, separated by commas"
          defaultValue={row?.extraInvoiceDates.join(", ") ?? ""}
        />
        <Field
          name="skippedInvoiceDates"
          label="Skipped invoice dates"
          hint="YYYY-MM-DD, separated by commas"
          defaultValue={row?.skippedInvoiceDates.join(", ") ?? ""}
        />
        <label className="flex items-center gap-2 self-center text-sm">
          <input
            type="checkbox"
            name="active"
            defaultChecked={row?.active ?? true}
          />
          Active
        </label>
      </div>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1 text-sm font-medium">Solidtime projects</legend>
        <div className="grid gap-1 sm:grid-cols-3">
          {solidtime.map((o) => (
            <label key={o.value} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="solidtimeProjectIds"
                value={o.value}
                defaultChecked={mapped.includes(o.value)}
              />
              {o.label}
            </label>
          ))}
        </div>
      </fieldset>
    </ActionForm>
  )
}

export default async function ProjectsPage() {
  await requireDirector()
  const [projects, maps, contacts, solidtime, unmapped] = await Promise.all([
    db.select().from(project).orderBy(asc(project.code), asc(project.name)),
    db.select().from(projectSolidtime),
    db
      .select({ id: xeroContact.contactId, name: xeroContact.name })
      .from(xeroContact)
      .orderBy(asc(xeroContact.name)),
    db.select().from(solidtimeProject).orderBy(asc(solidtimeProject.name)),
    unmappedSolidtime(),
  ])
  const contactOptions = contacts.map((c) => ({ value: c.id, label: c.name }))
  const solidtimeOptions = solidtime.map((p) => ({
    value: p.id,
    label: p.isArchived ? `${p.name} (archived)` : p.name,
  }))

  return (
    <div className="flex max-w-4xl flex-col gap-8">
      <PageHeader
        title="Projects"
        lede="Charge rates, invoice dates and payment terms for the forecast."
        note={
          <Link href="/settings" className="underline">
            Back to Settings
          </Link>
        }
      />
      {unmapped.projects.length > 0 && (
        <Alert>
          <AlertTitle>Solidtime projects not mapped</AlertTitle>
          <AlertDescription>
            {unmapped.projects.map((p) => p.name).join(", ")}
          </AlertDescription>
        </Alert>
      )}
      <Card>
        <CardHeader>
          <CardTitle>New project</CardTitle>
        </CardHeader>
        <CardContent>
          <ProjectForm
            mapped={[]}
            contacts={contactOptions}
            solidtime={solidtimeOptions}
          />
        </CardContent>
      </Card>
      {projects.map((p) => (
        <Card key={p.id}>
          <CardHeader>
            <CardTitle>{p.code ? `${p.code} · ${p.name}` : p.name}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <ProjectForm
              row={p}
              mapped={maps
                .filter((m) => m.projectId === p.id)
                .map((m) => m.solidtimeProjectId)}
              contacts={contactOptions}
              solidtime={solidtimeOptions}
            />
            <ActionForm
              action={deleteProject}
              submit="Delete project"
              variant="ghost"
            >
              <input type="hidden" name="id" value={p.id} />
            </ActionForm>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
