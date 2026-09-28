"use client";

import { cn } from "@saroh/ui/lib/utils";
import Link from "next/link";
import { useId } from "react";

import type {
    PackKind,
    PackServiceOption,
} from "@/lib/class-packs/pack-editor";
import {
    servicesFor,
    toggleService,
    unitsOf,
} from "@/lib/class-packs/pack-editor";
import { formatMoney } from "@/lib/format/money";

import { FieldError, HELP, PackChip, PackSection } from "./parts";

/**
 * Good for (E18): the services a credit pays for, filtered by the pack's
 * kind — classes for a Classes pack, one-to-one services for a one-to-one
 * pack (E13's rule, the same one `redeem-pack.ts` spends by). A service the
 * pack already names stays shown even when paused. A services read that
 * failed says so and leaves the choice as it is.
 */
export function ServicesPicker({
    kind,
    value,
    onChange,
    services,
    error,
    disabled,
}: {
    kind: PackKind;
    value: string[];
    onChange: (ids: string[]) => void;
    /** Null when they couldn't be read. */
    services: PackServiceOption[] | null;
    error?: string;
    disabled: boolean;
}) {
    const ids = { error: useId() };
    const units = unitsOf(kind);
    const options = services ? servicesFor(kind, services, value) : [];
    return (
        <PackSection title="Good for" sub="What a credit can be used on.">
            {services === null ? (
                <p role="alert" className={cn(HELP, "mt-2")}>
                    Your services couldn&apos;t be loaded, so what this pack is
                    good for stays as it is. Reload to change it.
                </p>
            ) : options.length ? (
                <div
                    role="group"
                    aria-label="Good for"
                    aria-describedby={error ? ids.error : undefined}
                    className="mt-1.5 flex flex-wrap gap-1.5"
                >
                    {options.map((s) => {
                        const price = formatMoney(s.priceCents, s.currency);
                        return (
                            <PackChip
                                key={s.id}
                                role="checkbox"
                                on={value.includes(s.id)}
                                disabled={disabled}
                                onClick={() =>
                                    onChange(toggleService(value, s.id))
                                }
                            >
                                {s.name}
                                {price ? ` · ${price}` : ""}
                            </PackChip>
                        );
                    })}
                </div>
            ) : (
                <p className={cn(HELP, "mt-2")}>
                    {kind === "ONE_TO_ONE"
                        ? "No one-to-one services are taking bookings yet."
                        : "No classes are taking bookings yet."}{" "}
                    <Link
                        href="/services/new"
                        className="rounded-[4px] font-semibold text-brand transition-colors duration-fast hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:text-foreground/70"
                    >
                        Add a service
                    </Link>{" "}
                    and it can pay for its {units}.
                </p>
            )}
            <FieldError id={ids.error} message={error} />
        </PackSection>
    );
}
