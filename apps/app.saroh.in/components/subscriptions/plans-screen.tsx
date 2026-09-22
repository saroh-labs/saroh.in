"use client";

import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { EmptyState } from "@saroh/ui/data-state";
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
import { PageHeader } from "@saroh/ui/page-header";
import { Textarea } from "@saroh/ui/textarea";
import { showError, showSuccess } from "@saroh/ui/toast";
import { Repeat } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import type { ContactOption } from "@/components/shared/contact-picker";
import { OptionSelect } from "@/components/shared/option-select";
import { invoiceMoney } from "@/lib/invoices/money";
import {
    createPlan,
    setPlanArchived,
    updatePlan,
} from "@/lib/subscriptions/actions";
import { intervalWords } from "@/lib/subscriptions/renewal";
import type { Interval, Plan } from "@/lib/subscriptions/service";

import { SubscribeDialog } from "./subscribe-dialog";

const CURRENCIES = ["INR", "USD", "GBP", "EUR", "AED", "SGD", "AUD", "CAD"];
const INTERVALS: { value: Interval; label: string }[] = [
    { value: "WEEK", label: "Every week" },
    { value: "MONTH", label: "Every month" },
    { value: "QUARTER", label: "Every quarter" },
    { value: "YEAR", label: "Every year" },
];

/**
 * Billing → Subscriptions → Plans, after the design: one card per plan with
 * what it costs, how often, and how many people are on it. Editing a plan
 * changes only what is sold next — everyone on it keeps the price they
 * agreed. An archived plan is not sold, so its button is gone rather than
 * dead.
 */
export function PlansScreen({
    plans,
    contacts,
    canWrite,
}: {
    plans: Plan[];
    contacts: ContactOption[];
    canWrite: boolean;
}) {
    const [editing, setEditing] = useState<Plan | "new" | null>(null);
    const [subscribeTo, setSubscribeTo] = useState<string | null>(null);

    return (
        <>
            <PageHeader
                breadcrumb={[
                    <Link
                        key="subs"
                        href="/billing/subscriptions"
                        className="hover:text-foreground"
                    >
                        Subscriptions
                    </Link>,
                    "Plans",
                ]}
                title="Plans"
                className="mb-0"
                actions={
                    canWrite ? (
                        <Button
                            variant="outline"
                            onClick={() => setEditing("new")}
                        >
                            New plan
                        </Button>
                    ) : undefined
                }
            />

            {plans.length === 0 ? (
                <EmptyState
                    icon={<Repeat />}
                    title="No plans yet"
                    description="A plan is what you sell on repeat — a monthly membership, a quarterly package. Make one, then put people on it."
                    action={
                        canWrite ? (
                            <Button onClick={() => setEditing("new")}>
                                Make a plan
                            </Button>
                        ) : undefined
                    }
                />
            ) : (
                <ul className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(100%,280px),1fr))]">
                    {plans.map((p) => (
                        <li key={p.id}>
                            <PlanCard
                                plan={p}
                                canWrite={canWrite}
                                onEdit={() => setEditing(p)}
                                onSubscribe={() => setSubscribeTo(p.id)}
                            />
                        </li>
                    ))}
                </ul>
            )}

            {editing ? (
                <PlanDialog
                    plan={editing === "new" ? null : editing}
                    onClose={() => setEditing(null)}
                />
            ) : null}
            {subscribeTo ? (
                <SubscribeDialog
                    open
                    onOpenChange={(o) =>
                        !o ? setSubscribeTo(null) : undefined
                    }
                    contacts={contacts}
                    plans={plans}
                    initialPlanId={subscribeTo}
                />
            ) : null}
        </>
    );
}

function PlanCard({
    plan,
    canWrite,
    onEdit,
    onSubscribe,
}: {
    plan: Plan;
    canWrite: boolean;
    onEdit: () => void;
    onSubscribe: () => void;
}) {
    const archived = plan.status === "ARCHIVED";
    const n = plan.subscriberCount;
    return (
        <article
            className={
                archived
                    ? "flex h-full flex-col gap-3 rounded-[12px] border border-border bg-muted/40 p-5"
                    : "flex h-full flex-col gap-3 rounded-[12px] border border-border bg-card p-5"
            }
        >
            <header className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <h2 className="font-display text-[18px] font-semibold tracking-[-0.02em]">
                        {plan.name}
                    </h2>
                    <p className="text-[12.5px] text-muted-foreground">
                        {n === 0
                            ? "No one on it"
                            : `${n} ${n === 1 ? "member" : "members"}`}
                    </p>
                </div>
                {archived ? <Badge variant="neutral">Archived</Badge> : null}
            </header>
            <p className="flex items-baseline gap-1.5">
                <span className="font-display text-[26px] font-semibold tabular-nums tracking-[-0.03em]">
                    {invoiceMoney(plan.price, plan.currency)}
                </span>
                <span className="text-[13px] text-muted-foreground">
                    {intervalWords(plan.interval).per}
                </span>
            </p>
            {plan.description ? (
                <p className="text-[13px] leading-[1.55] text-muted-foreground">
                    {plan.description}
                </p>
            ) : null}
            {canWrite ? (
                <div className="mt-auto flex flex-wrap gap-2 pt-1">
                    {!archived ? (
                        <Button onClick={onSubscribe}>Subscribe someone</Button>
                    ) : null}
                    <Button variant="ghost" onClick={onEdit}>
                        {archived ? "Restore or edit" : "Edit"}
                    </Button>
                </div>
            ) : null}
        </article>
    );
}

/**
 * A plan, new or changed. For a plan people are on, the dialog says that a
 * change reaches new sign-ups only, and offers Archive.
 */
function PlanDialog({
    plan,
    onClose,
}: {
    plan: Plan | null;
    onClose: () => void;
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
                            : "What you sell on repeat. Each period is invoiced; nothing is charged."}
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
