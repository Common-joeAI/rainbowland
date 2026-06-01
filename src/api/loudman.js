/**
 * Loudman.live integration
 * Embeds the Loudman Radio player and links to artist profiles.
 * Since Loudman doesn't expose a public REST API, we use their
 * embeddable iframe widget + direct profile linking.
 */

export const LOUDMAN_BASE = 'https://loudman.live'

/** Embed URL for the main Loudman Radio player */
export const LOUDMAN_PLAYER_URL = `${LOUDMAN_BASE}`

/** Build a deep link to a Loudman artist profile */
export function loudmanArtistUrl(handle) {
  return `${LOUDMAN_BASE}/artist/${handle}`
}

/** Build a "become a host" link */
export const LOUDMAN_HOST_URL = `${LOUDMAN_BASE}/become-a-host`

/**
 * Mock featured Loudman artists (real profiles from loudman.live)
 * In production these would come from a Loudman partner API.
 */
export const FEATURED_LOUDMAN_ARTISTS = [
  {
    handle: 'alarmclockhero',
    name: 'Alarm Clock Hero',
    genre: 'Indie / Alternative',
    avatar: null,
    bio: 'Independent artist on Loudman Radio',
  },
  {
    handle: 'egonladd',
    name: 'Egon Ladd',
    genre: 'Electronic',
    avatar: null,
    bio: 'Creator of Loudman.LIVE — electronic music producer',
  },
  {
    handle: 'ericblujerze',
    name: 'EricBluJerze',
    genre: 'R&B / Soul',
    avatar: null,
    bio: 'Independent R&B artist on Loudman Radio',
  },
  {
    handle: 'joespi',
    name: 'Joseph Schwartz',
    genre: 'Singer-Songwriter',
    avatar: null,
    bio: 'Singer-songwriter on Loudman Radio',
  },
]

/** Returns the Loudman embed iframe HTML for a given artist */
export function getLoudmanEmbedUrl(handle) {
  // Direct to artist page — Loudman uses their own player
  return `${LOUDMAN_BASE}/artist/${handle}`
}
