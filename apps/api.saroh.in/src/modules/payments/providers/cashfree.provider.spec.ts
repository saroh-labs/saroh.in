// Network-free: `fetch` is replaced per test, so what goes to Cashfree and
// how each answer is read are both asserted without a live call.
import { CashfreeProvider } from "./cashfree.provider";
import { RefundCallError } from "./provider.port";

const CREDS = { keyId: "cf_app", keySecret: "cf_secret" };
const INPUT = {
    reference: "cmrefund00000000000000001",
    providerIntentId: "order_1",
    providerPaymentRef: null,
    amountCents: 25050,
    currency: "INR",
    credentials: CREDS,
};

const fetchMock = jest.fn();
beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
});

function answer(status: number, body: unknown = {}) {
    return Promise.resolve(
        new Response(JSON.stringify(body), {
            status,
            headers: { "Content-Type": "application/json" },
        }),
    );
}

/** A 2xx whose body is cut short: not JSON. */
function unreadable(status = 200) {
    return Promise.resolve(
        new Response('{"id": "rfnd_', {
            status,
            headers: { "Content-Type": "application/json" },
        }),
    );
}

async function outcomeOf(p: Promise<unknown>) {
    const err = await p.catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RefundCallError);
    return (err as RefundCallError).outcome;
}

describe("CashfreeProvider.refund", () => {
    it("uses Saroh's reference as the refund_id, amount in rupees", async () => {
        fetchMock.mockReturnValue(
            answer(200, { cf_refund_id: 991, refund_status: "PENDING" }),
        );

        const result = await new CashfreeProvider().refund(INPUT);

        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe("https://api.cashfree.com/pg/orders/order_1/refunds");
        expect(JSON.parse(init.body as string)).toEqual({
            refund_amount: 250.5,
            refund_id: INPUT.reference,
        });
        expect(result).toEqual({
            providerRefundId: "991",
            status: "PENDING",
            failed: false,
        });
    });

    it("two refunds of the same amount on one payment send two refund_ids", async () => {
        fetchMock.mockImplementation(() => answer(200, { cf_refund_id: 1 }));
        const provider = new CashfreeProvider();

        await provider.refund({ ...INPUT, reference: "rf_a" });
        await provider.refund({ ...INPUT, reference: "rf_b" });

        const ids = (fetchMock.mock.calls as [string, RequestInit][]).map(
            ([, init]) =>
                (JSON.parse(init.body as string) as { refund_id: string })
                    .refund_id,
        );
        expect(ids).toEqual(["rf_a", "rf_b"]);
    });

    it("a refund_id already used means an earlier call made it — UNKNOWN", async () => {
        fetchMock.mockReturnValue(
            answer(400, {
                message: "refund_id already exists",
                code: "refund_id_already_exists",
                type: "invalid_request_error",
            }),
        );
        expect(await outcomeOf(new CashfreeProvider().refund(INPUT))).toBe(
            "UNKNOWN",
        );
    });

    it.each([409, 429, 500])("HTTP %i is UNKNOWN", async (status) => {
        fetchMock.mockReturnValue(answer(status));
        expect(await outcomeOf(new CashfreeProvider().refund(INPUT))).toBe(
            "UNKNOWN",
        );
    });

    it("a network error is UNKNOWN", async () => {
        fetchMock.mockRejectedValue(new TypeError("fetch failed"));
        expect(await outcomeOf(new CashfreeProvider().refund(INPUT))).toBe(
            "UNKNOWN",
        );
    });

    it("a 2xx whose body cannot be read may have refunded — UNKNOWN", async () => {
        fetchMock.mockReturnValue(unreadable());
        expect(await outcomeOf(new CashfreeProvider().refund(INPUT))).toBe(
            "UNKNOWN",
        );
    });

    it("any other 400 made no refund — REFUSED", async () => {
        fetchMock.mockReturnValue(
            answer(400, { message: "refund amount is more than order amount" }),
        );
        expect(await outcomeOf(new CashfreeProvider().refund(INPUT))).toBe(
            "REFUSED",
        );
    });
});

describe("CashfreeProvider.findRefund", () => {
    it("fetches the refund by its refund_id", async () => {
        fetchMock.mockReturnValue(
            answer(200, { cf_refund_id: 991, refund_status: "SUCCESS" }),
        );

        const found = await new CashfreeProvider().findRefund(INPUT);

        expect(fetchMock.mock.calls[0][0]).toBe(
            `https://api.cashfree.com/pg/orders/order_1/refunds/${INPUT.reference}`,
        );
        expect(found).toEqual({
            providerRefundId: "991",
            status: "SUCCESS",
            failed: false,
        });
    });

    it.each(["CANCELLED", "FAILED", "REJECTED"])(
        "a %s refund reads as failed, as the webhook reads it",
        async (status) => {
            fetchMock.mockReturnValue(
                answer(200, { cf_refund_id: 991, refund_status: status }),
            );
            await expect(
                new CashfreeProvider().findRefund(INPUT),
            ).resolves.toMatchObject({ failed: true });
        },
    );

    it("is UNKNOWN when its answer cannot be read", async () => {
        fetchMock.mockReturnValue(unreadable());
        expect(await outcomeOf(new CashfreeProvider().findRefund(INPUT))).toBe(
            "UNKNOWN",
        );
    });

    it("404 means Cashfree has none", async () => {
        fetchMock.mockReturnValue(answer(404));
        await expect(
            new CashfreeProvider().findRefund(INPUT),
        ).resolves.toBeNull();
    });

    it("any other failure is UNKNOWN", async () => {
        fetchMock.mockReturnValue(answer(500));
        expect(await outcomeOf(new CashfreeProvider().findRefund(INPUT))).toBe(
            "UNKNOWN",
        );
    });
});
