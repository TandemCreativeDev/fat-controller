import { asc } from "drizzle-orm"

import { ActionForm } from "@/components/action-form"
import { Field, SelectField } from "@/components/form-fields"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Card, CardContent } from "@/components/ui/card"
import { db } from "@/db"
import {
  project,
  projectSolidtime,
  solidtimeProject,
  xeroContact,
} from "@/db/schema"
import { londonDate } from "@/lib/forecast"
import { unmappedSolidtime } from "@/lib/forecast-store"
import { formatDay, formatPence } from "@/lib/format"
import { requireDirector } from "@/lib/session"
import { deleteProject, saveProject } from "../forecast-actions"
import { FormSection } from "../form-section"
import { ItemList, type ListGroup, type ListItem } from "../item-list"

type Project = typeof project.$inferSelect
type Option = { value: string; label: string }
type SolidtimeOption = Option & { usedBy: string | null }

function ProjectForm({
  row,
  mapped,
  contacts,
  solidtime,
}: {
  row?: Project
  mapped: string[]
  contacts: Option[]
  solidtime: SolidtimeOption[]
}) {
  const ordered = [
    ...solidtime.filter((o) => mapped.includes(o.value)),
    ...solidtime.filter((o) => !mapped.includes(o.value) && !o.usedBy),
    ...solidtime.filter((o) => !mapped.includes(o.value) && o.usedBy),
  ]
  return (
    <ActionForm
      action={saveProject}
      submit={row ? "Save project" : "Add project"}
      resetOnSuccess={!row}
    >
      {row && <input type="hidden" name="id" value={row.id} />}
      <div className="grid items-start gap-4 xl:grid-cols-2">
        <FormSection title="Details">
          <div className="grid gap-3 sm:grid-cols-2">
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
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="active"
              defaultChecked={row?.active ?? true}
            />
            Active
          </label>
        </FormSection>
        <FormSection title="Invoicing">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              name="chargeRateGbp"
              label="Charge rate per day (£)"
              inputMode="decimal"
              defaultValue={row?.chargeRateGbp ?? ""}
            />
            <Field
              name="invoiceIntervalDays"
              label="Invoice every (days)"
              type="number"
              min={1}
              defaultValue={row?.invoiceIntervalDays ?? 14}
            />
            <Field
              name="invoiceAnchorDate"
              label="Invoice anchor date"
              type="date"
              defaultValue={row?.invoiceAnchorDate ?? ""}
            />
            <Field
              name="paymentTermsDays"
              label="Payment terms (days)"
              type="number"
              min={0}
              defaultValue={row?.paymentTermsDays ?? 30}
            />
            <Field
              name="endDate"
              label="End date"
              hint="Optional. No work is forecast after this"
              type="date"
              defaultValue={row?.endDate ?? ""}
            />
          </div>
        </FormSection>
        <FormSection
          title="One-off invoice dates"
          hint="YYYY-MM-DD, separated by commas"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              name="extraInvoiceDates"
              label="Extra dates"
              defaultValue={row?.extraInvoiceDates.join(", ") ?? ""}
            />
            <Field
              name="skippedInvoiceDates"
              label="Skipped dates"
              defaultValue={row?.skippedInvoiceDates.join(", ") ?? ""}
            />
          </div>
        </FormSection>
        <FormSection
          title={`Solidtime projects (${mapped.length} linked)`}
          hint="Linked ones are listed first. A Solidtime project can only belong to one project."
        >
          <div className="grid max-h-56 gap-1 overflow-y-auto sm:grid-cols-2">
            {ordered.map((o) => (
              <label
                key={o.value}
                className="flex items-center gap-2 text-sm has-disabled:text-muted-foreground"
              >
                <input
                  type="checkbox"
                  name="solidtimeProjectIds"
                  value={o.value}
                  defaultChecked={mapped.includes(o.value)}
                  disabled={Boolean(o.usedBy) && !mapped.includes(o.value)}
                />
                <span className="truncate">
                  {o.label}
                  {o.usedBy && !mapped.includes(o.value)
                    ? ` (on ${o.usedBy})`
                    : ""}
                </span>
              </label>
            ))}
          </div>
        </FormSection>
      </div>
    </ActionForm>
  )
}

