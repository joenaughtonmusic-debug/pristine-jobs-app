"use client"

import { useEffect, useMemo, useState } from "react"
import { createClient } from "@/lib/supabase/client"

type QuoteTemplate = {
  id: string
  name: string
  category: string | null
  customer_scope: string | null
  internal_notes: string | null
  terms_conditions: string | null
  frequency: string | null
  labour_hours: number | null
  labour_rate: number | null
  greenwaste_bags: number | null
  greenwaste_rate: number | null
  sprays_size: string | null
  sprays_price: number | null
  fertiliser_size: string | null
  fertiliser_price: number | null
  stump_paste_size: string | null
  stump_paste_price: number | null
  is_active: boolean | null
}

type TemplateForm = {
  name: string
  category: string
  customer_scope: string
  internal_notes: string
  terms_conditions: string
  frequency: string
  labour_hours: number
  labour_rate: number
  greenwaste_bags: number
  greenwaste_rate: number
  sprays_size: string
  sprays_price: number
  fertiliser_size: string
  fertiliser_price: number
  stump_paste_size: string
  stump_paste_price: number
  is_active: boolean
}

type Props = {
  queryError: string | null
  templates: QuoteTemplate[]
}

const maintenanceTemplateOrder = [
  "Monthly Maintenance",
  "6 Weekly Maintenance",
  "2 Monthly Maintenance",
  "3 Monthly Maintenance",
  "4 Monthly Maintenance",
  "6 Monthly Maintenance",
]

const categories = [
  "Maintenance",
  "Landscape",
  "Planting",
  "Fencing",
  "Decking",
  "Retaining",
  "Other",
]

const frequencyOptions = [
  { value: "", label: "No frequency" },
  { value: "weekly", label: "Weekly" },
  { value: "fortnightly", label: "Fortnightly" },
  { value: "3_weekly", label: "3 Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "6_weekly", label: "6 Weekly" },
  { value: "2_monthly", label: "2 Monthly" },
  { value: "3_monthly", label: "3 Monthly" },
  { value: "4_monthly", label: "4 Monthly" },
  { value: "6_monthly", label: "6 Monthly" },
]

const gardenFrequencyOptions = [
  { value: "weekly", label: "Weekly" },
  { value: "fortnightly", label: "Fortnightly" },
  { value: "monthly", label: "Monthly" },
  { value: "2_monthly", label: "2 Monthly" },
  { value: "3_monthly", label: "3 Monthly" },
]

const lawnFrequencyOptions = [
  { value: "weekly", label: "Weekly" },
  { value: "fortnightly", label: "Fortnightly" },
  { value: "3_weekly", label: "3 Weekly" },
  { value: "monthly", label: "Monthly" },
]

const intensityOptions = [
  { value: "light", label: "Light" },
  { value: "medium", label: "Medium" },
  { value: "heavy", label: "Heavy" },
]

function formatOptionLabel(
  options: { value: string; label: string }[],
  value: string
) {
  return options.find((option) => option.value === value)?.label || value
}

function calculateMonthlyEquivalent(perVisitPrice: number, frequency: string) {
  if (frequency === "weekly") return (perVisitPrice * 52) / 12
  if (frequency === "fortnightly") return (perVisitPrice * 26) / 12
  if (frequency === "3_weekly") return (perVisitPrice * 52) / 12 / 3
  if (frequency === "monthly") return perVisitPrice
  if (frequency === "6_weekly") return (perVisitPrice * 52) / 12 / 6
  if (frequency === "2_monthly") return perVisitPrice / 2
  if (frequency === "3_monthly") return perVisitPrice / 3
  if (frequency === "4_monthly") return perVisitPrice / 4
  if (frequency === "6_monthly") return perVisitPrice / 6
  return null
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-NZ", {
    style: "currency",
    currency: "NZD",
  }).format(value)
}

function getTemplatePerVisitPrice(template: QuoteTemplate | null) {
  if (
    !template ||
    template.labour_hours === null ||
    template.labour_rate === null
  ) {
    return null
  }

  return (
    Number(template.labour_hours || 0) * Number(template.labour_rate || 0) +
    Number(template.greenwaste_bags || 0) * Number(template.greenwaste_rate || 0) +
    Number(template.sprays_price || 0) +
    Number(template.fertiliser_price || 0) +
    Number(template.stump_paste_price || 0)
  )
}

