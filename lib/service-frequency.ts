export const serviceFrequencyOptions = [
  { value: "", label: "Not set" },
  { value: "two_weekly", label: "2 Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "six_weekly", label: "6 Weekly" },
  { value: "two_monthly", label: "2 Monthly" },
  { value: "three_monthly", label: "3 Monthly" },
  { value: "four_monthly", label: "4 Monthly" },
  { value: "six_monthly", label: "6 Monthly" },
  { value: "one_off", label: "One-Off" },
]

export function getServiceIntervalWeeks(frequency: string | null | undefined) {
  if (frequency === "two_weekly") return 2
  if (frequency === "monthly") return 4
  if (frequency === "six_weekly") return 6
  if (frequency === "two_monthly") return 8
  if (frequency === "three_monthly") return 12
  if (frequency === "four_monthly") return 16
  if (frequency === "six_monthly") return 26

  return null
}

export function formatServiceFrequency(frequency: string | null | undefined) {
  const option = serviceFrequencyOptions.find((item) => item.value === frequency)

  return option?.label || "Not set"
}

export function formatServiceValue(value: string | null | undefined) {
  if (!value) return "Not set"

  return value.replaceAll("_", " ")
}
