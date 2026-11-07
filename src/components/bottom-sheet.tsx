"use client"

import { Dialog } from "@base-ui/react/dialog"
import { X } from "lucide-react"
import { createContext, useContext } from "react"

import { Button } from "@/components/ui/button"
import { useIsMobile } from "@/hooks/use-is-mobile"

const InSheet = createContext(false)

/** True inside a sheet, so a form pins its primary action to the bottom. */
export const useInSheet = () => useContext(InSheet)

/** A full-height sheet for an edit flow on mobile. */
export function BottomSheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/60" />
        <Dialog.Popup className="fixed inset-0 z-50 flex flex-col bg-background pt-[env(safe-area-inset-top)] outline-none">
          <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-1">
            <Dialog.Title className="min-w-0 font-heading text-base font-semibold">
              {title}
            </Dialog.Title>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Close"
              onClick={onClose}
            >
              <X aria-hidden />
            </Button>
          </header>
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pt-4 [&>*]:flex [&>*]:flex-1 [&>*]:flex-col">
            <InSheet.Provider value={true}>{children}</InSheet.Provider>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

/** An edit flow: in place on desktop, a bottom sheet on mobile. */
export function EditSurface({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
}) {
  const mobile = useIsMobile()
  if (!open) return null
  return mobile ? (
    <BottomSheet open onClose={onClose} title={title}>
      {children}
    </BottomSheet>
  ) : (
    children
  )
}
