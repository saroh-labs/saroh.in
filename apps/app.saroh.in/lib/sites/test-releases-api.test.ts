import { beforeEach, describe, expect, it, vi } from "vitest";

import {
    goLiveWithRelease,
    scheduleGoLive,
    SEND_UNREACHABLE,
} from "./test-releases-api";

const { apiFetch } = vi.hoisted(() => ({
    apiFetch: vi.fn<(path: string, init?: RequestInit) => Promise<Response>>(),
}));
vi.mock("@/lib/api/http", () => ({
    apiFetch,
    getActiveOrgId: () => Promise.resolve("org_1"),
    getJson: vi.fn(),
}));

describe("a test-release write when the API can't be reached (release review)", () => {
    beforeEach(() => {
        apiFetch.mockReset();
    });

    it("answers a failed result instead of throwing, so the sheet frees its buttons", async () => {
        apiFetch.mockRejectedValue(new TypeError("fetch failed"));

        await expect(
            goLiveWithRelease("site_1", "rel_1", false),
        ).resolves.toEqual({ ok: false, error: SEND_UNREACHABLE });
    });

    it("still reads the API's own refusal when it does answer", async () => {
        apiFetch.mockResolvedValue(
            new Response(
                JSON.stringify({
                    error: {
                        message: "Cancel the scheduled go-live first.",
                        details: { code: "SCHEDULED" },
                    },
                }),
                { status: 409 },
            ),
        );

        const result = await scheduleGoLive("site_1", "rel_1", {
            date: "2026-10-02",
            time: "18:00",
        });
        expect(result.ok).toBe(false);
    });
});
