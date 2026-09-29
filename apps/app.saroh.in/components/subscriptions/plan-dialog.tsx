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
import { Textarea } from "@saroh/ui/textarea";
import { showError, showSuccess } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { OptionSelect } from "@/components/shared/option-select";
import {
    createPlan,
    setPlanArchived,
    updatePlan,
} from "@/lib/subscriptions/actions";
import { renewalWords } from "@/lib/subscriptions/autopay";
import type { Interval, Plan } from "@/lib/subscriptions/service";

const CURRENCIES = ["INR", "USD", "GBP", "EUR", "AED", "SGD", "AUD", "CAD"];
const INTERVALS: { value: Interval; label: string }[] = [
    { value: "WEEK", label: "Every week" },
    { value: "MONTH", label: "Every month" },
    { value: "QUARTER", label: "Every quarter" },
    { value: "YEAR", label: "Every year" },
];

/**
 * A plan, new or changed. For a plan people are on, the dialog says that a
 * change reaches new sign-ups only, and offers Archive. The Plans tab's New
 * plan and Edit open it until the Plan Editor page replaces it (D7).
 */
export function PlanDialog({
    plan,
    onClose,
    autopayOffered = false,
}: {
    plan: Plan | null;
    onClose: () => void;
    /**
     * The business offers autopay (D14): only then does the copy say
     * renewals may be paid by it. Unknown reads as not.
     */
    autopayOffered?: boolean;
}) {
    const router = useRouter();
    const ids = {
        name: useId(),
        desc: useId(),
        price: useId(),
        cur: useId(),
        every: useId(),
    };
    const [name, setName] = useState(plan?.name ?? "");
    const [description, setDescription] = useState(plan?.description ?? "");
    const [price, setPrice] = useState(plan?.price ?? "");
    const [currency, setCurrency] = useState(plan?.currency ?? "INR");
    const [interval, setInterval] = useState<Interval>(
        plan?.interval ?? "MONTH",
    );
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<{
        field?: string;
        message: string;
    } | null>(null);

    async function save() {
        setBusy(true);
        const input = {
            name: name.trim(),
            description: description.trim() || null,
            price: price.trim(),
            currency,
            interval,
        };
        const res = plan
            ? await updatePlan(plan.id, input)
            : await createPlan(input);
        setBusy(false);
        if (!res.ok) {
            setError({ field: res.field, message: res.error });
            if (!res.field) showError(res.error);
            return;
        }
        showSuccess(
            plan ? `${input.name} saved` : `${input.name} is ready to sell`,
        );
        onClose();
        router.refresh();
    }

    async function archive(archived: boolean) {
        if (!plan) return;
        setBusy(true);
        const res = await setPlanArchived(plan.id, archived);
        setBusy(false);
        if (!res.ok) return showError(res.error);
        showSuccess(
            archived
                ? `${plan.name} is archived — no new sign-ups`
                : `${plan.name} is on sale again`,
        );
        onClose();
        router.refresh();
    }

    const fieldError = (f: string) =>
        error?.field === f ? (
            <p className="text-[12px] text-destructive-subtle-foreground">
                {error.message}
            </p>
        ) : null;

    return (
        <Dialog open onOpenChange={(o) => (!o ? onClose() : undefined)}>
            <DialogContent className="sm:max-w-[460px]">
                <DialogHeader>
                    <DialogTitle className="font-display text-[18px] tracking-[-0.02em]">
                        {plan ? `Edit ${plan.name}` : "New plan"}
                    </DialogTitle>
                    <DialogDescription>
                        {plan && plan.subscriberCount > 0
                            ? `Changes reach new sign-ups only. The ${plan.subscriberCount} ${plan.subscriberCount === 1 ? "person" : "people"} on it keep the price they agreed.`
                            : renewalWords(autopayOffered).plan}
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4">
                    <div className="grid gap-1.5">
                        <Label htmlFor={ids.name}>Name</Label>
                        <Input
                            id={ids.name}
                            value={name}
                            maxLength={120}
                            placeholder="Monthly membership"
                            onChange={(e) => setName(e.target.value)}
                            aria-invalid={error?.field === "name"}
                        />
                        {fieldError("name")}
                    </div>
                    <div className="grid grid-cols-[minmax(0,1fr)_110px] gap-3">
                        <div className="grid gap-1.5">
                            <Label htmlFor={ids.price}>Price</Label>
                            <Input
                                id={ids.price}
                                value={price}
                                inputMode="decimal"
                                placeholder="2400"
                                onChange={(e) => setPrice(e.target.value)}
                                aria-invalid={error?.field === "price"}
                            />
                            {fieldError("price")}
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor={ids.cur}>Currency</Label>
                            <OptionSelect
                                id={ids.cur}
                                value={currency}
                                onValueChange={setCurrency}
                                options={CURRENCIES.map((c) => ({
                                    value: c,
                                    label: c,
                                }))}
                            />
                        </div>
                    </div>
                    <div className="grid gap-1.5">
                        <Label htmlFor={ids.every}>Renews</Label>
                        <OptionSelect
                            id={ids.every}
                            value={interval}
                            onValueChange={setInterval}
                            options={INTERVALS}
                        />
                    </div>
                    <div className="grid gap-1.5">
                        <Label htmlFor={ids.desc}>
                            What it includes{" "}
                            <span className="font-normal text-muted-foreground">
                                (optional)
                            </span>
                        </Label>
                        <Textarea
                            id={ids.desc}
                            value={description}
                            maxLength={500}
                            rows={2}
                            onChange={(e) => setDescription(e.target.value)}
                        />
                    </div>
                </div>
                <DialogFooter className="gap-2 sm:justify-between sm:space-x-0">
                    {plan ? (
                        <Button
                            variant="ghost"
                            disabled={busy}
                            onClick={() =>
                                void archive(plan.status !== "ARCHIVED")
                            }
                        >
                            {plan.status === "ARCHIVED"
                                ? "Put it back on sale"
                                : "Archive"}
                        </Button>
                    ) : (
                        <span />
                    )}
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button disabled={busy} onClick={() => void save()}>
                            {busy ? "Saving…" : plan ? "Save" : "Make the plan"}
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
