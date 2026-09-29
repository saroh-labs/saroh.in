import type {
    CancelMandateInput,
    CreateMandateSetupInput,
    CreateOrderIntentInput,
    CreateOrderIntentResult,
    FindRefundInput,
    GetMandateInput,
    MandateCapability,
    MandateChargeInput,
    MandateChargeResult,
    MandateMethod,
    MandateSetupResult,
    MerchantProvider,
    PreDebitStatus,
    PreparedMandateCharge,
    PrepareMandateChargeInput,
    ProviderFactory,
    ProviderMandate,
    ProviderMandateStatus,
    RefundInput,
    RefundResult,
} from "./provider.port";
import {
    MANDATE_METHODS,
    MandateCallError,
    RefundCallError,
} from "./provider.port";

/** The mandate calls the fake answers, for {@link FakeMerchantProvider.failNextMandateCall}. */
export type FakeMandateOp =
    | "mandateMethods"
    | "createSetup"
    | "get"
    | "prepareCharge"
    | "getPreDebit"
    | "charge"
    | "findCharge";

/** One authorisation the fake has started, as its provider would keep it. */
export interface FakeMandateSetup {
    reference: string;
    setupReference: string;
    providerCustomerId: string;
    method: MandateMethod;
    maxAmountCents: number;
    status: ProviderMandateStatus;
    providerMandateId: string | null;
    displayHint: string | null;
    failureReason: string | null;
    expiresAt: Date;
    /** The authorisation's own payment, once the customer made it. */
    paymentRef?: string | null;
}

/** One charge the fake has prepared (step one) and maybe debited (step two). */
export interface FakeMandateCharge {
    reference: string;
    providerIntentId: string;
    providerMandateId: string;
    amountCents: number;
    debitAfter: Date;
    preDebitStatus: PreDebitStatus;
    providerPaymentRef: string | null;
    /** What became of the debit, once asked for (D13's look-up reads it). */
    paymentStatus: "PENDING" | "SUCCEEDED" | "FAILED" | null;
}

/** Razorpay refuses a UPI debit sooner than this after its notice (D11 spike). */
const FAKE_PRE_DEBIT_MINIMUM_MS = 25 * 60 * 60 * 1000;

/**
 * Deterministic, network-free provider for tests/dev (S5-002).
 *
 * Records every call (so a test can assert it received the DECRYPTED
 * credentials and the SERVER-CALCULATED amount) and returns a stable
 * `providerIntentId` derived from the order id. Never makes an HTTP request.
 */
export class FakeMerchantProvider implements MerchantProvider {
    readonly calls: CreateOrderIntentInput[] = [];
    readonly refundCalls: RefundInput[] = [];
    readonly findCalls: FindRefundInput[] = [];
    /** The refunds made, by Saroh's reference. */
    readonly refunds = new Map<string, RefundResult>();
    private readonly refundFailures: {
        outcome: "REFUSED" | "UNKNOWN";
        madeAnyway: boolean;
    }[] = [];

    /** Every mandate cancel asked for, answered or not (D20). */
    readonly mandateCancelCalls: CancelMandateInput[] = [];
    /** The mandates the provider has cancelled, by their provider id. */
    readonly cancelledMandates = new Set<string>();
    private readonly mandateCancelFailures: {
        outcome: "REFUSED" | "UNKNOWN";
        madeAnyway: boolean;
    }[] = [];

    /**
     * The methods this "account" can set up autopay with (D11). Empty makes
     * a business without autopay.
     */
    mandateMethodList: MandateMethod[] = [...MANDATE_METHODS];
    /**
     * The least an authorisation takes by each method (DEC-064's ₹1
     * check). None by default; a test sets Razorpay's (`UPI`/`CARD` 100).
     */
    readonly authorisationMinimum: Partial<Record<MandateMethod, number>> = {};
    /**
     * Methods whose debit waits for a pre-debit notice. UPI's does (D11
     * spike); card and eMandate timing is still open, so a test chooses.
     */
    readonly preDebitMethods = new Set<MandateMethod>(["UPI"]);
    /** The fake provider's clock, so a test can move past `debitAfter`. */
    now: () => Date = () => new Date();

