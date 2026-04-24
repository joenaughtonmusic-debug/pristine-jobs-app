"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Spinner } from "@/components/ui/spinner"
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
} from "lucide-react"
import type { ScheduledJob, Visit } from "@/lib/types"
import { cn } from "@/lib/utils"
import { CompleteVisitDialog } from "./complete-visit-dialog"

interface JobDetailProps {
  job: ScheduledJob
  recentVisits: Visit[]
  latestNextVisitNote: string | null
}

export function JobDetail({ job, recentVisits, latestNextVisitNote }: JobDetailProps) {
  const router = useRouter()
  const [status, setStatus] = useState(job.status)
  const [loading, setLoading] = useState(false)
  const [showCompleteDialog, setShowCompleteDialog] = useState(false)

  const property = job.properties

  const handleStartJob = async () => {
    setLoading(true)
    const supabase = createClient()

    const { error } = await supabase
      .from("scheduled_jobs")
      .update({ status: "in_progress", updated_at: new Date().toISOString() })
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

  return (
    <div className="p-4 pb-8">
      <header className="flex items-center gap-3 mb-6">
        <Link href="/jobs">
          <Button variant="ghost" size="icon" className="shrink-0">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-foreground truncate">
            {property?.client_name || "Unknown Client"}
          </h1>
          <Badge
            variant="secondary"
            className={cn(
              "mt-1",
              status === "scheduled" && "bg-secondary text-secondary-foreground",
              status === "in_progress" && "bg-primary text-primary-foreground",
              status === "completed" && "bg-chart-5 text-foreground",
              status === "cancelled" && "bg-muted text-muted-foreground"
            )}
          >
            {status === "in_progress"
              ? "In Progress"
              : status.charAt(0).toUpperCase() + status.slice(1)}
          </Badge>
        </div>
      </header>

      <div className="flex flex-col gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <MapPin className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-foreground">Address</p>
                <p className="text-muted-foreground">
                  {property?.address_line_1 || "No address"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {property?.access_notes && (
          <Card>
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <Key className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-foreground">Access Notes</p>
                  <p className="text-muted-foreground whitespace-pre-wrap">
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
                <StickyNote className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-foreground">Permanent Notes</p>
                  <p className="text-muted-foreground whitespace-pre-wrap">
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
                <MessageSquare className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-foreground">Next Visit Note</p>
                  <p className="text-muted-foreground whitespace-pre-wrap">
                    {latestNextVisitNote}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {recentVisits.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="w-4 h-4" />
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
                        {new Date(visit.visit_date).toLocaleDateString("en-AU", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                      <span className="font-medium">{visit.hours_worked}h</span>
                    </div>
                    {visit.work_notes && (
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
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
          <div className="flex flex-col gap-3 mt-2">
            {status === "scheduled" && (
              <Button
                size="lg"
                className="h-14 text-base"
                onClick={handleStartJob}
                disabled={loading}
              >
                {loading ? <Spinner className="mr-2" /> : <Play className="w-5 h-5 mr-2" />}
                Start Job
              </Button>
            )}

            {status === "in_progress" && (
              <Button
                size="lg"
                className="h-14 text-base"
                onClick={() => setShowCompleteDialog(true)}
              >
                <CheckCircle className="w-5 h-5 mr-2" />
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
              <XCircle className="w-5 h-5 mr-2" />
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
        onSuccess={handleCompleteSuccess}
      />
    </div>
  )
}