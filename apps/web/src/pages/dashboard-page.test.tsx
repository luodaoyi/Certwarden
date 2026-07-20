import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

import { I18nProvider } from "@/lib/i18n";
import { DashboardPage } from "@/pages/dashboard-page";

const apiRequestMock = vi.fn();

vi.mock("@/lib/api", () => ({
  apiRequest: (...args: unknown[]) => apiRequestMock(...args),
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: {
      id: 1,
      tenant_id: 1,
      username: "owner",
      role: "tenant_owner",
      email_verified: true,
    },
  }),
}));

vi.mock("@/components/domains/domain-form", () => ({
  DomainForm: ({
    onSubmit,
  }: {
    onSubmit: (payload: {
      hostname: string;
      port: number;
      target_ip: string;
      enabled: boolean;
      check_interval_seconds: number;
    }) => Promise<void>;
  }) => (
    <div data-testid="domain-form">
      <button
        type="button"
        onClick={() => {
          // Mirror DomainForm: catch rejected saves so they are not unhandled.
          void onSubmit({
            hostname: "new.example.com",
            port: 443,
            target_ip: "",
            enabled: true,
            check_interval_seconds: 86400,
          }).catch(() => {});
        }}
      >
        Submit domain
      </button>
    </div>
  ),
}));

function renderDashboard() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <MemoryRouter>
          <DashboardPage />
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

function publicStatusPayload(domains: Record<string, unknown>[]) {
  return {
    tenant: {
      id: 1,
      name: "Tenant",
      slug: "tenant",
      disabled: false,
      created_at: "2026-04-10T00:00:00Z",
      updated_at: "2026-04-10T00:00:00Z",
    },
    summary: {
      overall_status: domains.some((d) => d.status === "error") ? "error" : "healthy",
      domain_count: domains.length,
      healthy_count: domains.filter((d) => d.status === "healthy").length,
      pending_count: domains.filter((d) => d.status === "pending").length,
      error_count: domains.filter((d) => d.status === "error").length,
      next_expiry_at: "2026-05-10T00:00:00Z",
    },
    public_url: "https://status.example.com",
    domains,
  };
}

function mockDomainsPayload(domains: Record<string, unknown>[]) {
  apiRequestMock.mockImplementation((path: string, init?: RequestInit) => {
    if (path === "/domains" && !init) {
      return Promise.resolve({ domains });
    }

    if (path === "/public/tenants/1/status") {
      return Promise.resolve(publicStatusPayload(domains));
    }

    if (path === "/domains/1/check" && init?.method === "POST") {
      return new Promise(() => {});
    }

    throw new Error(`Unexpected request: ${path}`);
  });
}

