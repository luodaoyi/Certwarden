import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { EndpointForm } from "@/components/notifications/endpoint-form";
import { I18nProvider } from "@/lib/i18n";
import type { ApiEndpoint } from "@/lib/types";

describe("EndpointForm", () => {
  it("submits the webhook payload shape", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(
      <I18nProvider>
        <EndpointForm submitLabel="Save endpoint" onSubmit={onSubmit} />
      </I18nProvider>
    );

    await user.type(screen.getByLabelText(/name/i), "Webhook");
    await user.selectOptions(screen.getByLabelText(/type/i), "webhook");
    await user.type(screen.getByLabelText(/webhook url/i), "https://example.com/webhook");
    await user.click(screen.getByRole("button", { name: /save endpoint/i }));

    expect(onSubmit).toHaveBeenCalledWith({
      name: "Webhook",
      type: "webhook",
      enabled: true,
      config: { url: "https://example.com/webhook" },
    });
  });

  it("submits telegram bot token and chat id with default language en", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(
      <I18nProvider>
        <EndpointForm submitLabel="Save endpoint" onSubmit={onSubmit} />
      </I18nProvider>
    );

    await user.type(screen.getByLabelText(/name/i), "Telegram");
    await user.selectOptions(screen.getByLabelText(/type/i), "telegram");
    await user.type(screen.getByLabelText(/telegram bot token/i), "123456:tenant-bot");
    await user.type(screen.getByLabelText(/telegram chat id/i), "998877");

    expect(screen.getByLabelText(/^language$/i)).toHaveValue("en");

    await user.click(screen.getByRole("button", { name: /save endpoint/i }));

    expect(onSubmit).toHaveBeenCalledWith({
      name: "Telegram",
      type: "telegram",
      enabled: true,
      config: {
        bot_token: "123456:tenant-bot",
        chat_id: "998877",
        language: "en",
      },
    });
  });

  it("submits selected chinese telegram language", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(
      <I18nProvider>
        <EndpointForm submitLabel="Save endpoint" onSubmit={onSubmit} />
      </I18nProvider>
    );

    await user.type(screen.getByLabelText(/name/i), "Telegram CN");
    await user.selectOptions(screen.getByLabelText(/type/i), "telegram");
    await user.type(screen.getByLabelText(/telegram bot token/i), "123456:tenant-bot");
    await user.type(screen.getByLabelText(/telegram chat id/i), "998877");
    await user.selectOptions(screen.getByLabelText(/^language$/i), "zh-CN");
    await user.click(screen.getByRole("button", { name: /save endpoint/i }));

    expect(onSubmit).toHaveBeenCalledWith({
      name: "Telegram CN",
      type: "telegram",
      enabled: true,
      config: {
        bot_token: "123456:tenant-bot",
        chat_id: "998877",
        language: "zh-CN",
      },
    });
  });

  it("loads telegram language when editing an endpoint", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const endpoint: ApiEndpoint = {
      id: 7,
      name: "Existing Telegram",
      type: "telegram",
      enabled: true,
      config: {
        bot_token: "123456:existing-bot",
        chat_id: "112233",
        language: "zh-TW",
      },
      config_masked: {
        bot_token: "****",
        chat_id: "112233",
        language: "zh-TW",
      },
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };

    render(
      <I18nProvider>
        <EndpointForm endpoint={endpoint} submitLabel="Save endpoint" onSubmit={onSubmit} />
      </I18nProvider>
    );

    expect(screen.getByLabelText(/^language$/i)).toHaveValue("zh-TW");

    await user.click(screen.getByRole("button", { name: /save endpoint/i }));

    expect(onSubmit).toHaveBeenCalledWith({
      name: "Existing Telegram",
      type: "telegram",
      enabled: true,
      config: {
        bot_token: "123456:existing-bot",
        chat_id: "112233",
        language: "zh-TW",
      },
    });
  });

  it("defaults missing telegram language to en when editing", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const endpoint: ApiEndpoint = {
      id: 8,
      name: "Legacy Telegram",
      type: "telegram",
      enabled: true,
      config: {
        bot_token: "123456:legacy-bot",
        chat_id: "445566",
      },
      config_masked: {
        bot_token: "****",
        chat_id: "445566",
      },
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };

    render(
      <I18nProvider>
        <EndpointForm endpoint={endpoint} submitLabel="Save endpoint" onSubmit={onSubmit} />
      </I18nProvider>
    );

    expect(screen.getByLabelText(/^language$/i)).toHaveValue("en");

    await user.click(screen.getByRole("button", { name: /save endpoint/i }));

    expect(onSubmit).toHaveBeenCalledWith({
      name: "Legacy Telegram",
      type: "telegram",
      enabled: true,
      config: {
        bot_token: "123456:legacy-bot",
        chat_id: "445566",
        language: "en",
      },
    });
  });
});
