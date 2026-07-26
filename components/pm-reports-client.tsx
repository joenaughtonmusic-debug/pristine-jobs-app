"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Spinner } from "@/components/ui/spinner"
import { ChevronDown, ChevronRight, MapPin, Send } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import {
  SEVERITY_BADGE_CLASSES,
  SEVERITY_LABELS,
  type WalkAroundSeverity,
} from "@/lib/walk-around"

export type PmReportIssue = {
  id: string
  publicUrl: string | null
  caption: string
  severity: string
}

export type PmReportRow = {
  visitId: string
  visitDate: string // YYYY-MM-DD, for sorting
  visitDateLabel: string
  clientName: string
  address: string
  pmName: string | null
  pmEmail: string | null
  issues: PmReportIssue[]
  worst: WalkAroundSeverity | null
  everSent: boolean
  lastSentAtLabel: string | null
  lastSentTo: string | null
  lastError: string | null
}

type SendState =
  | { step: "idle" }
  | { step: "confirm" }
  | { step: "sending" }
  | { step: "sent"; message: string }
  | { step: "error"; message: string }

export function PmReportsClient({
  rows,
  loadError,
}: {
  rows: PmReportRow[]
  loadError: string | null
}) {
  const toSend = rows.filter((row) => !row.everSent)
  const sent = rows.filter((row) => row.everSent)

  return (
    <div className="flex flex-col gap-6">
      {loadError && (
        <p className="rounded-md border border-amber-500/50 bg-amber-50 p-3 text-sm text-amber-800">
          {loadError}
        </p>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          To send ({toSend.length})
        </h2>
        {toSend.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            No visits with unreported issues. Issues logged by crew at rental
            visit completions will appear here.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {toSend.map((row) => (
              <VisitCard key={row.visitId} row={row} />
            ))}
          </div>
        )}
      </section>

      {sent.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Sent ({sent.length})
          </h2>
          <div className="flex flex-col gap-3">
            {sent.map((row) => (
              <VisitCard key={row.visitId} row={row} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function VisitCard({ row }: { row: PmReportRow }) {
  const router = useRouter()
  const [expanded, setExpanded] = useState(false)
  const [sendState, setSendState] = useState<SendState>({ step: "idle" })
  // Draft note text per issue id; an entry exists only while it differs from
  // what's saved. The engine reads notes fresh at send time, so unsaved edits
  // must be saved (or discarded) before Send unlocks.
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState<Record<string, string>>(
    Object.fromEntries(row.issues.map((issue) => [issue.id, issue.caption]))
  )
  const [savingIssueId, setSavingIssueId] = useState<string | null>(null)
  const [noteError, setNoteError] = useState<string | null>(null)

  const dirtyCount = Object.keys(drafts).length
  const canSend = !!row.pmEmail && dirtyCount === 0 && sendState.step !== "sending"

  const handleNoteChange = (issueId: string, value: string) => {
    setDrafts((prev) => {
      if (value === saved[issueId]) {
        const { [issueId]: _dropped, ...rest } = prev
        return rest
      }
      return { ...prev, [issueId]: value }
    })
  }

  const handleNoteSave = async (issueId: string) => {
    const value = drafts[issueId]
    if (value === undefined) return
    setSavingIssueId(issueId)
    setNoteError(null)

    const { error } = await createClient()
      .from("job_photos")
      .update({ caption: value.trim() || null })
      .eq("id", issueId)

    setSavingIssueId(null)
    if (error) {
      setNoteError(`Couldn't save the note: ${error.message}`)
      return
    }
    setSaved((prev) => ({ ...prev, [issueId]: value }))
    setDrafts((prev) => {
      const { [issueId]: _dropped, ...rest } = prev
      return rest
    })
  }

  const handleSend = async () => {
    setSendState({ step: "sending" })
    try {
      const res = await fetch("/api/pm-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visitId: row.visitId }),
      })
      const result = await res.json().catch(() => null)

      if (result?.status === "sent") {
        setSendState({
          step: "sent",
          message: `Report sent to ${result.recipientEmail} (${result.issueCount} ${
            result.issueCount === 1 ? "issue" : "issues"
          }).`,
        })
        router.refresh()
        return
      }
      if (result?.status === "skipped") {
        setSendState({ step: "error", message: `Nothing sent: ${result.reason}` })
        return
      }
      setSendState({
        step: "error",
        message: `Send failed: ${result?.error || `HTTP ${res.status}`}`,
      })
    } catch (e) {
      setSendState({
        step: "error",
        message: e instanceof Error ? e.message : "Send failed: network error",
      })
    }
  }

  return (
    <Card>
      <CardContent className="p-4">
        <button
          type="button"
          className="flex w-full items-start justify-between gap-3 text-left"
          onClick={() => setExpanded((prev) => !prev)}
        >
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold text-foreground truncate">
                {row.clientName}
              </h3>
              <Badge
                className={`shrink-0 border-transparent text-xs ${
                  SEVERITY_BADGE_CLASSES[row.worst ?? "cosmetic"]
                }`}
              >
                {row.issues.length} {row.issues.length === 1 ? "issue" : "issues"}
              </Badge>
              {row.everSent && (
                <Badge variant="secondary" className="shrink-0 text-xs">
                  Sent{row.lastSentAtLabel ? ` ${row.lastSentAtLabel}` : ""}
                </Badge>
              )}
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-muted-foreground">
              <MapPin className="h-4 w-4 shrink-0" />
              <span className="truncate text-sm">{row.address}</span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Visit {row.visitDateLabel}
              {row.pmEmail
                ? ` · PM: ${row.pmName || "unnamed"} <${row.pmEmail}>`
                : ""}
            </p>
          </div>
          {expanded ? (
            <ChevronDown className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" />
          )}
        </button>

        {!row.pmEmail && (
          <p className="mt-3 rounded-md border border-amber-500/50 bg-amber-50 p-2 text-sm text-amber-800">
            No property manager email — assign a PM with an email address on the
            property (Properties → open the property) before this can send.
          </p>
        )}

        {row.lastError && sendState.step === "idle" && (
          <p className="mt-3 rounded-md border border-destructive/50 bg-destructive/10 p-2 text-sm text-destructive">
            Last send failed: {row.lastError}
          </p>
        )}

        {expanded && (
          <div className="mt-4 flex flex-col gap-4 border-t pt-4">
            {row.issues.map((issue) => {
              const draft = drafts[issue.id]
              const value = draft ?? saved[issue.id] ?? ""
              const dirty = draft !== undefined
              return (
                <div key={issue.id} className="flex items-start gap-3">
                  {issue.publicUrl ? (
                    <a
                      href={issue.publicUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={issue.publicUrl}
                        alt={value || "Issue photo"}
                        className="h-16 w-16 rounded-md border object-cover"
                      />
                    </a>
                  ) : (
                    <div className="h-16 w-16 shrink-0 rounded-md border bg-muted" />
                  )}
                  <div className="min-w-0 flex-1">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                        SEVERITY_BADGE_CLASSES[
                          (issue.severity as WalkAroundSeverity) ?? "cosmetic"
                        ]
                      }`}
                    >
                      {SEVERITY_LABELS[issue.severity as WalkAroundSeverity] ||
                        issue.severity}
                    </span>
                    <Textarea
                      className="mt-2 min-h-16 text-sm"
                      value={value}
                      placeholder="Note shown to the property manager"
                      onChange={(e) => handleNoteChange(issue.id, e.target.value)}
                    />
                    {dirty && (
                      <div className="mt-2 flex items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => handleNoteSave(issue.id)}
                          disabled={savingIssueId === issue.id}
                        >
                          {savingIssueId === issue.id ? (
                            <Spinner className="mr-1" />
                          ) : null}
                          Save note
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => handleNoteChange(issue.id, saved[issue.id] ?? "")}
                        >
                          Discard
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}

            {noteError && (
              <p className="text-sm text-destructive">{noteError}</p>
            )}

            <div className="flex flex-col gap-2 border-t pt-3">
              {sendState.step === "sent" ? (
                <p className="text-sm font-medium text-green-700">
                  {sendState.message}
                </p>
              ) : sendState.step === "confirm" ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm">
                    {row.everSent
                      ? `Already sent${row.lastSentAtLabel ? ` ${row.lastSentAtLabel}` : ""}${
                          row.lastSentTo ? ` to ${row.lastSentTo}` : ""
                        }. Send again to ${row.pmEmail}?`
                      : `Send the report to ${row.pmEmail}?`}
                  </span>
                  <Button type="button" size="sm" onClick={handleSend}>
                    <Send className="mr-1 h-4 w-4" />
                    Confirm send
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setSendState({ step: "idle" })}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    disabled={!canSend}
                    onClick={() => setSendState({ step: "confirm" })}
                  >
                    {sendState.step === "sending" ? (
                      <Spinner className="mr-1" />
                    ) : (
                      <Send className="mr-1 h-4 w-4" />
                    )}
                    {row.everSent ? "Send again" : "Send report"}
                  </Button>
                  {dirtyCount > 0 && (
                    <span className="text-xs text-muted-foreground">
                      Save or discard note edits first.
                    </span>
                  )}
                  {sendState.step === "error" && (
                    <span className="text-sm text-destructive">
                      {sendState.message}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
