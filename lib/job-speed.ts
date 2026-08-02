// Speed tag (074): one derivation rule, used by every surface that shows a
// job's pace so admin and crew always see the same colour.
//   override wins -> lawn mowing is ALWAYS orange by rule (property speed
//   deliberately does not reach into lawns) -> otherwise the property's
//   speed -> yellow when nothing is set (matches the column default).

export type JobSpeed = "orange" | "yellow" | "green"

export const JOB_SPEED_OPTIONS: { value: JobSpeed; label: string }[] = [
  { value: "orange", label: "Orange — high speed" },
  { value: "yellow", label: "Yellow — medium" },
  { value: "green", label: "Green — detail" },
]

export const JOB_TYPE_CHOICES: { value: string; label: string }[] = [
  { value: "maintenance", label: "Maintenance" },
  { value: "one_off", label: "One-off" },
  { value: "lawn_mowing", label: "Lawn mowing" },
  { value: "spray", label: "Spray" },
  { value: "landscaping", label: "Landscaping" },
]

export function jobTypeLabel(jobType: string | null | undefined): string | null {
  if (jobType === "job") return null // legacy constant, not a real type
  return JOB_TYPE_CHOICES.find((c) => c.value === jobType)?.label ?? null
}

function isSpeed(value: string | null | undefined): value is JobSpeed {
  return value === "orange" || value === "yellow" || value === "green"
}

export function deriveJobSpeed(input: {
  jobType?: string | null
  speedOverride?: string | null
  propertySpeed?: string | null
}): JobSpeed {
  if (isSpeed(input.speedOverride)) return input.speedOverride
  if (input.jobType === "lawn_mowing") return "orange"
  if (isSpeed(input.propertySpeed)) return input.propertySpeed
  return "yellow"
}

export const SPEED_BADGE_CLASSES: Record<JobSpeed, string> = {
  orange: "bg-orange-100 text-orange-800 border border-orange-300",
  yellow: "bg-yellow-100 text-yellow-800 border border-yellow-300",
  green: "bg-green-100 text-green-800 border border-green-300",
}

export const SPEED_BADGE_LABELS: Record<JobSpeed, string> = {
  orange: "High speed",
  yellow: "Medium",
  green: "Detail",
}
