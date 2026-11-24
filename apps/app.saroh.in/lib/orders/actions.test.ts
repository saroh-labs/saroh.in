import { beforeEach, describe, expect, it, vi } from "vitest";

import { recordPayment, updateOrder } from "./actions";

/**
 * Recording a payment from an Orders screen (DEC-259): the write goes as
 * the tab's business (`writeAsOrg`), so a tab left on another business
 * writes nothing, and the screen reads its queries again itself: nothing
 * is revalidated on the server.
 */
const { writeAsOrg, updateOrderApi, recordOrderPayment } = vi.hoisted(() => ({
    writeAsOrg: vi.fn(),
    updateOrderApi: vi.fn(),
    recordOrderPayment: vi.fn(),
}));
vi.mock("@/lib/api/assert-active-org", () => ({ writeAsOrg }));
vi.mock("./service", () => ({ updateOrder: updateOrderApi }));
vi.mock("./kitchen-service", () => ({ recordOrderPayment }));

beforeEach(() => {
    vi.clearAllMocks();
    writeAsOrg.mockReset();
    writeAsOrg.mockImplementation(
        (orgId: string, write: () => Promise<unknown>) =>
            orgId === "org_a"
                ? write()
                : Promise.resolve({ ok: false, error: "moved" }),
    );
    updateOrderApi.mockResolvedValue({ ok: true, data: { id: "o1" } });
    recordOrderPayment.mockResolvedValue({
        ok: true,
        data: { amountCents: 100 },
    });
});

describe("an order's payment, written as the tab's business", () => {
    it("records it through writeAsOrg with the tab's business", async () => {
        await updateOrder("s1", "o1", { paymentStatus: "PAID" }, "org_a");
        expect(writeAsOrg).toHaveBeenCalledWith("org_a", expect.any(Function));
        expect(updateOrderApi).toHaveBeenCalledWith("s1", "o1", {
            paymentStatus: "PAID",
        });
        await recordPayment("o1", "CASH", "org_a");
        expect(recordOrderPayment).toHaveBeenCalledWith("o1", "CASH");
    });

    it("writes nothing for a tab left on another business", async () => {
        const res = await recordPayment("o1", "CASH", "org_b");
        expect(res).toEqual({ ok: false, error: "moved" });
        expect(recordOrderPayment).not.toHaveBeenCalled();
    });
});
