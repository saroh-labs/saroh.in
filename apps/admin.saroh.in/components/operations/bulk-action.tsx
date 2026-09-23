"use client";

import { Badge } from "@saroh/ui/badge";
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
import { Label } from "@saroh/ui/label";
import { Skeleton } from "@saroh/ui/skeleton";
import { Textarea } from "@saroh/ui/textarea";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import type { OperationKind, OperationPlan } from "@/lib/machinery-actions";
import {
    planOperationAction,
    startOperationAction,
} from "@/lib/machinery-actions";

const VERDICT: Record<
    OperationPlan["items"][number]["verdict"],
    { label: string; variant: "success" | "neutral" | "warning" }
> = {
    act: { label: "Will run", variant: "success" },
    skip: { label: "Nothing to do", variant: "neutral" },
    unsafe: { label: "Refused", variant: "warning" },
};

/**
 * A bulk retry or replay: always a dry run first. Opening the dialog asks
 * the API what would happen to every target and shows it — what runs, what
 * has nothing to do, what is refused and why — before anything changes.
 * Running it starts a durable operation and opens its progress.
 */
export function BulkAction({
    kind,
    ids,
    trigger,
    triggerVariant = "outline",
    noun,
}: {
    kind: OperationKind;
    ids: string[];
    trigger: string;
    triggerVariant?: "outline" | "ghost" | "default";
    noun: { one: string; other: string };
}) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [plan, setPlan] = useState<OperationPlan | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [reason, setReason] = useState("");
    const [key, setKey] = useState("");
    const [pending, startTransition] = useTransition();
    const verb = kind === "jobs.retry" ? "Retry" : "Replay";

    function onOpenChange(next: boolean) {
        setOpen(next);
        if (!next) return;
        setPlan(null);
        setError(null);
        setReason("");
        setKey(crypto.randomUUID());
        startTransition(async () => {
            const result = await planOperationAction(kind, ids);
            if (result.ok) setPlan(result.data);
            else setError(result.error);
        });
    }

    function run() {
        setError(null);
        startTransition(async () => {
            const result = await startOperationAction(kind, {
                ids,
                reason: reason.trim(),
                idempotencyKey: key,
            });
            if (!result.ok) {
                setError(result.error);
                return;
            }
            setOpen(false);
            router.push(`/operations/runs/${result.data.id}`);
        });
    }

    const count = (n: number) => `${n} ${n === 1 ? noun.one : noun.other}`;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogTrigger asChild>
                <Button
                    size="sm"
                    variant={triggerVariant}
                    disabled={ids.length === 0}
                >
                    {trigger}
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-xl">
                <DialogHeader>
                    <DialogTitle>
                        {verb} {count(ids.length)}
                    </DialogTitle>
                    <DialogDescription>
                        A dry run first: this is what would happen. Nothing has
                        changed yet.
                    </DialogDescription>
                </DialogHeader>

                {!plan && !error && (
                    <div
                        className="grid gap-2"
                        aria-busy="true"
                        aria-label="Working out what would happen"
                    >
                        <Skeleton className="h-5 w-2/3" />
                        <Skeleton className="h-16 w-full" />
                    </div>
                )}

                {plan && (
                    <div className="grid gap-3">
                        <p className="text-sm">
                            {plan.act} would run · {plan.skip} have nothing to
                            do · {plan.unsafe} refused
                        </p>
                        <ul className="grid max-h-64 gap-1.5 overflow-y-auto rounded-lg border p-2">
                            {plan.items.map((item) => (
                                <li
                                    key={item.targetId}
                                    className="flex flex-wrap items-start justify-between gap-2 text-sm"
                                >
                                    <span className="min-w-0 flex-1">
                                        <span className="block break-words">
                                            {item.detail}
                                        </span>
                                        <span className="font-mono text-[11.5px] text-muted-foreground">
                                            {item.targetId}
                                        </span>
                                    </span>
                                    <Badge
                                        variant={VERDICT[item.verdict].variant}
                                    >
                                        {VERDICT[item.verdict].label}
                                    </Badge>
                                </li>
                            ))}
                        </ul>
                        {plan.act > 0 && (
                            <div className="grid gap-1.5">
                                <Label htmlFor={`bulk-reason-${kind}`}>
                                    Reason (kept in the audit trail)
                                </Label>
                                <Textarea
                                    id={`bulk-reason-${kind}`}
                                    value={reason}
                                    onChange={(e) => setReason(e.target.value)}
                                    rows={2}
                                    maxLength={500}
                                    disabled={pending}
                                />
                            </div>
                        )}
                    </div>
                )}

                {error && (
                    <p className="text-sm text-destructive" role="alert">
                        {error}
                    </p>
                )}

                <DialogFooter>
                    <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setOpen(false)}
                    >
                        Cancel
                    </Button>
                    <Button
                        type="button"
                        onClick={run}
                        disabled={
                            !plan ||
                            plan.act === 0 ||
                            reason.trim().length < 4 ||
                            pending
                        }
                    >
                        {plan?.act === 0
                            ? "Nothing to run"
                            : `${verb} ${plan ? count(plan.act) : ""}`}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
