// Walk-around issue severity for rental visit reports.
// An issue is a job_photos row with photo_type "issue" and a severity;
// see scripts/060_job_photos_issue_severity.sql.

export const WALK_AROUND_SEVERITIES = ["urgent", "soon", "cosmetic"] as const

export type WalkAroundSeverity = (typeof WALK_AROUND_SEVERITIES)[number]

export const SEVERITY_LABELS: Record<WalkAroundSeverity, string> = {
  urgent: "Urgent",
  soon: "Soon",
  cosmetic: "Cosmetic",
}

// Matches the admin priority pill convention (admin-actions-client.tsx).
export const SEVERITY_BADGE_CLASSES: Record<WalkAroundSeverity, string> = {
  urgent: "bg-red-100 text-red-800",
  soon: "bg-orange-100 text-orange-800",
  cosmetic: "bg-gray-100 text-gray-700",
}

const SEVERITY_RANK: Record<WalkAroundSeverity, number> = {
  urgent: 0,
  soon: 1,
  cosmetic: 2,
}

export function severityRank(severity: string | null | undefined): number {
  if (severity && severity in SEVERITY_RANK) {
    return SEVERITY_RANK[severity as WalkAroundSeverity]
  }
  return WALK_AROUND_SEVERITIES.length
}

export function worstSeverity(
  severities: (string | null | undefined)[]
): WalkAroundSeverity | null {
  let worst: WalkAroundSeverity | null = null
  for (const severity of severities) {
    if (
      severity &&
      WALK_AROUND_SEVERITIES.includes(severity as WalkAroundSeverity) &&
      (worst === null || severityRank(severity) < severityRank(worst))
    ) {
      worst = severity as WalkAroundSeverity
    }
  }
  return worst
}
