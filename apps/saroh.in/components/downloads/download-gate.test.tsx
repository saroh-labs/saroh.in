import { afterEach, describe, expect, it, vi } from "vitest";

import { downloadGateSubmit } from "./download-gate";

afterEach(() => vi.unstubAllGlobals());

function answer(body: unknown) {
    const fetch = vi.fn().mockResolvedValue(Response.json(body));
    vi.stubGlobal("fetch", fetch);
    return fetch;
}

describe("downloadGateSubmit", () => {
    it("posts the slug, the one contact and the Turnstile token", async () => {
        const fetch = answer({ unlocked: true, emailed: "none" });
        await expect(
            downloadGateSubmit(
                "receipt-format",
                { phone: "+919876543210" },
                "tok",
            ),
        ).resolves.toEqual({ ok: true, emailed: "none" });
        expect(fetch).toHaveBeenCalledWith(
            "/api/downloads/unlock",
            expect.objectContaining({
                method: "POST",
                body: JSON.stringify({
                    slug: "receipt-format",
                    phone: "+919876543210",
                    turnstileToken: "tok",
                }),
            }),
        );
    });

    it("passes each refusal through as its own reason, and sends no token it hasn't got", async () => {
        const fetch = answer({ unlocked: false, failure: "challenge" });
        await expect(
            downloadGateSubmit(
                "receipt-format",
                { email: "a@example.com" },
                null,
            ),
        ).resolves.toEqual({ ok: false, reason: "challenge" });
        expect(
            JSON.parse(
                (fetch.mock.calls[0]?.[1] as { body: string }).body,
            ) as unknown,
        ).toEqual({ slug: "receipt-format", email: "a@example.com" });
    });
});