    /** Every mandate call but cancel, in order. */
    readonly mandateCalls: { op: FakeMandateOp; input: unknown }[] = [];
    /** Authorisations started, by the set-up reference the fake gave out. */
    readonly mandateSetups = new Map<string, FakeMandateSetup>();
    /** Charges prepared, by the provider order id the fake gave out. */
    readonly mandateCharges = new Map<string, FakeMandateCharge>();
    private readonly mandateFailures = new Map<
        FakeMandateOp,
        { outcome: "REFUSED" | "UNKNOWN" | "NOT_YET"; madeAnyway: boolean }[]
    >();

    /**
     * Autopay mandates (D11; D20's cancel). Set-up, the two-step charge (a
     * prepared order with its pre-debit notice, then the debit once the
     * notice is delivered and `debitAfter` has passed) and cancel, answered
     * the way the D11 spike saw Razorpay answer. Cancelling one already
     * cancelled answers as a success, as a real provider's cancel does.
     */
    readonly mandates: MandateCapability = {
        authorisationMinimumCents: this.authorisationMinimum,
        mandateMethods: (input) =>
            this.mandateCall("mandateMethods", input, () => [
                ...this.mandateMethodList,
            ]),
        createSetup: (input) =>
            this.mandateCall("createSetup", input, () =>
                this.startSetup(input),
            ),
        get: (input) =>
            this.mandateCall("get", input, () => this.readMandate(input)),
        prepareCharge: (input) =>
            this.mandateCall("prepareCharge", input, () => this.prepare(input)),
        getPreDebit: (input) =>
            this.mandateCall("getPreDebit", input, () => {
                const charge = this.mandateCharges.get(input.providerIntentId);
                if (!charge) {
                    throw new MandateCallError("no such order", "REFUSED");
                }
                return charge.preDebitStatus;
            }),
        charge: (input) =>
            this.mandateCall("charge", input, () => this.debit(input)),
        findCharge: (input) =>
            this.mandateCall("findCharge", input, () => {
                const charge = this.mandateCharges.get(input.providerIntentId);
                if (!charge) {
                    throw new MandateCallError("no such order", "REFUSED");
                }
                return {
                    status: charge.paymentStatus ?? "NONE",
                    providerPaymentRef: charge.providerPaymentRef,
                };
            }),
        cancel: (input) => {
            this.mandateCancelCalls.push(input);
            if (this.cancelledMandates.has(input.providerMandateId)) {
                return Promise.resolve();
            }
            const failure = this.mandateCancelFailures.shift();
            if (failure?.madeAnyway) {
                this.cancelMandateHere(input.providerMandateId);
            }
            if (failure) {
                return Promise.reject(
                    new MandateCallError(
                        "fake mandate cancel failed",
                        failure.outcome,
                    ),
                );
            }
            this.cancelMandateHere(input.providerMandateId);
            return Promise.resolve();
        },
    };

    constructor(readonly name = "RAZORPAY") {}

    createOrderIntent(
        input: CreateOrderIntentInput,
    ): Promise<CreateOrderIntentResult> {
        this.calls.push(input);
        return Promise.resolve({
            providerIntentId: `fake_${this.name.toLowerCase()}_${input.orderId}`,
            clientParams: {
                fakeOrderId: `fake_${this.name.toLowerCase()}_${input.orderId}`,
                amount: input.amountCents,
                currency: input.currency,
            },
        });
    }

