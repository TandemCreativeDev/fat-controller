import { asc } from "drizzle-orm"

import { ActionForm } from "@/components/action-form"
import { Field, SelectField } from "@/components/form-fields"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Card, CardContent } from "@/components/ui/card"
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
import { FormSection } from "../form-section"
import { ItemList, type ListGroup, type ListItem } from "../item-list"

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
      submit={row ? "Save person" : "Add person"}
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
              defaultValue={row?.kind ?? "contractor"}
              options={[
                { value: "contractor", label: "Contractor" },
                { value: "director", label: "Director" },
              ]}
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
          </div>
        </FormSection>
        <FormSection title="Pay and bills">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              name="defaultRate"
              label="Default pay rate per day (£)"
              hint="Required for contractors"
              inputMode="decimal"
              defaultValue={defaultRate ?? ""}
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
        </FormSection>
      </div>
    </ActionForm>
  )
}

export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>
}) {
  await requireDirector()
  const [{ id }, people, rates, members, contacts, projects, unmapped] =
    await Promise.all([
      searchParams,
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

  const defaultRateOf = (p: Person) =>
    rates.find((r) => r.personId === p.id && !r.projectId)?.dayRateGbp
  const toItem = (p: Person): ListItem => {
    const rate = defaultRateOf(p)
    const extra = rates.filter((r) => r.personId === p.id && r.projectId).length
    return {
      id: p.id,
      title: p.name,
      figure: rate ? formatPence(rate) : undefined,
      meta: [
        `bills ${p.billTermsDays} days`,
        extra ? `${extra} project ${extra === 1 ? "rate" : "rates"}` : null,
      ]
        .filter(Boolean)
        .join(" · "),
      flag: !p.solidtimeMemberId
        ? "Not mapped to Solidtime"
        : p.kind === "contractor" && !rate
          ? "No pay rate"
          : undefined,
    }
  }
  const groups: ListGroup[] = [
    {
      label: "Contractors",
      items: people.filter((p) => p.kind === "contractor").map(toItem),
    },
    {
      label: "Directors",
      items: people.filter((p) => p.kind !== "contractor").map(toItem),
    },
  ]
  const firstId = groups.find((g) => g.items.length > 0)?.items[0].id
  const row =
    id === "new"
      ? undefined
      : (people.find((p) => p.id === id) ??
        people.find((p) => p.id === firstId))
  const selected = row?.id ?? "new"
  const projectRates = row
    ? rates.filter((r) => r.personId === row.id && r.projectId)
    : []

  return (
    <div className="flex flex-col gap-4">
      {unmapped.members.length > 0 && (
        <Alert>
          <AlertTitle>Solidtime members not mapped</AlertTitle>
          <AlertDescription>
            {unmapped.members.map((m) => m.name).join(", ")}
          </AlertDescription>
        </Alert>
      )}
      <div className="grid items-start gap-4 lg:grid-cols-[22rem_1fr]">
        <ItemList
          groups={groups}
          selected={selected}
          basePath="/settings/people"
          noun="people"
          addLabel="New person"
        />
        <Card>
          <CardContent className="flex flex-col gap-4">
            <h2 className="font-heading text-lg font-semibold">
              {row ? row.name : "New person"}
            </h2>
            <PersonForm
              key={selected}
              row={row}
              defaultRate={row ? defaultRateOf(row) : undefined}
              members={memberOptions}
              contacts={contactOptions}
            />
            {row?.kind === "contractor" && (
              <FormSection
                title="Project pay rates"
                hint="These replace the default pay rate on that project."
              >
                {projectRates.length > 0 && (
                  <ul className="flex flex-col gap-1">
                    {projectRates.map((r) => (
                      <li
                        key={r.id}
                        className="grid grid-cols-[1fr_auto_auto] items-center gap-3 text-sm"
                      >
                        <span>{projectName.get(r.projectId!)}</span>
                        <span className="font-mono tabular-nums">
                          {formatPence(r.dayRateGbp)}
                        </span>
                        <ActionForm
                          action={deleteProjectRate}
                          submit="Remove"
                          variant="ghost"
                        >
                          <input type="hidden" name="id" value={r.id} />
                        </ActionForm>
                      </li>
                    ))}
                  </ul>
                )}
                {projectOptions.length > 0 && (
                  <ActionForm
                    key={`rate-${row.id}`}
                    action={saveProjectRate}
                    submit="Add rate"
                    resetOnSuccess
                  >
                    <input type="hidden" name="personId" value={row.id} />
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
              </FormSection>
            )}
            {row && (
              <div className="border-t border-border/60 pt-3">
                <ActionForm
                  key={`delete-${row.id}`}
                  action={deletePerson}
                  submit="Delete person"
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
