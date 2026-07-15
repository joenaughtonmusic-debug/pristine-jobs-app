import type { SalesLead } from "@/lib/sales-leads"

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || "there"
}

function serviceLabel(service?: string | null) {
  return service?.trim() || "garden work"
}

function suburbLabel(suburb?: string | null) {
  return suburb?.trim() || "your area"
}

export function getContactDraft(
  lead: Pick<SalesLead, "name" | "service_needed" | "suburb" | "message">
) {
  const name = firstName(lead.name)
  const service = serviceLabel(lead.service_needed)
  const suburb = suburbLabel(lead.suburb)
  const serviceKey = service.toLowerCase()

  if (serviceKey.includes("tidy")) {
    return `Hi ${name},

Thanks for your enquiry about a garden tidy up in ${suburb}.

We can help get the property looking tidy and manageable again. If you can send through any photos of the garden, that will help us understand the scope before we visit.

Would you be happy for us to book a quick quote visit? Let us know which days or times suit you best.

Kind regards,
Pristine Gardens`
  }

  if (serviceKey.includes("maintenance") || serviceKey.includes("mow")) {
    return `Hi ${name},

Thanks for getting in touch about ${service.toLowerCase()} in ${suburb}.

We specialise in reliable ongoing garden care across Auckland. Happy to talk through what you need and whether regular visits would suit the property.

Are you available for a quick quote visit this week? Let us know which days or times suit you best.

Kind regards,
Pristine Gardens`
  }

  if (serviceKey.includes("hedge")) {
    return `Hi ${name},

Thanks for your enquiry about hedge work in ${suburb}.

We can take a look and advise on the best tidy-up or ongoing trimming approach for the property.

Would you like us to arrange a quote visit? Let us know which days or times suit you best.

Kind regards,
Pristine Gardens`
  }

  return `Hi ${name},

Thanks for your enquiry about ${service.toLowerCase()} in ${suburb}.

We would love to help. If you can share any photos or extra detail about the garden, that will help us point you in the right direction.

Would you be happy for us to arrange a quote visit? Let us know which days or times suit you best.

Kind regards,
Pristine Gardens`
}

export function getFollowUpDraft(
  lead: Pick<SalesLead, "name" | "service_needed" | "suburb">
) {
  const name = firstName(lead.name)
  const service = serviceLabel(lead.service_needed)

  return `Hi ${name},

Just following up on the quote we sent through for ${service.toLowerCase()}.

Happy to answer any questions or adjust the scope if needed. If you would like to go ahead, we can get you booked in.

Kind regards,
Pristine Gardens`
}
