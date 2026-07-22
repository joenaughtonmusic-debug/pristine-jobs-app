"use client"

import { useRef, useState, type ChangeEvent } from "react"
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
  Camera,
  Trash2,
} from "lucide-react"

import type { JobPhoto, ScheduledJob, Visit } from "@/lib/types"
import { cn } from "@/lib/utils"
import {
  formatServiceFrequency,
  formatServiceValue,
} from "@/lib/service-frequency"
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

function hasServiceValue(value?: string | null) {
  return Boolean(value && value.trim())
}

function formatPropertyAddress(property: ScheduledJob["properties"]) {
  const parts = [property?.address_line_1, property?.suburb].filter(Boolean)
  return parts.join(", ")
}

function getJobTypeLabel(job: ScheduledJob) {
  const serviceType = job.properties?.service_type
  const serviceFrequency = job.properties?.service_frequency

  if (job.job_type === "one_off" || serviceFrequency === "one_off") {
    return "One-off Job"
  }

  if (job.job_type === "landscaping" || serviceType === "landscaping") {
    return "Landscaping Job"
  }

  return null
}

interface JobDetailProps {
  job: ScheduledJob
  recentVisits: Visit[]
  completedVisit: Visit | null
  latestNextVisitNote: string | null
  labourEntries: LabourEntry[]
  jobPhotos: JobPhoto[]
  isAdmin?: boolean
}

