// Network-free: `fetch` is replaced per test and answers with the shapes
// the D11 spike recorded in Razorpay test mode, so every call's request
// and how each answer is read are asserted without a live call (D19).
import {
    authLink,
    authPayment,
    cardToken,
    chargeOrder,
    emandateToken,
    RZP,
    token,
} from "../../../../test/fixtures/razorpay-recurring";
import { FlagKey } from "../../feature-flags/flags";
import type { MandateMethod } from "./provider.port";
import { MandateCallError, supportsMandates } from "./provider.port";
import { RazorpayProvider } from "./razorpay.provider";

const CREDS = { keyId: "rzp_test_key", keySecret: "rzp_test_secret_value" };
const mandates = new RazorpayProvider().mandates;

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

function refusal(status: number, reason: string, description = "") {
    return answer(status, {
        error: {
            code: "BAD_REQUEST_ERROR",
            description,
            source: "business",
            step: "payment_initiation",
            reason,
        },
    });
}

function call(n: number): { url: string; method: string; body: unknown } {
    const [url, init] = fetchMock.mock.calls[n] as [string, RequestInit];
    return {
        url,
        method: init.method ?? "GET",
        body: init.body ? JSON.parse(init.body as string) : undefined,
    };
}

async function outcome(p: Promise<unknown>) {
    const err = await p.catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MandateCallError);
    return err as MandateCallError;
}

const SETUP = {
    reference: "cmmandate000000000000001",
    method: "UPI" as MandateMethod,
    customer: {
        name: "Asha Rao",
        email: "asha@example.in",
        phone: "+919000090000",
    },
    firstAmountCents: 100,
    maxAmountCents: 180_000,
    currency: "INR",
    frequency: "AS_PRESENTED" as const,
    expiresAt: new Date("2036-09-29T00:00:00Z"),
    setupExpiresAt: new Date("2026-09-30T00:00:00Z"),
    description: "Autopay for Monthly",
    credentials: CREDS,
};

describe("Razorpay takes autopay, behind its rollout flag", () => {
    it("has the capability, gated on RAZORPAY_AUTOPAY", () => {
        const provider = new RazorpayProvider();
        expect(supportsMandates(provider)).toBe(true);
        expect(provider.mandates.rolloutFlag).toBe(FlagKey.RAZORPAY_AUTOPAY);
    });

    it("offers the three methods the account took (no NACH), with no call", async () => {
        await expect(
            mandates.mandateMethods({ credentials: CREDS }),
        ).resolves.toEqual(["UPI", "CARD", "EMANDATE"]);
        expect(fetchMock).not.toHaveBeenCalled();
    });
});

describe("createSetup", () => {
    it("makes a registration link for the picked method and hands back its page", async () => {
        fetchMock.mockReturnValue(answer(200, authLink()));

        const result = await mandates.createSetup(SETUP);

        const sent = call(0);
        expect(sent.url).toBe(
            "https://api.razorpay.com/v1/subscription_registration/auth_links",
        );
        expect(sent.method).toBe("POST");
        expect(sent.body).toEqual({
            customer: {
                name: "Asha Rao",
                email: "asha@example.in",
                contact: "+919000090000",
            },
            type: "link",
            amount: 100,
            currency: "INR",
            description: "Autopay for Monthly",
            receipt: SETUP.reference,
            expire_by: 1790726400,
            sms_notify: false,
            email_notify: false,
            subscription_registration: {
                method: "upi",
                max_amount: 180_000,
                expire_at: 2106259200,
                frequency: "as_presented",
            },
            notes: { saroh_mandate_id: SETUP.reference },
        });
        expect(result).toEqual({
            providerCustomerId: RZP.customerId,
            setupReference: RZP.linkId,
            authorisationUrl: "https://rzp.io/i/d11spike",
            clientParams: {
                razorpayOrderId: RZP.authOrderId,
                razorpayCustomerId: RZP.customerId,
                recurring: "1",
                method: "upi",
            },
        });
    });

    it.each([
        ["CARD", "card"],
        ["EMANDATE", "emandate"],
    ] as const)("sends %s as Razorpay's %s", async (method, sentAs) => {
        fetchMock.mockReturnValue(answer(200, authLink()));
        await mandates.createSetup({
            ...SETUP,
            method,
            firstAmountCents: method === "EMANDATE" ? 0 : 100,
        });
        const body = call(0).body as {
            amount: number;
            subscription_registration: { method: string };
        };
        expect(body.subscription_registration.method).toBe(sentAs);
    });

    it("leaves out a customer's missing email and phone", async () => {
        fetchMock.mockReturnValue(answer(200, authLink()));
        await mandates.createSetup({
            ...SETUP,
            customer: { name: "Asha", email: null, phone: null },
        });
        expect((call(0).body as { customer: unknown }).customer).toEqual({
            name: "Asha",
        });
    });

    it("a 400 is REFUSED, and the error carries no body prose or credential", async () => {
        fetchMock.mockReturnValue(
            refusal(400, "input_validation_failed", "asha@example.in is bad"),
        );
        const err = await outcome(mandates.createSetup(SETUP));
        expect(err.outcome).toBe("REFUSED");
        expect(err.message).toBe(
            "Razorpay set-up failed (HTTP 400, input_validation_failed)",
        );
        expect(err.message).not.toContain("asha");
        expect(err.message).not.toContain(CREDS.keySecret);
    });

    it("a network error, 5xx or 429 is UNKNOWN", async () => {
        fetchMock.mockRejectedValueOnce(new Error("socket hang up"));
        expect((await outcome(mandates.createSetup(SETUP))).outcome).toBe(
            "UNKNOWN",
        );
        fetchMock.mockReturnValueOnce(answer(502));
        expect((await outcome(mandates.createSetup(SETUP))).outcome).toBe(
            "UNKNOWN",
        );
        fetchMock.mockReturnValueOnce(answer(429));
        expect((await outcome(mandates.createSetup(SETUP))).outcome).toBe(
            "UNKNOWN",
        );
    });

    it("a yes that names no link is UNKNOWN (it may exist)", async () => {
        fetchMock.mockReturnValue(answer(200, { status: "issued" }));
        expect((await outcome(mandates.createSetup(SETUP))).outcome).toBe(
            "UNKNOWN",
        );
    });
});