    refund(input: RefundInput): Promise<RefundResult> {
        this.refundCalls.push(input);
        // Like Razorpay's idempotency key: the same reference answers with
        // the refund it already made.
        const made = this.refunds.get(input.reference);
        if (made) return Promise.resolve(made);

        const failure = this.refundFailures.shift();
        if (failure && !failure.madeAnyway) {
            return Promise.reject(
                new RefundCallError("fake refund failed", failure.outcome),
            );
        }
        // A payment can be refunded more than once now (by line, U6); each
        // refund gets its own id, the first keeping the old shape.
        const nth = [...this.refunds.values()].filter((r) =>
            r.providerRefundId.startsWith(
                `fake_refund_${input.providerIntentId}`,
            ),
        ).length;
        const result: RefundResult = {
            providerRefundId:
                nth === 0
                    ? `fake_refund_${input.providerIntentId}`
                    : `fake_refund_${input.providerIntentId}_${nth + 1}`,
            status: "PENDING",
            failed: false,
        };
        this.refunds.set(input.reference, result);
        // The refund was made, but the answer never came back.
        if (failure) {
            return Promise.reject(
                new RefundCallError("fake refund timed out", failure.outcome),
            );
        }
        return Promise.resolve(result);
    }

    findRefund(input: FindRefundInput): Promise<RefundResult | null> {
        this.findCalls.push(input);
        return Promise.resolve(this.refunds.get(input.reference) ?? null);
    }

    /**
     * Make the next refund call fail: `REFUSED` makes nothing; `UNKNOWN`
     * makes nothing unless `madeAnyway` — a refund that went through while
     * the answer was lost.
     */
    failNextRefund(
        outcome: "REFUSED" | "UNKNOWN",
        opts: { madeAnyway?: boolean } = {},
    ): void {
        this.refundFailures.push({ outcome, madeAnyway: !!opts.madeAnyway });
    }

    /**
     * Make the next mandate cancel fail: `REFUSED` cancels nothing;
     * `UNKNOWN` cancels nothing unless `madeAnyway` — the cancel went
     * through while the answer was lost.
     */
    failNextMandateCancel(
        outcome: "REFUSED" | "UNKNOWN",
        opts: { madeAnyway?: boolean } = {},
    ): void {
        this.mandateCancelFailures.push({
            outcome,
            madeAnyway: !!opts.madeAnyway,
        });
    }

    /**
     * Make the next `op` mandate call fail. `madeAnyway`: it went through at
     * the provider while the answer was lost (an `UNKNOWN` that did happen).
     */
    failNextMandateCall(
        op: FakeMandateOp,
        outcome: "REFUSED" | "UNKNOWN" | "NOT_YET",
        opts: { madeAnyway?: boolean } = {},
    ): void {
        const queue = this.mandateFailures.get(op) ?? [];
        queue.push({ outcome, madeAnyway: !!opts.madeAnyway });
        this.mandateFailures.set(op, queue);
    }

    /**
     * The bank answers a debit (D13): captured or declined at the provider.
     * A test may then send the payment's webhook, or leave it lost and let
     * a look-up find it.
     */
    answerCharge(
        providerIntentId: string,
        status: "SUCCEEDED" | "FAILED",
    ): FakeMandateCharge {
        const charge = this.mandateCharges.get(providerIntentId);
        if (!charge?.providerPaymentRef) {
            throw new Error(`fake: no debit on ${providerIntentId}`);
        }
        charge.paymentStatus = status;
        return charge;
    }

    /**
     * The customer approves the authorisation: the provider makes the
     * mandate (token) and it is ACTIVE. Returns what its webhook would say.
     */
    authorise(
        setupReference: string,
        opts: { displayHint?: string } = {},
    ): FakeMandateSetup {
        const setup = this.setupOrThrow(setupReference);
        setup.status = "ACTIVE";
        setup.providerMandateId ??= `fake_token_${setup.reference}`;
        setup.displayHint =
            opts.displayHint ??
            (setup.method === "CARD" ? "•••• 4242" : "as•••@okbank");
        return setup;
    }

