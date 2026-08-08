import { setAccessToken, streamCheckJobEvents } from "@/lib/api";

describe("streamCheckJobEvents", () => {
  afterEach(() => {
    setAccessToken(null);
    vi.unstubAllGlobals();
  });

  it("parses chunked SSE events and sends bearer authentication", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode("retry: 3000\n\nid: 1\nevent: domain.started\nda"));
        controller.enqueue(encoder.encode("ta: {\"id\":1,\"type\":\"domain.started\",\"job_id\":\"job-1\",\"mode\":\"single\",\"domain_id\":7,\"status\":\"running\",\"total\":1,\"completed\":0,\"succeeded\":0,\"failed\":0}\n\n"));
        controller.enqueue(encoder.encode("id: 2\nevent: job.completed\ndata: {\"id\":2,\"type\":\"job.completed\",\"job_id\":\"job-1\",\"mode\":\"single\",\"status\":\"completed\",\"total\":1,\"completed\":1,\"succeeded\":1,\"failed\":0}\n\n"));
        controller.close();
      },
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(stream, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    setAccessToken("access-token");

    const events: string[] = [];
    await streamCheckJobEvents("job-1", (event) => events.push(event.type));

    expect(events).toEqual(["domain.started", "job.completed"]);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer access-token");
  });
});
