"use client";

import { Refusal } from "@/components/shared/states/refusal";
import { formatDate } from "@/lib/format/datetime";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { showSuccess } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { FormDialog } from "@/components/shared/forms/form-dialog";
import { Chip } from "@/components/shared/lists/chip";
import { runAction } from "@/lib/api/run-action";
import { extendHolder } from "@/lib/class-packs/actions";
import {
    EXTEND_REASON_MAX,
    MAX_EXTEND_DAYS,
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
    const [tried, setTried] = useState(false);
    const why = reason.trim();
    const whyless = tried && why.length === 0;

    async function save() {
        setTried(true);
        if (busy || why.length === 0) return;
        setError(null);
        const res = await runAction(
            () => extendHolder(target.purchaseId, days, why),
            { setBusy, quiet: true, onUnreached: setError },
        );
        if (!res) return;
        if (!res.ok) {
            setError(extendFailure(res, target.name));
            return;
        }
        showSuccess(extendedToast(target.name, res.data.expiresAt, timeZone));
        onClose();
        router.refresh();
    }

    return (
        <FormDialog
            open
            size="md"
            title={`Extend ${target.name}'s pack`}
            description={`Use by ${formatDate(target.expiresAt, timeZone)} now. Up to ${MAX_EXTEND_DAYS} more days at a time.`}
            pending={busy}
            saveLabel="Extend pack"
            savingLabel="Extending…"
            fieldsClassName="gap-3"
            onClose={onClose}
            onSubmit={save}
        >
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
                {formatDate(
                    extendedTo(target.expiresAt, days).toISOString(),
                    timeZone,
                    { weekday: "short" },
                )}
            </p>
            <div className="grid gap-1.5">
                <Label htmlFor={ids.why}>Reason</Label>
                <Input
                    id={ids.why}
                    value={reason}
                    maxLength={EXTEND_REASON_MAX}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="e.g. Knee injury, doctor's note seen"
                    aria-describedby={
                        error ? `${ids.err} ${ids.help}` : ids.help
                    }
                    aria-invalid={error || whyless ? true : undefined}
                />
                {whyless ? (
                    <p
                        role="alert"
                        className="text-[12.5px] font-medium text-destructive-subtle-foreground"
                    >
                        Say why they are getting more days.
                    </p>
                ) : null}
                <p
                    id={ids.help}
                    className="m-0 text-[12px] text-muted-foreground"
                >
                    Shown with their pack under Who has it, and kept in the
                    pack&apos;s history.
                </p>
            </div>
            <Refusal id={ids.err}>{error}</Refusal>
        </FormDialog>
    );
}
