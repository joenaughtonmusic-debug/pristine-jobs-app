"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import {
  ArrowLeft,
  MapPin,
  Key,
  StickyNote,
  MessageSquare,
  Clock,
  Play,
  CheckCircle,
  XCircle,
  Send,
  FileText,
  Package,
} from "lucide-react"

import type { ScheduledJob, Visit } from "@/lib/types"
import { cn } from "@/lib/utils"
import { CompleteVisitDialog } from "./complete-visit-dialog"

type LabourEntry = {
  id: string
  job_type: string
  job_name: string | null
  job_code: string | null
  staff_member_id: string
  staff_name: string
  work_date: string
  hours_worked: number
  billable: boolean
  notes: string | null
}

interface JobDetailProps {
  job: ScheduledJob
  recentVisits: Visit[]
  latestNextVisitNote: string | null
  labourEntries: LabourEntry[]
}

export function JobDetail({
  job,
  recentVisits,
  latestNextVisitNote,
  labourEntries,
}: JobDetailProps) {
  const router = useRouter()

  const [status, setStatus] = useState(job.status)
  const [loading, setLoading] = useState(false)
  const [showCompleteDialog, setShowCompleteDialog] = useState(false)

  const [internalNote, setInternalNote] = useState("")
  const [savingInternalNote, setSavingInternalNote] = useState(false)
  const [internalNoteMessage, setInternalNoteMessage] =
    useState<string | null>(null)
  const [internalNoteError, setInternalNoteError] =
    useState<string | null>(null)

  const property = job.properties

  const totalLabourHours = labourEntries.reduce((total, entry) => {
    return total + Number(entry.hours_worked || 0)
  }, 0)

  const handleStartJob = async () => {
    setLoading(true)

    const supabase = createClient()

    const { error } = await supabase
      .from("scheduled_jobs")
      .update({
        status: "in_progress",
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id)

    if (!error) {
      setStatus("in_progress")
    }

    setLoading(false)
  }

  const handleCancel = async () => {
    setLoading(true)

    const supabase = createClient()

    const { error } = await supabase
      .from("scheduled_jobs")
      .update({
        status: "cancelled",
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id)

    if (!error) {
      setStatus("cancelled")
      router.refresh()
    }

    setLoading(false)
  }

  const handleCompleteSuccess = () => {
    setShowCompleteDialog(false)
    setStatus("completed")
    router.refresh()
  }

  const handleSubmitInternalNote = async () => {
    setSavingInternalNote(true)

    setInternalNoteMessage(null)
    setInternalNoteError(null)

    const trimmedNote = internalNote.trim()

    if (!trimmedNote) {
      setInternalNoteError("Please enter an internal note.")
      setSavingInternalNote(false)
      return
    }

    const supabase = createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    let staffMember: { id: string; name: string } | null = null

    if (user) {
      const { data } = await supabase
        .from("staff_members")
        .select("id, name")
        .eq("auth_user_id", user.id)
        .maybeSingle()

      staffMember = data
    }

    const { error } = await supabase.from("internal_job_notes").insert({
      scheduled_job_id: job.id,
      property_id: job.property_id,
      property_address: property?.address_line_1 || null,
      note: trimmedNote,
      submitted_by_staff_id: staffMember?.id || null,
      submitted_by_staff_name: staffMember?.name || null,
      email_status: "pending",
    })

    if (error) {
      setInternalNoteError(error.message)
      setSavingInternalNote(false)
      return
    }

    setInternalNote("")
    setInternalNoteMessage("Internal note submitted.")
    setSavingInternalNote(false)
  }

  return (
    <div className="p-4 pb-8">
      <header className="mb-6 flex items-center gap-3">
        <Link href="/jobs">
          <Button variant="ghost" size="icon" className="shrink-0">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-bold text-foreground">
            {property?.client_name || "Unknown Client"}
          </h1>

          <div className="mt-2 flex flex-wrap gap-2">
            <Badge
              variant="secondary"
              className={cn(
                status === "scheduled" &&
                  "bg-secondary text-secondary-foreground",

                status === "in_progress" &&
                  "bg-primary text-primary-foreground",

                status === "completed" &&
                  "bg-chart-5 text-foreground",

                status === "cancelled" &&
                  "bg-muted text-muted-foreground"
              )}
            >
              {status === "in_progress"
                ? "In Progress"
                : status.charAt(0).toUpperCase() + status.slice(1)}
            </Badge>

            {job.time_limit_type === "fixed_time" && (
              <Badge className="border border-amber-300 bg-amber-100 text-amber-900">
                Time Fixed · {job.planned_duration_hours || "?"}h
              </Badge>
            )}

            {job.quoted_scope && (
              <Badge className="border border-blue-300 bg-blue-100 text-blue-900">
                Scope Attached
              </Badge>
            )}
          </div>
        </div>
      </header>

      <div className="flex flex-col gap-4">
        {labourEntries.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock className="h-4 w-4" />
                Labour Entered
              </CardTitle>
            </CardHeader>

            <CardContent className="p-4 pt-0">
              <div className="mb-3 rounded-md bg-gray-50 p-3 text-sm">
                <span className="font-medium">Total labour entered:</span>{" "}
                {totalLabourHours}h
              </div>

              <div className="flex flex-col gap-3">
                {labourEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className="border-b border-border pb-3 last:border-0 last:pb-0"
                  >
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{entry.staff_name}</span>
                      <span className="font-medium">{entry.hours_worked}h</span>
                    </div>

                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(entry.work_date).toLocaleDateString("en-NZ", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}{" "}
                      · {entry.billable ? "Billable" : "Non-billable"}
                    </p>

                    {entry.notes && (
                      <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                        {entry.notes}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-primary" />

              <div>
                <p className="font-medium text-foreground">Address</p>

                <p className="text-muted-foreground">
                  {property?.address_line_1 || "No address"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {job.quoted_scope && (
          <Card className="border-blue-200 bg-blue-50/50">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="h-4 w-4" />
                Quoted Scope / Job Notes
              </CardTitle>
            </CardHeader>

            <CardContent className="pt-0">
              <p className="whitespace-pre-wrap text-sm text-gray-700">
                {job.quoted_scope}
              </p>
            </CardContent>
          </Card>
        )}

        {job.quoted_materials && (
          <Card className="border-green-200 bg-green-50/50">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Package className="h-4 w-4" />
                Included Materials
              </CardTitle>
            </CardHeader>

            <CardContent className="pt-0">
              <p className="whitespace-pre-wrap text-sm text-gray-700">
                {job.quoted_materials}
              </p>
            </CardContent>
          </Card>
        )}

        {property?.property_notes_url && (
          <Card>
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <Key className="mt-0.5 h-5 w-5 shrink-0 text-primary" />

                <div>
                  <p className="font-medium text-foreground">
                    Access Notes
                  </p>

                  <p className="whitespace-pre-wrap text-muted-foreground">
                    {property.access_notes}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {property?.permanent_notes && (
          <Card>
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <StickyNote className="mt-0.5 h-5 w-5 shrink-0 text-primary" />

                <div>
                  <p className="font-medium text-foreground">
                    Permanent Notes
                  </p>

                  <p className="whitespace-pre-wrap text-muted-foreground">
                    {property.permanent_notes}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {latestNextVisitNote && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <MessageSquare className="mt-0.5 h-5 w-5 shrink-0 text-primary" />

                <div>
                  <p className="font-medium text-foreground">
                    Previous Visit Note (for this visit)
                  </p>

                  <p className="whitespace-pre-wrap text-muted-foreground">
                    {latestNextVisitNote}
                  </p>

                  <p className="mt-2 text-xs text-muted-foreground">
                    Added{" "}
                    {new Date(
                      recentVisits.find(
                        (visit) =>
                          visit.next_visit_notes === latestNextVisitNote
                      )?.visit_date || ""
                    ).toLocaleDateString("en-NZ", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageSquare className="h-4 w-4" />
              Internal Note
            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-3 p-4 pt-0">
            <Textarea
              value={internalNote}
              onChange={(e) => setInternalNote(e.target.value)}
              placeholder="Example: client asked about extra spray, gate latch broken, needs quote follow-up..."
              rows={3}
            />

            {internalNoteError && (
              <p className="rounded-md bg-red-50 p-2 text-sm text-red-600">
                {internalNoteError}
              </p>
            )}

            {internalNoteMessage && (
              <p className="rounded-md bg-green-50 p-2 text-sm text-green-700">
                {internalNoteMessage}
              </p>
            )}

            <Button
              type="button"
              variant="outline"
              className="h-11 w-full"
              onClick={handleSubmitInternalNote}
              disabled={savingInternalNote}
            >
              {savingInternalNote ? (
                <Spinner className="mr-2" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}

              {savingInternalNote
                ? "Submitting..."
                : "Submit Internal Note"}
            </Button>
          </CardContent>
        </Card>

        {recentVisits.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock className="h-4 w-4" />
                Recent Visits
              </CardTitle>
            </CardHeader>

            <CardContent className="p-4 pt-0">
              <div className="flex flex-col gap-3">
                {recentVisits.map((visit) => (
                  <div
                    key={visit.id}
                    className="border-b border-border pb-3 last:border-0 last:pb-0"
                  >
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        {new Date(visit.visit_date).toLocaleDateString(
                          "en-AU",
                          {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          }
                        )}
                      </span>

                      <span className="font-medium">
                        {visit.hours_worked}h
                      </span>
                    </div>

                    {visit.work_notes && (
                      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                        {visit.work_notes}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {status !== "completed" && status !== "cancelled" && (
          <div className="mt-2 flex flex-col gap-3">
            {status === "scheduled" && (
              <Button
                size="lg"
                className="h-14 text-base"
                onClick={handleStartJob}
                disabled={loading}
              >
                {loading ? (
                  <Spinner className="mr-2" />
                ) : (
                  <Play className="mr-2 h-5 w-5" />
                )}

                Start Job
              </Button>
            )}

            {status === "in_progress" && (
              <Button
                size="lg"
                className="h-14 text-base"
                onClick={() => setShowCompleteDialog(true)}
              >
                <CheckCircle className="mr-2 h-5 w-5" />
                Complete Visit
              </Button>
            )}

            <Button
              variant="destructive"
              size="lg"
              className="h-14 text-base"
              onClick={handleCancel}
              disabled={loading}
            >
              <XCircle className="mr-2 h-5 w-5" />
              Cancel Job
            </Button>
          </div>
        )}
      </div>

      <CompleteVisitDialog
        open={showCompleteDialog}
        onOpenChange={setShowCompleteDialog}
        jobId={job.id}
        propertyId={job.property_id}
        assignedStaffId={job.assigned_staff_id || null}
        onSuccess={handleCompleteSuccess}
      />
    </div>
  )
}