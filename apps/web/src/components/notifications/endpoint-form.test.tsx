import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { EndpointForm } from "@/components/notifications/endpoint-form";

describe("EndpointForm", () => {
  it("submits the webhook payload shape", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(<EndpointForm submitLabel="Save endpoint" onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText(/name/i), "Webhook");
    await user.selectOptions(screen.getByLabelText(/type/i), "webhook");
    await user.type(screen.getByLabelText("https://example.com/hook"), "https://example.com/webhook");
    await user.click(screen.getByRole("button", { name: /save endpoint/i }));

    expect(onSubmit).toHaveBeenCalledWith({
      name: "Webhook",
      type: "webhook",
      enabled: true,
      config: { url: "https://example.com/webhook" },
    });
  });
});
