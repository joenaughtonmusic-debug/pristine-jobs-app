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
import { createMaintenanceCalendarEvent } from "@/app/(app)/admin/actions/maintenance-calendar-actions"
import { JOB_SPEED_OPTIONS, JOB_TYPE_CHOICES } from "@/lib/job-speed"
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

type BillingLineDraft = {
  key: string // stable React key (persisted id, or a temp key for new lines)
  id: string | null // null until saved
  jobType: string
  mode: string // charge_up | fixed_recurring | subscription
  amount: string // price — used by fixed_recurring + subscription only
  confirmed: boolean // subscription only: "I saw the Xero repeating invoice"
}

const BILLING_MODE_OPTIONS: { value: string; label: string }[] = [
  { value: "charge_up", label: "Charge up (per visit, by hours)" },
  { value: "fixed_recurring", label: "Fixed price per visit" },
  { value: "subscription", label: "Subscription (Xero repeating invoice)" },
]

// A price applies to the two fixed modes; charge_up bills on hours, no price.
const modeHasPrice = (mode: string) =>
  mode === "fixed_recurring" || mode === "subscription"

let billingLineKeySeq = 0
function newBillingLineKey() {
  billingLineKeySeq += 1
  return `new-${billingLineKeySeq}`
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
  const [clientEmail, setClientEmail] = useState("")
  const [clientPhone, setClientPhone] = useState("")
  const [speed, setSpeed] = useState("yellow")
  const [defaultVisitHours, setDefaultVisitHours] = useState("")
  const [sendPhotos, setSendPhotos] = useState(false)
  const [address, setAddress] = useState("")
  const [accessNotes, setAccessNotes] = useState("")
  const [permanentNotes, setPermanentNotes] = useState("")
  const [invoiceHandlingNote, setInvoiceHandlingNote] = useState("")
  const [serviceType, setServiceType] = useState("")
  const [serviceFrequency, setServiceFrequency] = useState("")
  const [hourlyRate, setHourlyRate] = useState("80")
  const [greenwasteRate, setGreenwasteRate] = useState("26.5")
  // Phase B: a property's billing identity is a set of per-job-type LINES. This
  // editor manages all of them — job type, mode (charge_up / fixed price per
  // visit / subscription), price, and (subscription only) the Xero-confirmation
  // tick. `id: null` = a line added in this session, not yet persisted.
  const [billingLines, setBillingLines] = useState<BillingLineDraft[]>([])
  // Persisted line ids removed in this session → retired (active=false) on save.
  const [removedLineIds, setRemovedLineIds] = useState<string[]>([])
  // Recurring maintenance calendar event (078): fired via a button, guarded so
  // it can't be created twice.
  const [calendarSaving, setCalendarSaving] = useState(false)
  const [calendarCreated, setCalendarCreated] = useState(false)
  const [calendarMsg, setCalendarMsg] = useState<string | null>(null)
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

  const updateLine = (key: string, patch: Partial<BillingLineDraft>) =>
    setBillingLines((prev) =>
      prev.map((line) => (line.key === key ? { ...line, ...patch } : line))
    )

  const addLine = () =>
    setBillingLines((prev) => [
      ...prev,
      {
        key: newBillingLineKey(),
        id: null,
        jobType: "",
        mode: "charge_up",
        amount: "",
        confirmed: false,
      },
    ])

  const removeLine = (key: string) =>
    setBillingLines((prev) => {
      const line = prev.find((l) => l.key === key)
      if (line?.id) setRemovedLineIds((ids) => [...ids, line.id as string])
      return prev.filter((l) => l.key !== key)
    })

  const handleAddCalendarEvent = async () => {
    if (!property) return
    setCalendarSaving(true)
    setCalendarMsg(null)
    const result = await createMaintenanceCalendarEvent(property.id)
    setCalendarSaving(false)
    if (result.ok) {
      setCalendarCreated(true)
      setCalendarMsg(result.message)
    } else {
      setCalendarMsg(result.error)
    }
  }

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
      setClientEmail(property.client_email || "")
      setClientPhone(property.phone || "")
      setSpeed(property.speed || "yellow")
      setDefaultVisitHours(
        property.default_duration_hours != null
          ? String(property.default_duration_hours)
          : ""
      )
      setSendPhotos(property.send_photos ?? false)
      setAddress(property.address_line_1 ?? "")
      setAccessNotes(property.access_notes || "")
      setPermanentNotes(property.permanent_notes || "")
      setInvoiceHandlingNote(property.invoice_handling_note || "")
      setServiceType(property.service_type || "")
      setServiceFrequency(property.service_frequency || "")
      setIsRental(property.is_rental ?? false)
      setPropertyManagerId(property.property_manager_id ?? "")
      setCalendarCreated(Boolean(property.gcal_recurring_event_created_at))
      setCalendarMsg(null)
      setError(null)

      // Phase B: load the property's active billing lines. Subscription lines
      // start ticked only when currently, validly confirmed — a stale/unconfirmed
      // one starts unticked so it needs an active re-confirmation.
      let cancelled = false
      setRemovedLineIds([])
      const supabase = createClient()
      supabase
        .from("property_billing_lines")
        .select(
          "id, job_type, billing_mode, subscription_amount, subscription_invoice_confirmed_at"
        )
        .eq("property_id", property.id)
        .eq("active", true)
        .order("created_at", { ascending: true })
        .then(({ data }) => {
          if (cancelled) return
          setBillingLines(
            (data || []).map((line) => ({
              key: line.id as string,
              id: line.id as string,
              jobType: (line.job_type as string) || "",
              mode: (line.billing_mode as string) || "charge_up",
              amount:
                line.subscription_amount != null
                  ? String(line.subscription_amount)
                  : "",
              confirmed:
                line.billing_mode === "subscription" &&
                !isSubscriptionUnconfirmed({
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
      setClientEmail("")
      setClientPhone("")
      setSpeed("yellow")
      setDefaultVisitHours("")
      setSendPhotos(false)
      setAddress("")
      setAccessNotes("")
      setPermanentNotes("")
      setInvoiceHandlingNote("")
      setServiceType("")
      setServiceFrequency("")
      setBillingLines([])
      setRemovedLineIds([])
      setCalendarCreated(false)
      setCalendarMsg(null)
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
  client_email: clientEmail.trim() || null,
  phone: clientPhone.trim() || null,
  address_line_1: address.trim(),
  access_notes: accessNotes.trim() || null,
  permanent_notes: permanentNotes.trim() || null,
  invoice_handling_note: invoiceHandlingNote.trim() || null,
  service_type: serviceType.trim() || null,
  service_frequency: serviceFrequency || null,
  service_interval_weeks: getServiceIntervalWeeks(serviceFrequency),
  speed,
  default_duration_hours: defaultVisitHours ? Number(defaultVisitHours) : null,
  send_photos: sendPhotos,
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

      // Phase B: write each billing LINE. Price applies to the two fixed modes;
      // the confirmation tick + timestamp is subscription-only (it means "I saw
      // the Xero repeating invoice"). Ticking stamps a fresh confirmed_at
      // (clearing staleness); unticking un-confirms. New lines insert; removed
      // lines retire (active=false) rather than hard-delete, to keep history.
      const nowIso = new Date().toISOString()
      for (const line of billingLines) {
        const payload = {
          property_id: property.id,
          job_type: line.jobType.trim() || null,
          billing_mode: line.mode,
          subscription_amount:
            modeHasPrice(line.mode) && line.amount ? Number(line.amount) : null,
          subscription_invoice_confirmed_at:
            line.mode === "subscription" && line.confirmed ? nowIso : null,
          subscription_invoice_confirmed_by:
            line.mode === "subscription" && line.confirmed
              ? user.email || "admin"
              : null,
          updated_at: nowIso,
        }

        const { error: lineError } = line.id
          ? await supabase
              .from("property_billing_lines")
              .update(payload)
              .eq("id", line.id)
          : await supabase
              .from("property_billing_lines")
              .insert({ ...payload, active: true })

        if (lineError) {
          setError(lineError.message)
          setLoading(false)
          return
        }
      }

      if (removedLineIds.length > 0) {
        const { error: retireError } = await supabase
          .from("property_billing_lines")
          .update({ active: false, updated_at: nowIso })
          .in("id", removedLineIds)
        if (retireError) {
          setError(retireError.message)
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
              <FieldLabel htmlFor="clientEmail">Client Email</FieldLabel>
              <Input
                id="clientEmail"
                type="email"
                placeholder="e.g. john@example.com"
                value={clientEmail}
                onChange={(e) => setClientEmail(e.target.value)}
                className="h-12"
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="clientPhone">Client Phone</FieldLabel>
              <Input
                id="clientPhone"
                type="tel"
                placeholder="e.g. 021 123 4567"
                value={clientPhone}
                onChange={(e) => setClientPhone(e.target.value)}
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

            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={sendPhotos}
                onChange={(e) => setSendPhotos(e.target.checked)}
              />
              <span>
                Send photos to customer
                <span className="block text-xs text-muted-foreground">
                  Completed visits appear in the photo-email review pile.
                  Photos are captured on every job regardless.
                </span>
              </span>
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
              <FieldLabel htmlFor="propertySpeed">Speed</FieldLabel>
              <select
                id="propertySpeed"
                className="h-12 w-full rounded-md border bg-background px-3 text-sm"
                value={speed}
                onChange={(e) => setSpeed(e.target.value)}
              >
                {JOB_SPEED_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field>
              <FieldLabel htmlFor="defaultVisitHours">
                Default Visit Hours
              </FieldLabel>
              <Input
                id="defaultVisitHours"
                type="number"
                min="0"
                step="0.25"
                placeholder="Pre-fills the scheduler, e.g. 4"
                value={defaultVisitHours}
                onChange={(e) => setDefaultVisitHours(e.target.value)}
                className="h-12"
              />
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

            {isEditing && (
              <div className="rounded-md border p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-medium">Billing lines</p>
                  <button
                    type="button"
                    onClick={addLine}
                    className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-medium"
                  >
                    + Add line
                  </button>
                </div>
                <p className="mb-3 text-xs text-gray-500">
                  One line per job type. Charge-up bills on hours; fixed price
                  per visit bills a set amount (hours still recorded, but don&apos;t
                  drive the invoice). Prices include GST.
                </p>

                {billingLines.length === 0 ? (
                  <p className="rounded border border-dashed p-2 text-xs text-gray-400">
                    No billing lines. Add one to set how this property is billed.
                  </p>
                ) : (
                  billingLines.map((line, index) => (
                    <div
                      key={line.key}
                      className={
                        index > 0 ? "mt-3 border-t pt-3" : undefined
                      }
                    >
                      <div className="flex items-start gap-2">
                        <div className="flex-1">
                          <Field>
                            <FieldLabel htmlFor={`lineJobType-${line.key}`}>
                              Job type
                            </FieldLabel>
                            <select
                              id={`lineJobType-${line.key}`}
                              value={line.jobType}
                              onChange={(e) =>
                                updateLine(line.key, { jobType: e.target.value })
                              }
                              className="h-12 w-full rounded-md border border-gray-300 bg-white px-3 text-sm"
                            >
                              <option value="">General / any</option>
                              {JOB_TYPE_CHOICES.map((c) => (
                                <option key={c.value} value={c.value}>
                                  {c.label}
                                </option>
                              ))}
                            </select>
                          </Field>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeLine(line.key)}
                          className="mt-7 rounded-md border border-red-200 bg-white px-2 py-2 text-xs font-medium text-red-700"
                          aria-label="Remove line"
                        >
                          Remove
                        </button>
                      </div>

                      <Field className="mt-2">
                        <FieldLabel htmlFor={`lineMode-${line.key}`}>
                          Billing
                        </FieldLabel>
                        <select
                          id={`lineMode-${line.key}`}
                          value={line.mode}
                          onChange={(e) =>
                            updateLine(line.key, { mode: e.target.value })
                          }
                          className="h-12 w-full rounded-md border border-gray-300 bg-white px-3 text-sm"
                        >
                          {BILLING_MODE_OPTIONS.map((m) => (
                            <option key={m.value} value={m.value}>
                              {m.label}
                            </option>
                          ))}
                        </select>
                      </Field>

                      {modeHasPrice(line.mode) && (
                        <Field className="mt-2">
                          <FieldLabel htmlFor={`lineAmount-${line.key}`}>
                            {line.mode === "subscription"
                              ? "Repeating invoice amount ($ incl GST)"
                              : "Fixed price per visit ($ incl GST)"}
                          </FieldLabel>
                          <Input
                            id={`lineAmount-${line.key}`}
                            type="number"
                            step="0.01"
                            placeholder="e.g. 220.40"
                            value={line.amount}
                            onChange={(e) =>
                              updateLine(line.key, { amount: e.target.value })
                            }
                            className="h-12"
                          />
                        </Field>
                      )}

                      {line.mode === "subscription" && (
                        <label className="mt-2 flex items-start gap-2 text-sm text-blue-900">
                          <input
                            type="checkbox"
                            className="mt-1"
                            checked={line.confirmed}
                            onChange={(e) =>
                              updateLine(line.key, {
                                confirmed: e.target.checked,
                              })
                            }
                          />
                          I&apos;ve confirmed a live Xero repeating invoice exists
                          for this line.
                        </label>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}

            {isEditing && getServiceIntervalWeeks(serviceFrequency) && (
              <div className="rounded-md border p-3">
                <p className="mb-1 text-sm font-medium">
                  Recurring maintenance calendar
                </p>
                {calendarCreated ? (
                  <p className="text-sm text-green-700">
                    ✓ A recurring maintenance visit has been added to Google
                    Calendar for this property.
                  </p>
                ) : (
                  <>
                    <p className="mb-2 text-xs text-gray-500">
                      Adds a recurring visit to Google Calendar — the next Monday,
                      repeating on this property&apos;s frequency, using its
                      default visit hours. You can move or adjust it in Calendar
                      afterwards.
                    </p>
                    <button
                      type="button"
                      onClick={handleAddCalendarEvent}
                      disabled={calendarSaving}
                      className="rounded-md bg-black px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                    >
                      {calendarSaving
                        ? "Adding…"
                        : "Add recurring maintenance visit to Google Calendar"}
                    </button>
                  </>
                )}
                {calendarMsg && (
                  <p className="mt-2 text-sm text-gray-700">{calendarMsg}</p>
                )}
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
