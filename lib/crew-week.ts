import { toZonedTime } from "date-fns-tz"

export const NZ_TIME_ZONE = "Pacific/Auckland"

// Crew surfaces roll over to the coming week from 9am Sunday (Auckland time), so
// the guys can log in on a Sunday morning and prepare for the week ahead. Before
// 9am Sunday they still see the week just worked.
export const CREW_WEEK_ROLLOVER_HOUR = 9

// toZonedTime returns a Date whose *local* fields read as Auckland time, so
// getDay()/getHours() on the result are Auckland's day and hour.
export function nowInNZ() {
  return toZonedTime(new Date(), NZ_TIME_ZONE)
}

export function toDateString(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")

  return `${year}-${month}-${day}`
}

// Monday of the calendar week containing `date` (weeks run Monday to Sunday).
export function getMonday(date: Date) {
  const d = new Date(date)
  const mondayOffset = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - mondayOffset)
  return d
}

// True once it is Sunday 9am or later in Auckland — the point where crew job
// lists switch to the coming week.
export function isCrewWeekRolledOver(now: Date) {
  return now.getDay() === 0 && now.getHours() >= CREW_WEEK_ROLLOVER_HOUR
}

// The Monday of the week the crew should be looking at for jobs.
export function getCrewWeekMonday(now: Date) {
  const monday = getMonday(now)

  if (isCrewWeekRolledOver(now)) {
    monday.setDate(monday.getDate() + 7)
  }

  return monday
}

// The five working days (Mon–Fri) of the week starting at `monday`.
export function getWeekDays(monday: Date) {
  return [0, 1, 2, 3, 4].map((offset) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + offset)
    return toDateString(d)
  })
}
