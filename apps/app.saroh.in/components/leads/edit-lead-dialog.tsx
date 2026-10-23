"use client";

import { Button } from "@saroh/ui/button";
import { Label } from "@saroh/ui/label";
import { MoneyInput } from "@saroh/ui/money-input";
import { Textarea } from "@saroh/ui/textarea";
import { showError, showSuccess } from "@saroh/ui/toast";
import { PenLine } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { FormSheet } from "@/components/shared/forms/form-sheet";
import { runAction } from "@/lib/api/run-action";
import { updateLead } from "@/lib/leads/actions";

/**
 * Change what a lead is called and what it could be worth, in the side
 * sheet Add a lead opens in. Who the lead belongs to is not changed here:
 * that is a different person, and so a different lead.
 */
export function EditLeadDialog({
    leadId,
    title,
    value,
    currency,
}: {
    leadId: string;
    title: string;
    /** Minor units, as the API stores it. */
    value: number | null;
    /** The business's currency: what a lead's Worth is in (owner, 11 Oct). */
    currency: string;
}) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [nextTitle, setNextTitle] = useState(title);
    const [worth, setWorth] = useState(
        value === null ? "" : (value / 100).toString(),
    );
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const titleId = useId();
    const worthId = useId();

    const before = value === null ? "" : (value / 100).toString();

    async function submit() {
        if (!nextTitle.trim()) return setError("A lead needs a name.");
        if (worth.trim() && !/^\d+(\.\d{1,2})?$/.test(worth.trim())) {
            return setError("Worth is a number, like 45000, or empty.");
        }
        if (!worth.trim() && value !== null) {
            // The API sets a value but cannot clear one; say so rather than
            // pretend the empty field was saved.
            return setError(
                "A worth can be changed but not removed yet. Set it to 0 if it is worth nothing now.",
            );
        }
        setError(null);
        const res = await runAction(
            () =>
                updateLead(leadId, {
                    title: nextTitle.trim(),
                    ...(worth.trim()
                        ? { value: Math.round(Number(worth.trim()) * 100) }
                        : {}),
                }),
            { setBusy: setSaving },
        );
        if (!res) return;
        if (!res.ok) return showError(res.error);
        setOpen(false);
        showSuccess("Lead saved.");
        router.refresh();
    }

    return (
        <FormSheet
            open={open}
            trigger={
                <Button variant="outline">
                    <PenLine className="mr-1.5 size-4" />
                    Edit
                </Button>
            }
            title="Edit lead"
            description="What they wanted, and what it could be worth."
            pending={saving}
            dirty={nextTitle !== title || worth !== before}
            fieldsClassName="gap-4"
            onOpen={() => {
                setNextTitle(title);
                setWorth(before);
                setError(null);
                setOpen(true);
            }}
            onClose={() => setOpen(false)}
            onSubmit={submit}
        >
            <div className="grid gap-1.5">
                <Label htmlFor={titleId}>What did they want?</Label>
                <Textarea
                    id={titleId}
                    rows={2}
                    maxLength={160}
                    value={nextTitle}
                    onChange={(e) => setNextTitle(e.target.value)}
                />
            </div>
            <div className="grid gap-1.5">
                <Label htmlFor={worthId}>Worth</Label>
                <MoneyInput
                    id={worthId}
                    currency={currency}
                    value={worth}
                    onValueChange={setWorth}
                />
            </div>
            {error ? (
                <p
                    role="alert"
                    className="text-[12.5px] font-medium text-destructive-subtle-foreground"
                >
                    {error}
                </p>
            ) : null}
        </FormSheet>
    );
}
