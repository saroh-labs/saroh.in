"use client";

import { useRef, useState } from "react";

import { destructiveAlertClasses } from "../alert";
import type { AutopayMethod, AutopayStart } from "../autopay/api";
import {
    AutopayMethodChoice,
    landOnBusinessSite,
    openAutopayWindow,
} from "../autopay/choice";
import type { OpenCheckout } from "../booking-flow/checkout";
import { openProviderCheckout } from "../booking-flow/checkout";
import { cn } from "../lib/utils";
import { priceKey } from "../prices/api";
import type { AccountSubscription } from "./model";
import { accountMoney, planPrice } from "./model";
import type { AutopayStartResult, PlanApi } from "./plan-api";
import { PLAN_OFFLINE } from "./plan-api";
import { Sheet, sheetButton } from "./sheet";

/**
 * "Set up autopay" and "Change how autopay pays" on My plan (round-2 D12):
 * every method the business's provider offers, by its plain name, and the
 * provider's window. With something owed, UPI and card pay it in the same
 * window; eMandate authorises alone (nothing is taken). Once approved, the
 * customer lands on the business's own page that says how autopay stands.
 */
export function AutopaySheet({
    plan,
    methods,
    onClose,
    start,
    businessName,
    customer,
    openCheckout = openProviderCheckout,
}: {
    /** The plan to set autopay up on; null keeps the sheet closed. */
    plan: AccountSubscription | null;
    methods: readonly AutopayMethod[];
    onClose: () => void;
    start: NonNullable<PlanApi["startAutopay"]>;
    businessName: string;
    customer: { name: string | null; email: string };
    openCheckout?: OpenCheckout;
}) {
    const on =
        plan?.autopay?.state === "ON" || plan?.autopay?.state === "PAUSED";
    return (
        <Sheet
            open={plan !== null}
            onClose={onClose}
            title={on ? "Change how autopay pays" : "Set up autopay"}
            lead={plan ? `${plan.name} · ${planPrice(plan)}` : undefined}
        >
            {plan ? (
                <Choose
                    key={plan.ref}
                    plan={plan}
                    methods={methods}
                    start={start}
                    businessName={businessName}
                    customer={customer}
                    openCheckout={openCheckout}
                />
            ) : null}
        </Sheet>
    );
}

function Choose({
    plan,
    methods,
    start,
    businessName,
    customer,
    openCheckout,
}: {
    plan: AccountSubscription;
    methods: readonly AutopayMethod[];
    start: NonNullable<PlanApi["startAutopay"]>;
    businessName: string;
    customer: { name: string | null; email: string };
    openCheckout: OpenCheckout;
}) {
    const [method, setMethod] = useState<AutopayMethod | null>(
        methods[0] ?? null,
    );
    const [busy, setBusy] = useState(false);
    const [said, setSaid] = useState<string | null>(null);
    const [problem, setProblem] = useState<string | null>(null);
    // One key per opening: a double tap starts one set-up.
    const key = useRef(priceKey("join"));
    // What turning autopay on pays now, when something is owed (D12).
    const owed = plan.autopayPays ?? null;
    // UPI and card pay what is owed in the same window; eMandate doesn't.
    const pays = owed && method && method !== "EMANDATE" ? owed : null;
    const off = busy || method === null;

    async function submit() {
        if (!method || busy) return;
        setBusy(true);
        setProblem(null);
        setSaid(null);
        const result = await start(plan.ref, method, key.current).catch(
            (): AutopayStartResult => ({ ok: false, message: PLAN_OFFLINE }),
        );
        if (!result.ok) {
            setBusy(false);
            setProblem(result.message);
            return;
        }
        await finish(result.data);
    }

    async function finish(started: AutopayStart) {
        const outcome = await openAutopayWindow(started, {
            openCheckout,
            business: businessName,
            description: `Autopay for ${plan.name}`,
            booker: { name: customer.name ?? "", email: customer.email },
        });
        if (outcome === "redirected") return;
        if (outcome === "paid" && landOnBusinessSite(started)) return;
        setBusy(false);
        // A new try is a new set-up.
        key.current = priceKey("join");
        if (outcome === "paid") {
            setSaid(
                "Autopay is being confirmed. It shows here as soon as it's on.",
            );
        } else if (outcome === "closed") {
            setSaid("The window closed before autopay was set up.");
        } else {
            setProblem(
                outcome === "failed"
                    ? "Autopay wasn't set up. Nothing was taken — try again, or pick another way."
                    : "We couldn't open the payment window. Try again in a moment.",
            );
        }
    }

    return (
        <>
            <AutopayMethodChoice
                methods={methods}
                chosen={method}
                onPick={setMethod}
            />
            <p className="text-site-muted mt-2.5 text-[12.5px] leading-normal">
                {pays
                    ? `This pays the ${accountMoney(pays.total, pays.currency)} owed now, and each renewal after it is paid automatically.`
                    : "Each renewal is paid automatically. Cancel any time by asking the business."}
            </p>
            {said ? (
                <p role="status" className="text-site-body mt-3 text-sm">
                    {said}
                </p>
            ) : null}
            {problem ? (
                <p role="alert" className={cn(destructiveAlertClasses, "mt-3")}>
                    {problem}
                </p>
            ) : null}
            <button
                type="button"
                disabled={off}
                onClick={() => void submit()}
                className={sheetButton(off)}
            >
                {busy
                    ? "Opening…"
                    : pays
                      ? `Pay ${accountMoney(pays.total, pays.currency)} and turn on autopay`
                      : "Turn on autopay"}
            </button>
        </>
    );
}