describe("DashboardPage", () => {
  beforeEach(() => {
    window.localStorage.setItem("certwarden.locale", "en");
    apiRequestMock.mockReset();
  });

  it("renders monitoring overview above the certificate table", async () => {
    mockDomainsPayload([baseDomain()]);

    const { container } = renderDashboard();

    expect(await screen.findByText("Monitoring overview")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Certificates" })).toBeInTheDocument();

    const overview = screen.getByTestId("monitoring-overview");
    const table = screen.getByTestId("certificate-table");
    const sections = Array.from(container.querySelectorAll("section"));
    expect(sections.indexOf(overview)).toBeLessThan(sections.indexOf(table));
    expect(overview.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("shows a visible pending state while checking a domain immediately", async () => {
    const user = userEvent.setup();
    let resolveCheckRequest: ((value: { domain: Record<string, unknown> }) => void) | undefined;

    const domain = baseDomain();

    apiRequestMock.mockImplementation((path: string, init?: RequestInit) => {
      if (path === "/domains" && !init) {
        return Promise.resolve({ domains: [domain] });
      }

      if (path === "/public/tenants/1/status") {
        return Promise.resolve(publicStatusPayload([domain]));
      }

      if (path === "/domains/1/check" && init?.method === "POST") {
        return new Promise((resolve) => {
          resolveCheckRequest = resolve;
        });
      }

      throw new Error(`Unexpected request: ${path}`);
    });

    renderDashboard();

    const checkButton = await screen.findByRole("button", { name: "Check now" });
    await user.click(checkButton);

    const checkingButton = await screen.findByRole("button", { name: "Checking…" });
    expect(checkingButton).toBeDisabled();
    expect(checkingButton).toHaveAttribute("aria-busy", "true");

    resolveCheckRequest?.({ domain });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Check now" })).toHaveAttribute("aria-busy", "false");
    });
  });

  it("derives remaining days from cert_expires_at instead of stale days_remaining", async () => {
    const msPerDay = 24 * 60 * 60 * 1000;
    const now = Date.now();
    // Keep a partial day buffer so floor() stays stable for the short test window.
    const certExpiresAt = new Date(now + 30 * msPerDay + 2 * 60 * 60 * 1000).toISOString();
    const expectedDays = Math.floor((new Date(certExpiresAt).getTime() - now) / msPerDay);

    mockDomainsPayload([
      baseDomain({
        hostname: "live.example.com",
        cert_expires_at: certExpiresAt,
        // Stale server value that would be wrong if trusted.
        days_remaining: 999,
        check_interval_seconds: 86400,
      }),
    ]);

    renderDashboard();

    expect(await screen.findByText("live.example.com")).toBeInTheDocument();
    expect(screen.getByText(`${expectedDays}d left`)).toBeInTheDocument();
    expect(screen.queryByText("999d left")).not.toBeInTheDocument();
    expect(screen.queryByText("999d overdue")).not.toBeInTheDocument();
  });

  it("shows overdue days and never a positive remaining count for past cert_expires_at", async () => {
    const msPerDay = 24 * 60 * 60 * 1000;
    const now = Date.now();
    const certExpiresAt = new Date(now - 9 * msPerDay - 2 * 60 * 60 * 1000).toISOString();
    const expectedOverdue = Math.abs(Math.floor((new Date(certExpiresAt).getTime() - now) / msPerDay));

    mockDomainsPayload([
      baseDomain({
        id: 2,
        hostname: "expired.example.com",
        status: "error",
        last_error: "certificate has expired",
        resolved_ip: "203.0.113.20",
        cert_expires_at: certExpiresAt,
        // Stale positive value from server must not be shown.
        days_remaining: 12,
        check_interval_seconds: 86400,
      }),
    ]);

    renderDashboard();

    const host = await screen.findByText("expired.example.com");
    const row = host.closest("article");
    expect(row).not.toBeNull();
    expect(row).toHaveAttribute("data-overdue", "true");
    expect(within(row as HTMLElement).getByText("Expired")).toBeInTheDocument();
    expect(within(row as HTMLElement).getByText(`${expectedOverdue}d overdue`)).toBeInTheDocument();
    expect(within(row as HTMLElement).getByText("certificate has expired")).toBeInTheDocument();
    expect(screen.queryByText("12d left")).not.toBeInTheDocument();
    expect(within(row as HTMLElement).queryByText(/^\d+d left$/)).not.toBeInTheDocument();
  });

  it("keeps add domain form available from the compact toolbar", async () => {
    const user = userEvent.setup();
    mockDomainsPayload([]);

    renderDashboard();

    expect(await screen.findByText("No domains added yet.")).toBeInTheDocument();
    expect(screen.queryByTestId("domain-form")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check all" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Add domain" }));
    expect(screen.getByTestId("domain-form")).toBeInTheDocument();
  });

  it("renders certificate rows by cert_expires_at ascending with missing expiry last", async () => {
    mockDomainsPayload([
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
    ]);

    renderDashboard();

    expect(await screen.findByText("expired.example.com")).toBeInTheDocument();

    const table = screen.getByTestId("certificate-table");
    const hostnames = Array.from(table.querySelectorAll("article")).map((article) => {
      const label = article.querySelector("button span.min-w-0 span.block");
      return label?.childNodes[0]?.textContent ?? "";
    });

    expect(hostnames).toEqual([
      "expired.example.com",
      "soon.example.com",
      "later.example.com",
      "none.example.com",
      "invalid.example.com",
    ]);
  });

  it("checks all domains concurrently, refreshes results, and reports bulk success", async () => {
    const user = userEvent.setup();
    const domains = [
      baseDomain({ id: 1, hostname: "a.example.com" }),
      baseDomain({ id: 2, hostname: "b.example.com" }),
    ];
    let domainFetches = 0;
    let statusFetches = 0;
    const checkResolvers: Array<(value: { domain: Record<string, unknown> }) => void> = [];

    apiRequestMock.mockImplementation((path: string, init?: RequestInit) => {
      if (path === "/domains" && !init) {
        domainFetches += 1;
        return Promise.resolve({ domains });
      }

      if (path === "/public/tenants/1/status") {
        statusFetches += 1;
        return Promise.resolve(publicStatusPayload(domains));
      }

      if ((path === "/domains/1/check" || path === "/domains/2/check") && init?.method === "POST") {
        return new Promise((resolve) => {
          checkResolvers.push(resolve as (value: { domain: Record<string, unknown> }) => void);
        });
      }

      throw new Error(`Unexpected request: ${path}`);
    });

    renderDashboard();

    expect(await screen.findByText("a.example.com")).toBeInTheDocument();
    expect(screen.getByText("b.example.com")).toBeInTheDocument();

    const checkAll = screen.getByRole("button", { name: "Check all" });
    await waitFor(() => {
      expect(checkAll).toBeEnabled();
    });
    const initialDomainFetches = domainFetches;
    const initialStatusFetches = statusFetches;

    await user.click(checkAll);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Checking all…" })).toBeDisabled();
    });
    expect(checkResolvers).toHaveLength(2);

    checkResolvers[0]?.({ domain: domains[0] });
    checkResolvers[1]?.({ domain: domains[1] });

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("All 2 domains checked successfully.");
    });
    expect(screen.getByRole("status")).toHaveAttribute("data-tone", "success");

    await waitFor(() => {
      expect(domainFetches).toBeGreaterThan(initialDomainFetches);
      expect(statusFetches).toBeGreaterThan(initialStatusFetches);
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Check all" })).toBeEnabled();
    });
  });

  it("reports partial bulk check results when some domain checks fail", async () => {
    const user = userEvent.setup();
    const domains = [
      baseDomain({ id: 1, hostname: "ok.example.com" }),
      baseDomain({ id: 2, hostname: "bad.example.com" }),
    ];

    apiRequestMock.mockImplementation((path: string, init?: RequestInit) => {
      if (path === "/domains" && !init) {
        return Promise.resolve({ domains });
      }

      if (path === "/public/tenants/1/status") {
        return Promise.resolve(publicStatusPayload(domains));
      }

      if (path === "/domains/1/check" && init?.method === "POST") {
        return Promise.resolve({ domain: domains[0] });
      }

      if (path === "/domains/2/check" && init?.method === "POST") {
        return Promise.reject(new Error("check failed"));
      }

      throw new Error(`Unexpected request: ${path}`);
    });

    renderDashboard();

    await user.click(await screen.findByRole("button", { name: "Check all" }));

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(
        "1 of 2 domains checked successfully. 1 failed."
      );
    });
    expect(screen.getByRole("status")).toHaveAttribute("data-tone", "warning");
  });

  it("shows success toast feedback after adding a domain", async () => {
    const user = userEvent.setup();
    const domains = [baseDomain()];

    apiRequestMock.mockImplementation((path: string, init?: RequestInit) => {
      if (path === "/domains" && !init) {
        return Promise.resolve({ domains });
      }

      if (path === "/public/tenants/1/status") {
        return Promise.resolve(publicStatusPayload(domains));
      }

      if (path === "/domains" && init?.method === "POST") {
        return Promise.resolve({
          domain: baseDomain({ id: 9, hostname: "new.example.com" }),
        });
      }

      throw new Error(`Unexpected request: ${path}`);
    });

    renderDashboard();

    await user.click(await screen.findByRole("button", { name: "Add domain" }));
    await user.click(screen.getByRole("button", { name: "Submit domain" }));

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("Domain added successfully.");
    });
    expect(screen.getByRole("status")).toHaveAttribute("data-tone", "success");
  });

  it("shows failure toast feedback when adding a domain fails", async () => {
    const user = userEvent.setup();

    apiRequestMock.mockImplementation((path: string, init?: RequestInit) => {
      if (path === "/domains" && !init) {
        return Promise.resolve({ domains: [] });
      }

      if (path === "/public/tenants/1/status") {
        return Promise.resolve(publicStatusPayload([]));
      }

      if (path === "/domains" && init?.method === "POST") {
        return Promise.reject(new Error("create failed"));
      }

      throw new Error(`Unexpected request: ${path}`);
    });

    renderDashboard();

    await user.click(await screen.findByRole("button", { name: "Add domain" }));
    expect(screen.getByTestId("domain-form")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Submit domain" }));

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("Unable to save domain.");
    });
    expect(screen.getByRole("status")).toHaveAttribute("data-tone", "error");
    // Failed save must keep the add form open (mutation onSuccess does not run).
    expect(screen.getByTestId("domain-form")).toBeInTheDocument();
  });
});
