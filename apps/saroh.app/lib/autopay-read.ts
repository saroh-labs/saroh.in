import type { AutopayDoneState } from "@saroh/site-blocks";

import { accountAreaOn } from "./account-area";
import type { AutopayRead } from "./autopay-shape";
import {
    AUTOPAY_REF,
    autopayDoneAnswer,
    joinDoneAnswer,
} from "./autopay-shape";
import { accountFetch } from "./customer-session";
import { getInvoiceAutopay } from "./invoice-pay";

/**
 * How autopay stands, for the page a customer lands on after setting it up
 * (round-2 D12). Server-side only: a pay link's by its token, the rest with
 * the customer's session, where the API finds the plan by its ref **and**
 * the signed-in customer (ADR-011).
 */

export { autopayReadOf } from "./autopay-shape";
export type { AutopayRead } from "./autopay-shape";

export async function autopayNow(read: AutopayRead): Promise<AutopayDoneState> {
    if (read.kind === "pay") {
        if (!AUTOPAY_REF.test(read.token)) return { kind: "error" };
        return (await getInvoiceAutopay(read.token)).state;
    }
    if (!AUTOPAY_REF.test(read.ref) || !accountAreaOn())
        return { kind: "error" };
    const path =
        read.kind === "plan"
            ? `me/autopay/plans/${read.ref}`
            : `me/autopay/joins/${read.ref}`;
    const call = await accountFetch(path);
    if (call === null) return { kind: "signed-out" };
    if (!call.ok) return { kind: "error" };
    const body: unknown = await call.res.json().catch(() => null);
    return read.kind === "plan"
        ? autopayDoneAnswer(call.res.status, body)
        : joinDoneAnswer(call.res.status, body);
}
