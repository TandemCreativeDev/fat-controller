import { asc } from "drizzle-orm"
import Link from "next/link"

import { ActionForm } from "@/components/action-form"
import { Field, SelectField } from "@/components/form-fields"
import { PageHeader } from "@/components/page-header"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { db } from "@/db"
import {
  payRate,
  person,
  project,
  solidtimeMember,
  xeroContact,
} from "@/db/schema"
import { unmappedSolidtime } from "@/lib/forecast-store"
import { formatPence } from "@/lib/format"
import { requireDirector } from "@/lib/session"
import {
  deletePerson,
  deleteProjectRate,
  savePerson,
  saveProjectRate,
} from "../forecast-actions"

type Person = typeof person.$inferSelect
type Option = { value: string; label: string }

function PersonForm({
  row,
  defaultRate,
  members,
  contacts,
}: {
  row?: Person
  defaultRate?: string
  members: Option[]
  contacts: Option[]
}) {
  return (
    <ActionForm
      action={savePerson}
      submit={row ? "Save" : "Add person"}
      resetOnSuccess={!row}
    >
      {row && <input type="hidden" name="id" value={row.id} />}
      <div className="grid gap-3 sm:grid-cols-3">
        <Field name="name" label="Name" defaultValue={row?.name} required />
        <SelectField
          name="kind"
          label="Kind"
          defaultValue={row?.kind ?? "contractor"}
          options={[
            { value: "contractor", label: "Contractor" },
            { value: "director", label: "Director" },
          ]}
        />
        <Field
          name="defaultRate"
          label="Default pay rate per day (£)"
          hint="Required for contractors"
          inputMode="decimal"
          defaultValue={defaultRate ?? ""}
        />
        <SelectField
          name="solidtimeMemberId"
          label="Solidtime member"
          defaultValue={row?.solidtimeMemberId ?? ""}
          options={[{ value: "", label: "Not mapped" }, ...members]}
        />
        <SelectField
          name="xeroContactId"
          label="Xero contact"
          defaultValue={row?.xeroContactId ?? ""}
          options={[{ value: "", label: "None" }, ...contacts]}
        />
        <Field
          name="billTermsDays"
          label="Bill terms (days)"
          type="number"
          min={0}
          defaultValue={row?.billTermsDays ?? 30}
        />
        <Field
          name="billCutoffDays"
          label="Bill covers work up to (days before)"
          type="number"
          min={0}
          defaultValue={row?.billCutoffDays ?? 7}
        />
      </div>
    </ActionForm>
  )
}

export default async function PeoplePage() {
  await requireDirector()
  const [people, rates, members, contacts, projects, unmapped] =
    await Promise.all([
      db.select().from(person).orderBy(asc(person.name)),
      db.select().from(payRate),
      db.select().from(solidtimeMember).orderBy(asc(solidtimeMember.name)),
      db
        .select({ id: xeroContact.contactId, name: xeroContact.name })
        .from(xeroContact)
        .orderBy(asc(xeroContact.name)),
      db.select().from(project).orderBy(asc(project.name)),
      unmappedSolidtime(),
    ])
  const memberOptions = members.map((m) => ({
    value: m.id,
    label: m.isPlaceholder ? `${m.name} (placeholder)` : m.name,
  }))
  const contactOptions = contacts.map((c) => ({ value: c.id, label: c.name }))
  const projectOptions = projects.map((p) => ({ value: p.id, label: p.name }))
  const projectName = new Map(projects.map((p) => [p.id, p.name]))

  return (
    <div className="flex max-w-4xl flex-col gap-8">
      <PageHeader
        title="People"
        lede="Directors and contractors, their pay rates and Solidtime members."
        note={
          <Link href="/settings" className="underline">
            Back to Settings
          </Link>
        }
      />
      {unmapped.members.length > 0 && (
        <Alert>
          <AlertTitle>Solidtime members not mapped</AlertTitle>
          <AlertDescription>
            {unmapped.members.map((m) => m.name).join(", ")}
          </AlertDescription>
        </Alert>
      )}
      <Card>
        <CardHeader>
          <CardTitle>New person</CardTitle>
        </CardHeader>
        <CardContent>
          <PersonForm members={memberOptions} contacts={contactOptions} />
        </CardContent>
      </Card>
      {people.map((p) => {
        const mine = rates.filter((r) => r.personId === p.id)
        const projectRates = mine.filter((r) => r.projectId)
        return (
          <Card key={p.id}>
            <CardHeader>
              <CardTitle>{p.name}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <PersonForm
                row={p}
                defaultRate={mine.find((r) => !r.projectId)?.dayRateGbp}
                members={memberOptions}
                contacts={contactOptions}
              />
              {p.kind === "contractor" && (
                <div className="flex flex-col gap-3 border-t border-border/60 pt-4">
                  <p className="text-sm font-medium">Project pay rates</p>
                  {projectRates.map((r) => (
                    <ActionForm
                      key={r.id}
                      action={deleteProjectRate}
                      submit="Remove"
                      variant="ghost"
                      className="flex-row items-center gap-3"
                    >
                      <input type="hidden" name="id" value={r.id} />
                      <span className="text-sm">
                        {projectName.get(r.projectId!)}:{" "}
                        {formatPence(r.dayRateGbp)} a day
                      </span>
                    </ActionForm>
                  ))}
                  {projectOptions.length > 0 && (
                    <ActionForm
                      action={saveProjectRate}
                      submit="Add rate"
                      resetOnSuccess
                    >
                      <input type="hidden" name="personId" value={p.id} />
                      <div className="grid gap-3 sm:grid-cols-2">
                        <SelectField
                          name="projectId"
                          label="Project"
                          options={projectOptions}
                        />
                        <Field
                          name="dayRateGbp"
                          label="Pay rate per day (£)"
                          inputMode="decimal"
                          required
                        />
                      </div>
                    </ActionForm>
                  )}
                </div>
              )}
              <ActionForm
                action={deletePerson}
                submit="Delete person"
                variant="ghost"
              >
                <input type="hidden" name="id" value={p.id} />
              </ActionForm>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