    /**
     * The customer paid the authorisation's own payment (a ₹1 check, or
     * the invoice): a read of the set-up now names it as captured.
     */
    payAuthorisation(setupReference: string, paymentRef: string): void {
        this.setupOrThrow(setupReference).paymentRef = paymentRef;
    }

    /** The authorisation was refused or abandoned at the provider. */
    rejectSetup(
        setupReference: string,
        reason = "mandate_rejected",
    ): FakeMandateSetup {
        const setup = this.setupOrThrow(setupReference);
        setup.status = "FAILED";
        setup.failureReason = reason;
        return setup;
    }

    /** The customer paused (or resumed) it in their UPI app. */
    setMandateStatus(
        providerMandateId: string,
        status: ProviderMandateStatus,
    ): void {
        const setup = this.setupByMandate(providerMandateId);
        if (setup) setup.status = status;
    }

    /** The provider delivered (or failed to deliver) a charge's notice. */
    settlePreDebit(
        providerIntentId: string,
        status: "DELIVERED" | "FAILED",
    ): void {
        const charge = this.mandateCharges.get(providerIntentId);
        if (!charge) throw new Error(`fake: no charge ${providerIntentId}`);
        charge.preDebitStatus = status;
    }

    private mandateCall<T>(
        op: FakeMandateOp,
        input: unknown,
        run: () => T,
    ): Promise<T> {
        this.mandateCalls.push({ op, input });
        const failure = this.mandateFailures.get(op)?.shift();
        if (failure) {
            if (failure.madeAnyway) {
                try {
                    run();
                } catch {
                    // Refused at the provider too; still no answer came back.
                }
            }
            return Promise.reject(
                new MandateCallError(`fake ${op} failed`, failure.outcome),
            );
        }
        try {
            return Promise.resolve(run());
        } catch (err) {
            return Promise.reject(
                err instanceof Error ? err : new Error(String(err)),
            );
        }
    }

    private startSetup(input: CreateMandateSetupInput): MandateSetupResult {
        if (!this.mandateMethodList.includes(input.method)) {
            throw new MandateCallError("method not enabled", "REFUSED");
        }
        if (input.maxAmountCents <= 0) {
            throw new MandateCallError("max_amount invalid", "REFUSED");
        }
        const setupReference = `fake_setup_${input.reference}`;
        // Like an idempotent create: the same reference is the same set-up.
        const setup: FakeMandateSetup = this.mandateSetups.get(
            setupReference,
        ) ?? {
            reference: input.reference,
            setupReference,
            providerCustomerId: `fake_cust_${input.reference}`,
            method: input.method,
            maxAmountCents: input.maxAmountCents,
            status: "PENDING",
            providerMandateId: null,
            displayHint: null,
            failureReason: null,
            expiresAt: input.expiresAt,
        };
        this.mandateSetups.set(setupReference, setup);
        return {
            providerCustomerId: setup.providerCustomerId,
            setupReference,
            authorisationUrl: `https://fake.provider.test/authorise/${setupReference}`,
            clientParams: { fakeSetupId: setupReference },
        };
    }

    private readMandate(input: GetMandateInput): ProviderMandate {
        const setup =
            (input.providerMandateId
                ? this.setupByMandate(input.providerMandateId)
                : undefined) ??
            (input.setupReference
                ? this.mandateSetups.get(input.setupReference)
                : undefined);
        if (!setup) throw new MandateCallError("no such mandate", "REFUSED");
        return {
            status: setup.status,
            providerMandateId: setup.providerMandateId,
            providerCustomerId: setup.providerCustomerId,
            method: setup.method,
            displayHint: setup.displayHint,
            maxAmountCents: setup.maxAmountCents,
            expiresAt: setup.expiresAt,
            failureReason: setup.failureReason,
            setupPayment: setup.paymentRef
                ? { providerPaymentRef: setup.paymentRef, captured: true }
                : null,
        };
    }

