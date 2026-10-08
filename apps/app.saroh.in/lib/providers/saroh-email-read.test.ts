import { beforeEach, describe, expect, it, vi } from "vitest";

const http = vi.hoisted(() => ({
    apiFetch: vi.fn(),
    orgBase: vi.fn<() => Promise<string | null>>(),
}));
vi.mock("@/lib/api/http", () => ({
    apiFetch: http.apiFetch,
    destroy: vi.fn(),
    getJson: vi.fn(),
    mutate: vi.fn(),
    orgBase: http.orgBase,
}));

import { getSarohEmail } from "@/lib/providers/service";

const SENDING = {
    state: "SENDING",
    used: 3,
    cap: 10,
    resetsOn: "1 Nov",
    sender: { name: "Rye via Saroh", address: "bookings@notify.example" },
    replyTo: null,
};

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status });
}

beforeEach(() => {
    http.apiFetch.mockReset();
    http.orgBase.mockReset();
    http.orgBase.mockResolvedValue("/organizations/org_1");
});

describe("reading whether Saroh sends the booking emails (DEC-086)", () => {
    it("an API without the read (404) says nothing new: OFF", async () => {
        http.apiFetch.mockResolvedValue(new Response("", { status: 404 }));
        expect(await getSarohEmail()).toEqual({
            state: "OFF",
            takesOver: false,
        });
    });

    it("passes a well-formed state through", async () => {
        http.apiFetch.mockResolvedValue(json(SENDING));
        expect(await getSarohEmail()).toEqual(SENDING);
        http.apiFetch.mockResolvedValue(
            json({ state: "OFF", takesOver: true }),
        );
        expect(await getSarohEmail()).toEqual({
            state: "OFF",
            takesOver: true,
        });
    });

    it("never reads a failure as a state: UNREAD", async () => {
        const failures: (() => void)[] = [
            () => http.apiFetch.mockResolvedValue(json({}, 500)),
            () => http.apiFetch.mockRejectedValue(new Error("down")),
            () => {
                http.orgBase.mockResolvedValue(null);
                http.apiFetch.mockResolvedValue(json(SENDING));
            },
            () =>
                http.apiFetch.mockResolvedValue(
                    new Response("<html>", { status: 200 }),
                ),
            () => http.apiFetch.mockResolvedValue(json({ state: "LATER" })),
            () => http.apiFetch.mockResolvedValue(json({ state: "OFF" })),
            () =>
                http.apiFetch.mockResolvedValue(
                    json({ ...SENDING, used: "3" }),
                ),
            () =>
                http.apiFetch.mockResolvedValue(
                    json({ ...SENDING, sender: null }),
                ),
        ];
        for (const arrange of failures) {
            http.apiFetch.mockReset();
            http.orgBase.mockResolvedValue("/organizations/org_1");
            arrange();
            expect(await getSarohEmail()).toEqual({ state: "UNREAD" });
        }
    });
});
