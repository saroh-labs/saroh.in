"use client";

import { Input } from "@saroh/ui/input";

import { Chip } from "@/components/shared/chip";
import type { AddressDraft, NewOrderWay } from "@/lib/orders/new-order";
import { goesToAddress } from "@/lib/orders/new-order";

import { FIELD, StepCard } from "./parts";

/**
 * How it leaves (B13): only the ways every line allows and the storefront
 * offers, as the API answers them (B12), each with what it adds; and, for
 * a delivery, where it goes.
 */
export function LeavesStep({
    ways,
    way,
    onWay,
    address,
    onAddress,
    format,
    failed,
    loading,
}: {
    ways: NewOrderWay[];
    way: NewOrderWay["type"] | null;
    onWay: (type: NewOrderWay["type"]) => void;
    address: AddressDraft;
    onAddress: (next: AddressDraft) => void;
    format: (cents: number) => string;
    /** The ways couldn't be read. */
    failed: boolean;
    loading: boolean;
}) {
    const set = (field: keyof AddressDraft) => (value: string) =>
        onAddress({ ...address, [field]: value });
    return (
        <StepCard title="How it leaves">
            {failed ? (
                <p
                    role="alert"
                    className="text-[12.5px] text-destructive-subtle-foreground"
                >
                    Couldn&apos;t read how these items can leave. Change an item
                    to try again.
                </p>
            ) : ways.length === 0 && !loading ? (
                <p className="text-[12.5px] leading-[1.5] text-muted-foreground">
                    These items have no way to leave together here. Take one
                    out, or turn a way on in the location&apos;s settings.
                </p>
            ) : (
                <div
                    role="radiogroup"
                    aria-label="How it leaves"
                    aria-busy={loading}
                    className="flex flex-wrap gap-1.5"
                >
                    {ways.map((w) => (
                        <Chip
                            key={w.type}
                            on={way === w.type}
                            onClick={() => onWay(w.type)}
                            className="cursor-pointer active:scale-[0.97]"
                        >
                            {w.fee
                                ? `${w.label} · ${format(Math.round(Number(w.fee) * 100))}`
                                : w.label}
                        </Chip>
                    ))}
                </div>
            )}
            {goesToAddress(way) ? (
                <div
                    role="group"
                    aria-label="Delivery address"
                    className="mt-[9px] grid gap-2"
                >
                    <Input
                        value={address.line1}
                        onChange={(e) => set("line1")(e.target.value)}
                        aria-label="Delivery address"
                        placeholder="Delivery address"
                        autoComplete="street-address"
                        className={FIELD}
                    />
                    <div className="grid grid-cols-[1fr_1fr_110px] gap-2 max-sm:grid-cols-2">
                        <Input
                            value={address.city}
                            onChange={(e) => set("city")(e.target.value)}
                            aria-label="Town or city"
                            placeholder="Town or city"
                            autoComplete="address-level2"
                            className={FIELD}
                        />
                        <Input
                            value={address.state}
                            onChange={(e) => set("state")(e.target.value)}
                            aria-label="State"
                            placeholder="State"
                            autoComplete="address-level1"
                            className={FIELD}
                        />
                        <Input
                            value={address.postalCode}
                            onChange={(e) => set("postalCode")(e.target.value)}
                            aria-label="PIN code"
                            placeholder="PIN"
                            inputMode="numeric"
                            autoComplete="postal-code"
                            className={FIELD}
                        />
                    </div>
                </div>
            ) : null}
        </StepCard>
    );
}
