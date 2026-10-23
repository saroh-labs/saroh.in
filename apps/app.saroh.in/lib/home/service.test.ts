import { beforeEach, describe, expect, it, vi } from "vitest";

const apiFetch = vi.fn();
vi.mock("@/lib/api/http", () => ({
    apiFetch: (path: string) => apiFetch(path) as unknown,
    orgBase: () => Promise.resolve("/organizations/org_1"),
}));

import { getHomeRail } from "@/lib/home/service";

const json = (status: number, body: unknown) => ({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
});

beforeEach(() => {
    apiFetch.mockReset();
});

describe("getHomeRail (review #16)", () => {
    it("asks the rail's read, never the whole of Home", async () => {
        apiFetch.mockResolvedValue(
            json(200, {
                actions: [
                    {
                        code: "COMMERCE_OPEN_ORDERS",
                        title: "Fulfil 2 orders due by tomorrow",
                        href: "/commerce/orders",
                        severity: "OVERDUE",
                        count: 2,
                    },
                ],
                unavailable: [],
            }),
        );
        const rail = await getHomeRail();
        expect(apiFetch).toHaveBeenCalledWith(
            "/organizations/org_1/home?parts=rail",
        );
        expect(rail.actions).toHaveLength(1);
        expect(rail.unavailable).toEqual([]);
    });

    it("throws on a failed read, so the shell draws the rail without badges", async () => {
        apiFetch.mockResolvedValue(json(503, {}));
        await expect(getHomeRail()).rejects.toThrow(/503/);
    });
});