describe("get", () => {
    const BY_TOKEN = {
        providerMandateId: RZP.tokenId,
        providerCustomerId: RZP.customerId,
        setupReference: RZP.linkId,
        credentials: CREDS,
    };

    it("reads the token: ACTIVE, UPI, a masked handle and never the full VPA", async () => {
        fetchMock.mockReturnValue(answer(200, token("confirmed")));

        const mandate = await mandates.get(BY_TOKEN);

        expect(call(0).url).toBe(
            `https://api.razorpay.com/v1/customers/${RZP.customerId}/tokens/${RZP.tokenId}`,
        );
        expect(mandate).toEqual({
            status: "ACTIVE",
            providerMandateId: RZP.tokenId,
            providerCustomerId: RZP.customerId,
            method: "UPI",
            displayHint: "te•••@razorpay",
            maxAmountCents: 50000,
            expiresAt: new Date(2105000000 * 1000),
            failureReason: null,
        });
        expect(JSON.stringify(mandate)).not.toContain("test.user");
    });

    it("before a token is known, follows the paid link → payment → token", async () => {
        fetchMock
            .mockReturnValueOnce(
                answer(
                    200,
                    authLink({ status: "paid", payment_id: RZP.authPaymentId }),
                ),
            )
            .mockReturnValueOnce(answer(200, authPayment()))
            .mockReturnValueOnce(answer(200, token("confirmed")));

        const mandate = await mandates.get({
            ...BY_TOKEN,
            providerMandateId: null,
            providerCustomerId: null,
        });

        expect(call(0).url).toMatch(/\/invoices\/inv_ThhazWCLFlAZZ6$/);
        expect(call(1).url).toMatch(/\/payments\/pay_ThhcIcfvnSEKcM$/);
        expect(call(2).url).toMatch(
            /\/customers\/cust_ThhaxvYyvDmc6j\/tokens\/token_ThhcIlf7TwGA9c$/,
        );
        expect(mandate.status).toBe("ACTIVE");
        expect(mandate.providerMandateId).toBe(RZP.tokenId);
    });

    it("an unpaid link is PENDING; an expired one FAILED", async () => {
        fetchMock.mockReturnValueOnce(answer(200, authLink()));
        const unset = { ...BY_TOKEN, providerMandateId: null };
        expect((await mandates.get(unset)).status).toBe("PENDING");

        fetchMock.mockReturnValueOnce(
            answer(200, authLink({ status: "expired" })),
        );
        const lapsed = await mandates.get(unset);
        expect(lapsed.status).toBe("FAILED");
        expect(lapsed.failureReason).toBe("setup_expired");
    });

    it.each([
        ["initiated", "PENDING"],
        ["confirmed", "ACTIVE"],
        ["paused", "PAUSED"],
        ["cancelled", "CANCELLED"],
        ["rejected", "FAILED"],
    ] as const)("token %s → %s", async (status, expected) => {
        fetchMock.mockReturnValue(answer(200, token(status)));
        const mandate = await mandates.get(BY_TOKEN);
        expect(mandate.status).toBe(expected);
        if (status === "rejected") {
            expect(mandate.failureReason).toBe("mandate_rejected");
        }
    });

    it("a card shows its last four; an eMandate shows nothing of the account", async () => {
        fetchMock.mockReturnValueOnce(answer(200, cardToken()));
        const card = await mandates.get(BY_TOKEN);
        expect(card.method).toBe("CARD");
        expect(card.displayHint).toBe("•••• 1111");

        fetchMock.mockReturnValueOnce(answer(200, emandateToken()));
        const bank = await mandates.get(BY_TOKEN);
        expect(bank.method).toBe("EMANDATE");
        expect(bank.displayHint).toBeNull();
        expect(JSON.stringify(bank)).not.toContain("1121");
    });
});

