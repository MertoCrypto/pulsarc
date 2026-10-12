/**
 * Circle only accepts usernames of 5-50 characters made of letters, digits and _@.:+-
 * (checked against rp_getRegistrationOptions). Turn whatever the user typed into one.
 */
export function toCircleUsername(raw?: string): string {
  let u = (raw ?? '').trim().replace(/\s+/g, '_').replace(/[^A-Za-z0-9_@.:+-]/g, '')
  if (u.length < 5) u = `pulsarc-${u || Math.random().toString(36).slice(2, 6)}`
  return u.slice(0, 50)
}
