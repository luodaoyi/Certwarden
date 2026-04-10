import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
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
  DomainForm: () => <div data-testid="domain-form" />,
}));

describe("DashboardPage", () => {
  beforeEach(() => {
    window.localStorage.setItem("certwarden.locale", "en");
    apiRequestMock.mockReset();
  });

  it("shows a visible pending state while checking a domain immediately", async () => {
    const user = userEvent.setup();
    let resolveCheckRequest: ((value: { domain: Record<string, unknown> }) => void) | undefined;

    const domain = {
      id: 1,
      hostname: "example.com",
      port: 443,
      enabled: true,
      status: "healthy",
      resolved_ip: "203.0.113.10",
      days_remaining: 30,
      next_check_at: "2026-04-10T00:00:00Z",
      check_interval_seconds: 3600,
      created_at: "2026-04-10T00:00:00Z",
      updated_at: "2026-04-10T00:00:00Z",
    };

    apiRequestMock.mockImplementation((path: string, init?: RequestInit) => {
      if (path === "/domains" && !init) {
        return Promise.resolve({ domains: [domain] });
      }

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
            overall_status: "healthy",
            domain_count: 1,
            healthy_count: 1,
            pending_count: 0,
            error_count: 0,
            next_expiry_at: "2026-05-10T00:00:00Z",
          },
          public_url: "https://status.example.com",
          domains: [domain],
        });
      }

      if (path === "/domains/1/check" && init?.method === "POST") {
        return new Promise((resolve) => {
          resolveCheckRequest = resolve;
        });
      }

      throw new Error(`Unexpected request: ${path}`);
    });

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <I18nProvider>
          <MemoryRouter>
            <DashboardPage />
          </MemoryRouter>
        </I18nProvider>
      </QueryClientProvider>
    );

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
});
