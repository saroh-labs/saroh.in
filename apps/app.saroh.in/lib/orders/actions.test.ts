import { beforeEach, describe, expect, it, vi } from "vitest";

import { recordPayment, updateOrder } from "./actions";

/**
 * Record as paid reads the order page again (UX-063): a successful write
 * revalidates the order and the list, so the money panel doesn't keep
 * saying "Still due" until a reload. A refused one revalidates nothing.
 */
const { revalidatePath, updateOrderApi, recordOrderPayment } = vi.hoisted(
    () => ({
        revalidatePath: vi.fn(),
        updateOrderApi: vi.fn(),
        recordOrderPayment: vi.fn(),
    }),
);
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("./service", () => ({ updateOrder: updateOrderApi }));
vi.mock("./kitchen-service", () => ({ recordOrderPayment }));

beforeEach(() => {
    revalidatePath.mockReset();
});

describe("recording a payment refreshes the order (UX-063)", () => {
    it("revalidates the order page and the list after Record as paid", async () => {
        updateOrderApi.mockResolvedValue({ ok: true, data: { id: "o1" } });
        await updateOrder("s1", "o1", { paymentStatus: "PAID" });
        expect(revalidatePath).toHaveBeenCalledWith("/commerce/orders/o1");
        expect(revalidatePath).toHaveBeenCalledWith("/commerce/orders");
    });

    it("revalidates after the counter's Paid in cash", async () => {
        recordOrderPayment.mockResolvedValue({
            ok: true,
            data: { amountCents: 100 },
        });
        await recordPayment("o1", "CASH");
        expect(revalidatePath).toHaveBeenCalledWith("/commerce/orders/o1");
    });

    it("leaves the page alone when the write is refused", async () => {
        updateOrderApi.mockResolvedValue({ ok: false, error: "No" });
        await updateOrder("s1", "o1", { paymentStatus: "PAID" });
        expect(revalidatePath).not.toHaveBeenCalled();
    });
});