const titleOf = (p: Project) => (p.code ? `${p.code} · ${p.name}` : p.name)

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>
}) {
  await requireDirector()
  const [{ id }, projects, maps, contacts, solidtime, unmapped] =
    await Promise.all([
      searchParams,
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
  const contactName = new Map(contacts.map((c) => [c.id, c.name]))
  const today = londonDate(new Date())
  const linkedTo = (p: Project) =>
    maps.filter((m) => m.projectId === p.id).map((m) => m.solidtimeProjectId)
  const owner = new Map(
    maps.map((m) => [
      m.solidtimeProjectId,
      projects.find((p) => p.id === m.projectId)?.name ?? null,
    ])
  )

  const toItem = (p: Project): ListItem => ({
    id: p.id,
    title: titleOf(p),
    figure:
      p.kind === "client" && p.chargeRateGbp
        ? formatPence(p.chargeRateGbp)
        : undefined,
    meta: [
      p.xeroContactId ? contactName.get(p.xeroContactId) : null,
      p.kind === "client" ? `every ${p.invoiceIntervalDays} days` : null,
      p.endDate
        ? `${p.endDate < today ? "ended" : "ends"} ${formatDay(p.endDate)}`
        : null,
    ]
      .filter(Boolean)
      .join(" · "),
    flag: !p.active
      ? undefined
      : linkedTo(p).length === 0
        ? "No Solidtime project linked"
        : p.kind === "client" && !p.chargeRateGbp
          ? "No charge rate"
          : undefined,
  })
  const groups: ListGroup[] = [
    {
      label: "Client",
      items: projects
        .filter((p) => p.active && p.kind === "client")
        .map(toItem),
    },
    {
      label: "Internal",
      items: projects
        .filter((p) => p.active && p.kind !== "client")
        .map(toItem),
    },
    { label: "Inactive", items: projects.filter((p) => !p.active).map(toItem) },
  ]

  const firstId = groups.find((g) => g.items.length > 0)?.items[0].id
  const row =
    id === "new"
      ? undefined
      : (projects.find((p) => p.id === id) ??
        projects.find((p) => p.id === firstId))
  const selected = row?.id ?? "new"
  const mapped = row ? linkedTo(row) : []
  const solidtimeOptions = solidtime.map((p) => ({
    value: p.id,
    label: p.isArchived ? `${p.name} (archived)` : p.name,
    usedBy: owner.get(p.id) ?? null,
  }))

  return (
    <div className="flex flex-col gap-4">
      {unmapped.projects.length > 0 && (
        <Alert>
          <AlertTitle>Solidtime projects not mapped</AlertTitle>
          <AlertDescription>
            {unmapped.projects.map((p) => p.name).join(", ")}
          </AlertDescription>
        </Alert>
      )}
      <div className="grid items-start gap-4 lg:grid-cols-[22rem_1fr]">
        <ItemList
          groups={groups}
          selected={selected}
          basePath="/settings/projects"
          noun="projects"
          addLabel="New project"
        />
        <Card>
          <CardContent className="flex flex-col gap-4">
            <h2 className="font-heading text-lg font-semibold">
              {row ? titleOf(row) : "New project"}
            </h2>
            <ProjectForm
              key={selected}
              row={row}
              mapped={mapped}
              contacts={contactOptions}
              solidtime={solidtimeOptions}
            />
            {row && (
              <div className="border-t border-border/60 pt-3">
                <ActionForm
                  key={`delete-${row.id}`}
                  action={deleteProject}
                  submit="Delete project"
                  variant="ghost"
                >
                  <input type="hidden" name="id" value={row.id} />
                </ActionForm>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
