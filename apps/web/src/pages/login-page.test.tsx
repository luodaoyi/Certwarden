import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

import { LoginPage } from "@/pages/login-page";

const loginMock = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    login: loginMock,
  }),
}));

describe("LoginPage", () => {
  it("submits credentials", async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    );

    await user.type(screen.getByLabelText(/email/i), "owner@example.com");
    await user.type(screen.getByLabelText(/password/i), "Password123");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(loginMock).toHaveBeenCalledWith("owner@example.com", "Password123");
  });
});
