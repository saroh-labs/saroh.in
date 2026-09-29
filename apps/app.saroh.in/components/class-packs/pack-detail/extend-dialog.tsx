"use client";

import { Button } from "@saroh/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@saroh/ui/dialog";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { showSuccess } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { Chip } from "@/components/shared/chip";
import { extendHolder } from "@/lib/class-packs/actions";
import {
    EXTEND_REASON_MAX,
    MAX_EXTEND_DAYS,
    day,
    dayWithWeekday,
} from "@/lib/class-packs/pack-detail";
import {
    defaultExtendDays,
    extendChoices,
    extendFailure,
    extendedTo,
    extendedToast,
} from "@/lib/class-packs/pack-holders";

/** Who is being given days, as the dialog needs them. */
export interface ExtendTarget {
    purchaseId: string;
    name: string;
    expiresAt: string;
}

/**
 * Extend a holder's pack (E16 on E13): how many days — 7, 14, 21 or 30,
 * each off when it would still leave the pack over — and why. The API
 * takes 1 to 30 days at a time; a pack with nothing left is its 409, said
 * here in the merchant's words and kept in the dialog so nothing is lost.
 */
export function ExtendDialog({
    target,
    timeZone,
    nowIso,
    onClose,
}: {
    target: ExtendTarget;
    timeZone: string;
    nowIso: string;
    onClose: () => void;
}) {
    const router = useRouter();
    const now = new Date(nowIso);
    const ids = { days: useId(), why: useId(), help: useId(), err: useId() };
    const choices = extendChoices(target.expiresAt, now);
    const [days, setDays] = useState(() =>
        defaultExtendDays(target.expiresAt, now),
    );
    const [reason, setReason] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const why = reason.trim();
    const off = busy || why.length === 0;

    async function save() {
        if (off) return;
        setBusy(true);
        setError(null);
        const res = await extendHolder(target.purchaseId, days, why);
        setBusy(false);
        if (!res.ok) {
            setError(extendFailure(res, target.name));
            return;
        }
        showSuccess(extendedToast(target.name, res.data.expiresAt, timeZone));
        onClose();
        router.refresh();
    }

    return (
        <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
            <DialogContent className="sm:max-w-[440px]">
                <DialogHeader>
                    <DialogTitle className="font-display text-[17px] tracking-[-0.02em]">
                        Extend {target.name}&apos;s pack
                    </DialogTitle>
                    <DialogDescription className="text-[12.5px]">
                        Use by {day(target.expiresAt, timeZone)} now. Up to{" "}
                        {MAX_EXTEND_DAYS} more days at a time.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-3">
                    <div
                        role="radiogroup"
                        aria-label="How many days"
                        className="flex flex-wrap gap-1.5"
                    >
                        {choices.map((c) => (
                            <Chip
                                key={c.days}
                                on={days === c.days}
                                disabled={!c.ok}
                                onClick={() => setDays(c.days)}
                            >
                                +{c.days} days
                            </Chip>
                        ))}
                    </div>
                    <p
                        id={ids.days}
                        aria-live="polite"
                        className="m-0 text-[13px] font-semibold"
                    >
                        New use-by:{" "}
                        {dayWithWeekday(
                            extendedTo(target.expiresAt, days).toISOString(),
                            timeZone,
                        )}
                    </p>
                    <div className="grid gap-1.5">
                        <Label htmlFor={ids.why}>Reason</Label>
                        <Input
                            id={ids.why}
                            value={reason}
                            maxLength={EXTEND_REASON_MAX}
                            onChange={(e) => setReason(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") void save();
                            }}
                            placeholder="e.g. Knee injury, doctor's note seen"
                            aria-describedby={
                                error ? `${ids.err} ${ids.help}` : ids.help
                            }
                            aria-invalid={error ? true : undefined}
                        />
                        <p
                            id={ids.help}
                            className="m-0 text-[12px] text-muted-foreground"
                        >
                            Shown with their pack under Who has it, and kept in
                            the pack&apos;s history.
                        </p>
                    </div>
                    {error ? (
                        <p
                            id={ids.err}
                            role="alert"
                            className="m-0 text-[12.5px] font-medium text-destructive"
                        >
                            {error}
                        </p>
                    ) : null}
                </div>
                <DialogFooter className="gap-2 sm:gap-2">
                    <Button variant="outline" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button disabled={off} onClick={() => void save()}>
                        {busy ? "Extending…" : "Extend"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
