"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { FieldGroup, Field, FieldLabel } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import type { Property } from "@/lib/types"
import { isSubscriptionUnconfirmed } from "@/lib/subscription-billing"
import {
  getServiceIntervalWeeks,
  serviceFrequencyOptions,
} from "@/lib/service-frequency"
import {
  ISSUE_STATUSES,
  ISSUE_STATUS_LABELS,
  SEVERITY_BADGE_CLASSES,
  SEVERITY_LABELS,
  severityRank,
  type IssueStatus,
  type WalkAroundSeverity,
} from "@/lib/walk-around"

interface PropertyDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  property: Property | null
  onSuccess: (property: Property, isNew: boolean) => void
}

type PropertyManager = {
  id: string
  name: string
  email: string | null
  company: string | null
}

function makePropertyCode(value: string) {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 20)
}

export function PropertyDialog({
  open,
  onOpenChange,
  property,
  onSuccess,
}: PropertyDialogProps) {
  const [loading, setLoading] = useState(false)
  const [clientName, setClientName] = useState("")
  const [address, setAddress] = useState("")
  const [accessNotes, setAccessNotes] = useState("")
  const [permanentNotes, setPermanentNotes] = useState("")
  const [invoiceHandlingNote, setInvoiceHandlingNote] = useState("")
  const [serviceType, setServiceType] = useState("")
  const [serviceFrequency, setServiceFrequency] = useState("")
  const [hourlyRate, setHourlyRate] = useState("80")
  const [greenwasteRate, setGreenwasteRate] = useState("26.5")
  // Phase B: confirmation + amount are per subscription billing LINE, so a
  // property can hold several, each confirmed independently.
  const [subscriptionLines, setSubscriptionLines] = useState<
    { id: string; amount: string; confirmed: boolean }[]
  >([])
  const [isRental, setIsRental] = useState(false)
  // Property manager: shared contact (one PM -> many properties). Pick an
  // existing PM or add one inline; the property stores property_manager_id.
  const [propertyManagers, setPropertyManagers] = useState<PropertyManager[]>([])
  const [propertyManagerId, setPropertyManagerId] = useState("")
  const [addingPm, setAddingPm] = useState(false)
  const [newPmName, setNewPmName] = useState("")
  const [newPmEmail, setNewPmEmail] = useState("")
  const [newPmCompany, setNewPmCompany] = useState("")
  const [savingPm, setSavingPm] = useState(false)
  const [walkAroundIssues, setWalkAroundIssues] = useState<
    {
      id: string
      public_url: string | null
      caption: string | null
      severity: WalkAroundSeverity | null
      created_at: string | null
      reported_to_pm_at: string | null
    }[]
  >([])
  // Piece 3: this dialog is the ONLY place issue status changes. Picking a
  // non-open status opens a confirm step (optional note) before it saves;
  // saving removes the issue from this open-only list.
  const [issueStatusDrafts, setIssueStatusDrafts] = useState<
    Record<string, { status: IssueStatus; note: string }>
  >({})
  const [savingIssueStatusId, setSavingIssueStatusId] = useState<string | null>(
    null
  )
  const [error, setError] = useState<string | null>(null)

  const isEditing = !!property

  const updateLine = (
    id: string,
    patch: Partial<{ amount: string; confirmed: boolean }>
  ) =>
    setSubscriptionLines((prev) =>
      prev.map((line) => (line.id === id ? { ...line, ...patch } : line))
    )

  useEffect(() => {
    if (!open) return

    // PM list is needed whether adding or editing, so load it regardless.
    let pmCancelled = false
    createClient()
      .from("property_managers")
      .select("id, name, email, company")
      .eq("active", true)
      .order("name", { ascending: true })
      .then(({ data }) => {
        if (!pmCancelled) setPropertyManagers((data || []) as PropertyManager[])
      })

    if (property) {
      setClientName(property.client_name)
      setAddress(property.address_line_1 ?? "")
      setAccessNotes(property.access_notes || "")
      setPermanentNotes(property.permanent_notes || "")
      setInvoiceHandlingNote(property.invoice_handling_note || "")
      setServiceType(property.service_type || "")
      setServiceFrequency(property.service_frequency || "")
      setIsRental(property.is_rental ?? false)
      setPropertyManagerId(property.property_manager_id ?? "")
      setError(null)

      // Phase B: load the property's active subscription lines so each can be
      // confirmed independently. A line is ticked only when it's currently,
      // validly confirmed — a stale/unconfirmed line starts unticked so it
      // requires an active re-confirmation.
      let cancelled = false
      const supabase = createClient()
      supabase
        .from("property_billing_lines")
        .select("id, subscription_amount, subscription_invoice_confirmed_at")
        .eq("property_id", property.id)
        .eq("active", true)
        .eq("billing_mode", "subscription")
        .order("created_at", { ascending: true })
        .then(({ data }) => {
          if (cancelled) return
          setSubscriptionLines(
            (data || []).map((line) => ({
              id: line.id as string,
              amount:
                line.subscription_amount != null
                  ? String(line.subscription_amount)
                  : "",
              confirmed: !isSubscriptionUnconfirmed({
                billing_mode: "subscription",
                subscription_invoice_confirmed_at:
                  line.subscription_invoice_confirmed_at,
              }),
            }))
          )
        })
      // Walk-around issues logged by crew at rental visit completions.
      // OPEN issues only (piece 3): resolved/dismissed/not-our-job disappear
      // from here and from the property badge.
      supabase
        .from("job_photos")
        .select("id, public_url, caption, severity, created_at, reported_to_pm_at")
        .eq("property_id", property.id)
        .eq("photo_type", "issue")
        .eq("issue_status", "open")
        .not("severity", "is", null)
        .order("created_at", { ascending: false })
        .then(({ data }) => {
          if (cancelled) return
          const rows = (data || []) as {
            id: string
            public_url: string | null
            caption: string | null
            severity: WalkAroundSeverity | null
            created_at: string | null
            reported_to_pm_at: string | null
          }[]
          setWalkAroundIssues(
            rows.sort(
              (a, b) => severityRank(a.severity) - severityRank(b.severity)
            )
          )
        })

      return () => {
        cancelled = true
        pmCancelled = true
      }
    } else {
      setClientName("")
      setAddress("")
      setAccessNotes("")
      setPermanentNotes("")
      setInvoiceHandlingNote("")
      setServiceType("")
      setServiceFrequency("")
      setSubscriptionLines([])
      setIsRental(false)
      setPropertyManagerId("")
      setAddingPm(false)
      setNewPmName("")
      setNewPmEmail("")
      setNewPmCompany("")
      setWalkAroundIssues([])
      setIssueStatusDrafts({})
      setError(null)
      return () => {
        pmCancelled = true
      }
    }
  }, [property, open])

  const handleSaveIssueStatus = async (issueId: string) => {
    const draft = issueStatusDrafts[issueId]
    if (!draft || draft.status === "open") return
    setSavingIssueStatusId(issueId)
    setError(null)

    const supabase = createClient()
    const { data: userData } = await supabase.auth.getUser()

    const { error: statusError } = await supabase
      .from("job_photos")
      .update({
        issue_status: draft.status,
        issue_status_at: new Date().toISOString(),
        issue_status_by: userData?.user?.email || null,
        issue_status_note: draft.note.trim() || null,
      })
      .eq("id", issueId)

    setSavingIssueStatusId(null)
    if (statusError) {
      setError(`Couldn't update the issue status: ${statusError.message}`)
      return
    }
    // The list shows open issues only, so a saved status removes the row.
    setWalkAroundIssues((prev) => prev.filter((issue) => issue.id !== issueId))
    setIssueStatusDrafts((prev) => {
      const { [issueId]: _dropped, ...rest } = prev
      return rest
    })
  }

  const handleAddPropertyManager = async () => {
    const name = newPmName.trim()
    if (!name) {
      setError("Enter the property manager's name.")
      return
    }

    setSavingPm(true)
    setError(null)

    const { data, error: pmError } = await createClient()
      .from("property_managers")
      .insert({
        name,
        email: newPmEmail.trim() || null,
        company: newPmCompany.trim() || null,
      })
      .select("id, name, email, company")
      .single()

    setSavingPm(false)

    if (pmError) {
      setError(pmError.message)
      return
    }

    const created = data as PropertyManager
    setPropertyManagers((prev) =>
      [...prev, created].sort((a, b) => a.name.localeCompare(b.name))
    )
    setPropertyManagerId(created.id)
    setAddingPm(false)
    setNewPmName("")
    setNewPmEmail("")
    setNewPmCompany("")
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      setError("You must be logged in")
      setLoading(false)
      return
    }

    const propertyData = {
  client_name: clientName.trim(),
  address_line_1: address.trim(),
  access_notes: accessNotes.trim() || null,
  permanent_notes: permanentNotes.trim() || null,
  invoice_handling_note: invoiceHandlingNote.trim() || null,
  service_type: serviceType.trim() || null,
  service_frequency: serviceFrequency || null,
  service_interval_weeks: getServiceIntervalWeeks(serviceFrequency),
  is_rental: isRental,
  property_manager_id: propertyManagerId || null,
  updated_at: new Date().toISOString(),
}

    if (isEditing) {
      const { data, error: updateError } = await supabase
        .from("properties")
        .update(propertyData)
        .eq("id", property.id)
        .select()
        .single()

      if (updateError) {
        setError(updateError.message)
        setLoading(false)
        return
      }

      // Phase B: confirmation + amount write to each subscription LINE, not the
      // property. Ticking stamps a fresh confirmed_at on that line (clearing its
      // staleness and only its own VA action); unticking un-confirms that line.
      const nowIso = new Date().toISOString()
      for (const line of subscriptionLines) {
        const { error: lineError } = await supabase
          .from("property_billing_lines")
          .update({
            subscription_amount: line.amount ? Number(line.amount) : null,
            subscription_invoice_confirmed_at: line.confirmed ? nowIso : null,
            subscription_invoice_confirmed_by: line.confirmed
              ? user.email || "admin"
              : null,
            updated_at: nowIso,
          })
          .eq("id", line.id)
        if (lineError) {
          setError(lineError.message)
          setLoading(false)
          return
        }
      }

      onSuccess(data as Property, false)
    } else {
      // Add path: generate the required property_code (NOT NULL, no default)
      // and default this new customer to the standard $80/$26.50 charge_up
      // rates. `user_id` is intentionally NOT written — no such column exists
      // on properties, and including it made every add fail.
      const { data, error: insertError } = await supabase
        .from("properties")
        .insert({
          ...propertyData,
          property_code: makePropertyCode(address),
          hourly_rate: Number(hourlyRate) || 80,
          greenwaste_rate: Number(greenwasteRate) || 26.5,
        })
        .select()
        .single()

      if (insertError) {
        setError(insertError.message)
        setLoading(false)
        return
      }

      // Phase B: every property carries its billing identity as a line. The add
      // form creates a charge_up property, so seed a matching charge_up line.
      const { error: lineError } = await supabase
        .from("property_billing_lines")
        .insert({
          property_id: data.id,
          billing_mode: "charge_up",
          job_type: serviceType.trim() || null,
          active: true,
        })
      if (lineError) {
        setError(lineError.message)
        setLoading(false)
        return
      }

      onSuccess(data as Property, true)
    }

    setLoading(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md mx-4 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit Property" : "Add Property"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="clientName">Client Name</FieldLabel>
              <Input
                id="clientName"
                placeholder="e.g. John Smith"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                required
                className="h-12"
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="address">Address</FieldLabel>
              <Input
                id="address"
                placeholder="e.g. 123 Garden Street"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                required
                className="h-12"
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="accessNotes">Access Notes</FieldLabel>
              <Textarea
                id="accessNotes"
                placeholder="Gate code, key location..."
                value={accessNotes}
                onChange={(e) => setAccessNotes(e.target.value)}
                rows={3}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="permanentNotes">Permanent Notes</FieldLabel>
              <Textarea
                id="permanentNotes"
                placeholder="Special instructions, preferences..."
                value={permanentNotes}
                onChange={(e) => setPermanentNotes(e.target.value)}
                rows={3}
              />
            </Field>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isRental}
                onChange={(e) => setIsRental(e.target.checked)}
              />
              Rental / PM-managed property
            </label>

            {isRental && (
              <Field>
                <FieldLabel htmlFor="propertyManager">
                  Property manager
                </FieldLabel>
                {!addingPm ? (
                  <div className="flex gap-2">
                    <select
                      id="propertyManager"
                      className="h-12 flex-1 rounded-md border bg-background px-3 text-sm"
                      value={propertyManagerId}
                      onChange={(e) => setPropertyManagerId(e.target.value)}
                    >
                      <option value="">No property manager</option>
                      {propertyManagers.map((pm) => (
                        <option key={pm.id} value={pm.id}>
                          {pm.name}
                          {pm.company ? ` (${pm.company})` : ""}
                          {pm.email ? ` — ${pm.email}` : ""}
                        </option>
                      ))}
                    </select>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-12"
                      onClick={() => setAddingPm(true)}
                    >
                      + New
                    </Button>
                  </div>
                ) : (
                  <div className="grid gap-2 rounded-md border bg-muted/30 p-3">
                    <Input
                      placeholder="PM name (required)"
                      value={newPmName}
                      onChange={(e) => setNewPmName(e.target.value)}
                      className="h-11"
                    />
                    <Input
                      type="email"
                      placeholder="PM email"
                      value={newPmEmail}
                      onChange={(e) => setNewPmEmail(e.target.value)}
                      className="h-11"
                    />
                    <Input
                      placeholder="Company (optional)"
                      value={newPmCompany}
                      onChange={(e) => setNewPmCompany(e.target.value)}
                      className="h-11"
                    />
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        className="h-11 flex-1"
                        onClick={handleAddPropertyManager}
                        disabled={savingPm}
                      >
                        {savingPm ? <Spinner className="mr-2" /> : null}
                        Save manager
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-11"
                        onClick={() => {
                          setAddingPm(false)
                          setNewPmName("")
                          setNewPmEmail("")
                          setNewPmCompany("")
                        }}
                        disabled={savingPm}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
                <p className="mt-1 text-xs text-muted-foreground">
                  Shared across properties — one manager can cover several. Used
                  to send the walk-around issue report.
                </p>
              </Field>
            )}

            {!isEditing && (
              <div className="flex gap-3">
                <Field className="flex-1">
                  <FieldLabel htmlFor="hourlyRate">Labour rate $/hr</FieldLabel>
                  <Input
                    id="hourlyRate"
                    type="number"
                    step="0.5"
                    value={hourlyRate}
                    onChange={(e) => setHourlyRate(e.target.value)}
                    className="h-12"
                  />
                </Field>
                <Field className="flex-1">
                  <FieldLabel htmlFor="greenwasteRate">
                    Greenwaste $/bag
                  </FieldLabel>
                  <Input
                    id="greenwasteRate"
                    type="number"
                    step="0.5"
                    value={greenwasteRate}
                    onChange={(e) => setGreenwasteRate(e.target.value)}
                    className="h-12"
                  />
                </Field>
              </div>
            )}

            <Field>
              <FieldLabel htmlFor="serviceType">Service Type</FieldLabel>
              <Input
                id="serviceType"
                placeholder="e.g. maintenance, commercial, one-off"
                value={serviceType}
                onChange={(e) => setServiceType(e.target.value)}
                className="h-12"
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="serviceFrequency">
                Service Frequency
              </FieldLabel>
              <select
                id="serviceFrequency"
                className="h-12 w-full rounded-md border bg-background px-3 text-sm"
                value={serviceFrequency}
                onChange={(e) => setServiceFrequency(e.target.value)}
              >
                {serviceFrequencyOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field>
              <FieldLabel htmlFor="invoiceHandlingNote">
                Invoice Handling Note
              </FieldLabel>
              <Textarea
                id="invoiceHandlingNote"
                placeholder="Invoice exclusions, special billing instructions..."
                value={invoiceHandlingNote}
                onChange={(e) => setInvoiceHandlingNote(e.target.value)}
                rows={3}
              />
            </Field>

            {subscriptionLines.length > 0 && (
              <div className="rounded-md border border-blue-200 bg-blue-50 p-3">
                <p className="mb-2 text-sm font-medium text-blue-900">
                  Subscription billing (Xero repeating invoice)
                </p>
                {subscriptionLines.map((line, index) => (
                  <div
                    key={line.id}
                    className={
                      index > 0
                        ? "mt-3 border-t border-blue-200 pt-3"
                        : undefined
                    }
                  >
                    {subscriptionLines.length > 1 && (
                      <p className="mb-1 text-xs font-medium text-blue-800">
                        Subscription line {index + 1}
                      </p>
                    )}
                    <Field>
                      <FieldLabel htmlFor={`subscriptionAmount-${line.id}`}>
                        Repeating invoice amount ($ per period)
                      </FieldLabel>
                      <Input
                        id={`subscriptionAmount-${line.id}`}
                        type="number"
                        step="0.01"
                        placeholder="e.g. 544"
                        value={line.amount}
                        onChange={(e) =>
                          updateLine(line.id, { amount: e.target.value })
                        }
                        className="h-12"
                      />
                    </Field>
                    <label className="mt-2 flex items-start gap-2 text-sm text-blue-900">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={line.confirmed}
                        onChange={(e) =>
                          updateLine(line.id, { confirmed: e.target.checked })
                        }
                      />
                      I&apos;ve confirmed a live Xero repeating invoice exists for
                      this line.
                    </label>
                  </div>
                ))}
              </div>
            )}

            {isEditing && walkAroundIssues.length > 0 && (
              <div className="rounded-md border p-3">
                <p className="mb-2 text-sm font-medium">
                  Open walk-around issues ({walkAroundIssues.length})
                </p>
                <div className="flex flex-col gap-3">
                  {walkAroundIssues.map((issue) => {
                    const draft = issueStatusDrafts[issue.id]
                    return (
                      <div key={issue.id} className="flex items-start gap-3">
                        {issue.public_url ? (
                          <a
                            href={issue.public_url}
                            target="_blank"
                            rel="noreferrer"
                            className="shrink-0"
                            onClick={(event) => event.stopPropagation()}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={issue.public_url}
                              alt={issue.caption || "Walk-around issue photo"}
                              className="h-12 w-12 rounded-md border object-cover"
                            />
                          </a>
                        ) : (
                          <div className="h-12 w-12 shrink-0 rounded-md border bg-muted" />
                        )}
                        <div className="min-w-0 flex-1">
                          <span
                            className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                              SEVERITY_BADGE_CLASSES[issue.severity ?? "cosmetic"]
                            }`}
                          >
                            {SEVERITY_LABELS[issue.severity ?? "cosmetic"]}
                          </span>
                          <p className="mt-1 text-sm">
                            {issue.caption || "No note"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {issue.created_at
                              ? new Date(issue.created_at).toLocaleDateString(
                                  "en-NZ"
                                )
                              : null}
                            {issue.reported_to_pm_at
                              ? ` · Reported to PM ${new Date(
                                  issue.reported_to_pm_at
                                ).toLocaleDateString("en-NZ")}`
                              : ""}
                          </p>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <select
                              className="h-9 rounded-md border bg-background px-2 text-sm"
                              value={draft?.status ?? "open"}
                              disabled={savingIssueStatusId === issue.id}
                              onChange={(e) => {
                                const status = e.target.value as IssueStatus
                                setIssueStatusDrafts((prev) => {
                                  if (status === "open") {
                                    const { [issue.id]: _dropped, ...rest } =
                                      prev
                                    return rest
                                  }
                                  return {
                                    ...prev,
                                    [issue.id]: {
                                      status,
                                      note: prev[issue.id]?.note ?? "",
                                    },
                                  }
                                })
                              }}
                            >
                              {ISSUE_STATUSES.map((status) => (
                                <option key={status} value={status}>
                                  {ISSUE_STATUS_LABELS[status]}
                                </option>
                              ))}
                            </select>
                            {draft && (
                              <>
                                <Input
                                  className="h-9 flex-1 min-w-40 text-sm"
                                  placeholder="Note (optional) — why?"
                                  value={draft.note}
                                  onChange={(e) =>
                                    setIssueStatusDrafts((prev) => ({
                                      ...prev,
                                      [issue.id]: {
                                        status: draft.status,
                                        note: e.target.value,
                                      },
                                    }))
                                  }
                                />
                                <Button
                                  type="button"
                                  size="sm"
                                  disabled={savingIssueStatusId === issue.id}
                                  onClick={() => handleSaveIssueStatus(issue.id)}
                                >
                                  {savingIssueStatusId === issue.id ? (
                                    <Spinner className="mr-1" />
                                  ) : null}
                                  Confirm
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </FieldGroup>

          {error && (
            <p className="text-destructive text-sm mt-4 text-center">{error}</p>
          )}

          <div className="flex gap-3 mt-6">
            <Button
              type="button"
              variant="outline"
              className="flex-1 h-12"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" className="flex-1 h-12" disabled={loading}>
              {loading ? <Spinner className="mr-2" /> : null}
              {loading ? "Saving..." : isEditing ? "Save" : "Add"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
