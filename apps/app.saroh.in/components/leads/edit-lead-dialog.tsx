"use client";

import { Button } from "@saroh/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@saroh/ui/dialog";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { Textarea } from "@saroh/ui/textarea";
import { showError, showSuccess } from "@saroh/ui/toast";
import { PenLine } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { updateLead } from "@/lib/leads/actions";

/**
 * Change what a lead is called and what it could be worth. A dialog, because
 * it is two fields and one decision; who the lead belongs to is not changed
 * here — that is a different person, and so a different lead.
 */
export function EditLeadDialog({
    leadId,
    title,
    value,
}: {
    leadId: string;
    title: string;
    /** Minor units, as the API stores it. */
    value: number | null;
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

    async function submit(e: React.FormEvent) {
        e.preventDefault();
        if (!nextTitle.trim()) return setError("A lead needs a name.");
        if (worth.trim() && !/^\d+(\.\d{1,2})?$/.test(worth.trim())) {
            return setError("Worth is a number, like 45000 — or empty.");
        }
        if (!worth.trim() && value !== null) {
            // The API sets a value but cannot clear one; say so rather than
            // pretend the empty field was saved.
            return setError(
                "A worth can be changed but not removed yet. Set it to 0 if it is worth nothing now.",
            );
        }
        setError(null);
        setSaving(true);
        const res = await updateLead(leadId, {
            title: nextTitle.trim(),
            ...(worth.trim()
                ? { value: Math.round(Number(worth.trim()) * 100) }
                : {}),
        });
        setSaving(false);
        if (!res.ok) return showError(res.error);
        setOpen(false);
        showSuccess("Saved");
        router.refresh();
    }

    return (
        <Dialog
            open={open}
            onOpenChange={(o) => {
                setOpen(o);
                if (o) {
                    setNextTitle(title);
                    setWorth(value === null ? "" : (value / 100).toString());
                    setError(null);
                }
            }}
        >
            <DialogTrigger asChild>
                <Button variant="outline">
                    <PenLine className="mr-1.5 size-4" />
                    Edit
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-[420px]">
                <form onSubmit={(e) => void submit(e)} className="space-y-4">
                    <DialogHeader>
                        <DialogTitle className="font-display text-[19px] tracking-[-0.025em]">
                            Edit lead
                        </DialogTitle>
                        <DialogDescription>
                            What they wanted, and what it could be worth.
                        </DialogDescription>
                    </DialogHeader>
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
                        <Input
                            id={worthId}
                            inputMode="decimal"
                            value={worth}
                            className="tabular-nums"
                            onChange={(e) => setWorth(e.target.value)}
                        />
                    </div>
                    {error ? (
                        <p className="text-[11.5px] text-destructive">
                            {error}
                        </p>
                    ) : null}
                    <DialogFooter className="gap-2 sm:gap-0">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setOpen(false)}
                        >
                            Cancel
                        </Button>
                        <Button type="submit" disabled={saving}>
                            {saving ? "Saving…" : "Save"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