    private prepare(input: PrepareMandateChargeInput): PreparedMandateCharge {
        const providerIntentId = `fake_mandate_order_${input.reference}`;
        const made = this.mandateCharges.get(providerIntentId);
        if (made) return preparedView(made);
        const setup = this.setupByMandate(input.providerMandateId);
        if (setup?.status !== "ACTIVE") {
            throw new MandateCallError("mandate not active", "REFUSED");
        }
        const needsNotice = this.preDebitMethods.has(setup.method);
        if (
            needsNotice &&
            input.debitAt.getTime() <
                this.now().getTime() + FAKE_PRE_DEBIT_MINIMUM_MS
        ) {
            // Razorpay: "Debit can be attempted 25 hours after sending the
            // pre-debit notification".
            throw new MandateCallError("debit too soon", "REFUSED");
        }
        const charge: FakeMandateCharge = {
            reference: input.reference,
            providerIntentId,
            providerMandateId: input.providerMandateId,
            amountCents: input.amountCents,
            debitAfter: needsNotice ? input.debitAt : this.now(),
            preDebitStatus: needsNotice ? "PENDING" : "NOT_NEEDED",
            providerPaymentRef: null,
            paymentStatus: null,
        };
        this.mandateCharges.set(providerIntentId, charge);
        return preparedView(charge);
    }

    private debit(input: MandateChargeInput): MandateChargeResult {
        const charge = this.mandateCharges.get(input.providerIntentId);
        if (!charge) throw new MandateCallError("no such order", "REFUSED");
        // Asked again for the same order: the debit it already made.
        if (charge.providerPaymentRef) {
            return {
                providerPaymentRef: charge.providerPaymentRef,
                status: "PENDING",
            };
        }
        const setup = this.setupByMandate(charge.providerMandateId);
        if (setup?.status !== "ACTIVE") {
            throw new MandateCallError("mandate not active", "REFUSED");
        }
        if (input.amountCents > setup.maxAmountCents) {
            throw new MandateCallError("amount above max_amount", "REFUSED");
        }
        if (
            charge.preDebitStatus === "PENDING" ||
            charge.preDebitStatus === "FAILED" ||
            this.now().getTime() < charge.debitAfter.getTime()
        ) {
            // Razorpay: `pre_debit_notification_not_sent`.
            throw new MandateCallError("pre-debit notice not sent", "NOT_YET");
        }
        charge.providerPaymentRef = `fake_mandate_pay_${charge.reference}`;
        charge.paymentStatus = "PENDING";
        return {
            providerPaymentRef: charge.providerPaymentRef,
            status: "PENDING",
        };
    }

    private setupOrThrow(setupReference: string): FakeMandateSetup {
        const setup = this.mandateSetups.get(setupReference);
        if (!setup) throw new Error(`fake: no set-up ${setupReference}`);
        return setup;
    }

    private setupByMandate(
        providerMandateId: string,
    ): FakeMandateSetup | undefined {
        for (const setup of this.mandateSetups.values()) {
            if (setup.providerMandateId === providerMandateId) return setup;
        }
        return undefined;
    }

    private cancelMandateHere(providerMandateId: string): void {
        this.cancelledMandates.add(providerMandateId);
        const setup = this.setupByMandate(providerMandateId);
        if (setup) setup.status = "CANCELLED";
    }
}

function preparedView(charge: FakeMandateCharge): PreparedMandateCharge {
    return {
        providerIntentId: charge.providerIntentId,
        debitAfter: charge.debitAfter,
        preDebitStatus: charge.preDebitStatus,
        preDebitRef:
            charge.preDebitStatus === "NOT_NEEDED"
                ? null
                : `fake_notice_${charge.reference}`,
    };
}

/**
 * A {@link ProviderFactory} that always returns the SAME fake provider,
 * regardless of the requested name. Lets a service test inject one fake and
 * assert on its recorded calls.
 */
export class FakeProviderFactory implements ProviderFactory {
    constructor(private readonly provider: FakeMerchantProvider) {}

    get(): FakeMerchantProvider {
        return this.provider;
    }
}
