import { PageHeader } from "@/components/page-header"
import { requireDirector } from "@/lib/session"
import { SettingsTabs } from "./settings-tabs"

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await requireDirector()
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Settings" />
      <div>
        <SettingsTabs />
      </div>
      {children}
    </div>
  )
}
