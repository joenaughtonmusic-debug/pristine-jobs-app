// PM issue report PDF — written for a property manager who has never seen our
// app. Rules (owner): property address, visit date, our name, and each issue as
// photo + note. NO internal IDs, NO jargon, NO severity words. Issues are
// ordered most-important-first (severity is used only for ORDER here, never
// printed), so the PM reads the pressing items first without seeing our labels.
import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer"
import { severityRank } from "@/lib/walk-around"

export type PmReportIssue = {
  photoUrl: string
  note: string | null
  // internal only — used to order issues, never rendered
  severity?: string | null
}

export type PmReportData = {
  businessName: string
  propertyAddress: string
  visitDate: string // pre-formatted, e.g. "17 July 2026"
  pmName?: string | null
  contactLine?: string | null // e.g. "Pristine Gardens · 021 xxx xxx · admin@..."
  issues: PmReportIssue[]
}

const styles = StyleSheet.create({
  page: { paddingTop: 48, paddingBottom: 56, paddingHorizontal: 48, fontSize: 11, color: "#1f2937", fontFamily: "Helvetica", lineHeight: 1.4 },
  business: { fontSize: 18, fontFamily: "Helvetica-Bold", color: "#14532d" },
  reportTitle: { fontSize: 12, color: "#4b5563", marginTop: 2 },
  rule: { borderBottomWidth: 1, borderBottomColor: "#d1d5db", marginTop: 12, marginBottom: 16 },
  metaRow: { flexDirection: "row", marginBottom: 4 },
  metaLabel: { width: 90, color: "#6b7280" },
  metaValue: { flex: 1, fontFamily: "Helvetica-Bold" },
  intro: { marginTop: 12, marginBottom: 8 },
  issue: { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: "#e5e7eb" },
  issueNumber: { fontFamily: "Helvetica-Bold", marginBottom: 6 },
  issuePhoto: { width: 320, maxHeight: 240, objectFit: "contain", borderRadius: 4, marginBottom: 6 },
  issueNote: { fontSize: 11 },
  noIssues: { marginTop: 16, fontFamily: "Helvetica-Bold" },
  footer: { position: "absolute", bottom: 28, left: 48, right: 48, fontSize: 9, color: "#9ca3af", borderTopWidth: 1, borderTopColor: "#e5e7eb", paddingTop: 8 },
})

function PmReportDocument({ data }: { data: PmReportData }) {
  const ordered = [...data.issues].sort(
    (a, b) => severityRank(a.severity) - severityRank(b.severity)
  )

  return (
    <Document title={`Property visit report — ${data.propertyAddress}`}>
      <Page size="A4" style={styles.page} wrap>
        <View>
          <Text style={styles.business}>{data.businessName}</Text>
          <Text style={styles.reportTitle}>Property visit report</Text>
        </View>
        <View style={styles.rule} />

        {data.pmName ? (
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Prepared for</Text>
            <Text style={styles.metaValue}>{data.pmName}</Text>
          </View>
        ) : null}
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Property</Text>
          <Text style={styles.metaValue}>{data.propertyAddress}</Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Visit date</Text>
          <Text style={styles.metaValue}>{data.visitDate}</Text>
        </View>

        {ordered.length > 0 ? (
          <>
            <Text style={styles.intro}>
              During our recent visit we noticed the following at this property.
              Photos are included for each item.
            </Text>
            {ordered.map((issue, index) => (
              <View key={index} style={styles.issue} wrap={false}>
                <Text style={styles.issueNumber}>Item {index + 1}</Text>
                {issue.photoUrl ? (
                  <Image style={styles.issuePhoto} src={issue.photoUrl} />
                ) : null}
                <Text style={styles.issueNote}>
                  {issue.note?.trim() || "No further detail was noted."}
                </Text>
              </View>
            ))}
          </>
        ) : (
          <Text style={styles.noIssues}>
            No issues were noted at this visit.
          </Text>
        )}

        {data.contactLine ? (
          <Text style={styles.footer} fixed>
            {data.contactLine}
          </Text>
        ) : null}
      </Page>
    </Document>
  )
}

export async function renderPmReportPdf(data: PmReportData): Promise<Buffer> {
  return renderToBuffer(<PmReportDocument data={data} />)
}