function templateToForm(template: QuoteTemplate): TemplateForm {
  return {
    name: template.name,
    category: template.category || "Maintenance",
    customer_scope: template.customer_scope || "",
    internal_notes: template.internal_notes || "",
    terms_conditions: template.terms_conditions || "",
    frequency: template.frequency || "",
    labour_hours: Number(template.labour_hours || 0),
    labour_rate: Number(template.labour_rate || 90),
    greenwaste_bags: Number(template.greenwaste_bags || 0),
    greenwaste_rate: Number(template.greenwaste_rate || 26.5),
    sprays_size: template.sprays_size || "small",
    sprays_price: Number(template.sprays_price || 5),
    fertiliser_size: template.fertiliser_size || "small",
    fertiliser_price: Number(template.fertiliser_price || 7.5),
    stump_paste_size: template.stump_paste_size || "small",
    stump_paste_price: Number(template.stump_paste_price || 7),
    is_active: Boolean(template.is_active),
  }
}

export function AdminQuoteTemplatesClient({
  queryError,
  templates: initialTemplates,
}: Props) {
  const supabase = createClient()
  const [templates, setTemplates] = useState(initialTemplates)
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)
  const [form, setForm] = useState<TemplateForm | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [previewCustomer, setPreviewCustomer] = useState("")
  const [includeGarden, setIncludeGarden] = useState(true)
  const [includeLawn, setIncludeLawn] = useState(false)
  const [gardenFrequency, setGardenFrequency] = useState("monthly")
  const [gardenIntensity, setGardenIntensity] = useState("medium")
  const [lawnFrequency, setLawnFrequency] = useState("fortnightly")
  const [lawnSeasonalIncrease, setLawnSeasonalIncrease] = useState(true)

  const orderedTemplates = useMemo(() => {
    return [...templates]
      .sort((a, b) => {
        const aIndex = maintenanceTemplateOrder.indexOf(a.name)
        const bIndex = maintenanceTemplateOrder.indexOf(b.name)

        if (aIndex === -1 && bIndex === -1) {
          return a.name.localeCompare(b.name)
        }

        if (aIndex === -1) return 1
        if (bIndex === -1) return -1

        return (
          aIndex -
          bIndex
        )
      })
  }, [templates])

  const selectedTemplate =
    orderedTemplates.find((template) => template.id === selectedTemplateId) ||
    null
  const selectedTemplatePerVisitPrice = getTemplatePerVisitPrice(selectedTemplate)
  const gardenMonthlyEquivalent =
    selectedTemplatePerVisitPrice === null
      ? null
      : calculateMonthlyEquivalent(selectedTemplatePerVisitPrice, gardenFrequency)
  const gardenNeedsReview =
    includeGarden &&
    (!selectedTemplate ||
      selectedTemplatePerVisitPrice === null ||
      gardenMonthlyEquivalent === null)
  const lawnNeedsReview = includeLawn
  const packageNeedsReview =
    (includeGarden && gardenNeedsReview) || (includeLawn && lawnNeedsReview)
  const combinedPreviewLines = [
    includeGarden
      ? `Garden maintenance - ${formatOptionLabel(
          gardenFrequencyOptions,
          gardenFrequency
        ).toLowerCase()} ${formatOptionLabel(
          intensityOptions,
          gardenIntensity
        ).toLowerCase()} service`
      : null,
    includeLawn
      ? `Lawn maintenance - ${formatOptionLabel(
          lawnFrequencyOptions,
          lawnFrequency
        ).toLowerCase()} service${
          lawnSeasonalIncrease ? " with increased spring/summer frequency" : ""
        }`
      : null,
  ].filter(Boolean)

  useEffect(() => {
    if (selectedTemplateId || orderedTemplates.length === 0) return

    const monthlyTemplate =
      orderedTemplates.find((template) => template.name === "Monthly Maintenance") ||
      orderedTemplates[0]

    setSelectedTemplateId(monthlyTemplate.id)
    setForm(templateToForm(monthlyTemplate))
  }, [orderedTemplates, selectedTemplateId])

  const selectTemplate = (template: QuoteTemplate) => {
    setSelectedTemplateId(template.id)
    setForm(templateToForm(template))
    setMessage(null)
    setError(null)
  }

  const reloadSavedValues = () => {
    if (!selectedTemplate) return

    setForm(templateToForm(selectedTemplate))
    setMessage("Saved values reloaded.")
    setError(null)
  }

  const loadTemplates = async () => {
    const { data } = await supabase
      .from("quote_templates")
      .select("*")
      .order("name", { ascending: true })

    setTemplates((data || []) as QuoteTemplate[])
  }

  const saveTemplate = async () => {
    if (!selectedTemplate || !form) return

    setSaving(true)
    setMessage(null)
    setError(null)

    const { error: saveError } = await supabase
      .from("quote_templates")
      .update({
        name: form.name.trim(),
        category: form.category || null,
        customer_scope: form.customer_scope.trim() || null,
        internal_notes: form.internal_notes.trim() || null,
        terms_conditions: form.terms_conditions.trim() || null,
        frequency: form.frequency || null,
        labour_hours: form.labour_hours,
        labour_rate: form.labour_rate,
        greenwaste_bags: form.greenwaste_bags,
        greenwaste_rate: form.greenwaste_rate,
        sprays_size: form.sprays_size || null,
        sprays_price: form.sprays_price,
        fertiliser_size: form.fertiliser_size || null,
        fertiliser_price: form.fertiliser_price,
        stump_paste_size: form.stump_paste_size || null,
        stump_paste_price: form.stump_paste_price,
        is_active: form.is_active,
        updated_at: new Date().toISOString(),
      })
      .eq("id", selectedTemplate.id)

    setSaving(false)

    if (saveError) {
      setError(saveError.message)
      return
    }

    await loadTemplates()
    setMessage("Template saved.")
  }

  return (
    <div className="mx-auto max-w-7xl p-4 pb-10">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">Template Settings</h1>
        <p className="text-sm text-gray-500">
          Edit the saved maintenance quote templates used by the Quote Builder.
        </p>
      </header>

      {queryError && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Error loading quote templates: {queryError}
        </div>
      )}

      <section className="mb-6 rounded-xl border bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">New Maintenance Quote</h2>
            <p className="mt-1 text-sm text-gray-500">
              Build a customer-facing package from separate service components.
              Garden maintenance and lawn maintenance stay separate internally
              for scheduling and pricing review.
            </p>
          </div>

          {packageNeedsReview && (
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-900">
              Needs review
            </span>
          )}
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_1fr]">
          <div className="space-y-4">
            <div className="rounded-lg border bg-gray-50 p-4">
              <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                1. Select customer/property
              </div>
              <input
                className="h-10 w-full rounded-md border bg-white px-3 text-sm"
                value={previewCustomer}
                onChange={(event) => setPreviewCustomer(event.target.value)}
                placeholder="Preview customer or property name"
              />
              <p className="mt-2 text-xs text-gray-500">
                Final customer/property selection still happens in the Quote
                Builder. This preview is for package structure only.
              </p>
            </div>

            <div className="rounded-lg border bg-gray-50 p-4">
              <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                2. Add service component
              </div>

              <div className="space-y-3">
                <label className="flex items-start gap-3 rounded-md border bg-white p-3 text-sm">
                  <input
                    type="checkbox"
                    checked={includeGarden}
                    onChange={(event) => setIncludeGarden(event.target.checked)}
                    className="mt-1"
                  />
                  <span>
                    <span className="block font-medium text-gray-900">
                      Garden Maintenance
                    </span>
                    <span className="text-gray-500">
                      Uses the selected saved maintenance template as the garden
                      component basis.
                    </span>
                  </span>
                </label>

                {includeGarden && (
                  <div className="grid gap-3 rounded-md border bg-white p-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-1 block text-sm font-medium">
                        Frequency
                      </span>
                      <select
                        className="h-10 w-full rounded-md border px-3 text-sm"
                        value={gardenFrequency}
                        onChange={(event) => setGardenFrequency(event.target.value)}
                      >
                        {gardenFrequencyOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="block">
                      <span className="mb-1 block text-sm font-medium">
                        Intensity
                      </span>
                      <select
                        className="h-10 w-full rounded-md border px-3 text-sm"
                        value={gardenIntensity}
                        onChange={(event) => setGardenIntensity(event.target.value)}
                      >
                        {intensityOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                )}

                <label className="flex items-start gap-3 rounded-md border bg-white p-3 text-sm">
                  <input
                    type="checkbox"
                    checked={includeLawn}
                    onChange={(event) => setIncludeLawn(event.target.checked)}
                    className="mt-1"
                  />
                  <span>
                    <span className="block font-medium text-gray-900">
                      Lawn Maintenance
                    </span>
                    <span className="text-gray-500">
                      Separate component for future lawn scheduling and pricing
                      logic.
                    </span>
                  </span>
                </label>

                {includeLawn && (
                  <div className="grid gap-3 rounded-md border bg-white p-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-1 block text-sm font-medium">
                        Frequency
                      </span>
                      <select
                        className="h-10 w-full rounded-md border px-3 text-sm"
                        value={lawnFrequency}
                        onChange={(event) => setLawnFrequency(event.target.value)}
                      >
                        {lawnFrequencyOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="flex items-center gap-3 rounded-md border px-3 text-sm font-medium">
                      <input
                        type="checkbox"
                        checked={lawnSeasonalIncrease}
                        onChange={(event) =>
                          setLawnSeasonalIncrease(event.target.checked)
                        }
                      />
                      Increase during spring/summer
                    </label>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-lg border p-4">
              <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                3. Combined customer-facing preview
              </div>
              <h3 className="font-semibold text-gray-900">
                {previewCustomer.trim() || "Maintenance package"}
              </h3>
              <div className="mt-3 space-y-2 text-sm text-gray-700">
                {combinedPreviewLines.length > 0 ? (
                  combinedPreviewLines.map((line) => <p key={line}>{line}</p>)
                ) : (
                  <p>No service components selected.</p>
                )}
              </div>

              <div className="mt-4 rounded-md bg-gray-50 p-3 text-sm">
                <div className="font-medium text-gray-900">
                  Customer package amount
                </div>
                {includeGarden && gardenMonthlyEquivalent !== null && !includeLawn ? (
                  <p className="mt-1 text-gray-700">
                    {formatCurrency(gardenMonthlyEquivalent)} per month
                  </p>
                ) : (
                  <p className="mt-1 text-amber-800">Needs review</p>
                )}
              </div>
            </div>

            <div className="rounded-lg border bg-gray-50 p-4">
              <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                4. Internal component breakdown
              </div>

              <div className="space-y-3 text-sm">
                {includeGarden && (
                  <div className="rounded-md border bg-white p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium text-gray-900">
                          Garden Maintenance
                        </div>
                        <div className="mt-1 text-gray-500">
                          {formatOptionLabel(gardenFrequencyOptions, gardenFrequency)} ·{" "}
                          {formatOptionLabel(intensityOptions, gardenIntensity)}
                        </div>
                        <div className="mt-1 text-gray-500">
                          Template: {selectedTemplate?.name || "No template selected"}
                        </div>
                      </div>
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-medium ${
                          gardenNeedsReview
                            ? "bg-amber-100 text-amber-900"
                            : "bg-green-100 text-green-800"
                        }`}
                      >
                        {gardenNeedsReview ? "Needs review" : "Ready"}
                      </span>
                    </div>
                    {!gardenNeedsReview && selectedTemplatePerVisitPrice !== null && (
                      <div className="mt-3 text-gray-600">
                        Internal per-visit basis:{" "}
                        {formatCurrency(selectedTemplatePerVisitPrice)}
                      </div>
                    )}
                  </div>
                )}

                {includeLawn && (
                  <div className="rounded-md border bg-white p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium text-gray-900">
                          Lawn Maintenance
                        </div>
                        <div className="mt-1 text-gray-500">
                          {formatOptionLabel(lawnFrequencyOptions, lawnFrequency)}
                          {lawnSeasonalIncrease
                            ? " · seasonal spring/summer increase"
                            : ""}
                        </div>
                        <div className="mt-1 text-gray-500">
                          Separate lawn template/pricing fields are not available yet.
                        </div>
                      </div>
                      <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-900">
                        Needs review
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <section className="rounded-xl border bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold">Template Settings</h2>

          <div className="space-y-3">
            {orderedTemplates.length > 0 ? (
              orderedTemplates.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => selectTemplate(template)}
                  className={`w-full rounded-lg border p-4 text-left transition hover:border-blue-300 hover:bg-blue-50/40 ${
                    selectedTemplateId === template.id
                      ? "border-blue-500 bg-blue-50"
                      : "bg-white"
                  }`}
                >
                  <div className="font-semibold text-gray-900">
                    {template.name}
                  </div>

                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    {template.frequency && (
                      <span className="rounded-full bg-amber-100 px-2 py-1 text-amber-800">
                        {template.frequency}
                      </span>
                    )}
                    <span
                      className={`rounded-full px-2 py-1 ${
                        template.is_active
                          ? "bg-green-100 text-green-800"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {template.is_active ? "Active" : "Inactive"}
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-gray-600">
                    <span>{Number(template.labour_hours || 0)} hrs</span>
                    <span>{Number(template.greenwaste_bags || 0)} bags</span>
                  </div>
                </button>
              ))
            ) : (
              <div className="rounded-lg border border-dashed p-4 text-sm text-gray-500">
                No templates returned from Supabase query.
              </div>
            )}
          </div>
        </section>

        <section className="rounded-xl border bg-white p-4 shadow-sm">
          {!selectedTemplate || !form ? (
            <div className="rounded-lg border border-dashed p-4 text-sm text-gray-500">
              Select a template to edit.
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">
                    {selectedTemplate.name}
                  </h2>
                  <p className="text-sm text-gray-500">
                    Editing saved template values.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={reloadSavedValues}
                  className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-gray-50"
                >
                  Reload Saved Values
                </button>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium">
                    Name
                  </label>
                  <input
                    className="h-10 w-full rounded-md border px-3"
                    value={form.name}
                    onChange={(event) =>
                      setForm((current) =>
                        current ? { ...current, name: event.target.value } : current
                      )
                    }
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium">
                    Category
                  </label>
                  <select
                    className="h-10 w-full rounded-md border px-3"
                    value={form.category}
                    onChange={(event) =>
                      setForm((current) =>
                        current
                          ? { ...current, category: event.target.value }
                          : current
                      )
                    }
                  >
                    {categories.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="mb-1 block text-sm font-medium">
                    Customer Scope
                  </label>
                  <textarea
                    className="min-h-[140px] w-full rounded-md border p-3"
                    value={form.customer_scope}
                    onChange={(event) =>
                      setForm((current) =>
                        current
                          ? { ...current, customer_scope: event.target.value }
                          : current
                      )
                    }
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="mb-1 block text-sm font-medium">
                    Internal Notes
                  </label>
                  <textarea
                    className="min-h-[90px] w-full rounded-md border p-3"
                    value={form.internal_notes}
                    onChange={(event) =>
                      setForm((current) =>
                        current
                          ? { ...current, internal_notes: event.target.value }
                          : current
                      )
                    }
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="mb-1 block text-sm font-medium">
                    Terms & Conditions
                  </label>
                  <textarea
                    className="min-h-[90px] w-full rounded-md border p-3"
                    value={form.terms_conditions}
                    onChange={(event) =>
                      setForm((current) =>
                        current
                          ? { ...current, terms_conditions: event.target.value }
                          : current
                      )
                    }
                  />
                </div>
              </div>

              <div className="rounded-lg border bg-gray-50 p-4">
                <h3 className="mb-3 font-semibold">Pricing Assumptions</h3>

                <div className="grid gap-4 md:grid-cols-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium">
                      Frequency
                    </label>
                    <select
                      className="h-10 w-full rounded-md border bg-white px-3"
                      value={form.frequency}
                      onChange={(event) =>
                        setForm((current) =>
                          current
                            ? { ...current, frequency: event.target.value }
                            : current
                        )
                      }
                    >
                      {frequencyOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <NumberField
                    label="Labour Hours"
                    value={form.labour_hours}
                    step="0.25"
                    onChange={(value) =>
                      setForm((current) =>
                        current ? { ...current, labour_hours: value } : current
                      )
                    }
                  />
                  <NumberField
                    label="Labour Rate"
                    value={form.labour_rate}
                    step="0.01"
                    onChange={(value) =>
                      setForm((current) =>
                        current ? { ...current, labour_rate: value } : current
                      )
                    }
                  />
                  <NumberField
                    label="Greenwaste Bags"
                    value={form.greenwaste_bags}
                    step="0.5"
                    onChange={(value) =>
                      setForm((current) =>
                        current ? { ...current, greenwaste_bags: value } : current
                      )
                    }
                  />
                  <NumberField
                    label="Greenwaste Rate"
                    value={form.greenwaste_rate}
                    step="0.01"
                    onChange={(value) =>
                      setForm((current) =>
                        current ? { ...current, greenwaste_rate: value } : current
                      )
                    }
                  />

                  <AllowanceFields
                    label="Sprays / Extras"
                    size={form.sprays_size}
                    price={form.sprays_price}
                    onSizeChange={(value) =>
                      setForm((current) =>
                        current ? { ...current, sprays_size: value } : current
                      )
                    }
                    onPriceChange={(value) =>
                      setForm((current) =>
                        current ? { ...current, sprays_price: value } : current
                      )
                    }
                  />
                  <AllowanceFields
                    label="Fertiliser"
                    size={form.fertiliser_size}
                    price={form.fertiliser_price}
                    onSizeChange={(value) =>
                      setForm((current) =>
                        current ? { ...current, fertiliser_size: value } : current
                      )
                    }
                    onPriceChange={(value) =>
                      setForm((current) =>
                        current ? { ...current, fertiliser_price: value } : current
                      )
                    }
                  />
                  <AllowanceFields
                    label="Stump Paste"
                    size={form.stump_paste_size}
                    price={form.stump_paste_price}
                    onSizeChange={(value) =>
                      setForm((current) =>
                        current ? { ...current, stump_paste_size: value } : current
                      )
                    }
                    onPriceChange={(value) =>
                      setForm((current) =>
                        current ? { ...current, stump_paste_price: value } : current
                      )
                    }
                  />

                  <label className="flex h-10 items-center gap-3 rounded-md border bg-white px-3 text-sm font-medium md:self-end">
                    <input
                      type="checkbox"
                      checked={form.is_active}
                      onChange={(event) =>
                        setForm((current) =>
                          current
                            ? { ...current, is_active: event.target.checked }
                            : current
                        )
                      }
                    />
                    Active
                  </label>
                </div>
              </div>

              {message && (
                <div className="rounded-md bg-green-50 p-3 text-sm text-green-700">
                  {message}
                </div>
              )}

              {error && (
                <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={saveTemplate}
                  disabled={saving}
                  className="h-11 rounded-md bg-blue-600 px-5 font-medium text-white disabled:bg-gray-300"
                >
                  {saving ? "Saving..." : "Save Template"}
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function NumberField({
  label,
  value,
  step,
  onChange,
}: {
  label: string
  value: number
  step: string
  onChange: (value: number) => void
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium">{label}</label>
      <input
        type="number"
        step={step}
        className="h-10 w-full rounded-md border bg-white px-3"
        value={value}
        onChange={(event) => onChange(Number(event.target.value || 0))}
      />
    </div>
  )
}

function AllowanceFields({
  label,
  size,
  price,
  onSizeChange,
  onPriceChange,
}: {
  label: string
  size: string
  price: number
  onSizeChange: (value: string) => void
  onPriceChange: (value: number) => void
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium">{label}</label>
      <select
        className="h-10 w-full rounded-md border bg-white px-3"
        value={size}
        onChange={(event) => onSizeChange(event.target.value)}
      >
        <option value="none">None</option>
        <option value="small">Small</option>
        <option value="large">Large</option>
      </select>
      <input
        type="number"
        step="0.01"
        className="mt-2 h-10 w-full rounded-md border bg-white px-3"
        value={price}
        onChange={(event) => onPriceChange(Number(event.target.value || 0))}
      />
    </div>
  )
}
