"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { ChevronDown, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  advanceStageAction,
  contactLeadAction,
  confirmVisitAction,
  markJobScheduledAction,
  markLostAction,
  markQuoteAcceptedAction,
  markQuoteSentAction,
  moveToQuoteAction,
  sendFollowUpAction,
} from "@/app/(app)/sales-pipeline/actions"
import {
  getContactDraft,
  getContactFollowUpDraft,
  getFollowUpDraft,
} from "@/lib/sales-lead-templates"
import {
  BOARD_STAGES,
  BOARD_STAGE_COLORS,
  formatActivityType,
  formatDateTime,
  fromDatetimeLocalValue,
  getBoardStageIndex,
  getFollowUpBadge,
  parseNotes,
  toDatetimeLocalValue,
  type SalesLead,
} from "@/lib/sales-leads"

function contactSubject(lead: SalesLead) {
  const service = lead.service_needed?.trim().toLowerCase() || "garden"
  return `Your ${service} enquiry — Pristine Gardens`
}

type ModalKind =
  | "contact"
  | "confirm_visit"
  | "create_quote"
  | "schedule_job"
  | "follow_up"
  | "mark_lost"
  | null

type ActionResult = { ok: true } | { error: string }

// Slice 3: stage actions & advancement. Each stage's primary action advances
// sales_leads.status through a server action and logs to the activity thread.
// Advancement is manual (spec §7) — nothing moves on inbound replies.
export function PipelineRow({ lead }: { lead: SalesLead }) {
  const [expanded, setExpanded] = useState(false)
  const [modal, setModal] = useState<ModalKind>(null)
  const [subject, setSubject] = useState("")
  const [body, setBody] = useState("")
  const [visitAt, setVisitAt] = useState("")
  const [lostReason, setLostReason] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const stageIndex = getBoardStageIndex(lead.status)
  const activities = parseNotes(lead.notes)
  const accepted = Boolean(lead.quote_accepted_at)
  const followUpBadge = getFollowUpBadge(lead)
  const stageColors = BOARD_STAGE_COLORS[BOARD_STAGES[stageIndex].key]
  // Red "needs action" dot: display-only for now — shown on the four stages
  // whose card carries a primary action (columns 1–4). Wiring it to real
  // per-lead conditions (e.g. overdue follow-ups) is a later slice.
  const needsAction = stageIndex <= 3

  const openModal = (kind: Exclude<ModalKind, null>) => {
    setError(null)

    if (kind === "contact") {
      setSubject(contactSubject(lead))
      setBody(getContactDraft(lead))
    } else if (kind === "follow_up") {
      if (lead.status === "contacted") {
        setSubject("Following up on your enquiry — Pristine Gardens")
        setBody(getContactFollowUpDraft(lead))
      } else {
        setSubject("Following up on your quote — Pristine Gardens")
        setBody(getFollowUpDraft(lead))
      }
    } else if (kind === "confirm_visit") {
      setVisitAt(toDatetimeLocalValue(lead.site_visit_at))
    } else if (kind === "mark_lost") {
      setLostReason(lead.lost_reason || "")
    }

    setModal(kind)
  }

  const closeModal = () => {
    setModal(null)
    setError(null)
  }

  const run = (action: () => Promise<ActionResult>) => {
    setError(null)

    startTransition(async () => {
      try {
        const result = await action()

        if ("error" in result) {
          setError(result.error)
          return
        }

        setModal(null)
      } catch {
        setError("Something went wrong. Please try again.")
      }
    })
  }

  const handleConfirmVisit = () => {
    const siteVisitAt = fromDatetimeLocalValue(visitAt)

    if (!siteVisitAt) {
      setError("Enter a visit date and time.")
      return
    }

    run(() => confirmVisitAction(lead.id, siteVisitAt))
  }

  const copyDraft = async () => {
    try {
      await navigator.clipboard.writeText(body)
    } catch {
      setError("Could not copy the draft to the clipboard.")
    }
  }

  // The stage's primary action(s), rendered inside the compact card.
  const renderStageActions = () => {
    switch (lead.status) {
      case "new":
        return (
          <ActionButton label="Contact" onClick={() => openModal("contact")} />
        )
      case "contacted":
        return (
          <ActionButton
            label="Confirm visit"
            onClick={() => openModal("confirm_visit")}
          />
        )
      case "visit_booked":
        return (
          <>
            {lead.site_visit_at ? (
              <p className="mt-2 text-xs text-gray-600">
                {formatDateTime(lead.site_visit_at)}
              </p>
            ) : null}
            <ActionButton
              label="Move to quote"
              disabled={pending}
              onClick={() => run(() => moveToQuoteAction(lead.id))}
            />
          </>
        )
      case "estimate_done":
        return (
          <ActionButton
            label="Create + send quote"
            onClick={() => openModal("create_quote")}
          />
        )
      case "quote_sent":
      case "follow_up_due":
        return (
          <>
            {accepted ? (
              <p className="mt-2 text-xs font-medium text-green-700">
                Accepted ✓
              </p>
            ) : (
              <ActionButton
                label="Mark accepted"
                disabled={pending}
                onClick={() => run(() => markQuoteAcceptedAction(lead.id))}
              />
            )}
            <ActionButton
              label="Schedule job"
              disabled={!accepted || pending}
              title={accepted ? undefined : "Enabled once the quote is accepted"}
              onClick={() => openModal("schedule_job")}
            />
          </>
        )
      default:
        // scheduled / won / completed: read-only visibility, no card action.
        return null
    }
  }

  return (
    <div className="border-b last:border-b-0">
      <div className="grid grid-cols-6">
        {BOARD_STAGES.map((stage, index) => (
          <div
            key={stage.key}
            className="flex min-h-[92px] items-center justify-center px-2 py-3"
          >
            {index === stageIndex ? (
              <div
                className={`relative w-full max-w-[190px] overflow-hidden rounded-lg border bg-white p-3 pl-4 shadow-sm transition-colors ${
                  expanded ? "border-gray-900" : "border-gray-300"
                }`}
              >
                <span
                  aria-hidden
                  className={`absolute inset-y-0 left-0 w-1.5 ${stageColors.bar}`}
                />
                <button
                  type="button"
                  onClick={() => setExpanded((value) => !value)}
                  aria-expanded={expanded}
                  className="flex w-full items-start gap-2 text-left"
                >
                  {expanded ? (
                    <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" />
                  ) : (
                    <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-sm font-semibold text-gray-900">
                      {lead.name}
                    </span>
                    {lead.suburb?.trim() ? (
                      <span className="mt-0.5 block break-words text-xs text-gray-500">
                        {lead.suburb}
                      </span>
                    ) : null}
                    {lead.service_needed?.trim() ? (
                      <span className="mt-0.5 block break-words text-xs text-gray-600">
                        {lead.service_needed}
                      </span>
                    ) : null}
                    {!lead.suburb?.trim() && !lead.service_needed?.trim() ? (
                      <span className="mt-0.5 block text-xs text-gray-400">
                        Details not set
                      </span>
                    ) : null}
                  </span>
                  {needsAction ? (
                    <span
                      className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-red-500"
                      aria-label="This stage needs action"
                      title="This stage needs action"
                    />
                  ) : null}
                </button>

                {followUpBadge ? (
                  <span
                    className={`mt-2 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                      followUpBadge.kind === "due"
                        ? "bg-orange-100 text-orange-800"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {followUpBadge.label}
                  </span>
                ) : null}

                {renderStageActions()}

                {followUpBadge?.kind === "due" ? (
                  <ActionButton
                    label="Send follow-up"
                    onClick={() => openModal("follow_up")}
                  />
                ) : null}

                {error && modal === null ? (
                  <p className="mt-2 text-xs text-red-600">{error}</p>
                ) : null}
              </div>
            ) : index < stageIndex ? (
              <span
                className="h-3.5 w-3.5 rounded-full bg-green-200"
                aria-label={`${stage.label} completed`}
                title={`${stage.label} completed`}
              />
            ) : null}
          </div>
        ))}
      </div>

      {expanded ? (
        <div className="border-t bg-gray-50 px-4 py-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <DrawerField label="Source" value={lead.source} />
            <DrawerField
              label="Current stage"
              value={BOARD_STAGES[stageIndex]?.label}
            />
            <DrawerField
              label="Site visit"
              value={
                lead.site_visit_at ? formatDateTime(lead.site_visit_at) : null
              }
            />
            <DrawerField
              label="Quote accepted"
              value={
                lead.quote_accepted_at
                  ? formatDateTime(lead.quote_accepted_at)
                  : null
              }
            />
          </div>

          <section className="mt-4">
            <h4 className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Enquiry / notes
            </h4>
            {lead.message?.trim() ? (
              <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700">
                {lead.message}
              </p>
            ) : (
              <p className="mt-1 text-sm text-gray-500">
                No enquiry notes recorded.
              </p>
            )}
          </section>

          <section className="mt-4">
            <h4 className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Message thread
            </h4>
            <p className="mt-1 text-xs text-gray-400">
              No dedicated message-thread field exists yet — showing the lead
              activity log (<code>sales_leads.notes</code>), which includes any
              logged communications. A true send/reply thread is a later slice.
            </p>
            {activities.length === 0 ? (
              <p className="mt-2 text-sm text-gray-500">No activity logged.</p>
            ) : (
              <ul className="mt-2 space-y-3">
                {activities.map((entry) => (
                  <li
                    key={entry.id}
                    className="border-l-2 border-gray-200 pl-3"
                  >
                    <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                      <span className="font-medium text-gray-700">
                        {formatActivityType(entry.type)}
                      </span>
                      <span>{formatDateTime(entry.created_at)}</span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700">
                      {entry.content}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <div className="mt-4 flex flex-wrap gap-2">
            {stageIndex < BOARD_STAGES.length - 1 ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending}
                title="Move to the next stage without sending anything — for steps already handled by phone/text/in person"
                onClick={() => run(() => advanceStageAction(lead.id))}
              >
                Advance stage (no action)
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => openModal("mark_lost")}
            >
              Mark lost
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled
              title="Coming in a later slice"
            >
              Edit details
            </Button>
          </div>
        </div>
      ) : null}

      {/* --- Modals (rendered only while open) --------------------------- */}

      {modal === "contact" ? (
        <Dialog open onOpenChange={(open) => !open && closeModal()}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Contact {lead.name}</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-gray-500">
              Review and edit before sending. The email is queued and sent by
              the existing Make scenario
              {lead.email ? ` to ${lead.email}` : ""}.
            </p>
            <label className="grid gap-2 text-sm">
              <span className="font-medium text-gray-900">Subject</span>
              <Input
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
              />
            </label>
            <Textarea
              className="min-h-[260px]"
              value={body}
              onChange={(event) => setBody(event.target.value)}
            />
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            <DialogFooter className="gap-2 sm:justify-between">
              <Button type="button" variant="outline" onClick={copyDraft}>
                Copy draft
              </Button>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={closeModal}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    run(() => contactLeadAction(lead.id, { subject, body }))
                  }
                >
                  {pending ? "Sending…" : "Send + mark contacted"}
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}

      {modal === "follow_up" ? (
        <Dialog open onOpenChange={(open) => !open && closeModal()}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Follow up with {lead.name}</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-gray-500">
              Review and edit before sending. The email is queued and sent by
              the existing Make scenario
              {lead.email ? ` to ${lead.email}` : ""}.
            </p>
            <label className="grid gap-2 text-sm">
              <span className="font-medium text-gray-900">Subject</span>
              <Input
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
              />
            </label>
            <Textarea
              className="min-h-[220px]"
              value={body}
              onChange={(event) => setBody(event.target.value)}
            />
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            <DialogFooter className="gap-2 sm:justify-between">
              <Button type="button" variant="outline" onClick={copyDraft}>
                Copy draft
              </Button>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={closeModal}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    run(() => sendFollowUpAction(lead.id, { subject, body }))
                  }
                >
                  {pending ? "Sending…" : "Send follow-up"}
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}

      {modal === "confirm_visit" ? (
        <Dialog open onOpenChange={(open) => !open && closeModal()}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirm visit for {lead.name}</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-gray-500">
              Enter the date and time agreed with the client.
            </p>
            <label className="grid gap-2 text-sm">
              <span className="font-medium text-gray-900">
                Visit date &amp; time
              </span>
              <Input
                type="datetime-local"
                value={visitAt}
                onChange={(event) => setVisitAt(event.target.value)}
              />
            </label>
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeModal}>
                Cancel
              </Button>
              <Button
                type="button"
                disabled={pending}
                onClick={handleConfirmVisit}
              >
                {pending ? "Saving…" : "Confirm visit"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}

      {modal === "create_quote" ? (
        <Dialog open onOpenChange={(open) => !open && closeModal()}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create + send quote for {lead.name}</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-gray-500">
              Build and send the quote in the{" "}
              <Link
                href="/admin/quotes"
                className="font-medium text-gray-900 underline"
                target="_blank"
              >
                quote builder
              </Link>
              , then mark it sent here. A follow-up reminder is set for 2 days
              from now. (Leads link to quotes automatically in a later phase.)
            </p>
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeModal}>
                Cancel
              </Button>
              <Button
                type="button"
                disabled={pending}
                onClick={() => run(() => markQuoteSentAction(lead.id))}
              >
                {pending ? "Saving…" : "Mark quote sent"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}

      {modal === "schedule_job" ? (
        <Dialog open onOpenChange={(open) => !open && closeModal()}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Schedule job for {lead.name}</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-gray-500">
              Book the job from the accepted quote in the{" "}
              <Link
                href="/admin/quotes"
                className="font-medium text-gray-900 underline"
                target="_blank"
              >
                quote builder
              </Link>{" "}
              (its Schedule action creates the scheduled job), then confirm
              here to move this lead to Job scheduled.
            </p>
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeModal}>
                Cancel
              </Button>
              <Button
                type="button"
                disabled={pending}
                onClick={() => run(() => markJobScheduledAction(lead.id))}
              >
                {pending ? "Saving…" : "Mark job scheduled"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}

      {modal === "mark_lost" ? (
        <Dialog open onOpenChange={(open) => !open && closeModal()}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Mark {lead.name} as lost</DialogTitle>
            </DialogHeader>
            <label className="grid gap-2 text-sm">
              <span className="font-medium text-gray-900">Lost reason</span>
              <Textarea
                value={lostReason}
                onChange={(event) => setLostReason(event.target.value)}
                placeholder="e.g. Went with another provider, budget, timing"
              />
            </label>
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeModal}>
                Cancel
              </Button>
              <Button
                type="button"
                disabled={pending}
                onClick={() => run(() => markLostAction(lead.id, lostReason))}
              >
                {pending ? "Saving…" : "Mark lost"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  )
}

function ActionButton({
  label,
  onClick,
  disabled,
  title,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  title?: string
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="mt-2 h-8 w-full text-xs"
      disabled={disabled}
      title={title}
      onClick={onClick}
    >
      {label}
    </Button>
  )
}

function DrawerField({
  label,
  value,
}: {
  label: string
  value: string | null | undefined
}) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
        {label}
      </p>
      <p className="mt-1 text-sm text-gray-900">{value?.trim() || "—"}</p>
    </div>
  )
}
