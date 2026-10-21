import { beforeEach, describe, expect, it, vi } from "vitest";

const apiFetch = vi.fn();
vi.mock("@/lib/api/http", () => ({
    apiFetch: (path: string, init?: unknown) => apiFetch(path, init) as unknown,
    orgBase: () => Promise.resolve("/organizations/org_1"),
}));

import { justPaid, turnDownBooking } from "@/lib/services/service";

const json = (status: number, body: unknown) => ({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
});

const PAID_REFUSAL = {
    error: {
        code: "CONFLICT",
        message: "They just paid. The booking stands.",
        statusCode: 409,
        details: { reason: "paid" },
    },
};

beforeEach(() => apiFetch.mockReset());

describe("Turn down (review #11)", () => {
    it("cancels only while the booking still awaits payment", async () => {
        apiFetch.mockResolvedValue(
            json(200, { id: "bk_1", status: "CANCELLED", money: {} }),
        );
        const res = await turnDownBooking("bk_1");
        expect(apiFetch).toHaveBeenCalledWith(
            "/organizations/org_1/services/bookings/bk_1?ifUnpaid=true",
            { method: "DELETE" },
        );
        expect(res.ok).toBe(true);
    });

    it('answers the API\'s "They just paid" as paid, not as a failure', async () => {
        apiFetch.mockResolvedValue(json(409, PAID_REFUSAL));
        const res = await turnDownBooking("bk_1");
        expect(res).toEqual({
            ok: false,
            error: "They just paid. The booking stands.",
            paid: true,
        });
    });

    it("keeps any other refusal a failure", async () => {
        apiFetch.mockResolvedValue(
            json(409, {
                error: { message: "Something else.", details: {} },
            }),
        );
        const res = await turnDownBooking("bk_1");
        expect(res.ok).toBe(false);
        expect("paid" in res).toBe(false);
    });

    it("reads the reason, never the words", () => {
        expect(justPaid(PAID_REFUSAL)).toBe(true);
        expect(
            justPaid({
                error: { message: "They just paid. The booking stands." },
            }),
        ).toBe(false);
        expect(justPaid(null)).toBe(false);
    });
});
