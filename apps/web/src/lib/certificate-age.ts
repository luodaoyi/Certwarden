const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Parse cert_expires_at into a comparable epoch ms value.
 * Missing / invalid timestamps return null so callers can push them last.
 */
export function parseCertExpiresMs(certExpiresAt?: string | null): number | null {
  if (!certExpiresAt) {
    return null;
  }

  const expiresMs = new Date(certExpiresAt).getTime();
  return Number.isNaN(expiresMs) ? null : expiresMs;
}

/**
 * Live day count from cert_expires_at, matching the API formula:
 * floor((expiresAt - now).Hours() / 24).
 * Positive = remaining days, zero = expires within the current day window,
 * negative = overdue days (never treat past expiry as remaining).
 */
export function deriveDaysFromCertExpiry(
  certExpiresAt?: string | null,
  now: Date | number = Date.now(),
): number | null {
  const expiresMs = parseCertExpiresMs(certExpiresAt);
  if (expiresMs === null) {
    return null;
  }

  const nowMs = typeof now === "number" ? now : now.getTime();
  return Math.floor((expiresMs - nowMs) / MS_PER_DAY);
}

export function isCertExpired(certExpiresAt?: string | null, now: Date | number = Date.now()): boolean {
  const days = deriveDaysFromCertExpiry(certExpiresAt, now);
  if (days === null) {
    return false;
  }
  return days < 0;
}

type DomainWithCertExpiry = {
  cert_expires_at?: string | null;
};

/**
 * Return a new domain list sorted by actual certificate expiry ascending.
 * Valid timestamps sort earliest-first (expired naturally first); missing/invalid
 * timestamps sort last. Equal expiry keeps original relative order (stable).
 * Does not mutate the input array.
 */
export function sortDomainsByCertExpiryAsc<T extends DomainWithCertExpiry>(
  domains: readonly T[],
): T[] {
  return domains
    .map((domain, index) => ({
      domain,
      index,
      expiresMs: parseCertExpiresMs(domain.cert_expires_at),
    }))
    .sort((a, b) => {
      if (a.expiresMs === null && b.expiresMs === null) {
        return a.index - b.index;
      }
      if (a.expiresMs === null) {
        return 1;
      }
      if (b.expiresMs === null) {
        return -1;
      }
      if (a.expiresMs !== b.expiresMs) {
        return a.expiresMs - b.expiresMs;
      }
      return a.index - b.index;
    })
    .map(({ domain }) => domain);
}