describe("prepareCharge", () => {
    const PREP = {
        reference: "inv_cminvoice000000000001_1",
        providerMandateId: RZP.tokenId,
        providerCustomerId: RZP.customerId,
        method: "UPI" as MandateMethod,
        amountCents: 120000,
        currency: "INR",
        debitAt: new Date(1790093600 * 1000),
        credentials: CREDS,
    };

    it("UPI: looks for its order first, then makes one with the pre-debit notice", async () => {
        fetchMock
            .mockReturnValueOnce(
                answer(200, { entity: "collection", count: 0, items: [] }),
            )
            .mockReturnValueOnce(answer(200, chargeOrder("created")));

        const prepared = await mandates.prepareCharge(PREP);

        expect(call(0).url).toBe(
            "https://api.razorpay.com/v1/orders?receipt=inv_cminvoice000000000001_1&count=1",
        );
        expect(call(1)).toEqual({
            url: "https://api.razorpay.com/v1/orders",
            method: "POST",
            body: {
                amount: 120000,
                currency: "INR",
                receipt: PREP.reference,
                payment_capture: true,
                notes: { saroh_charge: PREP.reference },
                notification: {
                    token_id: RZP.tokenId,
                    payment_after: 1790093600,
                },
            },
        });
        expect(prepared).toEqual({
            providerIntentId: RZP.chargeOrderId,
            debitAfter: new Date(1790093600 * 1000),
            preDebitStatus: "PENDING",
            preDebitRef: RZP.notificationId,
        });
    });

    it("asked again, answers with the order it already made", async () => {
        fetchMock.mockReturnValueOnce(
            answer(200, {
                count: 1,
                items: [chargeOrder("delivered", { receipt: PREP.reference })],
            }),
        );
        const prepared = await mandates.prepareCharge(PREP);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(prepared.preDebitStatus).toBe("DELIVERED");
    });

    it("card and eMandate: no notice, chargeable now", async () => {
        fetchMock
            .mockReturnValueOnce(answer(200, { items: [] }))
            .mockReturnValueOnce(answer(200, chargeOrder(null)));
        const prepared = await mandates.prepareCharge({
            ...PREP,
            method: "CARD",
        });
        expect(call(1).body).not.toHaveProperty("notification");
        expect(prepared.preDebitStatus).toBe("NOT_NEEDED");
        expect(prepared.preDebitRef).toBeNull();
    });

    it("a debit sooner than 25 hours is REFUSED", async () => {
        fetchMock
            .mockReturnValueOnce(answer(200, { items: [] }))
            .mockReturnValueOnce(
                refusal(
                    400,
                    "input_validation_failed",
                    "Debit can be attempted 25 hours after sending the pre-debit notification",
                ),
            );
        expect((await outcome(mandates.prepareCharge(PREP))).outcome).toBe(
            "REFUSED",
        );
    });
});

describe("getPreDebit", () => {
    it.each([
        ["created", "PENDING"],
        ["delivered", "DELIVERED"],
        ["failed", "FAILED"],
        [null, "NOT_NEEDED"],
    ] as const)("notice %s → %s", async (status, expected) => {
        fetchMock.mockReturnValue(answer(200, chargeOrder(status)));
        await expect(
            mandates.getPreDebit({
                providerIntentId: RZP.chargeOrderId,
                credentials: CREDS,
            }),
        ).resolves.toBe(expected);
        expect(call(0).url).toMatch(/\/orders\/order_ThhetE2QaddRHm$/);
    });
});

