import { describe, expect, it } from "vitest";

import {
  deriveDaysFromCertExpiry,
  isCertExpired,
  parseCertExpiresMs,
  sortDomainsByCertExpiryAsc,
} from "@/lib/certificate-age";

describe("deriveDaysFromCertExpiry", () => {
  const now = new Date("2026-04-10T12:00:00.000Z");

  it("returns null when expiry is missing or invalid", () => {
    expect(deriveDaysFromCertExpiry(undefined, now)).toBeNull();
    expect(deriveDaysFromCertExpiry(null, now)).toBeNull();
    expect(deriveDaysFromCertExpiry("not-a-date", now)).toBeNull();
  });

  it("returns positive remaining days for future expiry", () => {
    expect(deriveDaysFromCertExpiry("2026-05-10T12:00:00.000Z", now)).toBe(30);
    expect(deriveDaysFromCertExpiry("2026-04-11T12:00:00.000Z", now)).toBe(1);
  });

  it("returns zero when expiry is still within the current 24h floor window", () => {
    expect(deriveDaysFromCertExpiry("2026-04-11T11:59:00.000Z", now)).toBe(0);
  });

  it("returns negative overdue days when cert_expires_at is in the past", () => {
    expect(deriveDaysFromCertExpiry("2026-04-09T12:00:00.000Z", now)).toBe(-1);
    expect(deriveDaysFromCertExpiry("2026-04-01T12:00:00.000Z", now)).toBe(-9);
  });

  it("never reports a positive remaining count for past expiry timestamps", () => {
    const past = "2026-01-01T00:00:00.000Z";
    const days = deriveDaysFromCertExpiry(past, now);
    expect(days).not.toBeNull();
    expect(days! < 0).toBe(true);
    expect(isCertExpired(past, now)).toBe(true);
  });
});

describe("parseCertExpiresMs", () => {
  it("returns epoch ms for valid timestamps and null for missing/invalid", () => {
    expect(parseCertExpiresMs("2026-05-10T00:00:00.000Z")).toBe(Date.parse("2026-05-10T00:00:00.000Z"));
    expect(parseCertExpiresMs(undefined)).toBeNull();
    expect(parseCertExpiresMs(null)).toBeNull();
    expect(parseCertExpiresMs("not-a-date")).toBeNull();
  });
});

describe("sortDomainsByCertExpiryAsc", () => {
  it("sorts by cert_expires_at ascending, expired first, missing/invalid last", () => {
    const input = [
      { id: 1, hostname: "later", cert_expires_at: "2026-12-01T00:00:00.000Z" },
      { id: 2, hostname: "expired", cert_expires_at: "2025-01-01T00:00:00.000Z" },
      { id: 3, hostname: "missing" },
      { id: 4, hostname: "soon", cert_expires_at: "2026-06-01T00:00:00.000Z" },
      { id: 5, hostname: "invalid", cert_expires_at: "not-a-date" },
      { id: 6, hostname: "nullish", cert_expires_at: null },
    ];

    const sorted = sortDomainsByCertExpiryAsc(input);

    expect(sorted.map((d) => d.hostname)).toEqual([
      "expired",
      "soon",
      "later",
      "missing",
      "invalid",
      "nullish",
    ]);
  });

  it("keeps original relative order for equal expiry and does not mutate input", () => {
    const input = [
      { id: 1, hostname: "a", cert_expires_at: "2026-06-01T00:00:00.000Z" },
      { id: 2, hostname: "b", cert_expires_at: "2026-06-01T00:00:00.000Z" },
      { id: 3, hostname: "c", cert_expires_at: "2026-05-01T00:00:00.000Z" },
    ];
    const snapshot = input.map((d) => ({ ...d }));

    const sorted = sortDomainsByCertExpiryAsc(input);

    expect(sorted.map((d) => d.hostname)).toEqual(["c", "a", "b"]);
    expect(input).toEqual(snapshot);
    expect(sorted).not.toBe(input);
  });
});
