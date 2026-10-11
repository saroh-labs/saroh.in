"use client";

import { useState } from "react";

import { destructiveAlertClasses } from "../alert";
import { focusRing } from "../booking-flow/styles";
import { cn } from "../lib/utils";
import type { SaveNotices } from "./details-api";
import { DETAILS_OFFLINE } from "./details-api";
import type { AccountNotices } from "./details-model";
import type { AccountView, Block } from "./model";
import { AccountCard, Unavailable } from "./parts";

/**
 * Whether the business may email the customer (DEC-142), on Your details:
 * one switch over the consent the business already keeps for them, which
 * every send checks. No new kind of consent, and nothing about sign-in
 * codes, which always reach them.
 *
 * The switch moves at once and goes back if the save didn't take, with
 * the reason said.
 */

/** "bookings, orders and invoices", by what this business offers. */
export function emailsAbout(offers: AccountView["offers"]): string {
    const about = [
        offers.appointments ? "bookings" : null,
        offers.orders ? "orders" : null,
        "invoices",
    ].filter((part): part is string => part !== null);
    return about.length > 1
        ? `${about.slice(0, -1).join(", ")} and ${about.at(-1) ?? ""}`
        : (about[0] ?? "");
}

export function EmailChoice({
    notices,
    account,
    save,
}: {
    notices: Block<AccountNotices>;
    account: Pick<AccountView, "businessName" | "offers" | "email">;
    save: SaveNotices;
}) {
    const business = account.businessName;
    const [on, setOn] = useState(notices.ok ? notices.value.email : true);
    const [busy, setBusy] = useState(false);
    const [said, setSaid] = useState<string | null>(null);
    const [problem, setProblem] = useState<string | null>(null);

    if (!notices.ok) {
        return (
            <AccountCard
                labelledBy="me-emails"
                title={`Emails from ${business}`}
            >
                <Unavailable what="Your email choice" />
            </AccountCard>
        );
    }

    async function toggle() {
        if (busy) return;
        const next = !on;
        setBusy(true);
        setOn(next);
        setSaid(null);
        setProblem(null);
        const result = await save(next).catch(() => ({
            ok: false as const,
            message: DETAILS_OFFLINE,
        }));
        setBusy(false);
        if (!result.ok) {
            setOn(!next);
            setProblem(result.message);
            return;
        }
        setOn(result.notices.email);
        setSaid(
            result.notices.email
                ? `Saved. ${business} may email you.`
                : `Saved. ${business} won't email you.`,
        );
    }

    return (
        <AccountCard
            labelledBy="me-emails"
            title={`Emails from ${business}`}
            lead={
                <span id="me-emails-about">
                    About your {emailsAbout(account.offers)}, at {account.email}
                    . Sign-in codes are always sent.
                </span>
            }
        >
            <div className="border-site-border mt-3 flex items-center gap-3 border-t pt-3">
                <span
                    id="me-emails-label"
                    className="text-site-fg min-w-0 flex-1 text-[15px] font-semibold"
                >
                    {business} may email me
                </span>
                <button
                    type="button"
                    role="switch"
                    aria-checked={on}
                    aria-labelledby="me-emails-label"
                    aria-describedby="me-emails-about"
                    disabled={busy}
                    onClick={() => void toggle()}
                    className={cn(
                        // 44px to press; the track inside is the drawn part.
                        "group inline-flex h-11 w-[52px] shrink-0 cursor-pointer items-center rounded-full disabled:cursor-default",
                        focusRing,
                    )}
                >
                    <span
                        aria-hidden="true"
                        className={cn(
                            "flex h-7 w-[52px] items-center rounded-full border px-[3px] transition-colors duration-150 ease-[var(--site-ease,cubic-bezier(0.2,0.8,0.2,1))] group-active:opacity-80 motion-reduce:transition-none",
                            on
                                ? "bg-site-accent border-site-accent"
                                : "border-site-fg bg-[color-mix(in_srgb,hsl(var(--site-fg))_10%,hsl(var(--site-bg)))]",
                        )}
                    >
                        <span
                            className={cn(
                                "size-5 rounded-full transition-transform duration-150 ease-[var(--site-ease,cubic-bezier(0.2,0.8,0.2,1))] motion-reduce:transition-none",
                                on
                                    ? "bg-site-accent-fg translate-x-6"
                                    : "bg-site-fg translate-x-0",
                            )}
                        />
                    </span>
                </button>
                {/* On and off are said in words too, never by colour alone. */}
                <span
                    aria-hidden="true"
                    className="text-site-body w-7 shrink-0 text-[13.5px] font-semibold"
                >
                    {on ? "On" : "Off"}
                </span>
            </div>
            {said ? (
                <p role="status" className="text-site-body mt-2 text-[14px]">
                    {said}
                </p>
            ) : null}
            {problem ? (
                <p role="alert" className={cn(destructiveAlertClasses, "mt-3")}>
                    {problem}
                </p>
            ) : null}
        </AccountCard>
    );
}