describe("charge", () => {
    const CHARGE = {
        reference: "inv_cminvoice000000000001_1",
        providerIntentId: RZP.chargeOrderId,
        providerMandateId: RZP.tokenId,
        providerCustomerId: RZP.customerId,
        amountCents: 120000,
        currency: "INR",
        credentials: CREDS,
    };

    it("asks for the debit on the order, with Razorpay's own customer details", async () => {
        fetchMock
            .mockReturnValueOnce(answer(200, { items: [] }))
            .mockReturnValueOnce(
                answer(200, {
                    id: RZP.customerId,
                    email: "asha@example.in",
                    contact: "+919000090000",
                }),
            )
            .mockReturnValueOnce(
                answer(200, {
                    razorpay_payment_id: RZP.chargePaymentId,
                    razorpay_order_id: RZP.chargeOrderId,
                    razorpay_signature: "sig",
                }),
            );

        const result = await mandates.charge(CHARGE);

        expect(call(0).url).toMatch(
            /\/orders\/order_ThhetE2QaddRHm\/payments$/,
        );
        expect(call(1).url).toMatch(/\/customers\/cust_ThhaxvYyvDmc6j$/);
        expect(call(2)).toEqual({
            url: "https://api.razorpay.com/v1/payments/create/recurring",
            method: "POST",
            body: {
                email: "asha@example.in",
                contact: "+919000090000",
                amount: 120000,
                currency: "INR",
                order_id: RZP.chargeOrderId,
                customer_id: RZP.customerId,
                token: RZP.tokenId,
                recurring: true,
                notes: { saroh_charge: CHARGE.reference },
            },
        });
        expect(result).toEqual({
            providerPaymentRef: RZP.chargePaymentId,
            status: "PENDING",
        });
    });

    it("asked again for the same order, answers with the debit it made", async () => {
        fetchMock.mockReturnValueOnce(
            answer(200, {
                items: [
                    { id: "pay_old", status: "failed" },
                    { id: RZP.chargePaymentId, status: "captured" },
                ],
            }),
        );
        await expect(mandates.charge(CHARGE)).resolves.toEqual({
            providerPaymentRef: RZP.chargePaymentId,
            status: "SUCCEEDED",
        });
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("before the notice is out: NOT_YET, nothing charged", async () => {
        fetchMock
            .mockReturnValueOnce(answer(200, { items: [] }))
            .mockReturnValueOnce(answer(200, { id: RZP.customerId }))
            .mockReturnValueOnce(
                refusal(400, "pre_debit_notification_not_sent"),
            );
        expect((await outcome(mandates.charge(CHARGE))).outcome).toBe(
            "NOT_YET",
        );
    });

    it("above the mandate's limit: REFUSED", async () => {
        fetchMock
            .mockReturnValueOnce(answer(200, { items: [] }))
            .mockReturnValueOnce(answer(200, { id: RZP.customerId }))
            .mockReturnValueOnce(
                refusal(400, "amount_exceeds_maximum_amount_allowed"),
            );
        expect((await outcome(mandates.charge(CHARGE))).outcome).toBe(
            "REFUSED",
        );
    });

    it("no answer to the debit: UNKNOWN (the retry asks the order first)", async () => {
        fetchMock
            .mockReturnValueOnce(answer(200, { items: [] }))
            .mockReturnValueOnce(answer(200, { id: RZP.customerId }))
            .mockRejectedValueOnce(new Error("timeout"));
        expect((await outcome(mandates.charge(CHARGE))).outcome).toBe(
            "UNKNOWN",
        );
    });
});

describe("cancel", () => {
    const CANCEL = {
        providerMandateId: RZP.tokenId,
        providerCustomerId: RZP.customerId,
        credentials: CREDS,
    };

    it("PUTs the token's cancel, never DELETE", async () => {
        fetchMock.mockReturnValue(answer(200, token("cancelled")));
        await mandates.cancel(CANCEL);
        expect(call(0)).toEqual({
            url: `https://api.razorpay.com/v1/customers/${RZP.customerId}/tokens/${RZP.tokenId}/cancel`,
            method: "PUT",
            body: undefined,
        });
    });

    it("a refused cancel of a token already cancelled is a success", async () => {
        fetchMock
            .mockReturnValueOnce(refusal(400, "token_already_cancelled"))
            .mockReturnValueOnce(answer(200, token("cancelled")));
        await expect(mandates.cancel(CANCEL)).resolves.toBeUndefined();
        expect(call(1).method).toBe("GET");
    });

    it("a refused cancel of a live token stays REFUSED", async () => {
        fetchMock
            .mockReturnValueOnce(refusal(400, "invalid_state"))
            .mockReturnValueOnce(answer(200, token("confirmed")));
        expect((await outcome(mandates.cancel(CANCEL))).outcome).toBe(
            "REFUSED",
        );
    });

    it("no answer is UNKNOWN; no customer id is REFUSED without a call", async () => {
        fetchMock.mockReturnValueOnce(answer(503));
        expect((await outcome(mandates.cancel(CANCEL))).outcome).toBe(
            "UNKNOWN",
        );
        fetchMock.mockReset();
        expect(
            (
                await outcome(
                    mandates.cancel({ ...CANCEL, providerCustomerId: null }),
                )
            ).outcome,
        ).toBe("REFUSED");
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
