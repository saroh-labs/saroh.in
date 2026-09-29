/**
 * Razorpay recurring-payment objects as the D11 spike saw them in test
 * mode on 2026-09-29 (Northwind), and as Razorpay's webhook docs shape
 * their deliveries (round-2 D19). Ids are the spike's test-mode ids;
 * nothing here is a credential. A full VPA is never recorded: the spike
 * printed only its masked form, so the username here is made up.
 */

export const RZP = {
    customerId: "cust_ThhaxvYyvDmc6j",
    linkId: "inv_ThhazWCLFlAZZ6",
    authOrderId: "order_ThhazXS1mGWn0o",
    authPaymentId: "pay_ThhcIcfvnSEKcM",
    tokenId: "token_ThhcIlf7TwGA9c",
    chargeOrderId: "order_ThhetE2QaddRHm",
    chargePaymentId: "pay_ThhfRcurr1ng01",
    notificationId: "notification_ThhetF0dN0t1c3",
} as const;

/** `POST /subscription_registration/auth_links` → 200. */
export function authLink(overrides: Record<string, unknown> = {}) {
    return {
        id: RZP.linkId,
        entity: "invoice",
        receipt: "cmmandate000000000000001",
        customer_id: RZP.customerId,
        order_id: RZP.authOrderId,
        payment_id: null,
        status: "issued",
        short_url: "https://rzp.io/i/d11spike",
        amount: 100,
        currency: "INR",
        type: "link",
        expire_by: 1790000000,
        ...overrides,
    };
}

/**
 * `POST /customers` → 200 (with `fail_existing: "0"`, the one Razorpay
 * already has for that email and phone comes back the same way).
 */
export function authCustomer(overrides: Record<string, unknown> = {}) {
    return {
        id: RZP.customerId,
        entity: "customer",
        name: "Asha Rao",
        email: "asha@example.in",
        contact: "+919000090000",
        gstin: null,
        notes: [],
        created_at: 1790000000,
        ...overrides,
    };
}

/**
 * The authorisation order an in-page set-up makes (D12, `POST /orders`
 * with `method`, `customer_id` and a `token` block) → 200, as Razorpay's
 * recurring-payments docs shape it.
 */
export function authOrder(overrides: Record<string, unknown> = {}) {
    return {
        id: RZP.authOrderId,
        entity: "order",
        amount: 100,
        amount_paid: 0,
        amount_due: 100,
        currency: "INR",
        receipt: "cmmandate000000000000001",
        status: "created",
        attempts: 0,
        notes: { saroh_mandate_id: "cmmandate000000000000001" },
        created_at: 1790000000,
        method: "upi",
        customer_id: RZP.customerId,
        token: {
            method: "upi",
            max_amount: 180000,
            expire_at: 2106259200,
            frequency: "as_presented",
        },
        ...overrides,
    };
}

/** A token as `GET /customers/:c/tokens/:t` and `token.*` carry it. */
export function token(
    status: "initiated" | "confirmed" | "paused" | "cancelled" | "rejected",
    overrides: Record<string, unknown> = {},
) {
    return {
        id: RZP.tokenId,
        entity: "token",
        token: "Hr4qYk3Nq5ExAb",
        bank: null,
        wallet: null,
        method: "upi",
        vpa: { username: "test.user", handle: "razorpay", name: null },
        recurring: true,
        recurring_details: {
            status,
            failure_reason: status === "rejected" ? "mandate_rejected" : null,
        },
        auth_type: null,
        mrn: null,
        used_at: 1790000000,
        created_at: 1790000000,
        start_time: 1790000000,
        dcc_enabled: false,
        max_amount: 50000,
        expired_at: 2105000000,
        frequency: "as_presented",
        ...overrides,
    };
}

/** A card token: only `card.last4` is displayable. */
export function cardToken(status: "confirmed" = "confirmed") {
    return token(status, {
        method: "card",
        vpa: null,
        card: {
            entity: "card",
            name: "Asha Rao",
            last4: "1111",
            network: "Visa",
            type: "debit",
            issuer: "HDFC",
        },
    });
}

/** An eMandate token: its bank account is never kept, not even in part. */
export function emandateToken(status: "confirmed" = "confirmed") {
    return token(status, {
        method: "emandate",
        vpa: null,
        bank: "HDFC",
        bank_details: {
            beneficiary_name: "Asha Rao",
            account_number: "1121431121541121",
            ifsc: "HDFC0000001",
            account_type: "savings",
        },
    });
}

/** The authorisation payment (`GET /payments/:id`, `payment.captured`). */
export function authPayment(overrides: Record<string, unknown> = {}) {
    return {
        id: RZP.authPaymentId,
        entity: "payment",
        amount: 100,
        currency: "INR",
        status: "captured",
        order_id: RZP.authOrderId,
        invoice_id: RZP.linkId,
        method: "upi",
        captured: true,
        customer_id: RZP.customerId,
        token_id: RZP.tokenId,
        recurring: true,
        recurring_type: "initial",
        vpa: "test.user@razorpay",
        email: "asha@example.in",
        contact: "+919000090000",
        fee: 236,
        tax: 36,
        created_at: 1790000000,
        ...overrides,
    };
}

/** A charge order with its pre-debit notice (`POST /orders` → 200). */
export function chargeOrder(
    noticeStatus: "created" | "delivered" | "failed" | null,
    overrides: Record<string, unknown> = {},
) {
    return {
        id: RZP.chargeOrderId,
        entity: "order",
        amount: 120000,
        amount_paid: 0,
        currency: "INR",
        receipt: "inv_cminvoice000000000001_1",
        status: "created",
        attempts: 0,
        notes: { saroh_charge: "inv_cminvoice000000000001_1" },
        created_at: 1790000000,
        ...(noticeStatus
            ? {
                  notification: {
                      id: RZP.notificationId,
                      token_id: RZP.tokenId,
                      payment_after: 1790093600,
                      status: noticeStatus,
                      delivered_at:
                          noticeStatus === "delivered" ? 1790000100 : null,
                  },
              }
            : {}),
        ...overrides,
    };
}

/** A recurring charge's payment (`payment.captured` / `.failed`). */
export function chargePayment(
    status: "captured" | "failed" | "created",
    overrides: Record<string, unknown> = {},
) {
    return {
        id: RZP.chargePaymentId,
        entity: "payment",
        amount: 120000,
        currency: "INR",
        status,
        order_id: RZP.chargeOrderId,
        invoice_id: null,
        method: "upi",
        customer_id: RZP.customerId,
        token_id: RZP.tokenId,
        recurring: true,
        recurring_type: "auto",
        fee: 2832,
        error_code: status === "failed" ? "BAD_REQUEST_ERROR" : null,
        error_reason: status === "failed" ? "payment_failed" : null,
        created_at: 1790100000,
        ...overrides,
    };
}

/** A webhook delivery body as Razorpay sends it. */
export function delivery(
    event: string,
    entities: Record<string, unknown>,
    createdAt = 1790000200,
) {
    const payload: Record<string, { entity: unknown }> = {};
    for (const [key, entity] of Object.entries(entities)) {
        payload[key] = { entity };
    }
    return {
        entity: "event",
        account_id: "acc_Test0000000001",
        event,
        contains: Object.keys(entities),
        payload,
        created_at: createdAt,
    };
}

/** `order.notification.*`'s own entity. */
export function notice(status: "delivered" | "failed") {
    return {
        id: RZP.notificationId,
        order_id: RZP.chargeOrderId,
        token_id: RZP.tokenId,
        payment_after: 1790093600,
        delivered_at: status === "delivered" ? 1790000100 : null,
        status,
    };
}
