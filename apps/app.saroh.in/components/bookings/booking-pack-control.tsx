"use client";

import { Button } from "@saroh/ui/button";
import { showError, showSuccess } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { OptionSelect } from "@/components/shared/option-select";
import {
    payBookingWithPack,
    takePackOffBooking,
} from "@/lib/class-packs/actions";

/**
 * How a booking is paid, when a class pack is in it (ADR-007): "Paid with
 * Morning pack" and a way to take it off (the class goes back), or "Use a
 * class pack" when the person holds one that covers this session.
 *
 * The packs offered were read by the page with the API's own rules — the
 * person's, covering this service, valid when the session starts, with a
 * class left — and the API checks again as it spends one.
 */
export function BookingPackControl({
    bookingId,
    paidWith,
    usable,
    canWrite,
}: {
    bookingId: string;
    /** The pack paying for it now, if any. */
    paidWith: { name: string } | null;
    /** Packs that could pay for it, soonest to expire first, already worded. */
    usable: { id: string; label: string }[];
    canWrite: boolean;
}) {
    const router = useRouter();
    const selectId = useId();
    const [busy, setBusy] = useState(false);
    const [pick, setPick] = useState(usable.at(0)?.id ?? "");

    async function use() {
        const chosen = usable.find((p) => p.id === pick);
        if (!chosen) return;
        setBusy(true);
        const res = await payBookingWithPack(bookingId, chosen.id);
        setBusy(false);
        if (!res.ok) {
            showError(res.error);
            router.refresh();
            return;
        }
        showSuccess(
            `Paid with ${res.data.purchase.pack.name} — ${res.data.purchase.left} left`,
        );
        router.refresh();
    }

    async function takeOff() {
        setBusy(true);
        const res = await takePackOffBooking(bookingId);
        setBusy(false);
        if (!res.ok) return showError(res.error);
        showSuccess(
            res.data.returned
                ? "The pack is off this booking, and its class is back"
                : "This booking was not paid with a pack",
        );
        router.refresh();
    }

    if (paidWith) {
        return (
            <div className="grid gap-3">
                <p className="text-sm">
                    Paid with{" "}
                    <span className="font-medium">{paidWith.name}</span>.
                    Cancelling the booking gives the class back.
                </p>
                {canWrite ? (
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="justify-self-start"
                        disabled={busy}
                        onClick={() => void takeOff()}
                    >
                        {busy ? "Taking it off…" : "Take the pack off"}
                    </Button>
                ) : null}
            </div>
        );
    }

    if (!canWrite || usable.length === 0) return null;

    return (
        <div className="grid gap-3">
            <p className="text-sm text-muted-foreground">
                They hold a class pack that covers this session. Using it takes
                a class off; cancelling gives it back.
            </p>
            {usable.length > 1 ? (
                <OptionSelect
                    id={selectId}
                    aria-label="Which pack"
                    value={pick}
                    onValueChange={setPick}
                    options={usable.map((p) => ({
                        value: p.id,
                        label: p.label,
                    }))}
                />
            ) : (
                <p className="text-sm font-medium">{usable.at(0)?.label}</p>
            )}
            <Button
                type="button"
                size="sm"
                className="justify-self-start"
                disabled={busy || !pick}
                onClick={() => void use()}
            >
                {busy ? "Using it…" : "Use a class pack"}
            </Button>
        </div>
    );
}
