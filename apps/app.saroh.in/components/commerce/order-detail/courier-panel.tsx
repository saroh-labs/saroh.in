"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { useState } from "react";

import { actionClass, FOCUS, PanelTitle, WorkPanel } from "./parts";

const COURIERS = ["Delhivery", "Blue Dart", "Our own driver"] as const;

const isLink = (v: string) => /^https?:\/\/\S+\.\S+/.test(v);

/**
 * "Hand to courier": who takes it and, for a courier, the tracking link they
 * gave you. Saroh books no pickups and sends no email (scope: a tracking link
 * is typed) — the link is kept on the order, where the team can open it.
 */
export function CourierPanel({
    to,
    first,
    busy,
    onPrint,
    onCancel,
    onHandOver,
}: {
    /** Where it is going, one line. */
    to: string;
    first: string;
    busy: boolean;
    onPrint: () => void;
    onCancel: () => void;
    onHandOver: (input: { courier: string; trackingUrl?: string }) => void;
}) {
    const [courier, setCourier] = useState<string>(COURIERS[0]);
    const [link, setLink] = useState("");
    const own = courier === "Our own driver";
    const bad = !own && link.trim() !== "" && !isLink(link.trim());

    return (
        <WorkPanel label="Hand to courier">
            <PanelTitle>Hand to courier</PanelTitle>
            <p className="mt-[3px] text-[12px] text-muted-foreground">
                To {to}
            </p>
            <div
                className="mb-1.5 mt-3 text-[12px] font-medium"
                id="od-courier"
            >
                Courier
            </div>
            <div
                role="radiogroup"
                aria-labelledby="od-courier"
                className="flex flex-wrap gap-1.5"
            >
                {COURIERS.map((c) => {
                    const on = c === courier;
                    return (
                        <button
                            key={c}
                            type="button"
                            role="radio"
                            aria-checked={on}
                            onClick={() => setCourier(c)}
                            className={cn(
                                FOCUS,
                                "h-[30px] rounded-full border px-[11px] text-[12.5px] coarse:h-11",
                                on
                                    ? "border-foreground bg-primary font-semibold text-primary-foreground"
                                    : "border-border bg-card font-medium text-neutral-700 dark:text-muted-foreground",
                            )}
                        >
                            {c}
                        </button>
                    );
                })}
            </div>
            {!own ? (
                <label className="mt-3 block text-[12px] font-medium">
                    Tracking link
                    <input
                        type="url"
                        inputMode="url"
                        value={link}
                        onChange={(e) => setLink(e.target.value)}
                        placeholder="https://"
                        aria-invalid={bad || undefined}
                        aria-describedby="od-track-help"
                        className="mt-[5px] block h-9 w-full rounded-lg border border-border bg-card px-2.5 font-mono text-[13px] font-normal coarse:h-11"
                    />
                </label>
            ) : null}
            {!own ? (
                <p
                    id="od-track-help"
                    className={cn(
                        "mt-[5px] text-[11.5px]",
                        bad
                            ? "text-destructive-subtle-foreground"
                            : "text-muted-foreground",
                    )}
                >
                    {bad
                        ? "That isn't a web address — paste the whole link, starting https://."
                        : `Paste the link ${courier} gave you, or leave it empty. It stays on the order; nothing is sent to ${first}.`}
                </p>
            ) : null}
            <div className="mt-3 flex flex-wrap justify-end gap-2">
                <Button
                    type="button"
                    variant="outline"
                    className={actionClass("ghost")}
                    onClick={onPrint}
                >
                    Packing slip
                </Button>
                <Button
                    type="button"
                    variant="outline"
                    className={actionClass("ghost")}
                    onClick={onCancel}
                >
                    Cancel
                </Button>
                <Button
                    type="button"
                    className={actionClass("primary")}
                    disabled={bad || busy}
                    onClick={() =>
                        onHandOver({
                            courier,
                            ...(!own && link.trim()
                                ? { trackingUrl: link.trim() }
                                : {}),
                        })
                    }
                >
                    Handed over
                </Button>
            </div>
        </WorkPanel>
    );
}