export function JobDetail({
  job,
  recentVisits,
  completedVisit,
  latestNextVisitNote,
  labourEntries,
  jobPhotos,
  isAdmin = false,
}: JobDetailProps) {
  const router = useRouter()

  const [status, setStatus] = useState(job.status)
  const [loading, setLoading] = useState(false)
  const [showCompleteDialog, setShowCompleteDialog] = useState(false)

const [editVisitOpen, setEditVisitOpen] = useState(false)
const [visitHoursWorked, setVisitHoursWorked] = useState(
  completedVisit?.hours_worked?.toString() || ""
)
const [visitWorkNotes, setVisitWorkNotes] = useState(
  completedVisit?.work_notes || ""
)
const [visitNextNotes, setVisitNextNotes] = useState(
  completedVisit?.next_visit_notes || ""
)
const [savingVisit, setSavingVisit] = useState(false)
const [visitError, setVisitError] = useState<string | null>(null)
const [photos, setPhotos] = useState(jobPhotos)
const [selectedPhoto, setSelectedPhoto] = useState<JobPhoto | null>(null)
const [photoCaption, setPhotoCaption] = useState("")
const [photoType, setPhotoType] = useState<JobPhoto["photo_type"]>(
  // Rental visits need a work photo; client_instruction photos don't satisfy
  // the completion gate, so don't make them the default there.
  job.properties?.is_rental ? "after" : "client_instruction"
)
const [selectedPhotoFiles, setSelectedPhotoFiles] = useState<File[]>([])
const [uploadingPhotos, setUploadingPhotos] = useState(false)
const [photoMessage, setPhotoMessage] = useState<string | null>(null)
const [photoError, setPhotoError] = useState<string | null>(null)
const photoInputRef = useRef<HTMLInputElement | null>(null)

  const [completionWarning, setCompletionWarning] = useState<string | null>(
    null
  )
  const [internalNote, setInternalNote] = useState("")
  const [savingInternalNote, setSavingInternalNote] = useState(false)
  const [internalNoteMessage, setInternalNoteMessage] =
    useState<string | null>(null)
  const [internalNoteError, setInternalNoteError] =
    useState<string | null>(null)

  const property = job.properties
  const propertyAddress = formatPropertyAddress(property)
  const hasServiceDetails =
    hasServiceValue(property?.service_type) ||
    hasServiceValue(property?.service_frequency)
  const jobTypeLabel = getJobTypeLabel(job)
  const isQuotedJob =
    job.invoice_method === "quoted" || job.billing_mode === "quoted"
  const isChargeUpJob =
    !isQuotedJob &&
    (job.invoice_method === "charge_up" || job.billing_mode === "charge_up")
  const isTimeFlexible = job.time_limit_type === "flexible"
  const showChargeUpFlexibleGuidance = isChargeUpJob && isTimeFlexible
  const isRentalProperty = Boolean(property?.is_rental)
  const qualifyingPhotoCount = photos.filter(
    (photo) => photo.photo_type !== "client_instruction"
  ).length
  const photoGateBlocked = isRentalProperty && qualifyingPhotoCount === 0
  const plannedGuideHours =
    job.planned_duration_hours !== null && job.planned_duration_hours !== undefined
      ? Number(job.planned_duration_hours)
      : null
  const quotedAmount =
    job.quoted_amount !== null && job.quoted_amount !== undefined
      ? Number(job.quoted_amount)
      : null
  const formattedQuotedAmount =
    quotedAmount !== null && Number.isFinite(quotedAmount)
      ? new Intl.NumberFormat("en-NZ", {
          style: "currency",
          currency: "NZD",
        }).format(quotedAmount)
      : null

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

  const handleSaveCompletedVisit = async () => {
  if (!completedVisit) return

  setSavingVisit(true)
  setVisitError(null)

  const supabase = createClient()

  const { error } = await supabase
    .from("visits")
    .update({
      hours_worked: visitHoursWorked ? parseFloat(visitHoursWorked) : null,
      work_notes: visitWorkNotes.trim() || null,
      next_visit_notes: visitNextNotes.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", completedVisit.id)

  if (error) {
    setVisitError(error.message)
    setSavingVisit(false)
    return
  }

  setSavingVisit(false)
  setEditVisitOpen(false)
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
      property_address: propertyAddress || null,
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

  const refreshPhotos = async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from("job_photos")
      .select("*")
      .eq("scheduled_job_id", job.id)
      .order("created_at", { ascending: false })

    setPhotos((data as JobPhoto[]) || [])
  }

  const handlePhotoFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    console.log("selected files", files.length)
    setSelectedPhotoFiles(files)
    setPhotoError(null)
    setPhotoMessage(null)
  }

  const handleUploadPhotos = async () => {
    if (selectedPhotoFiles.length === 0) {
      setPhotoError("Please choose one or more photos.")
      return
    }

    setUploadingPhotos(true)
    setPhotoError(null)
    setPhotoMessage(null)

    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    const timestamp = Date.now()

    for (const [index, file] of selectedPhotoFiles.entries()) {
      const safeName = file.name
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, "-")
        .replace(/^-+|-+$/g, "")
      const objectPath = `${job.id}/${timestamp}-${index}-${safeName || "job-photo"}`
      const storagePath = `job-photos/${objectPath}`

      const { error: uploadError } = await supabase.storage
        .from("job-photos")
        .upload(objectPath, file, {
          cacheControl: "3600",
          upsert: false,
        })

      if (uploadError) {
        setPhotoError(uploadError.message)
        setUploadingPhotos(false)
        return
      }

      const { data: publicUrlData } = supabase.storage
        .from("job-photos")
        .getPublicUrl(objectPath)

      const { error: insertError } = await supabase.from("job_photos").insert({
        scheduled_job_id: job.id,
        property_id: job.property_id,
        visit_id: completedVisit?.id || null,
        uploaded_by: user?.id || null,
        storage_path: storagePath,
        public_url: publicUrlData.publicUrl || null,
        caption: photoCaption.trim() || null,
        photo_type: photoType,
      })

      if (insertError) {
        await supabase.storage.from("job-photos").remove([objectPath])
        setPhotoError(insertError.message)
        setUploadingPhotos(false)
        return
      }
    }

    setSelectedPhotoFiles([])
    if (photoInputRef.current) {
      photoInputRef.current.value = ""
    }
    setPhotoCaption("")
    setPhotoMessage("Photo uploaded.")
    await refreshPhotos()
    setUploadingPhotos(false)
    router.refresh()
  }

  const handleDeletePhoto = async (photo: JobPhoto) => {
    const supabase = createClient()
    setPhotoError(null)
    setPhotoMessage(null)
    const objectPath = photo.storage_path.replace(/^job-photos\//, "")

    const { error: storageError } = await supabase.storage
      .from("job-photos")
      .remove([objectPath])

    if (storageError) {
      setPhotoError(storageError.message)
      return
    }

    const { error: deleteError } = await supabase
      .from("job_photos")
      .delete()
      .eq("id", photo.id)

    if (deleteError) {
      setPhotoError(deleteError.message)
      return
    }

    setPhotos((current) => current.filter((item) => item.id !== photo.id))
    setPhotoMessage("Photo deleted.")
    router.refresh()
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

            {isChargeUpJob && (
              <Badge className="border border-emerald-300 bg-emerald-100 text-emerald-900">
                Charge-up
              </Badge>
            )}

            {showChargeUpFlexibleGuidance && (
              <Badge className="border border-sky-300 bg-sky-100 text-sky-900">
                Time Flexible
              </Badge>
            )}

            {isQuotedJob && (
              <Badge className="border border-purple-300 bg-purple-100 text-purple-900">
                Fixed Quote Job
                {formattedQuotedAmount ? ` · ${formattedQuotedAmount}` : ""}
              </Badge>
            )}

            {job.quoted_scope && (
              <Badge className="border border-blue-300 bg-blue-100 text-blue-900">
                Scope Attached
              </Badge>
            )}

            {jobTypeLabel && (
              <Badge variant="outline">{jobTypeLabel}</Badge>
            )}

            {!jobTypeLabel && hasServiceDetails && (
              <Badge variant="outline" className="capitalize">
                {[
                  hasServiceValue(property?.service_type)
                    ? formatServiceValue(property?.service_type)
                    : null,
                  hasServiceValue(property?.service_frequency)
                    ? formatServiceFrequency(property?.service_frequency)
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </Badge>
            )}
          </div>
        </div>
            </header>

      {isQuotedJob && (
        <Card className="mb-4 border-purple-300 bg-purple-50 shadow-sm">
          <CardContent className="p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <Badge className="mb-2 border border-purple-400 bg-white text-purple-900">
                  Quoted / Fixed Price
                </Badge>

                <p className="text-sm font-semibold text-purple-950">
                  Complete the quoted scope. Do not add extra charge-up time unless approved.
                </p>
              </div>

              {formattedQuotedAmount && (
                <div className="rounded-lg border border-purple-200 bg-white px-3 py-2 text-sm font-semibold text-purple-950">
                  Quote amount: {formattedQuotedAmount}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {showChargeUpFlexibleGuidance && (
        <Card className="mb-4 border-emerald-300 bg-emerald-50 shadow-sm">
          <CardContent className="p-4">
            <Badge className="mb-2 border border-emerald-400 bg-white text-emerald-900">
              Charge-up / Time Flexible
            </Badge>

            <p className="text-sm font-semibold text-emerald-950">
              Record actual hours worked. Planned time is a guide only.
            </p>

            {plannedGuideHours !== null && Number.isFinite(plannedGuideHours) && (
              <p className="mt-2 text-sm text-emerald-900">
                Planned guide: {plannedGuideHours} hours
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {completionWarning && (
        <Card className="mb-4 border-red-300 bg-red-50 shadow-sm">
          <CardContent className="p-4">
            <p className="text-sm font-semibold text-red-900">
              {completionWarning}
            </p>
          </CardContent>
        </Card>
      )}

      {photoGateBlocked && status !== "completed" && status !== "cancelled" && (
        <Card className="mb-4 border-amber-300 bg-amber-50 shadow-sm">
          <CardContent className="p-4">
            <Badge className="mb-2 border border-amber-400 bg-white text-amber-900">
              Rental Property
            </Badge>

            <p className="text-sm font-semibold text-amber-950">
              Upload at least one photo of the work before completing this
              visit. Any photo type counts except Client instruction.
            </p>
          </CardContent>
        </Card>
      )}

      {isAdmin && (
        <Card className="mb-4 border-blue-200 bg-blue-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Admin Actions</CardTitle>
          </CardHeader>

          <CardContent className="flex flex-col gap-2 p-4 pt-0">
            <Button
  type="button"
  variant="outline"
  onClick={() => setEditVisitOpen(true)}
  disabled={!completedVisit}
>
  {completedVisit ? "Edit Completed Visit" : "No Completed Visit Yet"}
</Button>
          </CardContent>
        </Card>
      )}

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
                      })}
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

                <p className="whitespace-normal break-words text-muted-foreground">
                  {propertyAddress || "No address"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {jobTypeLabel && (
          <Card>
            <CardContent className="p-4">
              <p className="font-medium text-foreground">{jobTypeLabel}</p>
            </CardContent>
          </Card>
        )}

        {!jobTypeLabel && hasServiceDetails && (
          <Card>
          <CardContent className="p-4">
            <p className="font-medium text-foreground">Service</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {hasServiceValue(property?.service_type) && (
                <Badge variant="outline" className="capitalize">
                  {formatServiceValue(property?.service_type)}
                </Badge>
              )}

              {hasServiceValue(property?.service_frequency) && (
                <Badge variant="outline">
                  {formatServiceFrequency(property?.service_frequency)}
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
        )}

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

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Camera className="h-4 w-4" />
              Job Photos / Client Photos
            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-4 p-4 pt-0">
            {/* Upload stays available to ALL signed-in users, not just admins:
                the rental photo gate depends on crew being able to upload. */}
            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="grid gap-3">
                <input
                  id={`job-photo-upload-${job.id}`}
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="block w-full rounded-md border bg-background p-2 text-sm"
                  onChange={handlePhotoFileChange}
                />

                <p
                  className={cn(
                    "text-xs",
                    selectedPhotoFiles.length === 0
                      ? "text-muted-foreground"
                      : "font-medium text-green-700"
                  )}
                  aria-live="polite"
                >
                  {selectedPhotoFiles.length === 0
                    ? "No photos selected"
                    : `${selectedPhotoFiles.length} photo${
                        selectedPhotoFiles.length === 1 ? "" : "s"
                      } selected`}
                </p>

                <select
                  className="h-11 rounded-md border bg-background px-3 text-sm"
                  value={photoType}
                  onChange={(event) =>
                    setPhotoType(event.target.value as JobPhoto["photo_type"])
                  }
                >
                  <option value="client_instruction">Client instruction</option>
                  <option value="before">Before</option>
                  <option value="after">After</option>
                  <option value="issue">Issue</option>
                  <option value="completion">Completion</option>
                  <option value="other">Other</option>
                </select>

                <Textarea
                  value={photoCaption}
                  onChange={(event) => setPhotoCaption(event.target.value)}
                  rows={2}
                  placeholder="Caption or instruction for staff..."
                />

                <Button
                  type="button"
                  variant="outline"
                  className="h-11"
                  onClick={handleUploadPhotos}
                  disabled={
                    selectedPhotoFiles.length === 0 ||
                    uploadingPhotos === true
                  }
                >
                  {uploadingPhotos ? <Spinner className="mr-2" /> : null}
                  {uploadingPhotos ? "Uploading..." : "Upload photos"}
                </Button>
              </div>
            </div>

            {photoError && (
              <p className="rounded-md bg-red-50 p-2 text-sm text-red-600">
                {photoError}
              </p>
            )}

            {photoMessage && (
              <p className="rounded-md bg-green-50 p-2 text-sm text-green-700">
                {photoMessage}
              </p>
            )}

            {photos.length > 0 ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {photos.map((photo) => (
                  <div key={photo.id} className="rounded-lg border bg-white p-2">
                    <button
                      type="button"
                      className="block w-full overflow-hidden rounded-md border bg-muted"
                      onClick={() => setSelectedPhoto(photo)}
                    >
                      <img
                        src={photo.public_url || ""}
                        alt={photo.caption || "Job photo"}
                        className="aspect-square w-full object-cover"
                      />
                    </button>

                    <div className="mt-2 space-y-1">
                      <Badge variant="outline" className="text-[11px] capitalize">
                        {photo.photo_type.replaceAll("_", " ")}
                      </Badge>

                      {photo.caption && (
                        <p className="line-clamp-2 text-xs text-muted-foreground">
                          {photo.caption}
                        </p>
                      )}

                      {isAdmin && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="mt-1 h-8 w-full text-xs text-red-700"
                          onClick={() => handleDeletePhoto(photo)}
                        >
                          <Trash2 className="mr-1 h-3 w-3" />
                          Delete
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-md border border-dashed bg-muted/30 p-3 text-sm text-muted-foreground">
                No photos uploaded for this job yet.
              </div>
            )}
          </CardContent>
        </Card>

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
                disabled={photoGateBlocked}
              >
                <CheckCircle className="mr-2 h-5 w-5" />
                {photoGateBlocked
                  ? "Photo Required to Complete"
                  : "Complete Visit"}
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
  propertyIsRental={isRentalProperty}
  onSuccess={handleCompleteSuccess}
  onIssueSaveWarning={setCompletionWarning}
/>

      {editVisitOpen && completedVisit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
            <h2 className="mb-1 text-xl font-semibold">
              Edit Completed Visit
            </h2>

            <p className="mb-4 text-sm text-muted-foreground">
              Update the visit details entered by the team.
            </p>

            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium">
                  Hours Worked
                </label>

                <input
                  type="number"
                  step="0.25"
                  className="h-11 w-full rounded-md border px-3"
                  value={visitHoursWorked}
                  onChange={(e) => setVisitHoursWorked(e.target.value)}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">
                  Work Notes
                </label>

                <Textarea
                  value={visitWorkNotes}
                  onChange={(e) => setVisitWorkNotes(e.target.value)}
                  rows={5}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">
                  Next Visit Notes
                </label>

                <Textarea
                  value={visitNextNotes}
                  onChange={(e) => setVisitNextNotes(e.target.value)}
                  rows={4}
                />
              </div>

              {visitError && (
                <p className="rounded-md bg-red-50 p-2 text-sm text-red-600">
                  {visitError}
                </p>
              )}

              <div className="flex gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 flex-1"
                  onClick={() => setEditVisitOpen(false)}
                  disabled={savingVisit}
                >
                  Cancel
                </Button>

                <Button
                  type="button"
                  className="h-11 flex-1"
                  onClick={handleSaveCompletedVisit}
                  disabled={savingVisit}
                >
                  {savingVisit ? "Saving..." : "Save Visit"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedPhoto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setSelectedPhoto(null)}
        >
          <div
            className="max-h-[90vh] w-full max-w-3xl"
            onClick={(event) => event.stopPropagation()}
          >
            <img
              src={selectedPhoto.public_url || ""}
              alt={selectedPhoto.caption || "Job photo"}
              className="max-h-[75vh] w-full rounded-lg object-contain"
            />

            {(selectedPhoto.caption || selectedPhoto.photo_type) && (
              <div className="mt-3 rounded-lg bg-white p-3 text-sm">
                <div className="font-medium capitalize">
                  {selectedPhoto.photo_type.replaceAll("_", " ")}
                </div>
                {selectedPhoto.caption && (
                  <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                    {selectedPhoto.caption}
                  </p>
                )}
              </div>
            )}

            <Button
              type="button"
              className="mt-3 w-full"
              onClick={() => setSelectedPhoto(null)}
            >
              Close
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
