"use client";

import Link from "next/link";

import { OptionSelect } from "@/components/shared/option-select";
import { PAY_WAY, payWayHint } from "@/lib/services/availability-rules";
import type { BookingPayment, OnlineBlocker } from "@/lib/staff/types";

/**
 * "How people pay when they book" on the Booking rules card (DEC-088):
 * Both, Online or At the desk, saved with the other rules. The hint says
 * what the choice means on the booking page and, when online can't be
 * taken now and the choice needs it, why — with the way to fix it.
 */
export function PayWayRow({
    way,
    blocker,
    disabled,
    onChange,
}: {
    way: BookingPayment;
    /** Why online can't be taken now; undefined when it couldn't be told. */
    blocker: OnlineBlocker | null | undefined;
    disabled: boolean;
    onChange: (way: BookingPayment) => void;
}) {
    const needsFix = way !== "DESK" && !!blocker;
    return (
        <>
            <div className="flex items-center gap-2 py-1.5">
                <span className="flex-1 text-[13px]">{PAY_WAY.label}</span>
                <OptionSelect
                    aria-label={PAY_WAY.label}
                    aria-describedby="pay-way-hint"
                    disabled={disabled}
                    value={way}
                    onValueChange={(v) => onChange(v)}
                    className="h-8 w-auto rounded-[8px] text-[12.5px]"
                    options={[...PAY_WAY.options]}
                />
            </div>
            <p
                id="pay-way-hint"
                className="mb-1.5 text-[11.5px] text-muted-foreground"
            >
                {payWayHint(way, blocker)}
                {needsFix ? (
                    <>
                        {" "}
                        <Link
                            href={
                                blocker === "PAYMENTS_OFF"
                                    ? "/settings/modules"
                                    : "/settings/providers"
                            }
                            className="rounded-sm font-medium text-foreground underline underline-offset-2 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            {blocker === "PAYMENTS_OFF"
                                ? "Turn on Payments"
                                : "Connect a provider"}
                        </Link>
                    </>
                ) : null}
            </p>
        </>
    );
}
