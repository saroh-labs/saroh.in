"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { useState } from "react";

import type { CounterPayment } from "@/lib/orders/kitchen-service";

import { actionClass } from "./parts";

const WAYS: { kind: CounterPayment; label: string }[] = [
    { kind: "CASH", label: "Cash" },
    { kind: "UPI", label: "UPI" },
    { kind: "CARD", label: "Card" },
];

/**
 * "Record payment" for what a paid order still owes — an edit's
 * difference — once the business has been paid at the counter. The API
 * works out the amount; this only asks how it was paid. On a plan without
 * online payments it is the only way the difference is settled; with them
 * it sits beside the pay link.
 */
export function RecordPayment({
    due,
    onRecord,
    busy = false,
}: {
    /** What is still owed, formatted ("₹120.00"). */
    due: string;
    onRecord: (kind: CounterPayment) => void;
    busy?: boolean;
}) {
    const [asking, setAsking] = useState(false);
    if (!asking) {
        return (
            <Button
                type="button"
                variant="outline"
                className={cn(actionClass("ghost"), "mt-2 w-full")}
                disabled={busy}
                onClick={() => setAsking(true)}
            >
                Record payment
            </Button>
        );
    }
    return (
        <div
            role="group"
            aria-label={`How was ${due} paid?`}
            className="mt-2 rounded-lg border border-border px-2.5 py-2"
        >
            <p className="text-pretty text-[12.5px] font-semibold">
                How was {due} paid?
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
                {WAYS.map((w) => (
                    <Button
                        key={w.kind}
                        type="button"
                        variant="outline"
                        className={actionClass("ghost")}
                        disabled={busy}
                        onClick={() => {
                            onRecord(w.kind);
                            setAsking(false);
                        }}
                    >
                        {w.label}
                    </Button>
                ))}
                <Button
                    type="button"
                    variant="ghost"
                    className={actionClass("ghost")}
                    disabled={busy}
                    onClick={() => setAsking(false)}
                >
                    Not yet
                </Button>
            </div>
        </div>
    );
}
