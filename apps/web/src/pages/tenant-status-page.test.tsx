import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { I18nProvider } from "@/lib/i18n";
import { TenantStatusPage } from "@/pages/tenant-status-page";

const apiRequestMock = vi.fn();

vi.mock("@/lib/api", () => ({
  apiRequest: (...args: unknown[]) => apiRequestMock(...args),
}));

function renderTenantStatus(path = "/status/1") {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/status/:tenantId" element={<TenantStatusPage />} />
          </Routes>
        </MemoryRouter>
      </I18nProvider>
    </QueryClientProvider>
  );
}

function baseDomain(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    hostname: "example.com",
    port: 443,
    enabled: true,
    status: "healthy",
    resolved_ip: "203.0.113.10",
    cert_expires_at: "2026-05-10T00:00:00Z",
    days_remaining: 30,
    next_check_at: "2026-04-10T00:00:00Z",
    check_interval_seconds: 3600,
    created_at: "2026-04-10T00:00:00Z",
    updated_at: "2026-04-10T00:00:00Z",
    ...overrides,
  };
}

describe("TenantStatusPage", () => {
  beforeEach(() => {
    window.localStorage.setItem("certwarden.locale", "en");
    apiRequestMock.mockReset();
  });

  it("renders public domains by cert_expires_at ascending with missing expiry last", async () => {
    const domains = [
      baseDomain({
        id: 1,
        hostname: "later.example.com",
        cert_expires_at: "2026-12-01T00:00:00Z",
      }),
      baseDomain({
        id: 2,
        hostname: "expired.example.com",
        status: "error",
        cert_expires_at: "2025-01-01T00:00:00Z",
      }),
      baseDomain({
        id: 3,
        hostname: "none.example.com",
        cert_expires_at: undefined,
        days_remaining: undefined,
      }),
      baseDomain({
        id: 4,
        hostname: "soon.example.com",
        cert_expires_at: "2026-06-01T00:00:00Z",
      }),
      baseDomain({
        id: 5,
        hostname: "invalid.example.com",
        cert_expires_at: "not-a-date",
      }),
    ];

    apiRequestMock.mockImplementation((path: string) => {
      if (path === "/public/tenants/1/status") {
        return Promise.resolve({
          tenant: {
            id: 1,
            name: "Tenant",
            slug: "tenant",
            disabled: false,
            created_at: "2026-04-10T00:00:00Z",
            updated_at: "2026-04-10T00:00:00Z",
          },
          summary: {
            overall_status: "error",
            domain_count: domains.length,
            healthy_count: 3,
            pending_count: 0,
            error_count: 1,
            next_expiry_at: "2025-01-01T00:00:00Z",
          },
          public_url: "https://status.example.com",
          domains,
        });
      }

      throw new Error(`Unexpected request: ${path}`);
    });

    const { container } = renderTenantStatus();

    expect(await screen.findByText("expired.example.com")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Certificate monitors" })).toBeInTheDocument();

    const hostnames = Array.from(container.querySelectorAll("article")).map((article) => {
      const label = article.querySelector("span.select-text");
      return label?.textContent ?? "";
    });

    expect(hostnames).toEqual([
      "expired.example.com",
      "soon.example.com",
      "later.example.com",
      "none.example.com",
      "invalid.example.com",
    ]);
  });

  it("expands the domain named in the domain query param", async () => {
    const domains = [
      baseDomain({ id: 1, hostname: "later.example.com", cert_expires_at: "2026-12-01T00:00:00Z" }),
      baseDomain({ id: 2, hostname: "expired.example.com", status: "error", cert_expires_at: "2025-01-01T00:00:00Z" }),
    ];

    apiRequestMock.mockImplementation((path: string) => {
      if (path === "/public/tenants/1/status") {
        return Promise.resolve({
          tenant: {
            id: 1,
            name: "Tenant",
            slug: "tenant",
            disabled: false,
            created_at: "2026-04-10T00:00:00Z",
            updated_at: "2026-04-10T00:00:00Z",
          },
          summary: {
            overall_status: "error",
            domain_count: domains.length,
            healthy_count: 1,
            pending_count: 0,
            error_count: 1,
            next_expiry_at: "2025-01-01T00:00:00Z",
          },
          public_url: "https://status.example.com",
          domains,
        });
      }

      throw new Error(`Unexpected request: ${path}`);
    });

    const { container } = renderTenantStatus("/status/1?domain=2");

    expect(await screen.findByText("expired.example.com")).toBeInTheDocument();

    const articles = Array.from(container.querySelectorAll("article"));
    const expanded = articles.find((article) => article.textContent?.includes("expired.example.com"));
    const collapsed = articles.find((article) => article.textContent?.includes("later.example.com"));
    expect(expanded?.querySelector("[aria-expanded=\"true\"]")).not.toBeNull();
    expect(collapsed?.querySelector("[aria-expanded=\"false\"]")).not.toBeNull();
  });
});
