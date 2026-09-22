"use client";

import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { Checkbox } from "@saroh/ui/checkbox";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@saroh/ui/dialog";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@saroh/ui/dropdown-menu";
import { Label } from "@saroh/ui/label";
import { PageHeader } from "@saroh/ui/page-header";
import { RadioGroup, RadioGroupItem } from "@saroh/ui/radio-group";
import { showError, showSuccess, showUndo } from "@saroh/ui/toast";
import { MoreHorizontal, Repeat } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import type { ContactOption } from "@/components/shared/contact-picker";
import { DataView } from "@/components/shared/data-view/data-view";
import type {
    DataColumn,
    DataFilter,
} from "@/components/shared/data-view/types";
import { invoiceMoney } from "@/lib/invoices/money";
import {
    cancelSubscription,
    keepSubscription,
    pauseSubscription,
    resumeSubscription,
} from "@/lib/subscriptions/actions";
import {
    checkedLine,
    intervalWords,
    latestInvoiceNote,
    nextLine,
    owedLine,
    periodEndDay,
    standing,
} from "@/lib/subscriptions/renewal";
import type { Plan, Renewals, Subscription } from "@/lib/subscriptions/service";

import { SubscribeDialog } from "./subscribe-dialog";

const STATUS = {
    ACTIVE: { label: "Active", variant: "success" },
    OVERDUE: { label: "Overdue", variant: "error" },
    PAUSED: { label: "Paused", variant: "neutral" },
    CANCELLED: { label: "Cancelled", variant: "neutral" },
} as const;

/**
 * The tabs, after the design. They never overlap: an overdue subscription is
 * on Overdue whether it is running or paused, and a cancelled one is on
 * Cancelled whatever it still owes — its invoices say that.
 */
const FILTERS: DataFilter<Subscription>[] = [
    {
        id: "active",
        label: "Active",
        predicate: (s) => standing(s) === "ACTIVE",
    },
    {
        id: "overdue",
        label: "Overdue",
        predicate: (s) => standing(s) === "OVERDUE",
    },
    {
        id: "paused",
        label: "Paused",
        predicate: (s) => standing(s) === "PAUSED",
    },
    {
        id: "cancelled",
        label: "Cancelled",
        predicate: (s) => standing(s) === "CANCELLED",
    },
];

/** "March", or "March 2025" when it was not this year. */
const since = (iso: string) => {
    const d = new Date(iso);
    const thisYear = d.getFullYear() === new Date().getFullYear();
    return new Intl.DateTimeFormat("en-GB", {
        month: "long",
        ...(thisYear ? {} : { year: "numeric" }),
    }).format(d);
};

/**
 * Billing → Subscriptions, after the "Saroh Billing and Classes" design:
 * who is on which plan, when each renews, and the latest invoice with how
 * late it is. The line above the list says when renewals were last
 * checked, because there is no scheduler to look at otherwise.
 */
export function SubscriptionsScreen({
    subscriptions,
    plans,
    contacts,
    renewals,
    canWrite,
    initialFilterId,
    openSubscribe,
}: {
    subscriptions: Subscription[];
    plans: Plan[];
    contacts: ContactOption[];
    /** Null when it could not be read: the line is left out. */
    renewals: Renewals | null;
    canWrite: boolean;
    initialFilterId?: string;
    /** `?subscribe=1`, from the command menu. */
    openSubscribe?: boolean;
}) {
    const [subscribing, setSubscribing] = useState(Boolean(openSubscribe));
    const [cancelling, setCancelling] = useState<Subscription | null>(null);

    const columns: DataColumn<Subscription>[] = [
        {
            id: "member",
            header: "Member",
            priority: "primary",
            sortValue: (s) => s.contact.name.toLowerCase(),
            cell: (s) => (
                <span className="min-w-0">
                    <Link
                        href={`/contacts/${s.contact.id}`}
                        className="block truncate text-[13.5px] font-medium underline-offset-4 hover:underline"
                    >
                        {s.contact.name}
                    </Link>
                    <span className="block truncate text-[11.5px] text-muted-foreground">
                        Since {since(s.startedAt)}
                    </span>
                </span>
            ),
        },
        {
            id: "plan",
            header: "Plan",
            priority: "secondary",
            sortValue: (s) => s.plan.name,
            cell: (s) => (
                <span className="min-w-0">
                    <span className="block truncate text-[13px]">
                        {intervalWords(s.interval).adj} ·{" "}
                        {invoiceMoney(s.price, s.currency)}
                    </span>
                    <span className="block truncate text-[11.5px] text-muted-foreground">
                        {s.plan.name}
                    </span>
                </span>
            ),
        },
        {
            id: "next",
            header: "Next",
            // Secondary, so a phone still says when it renews.
            priority: "secondary",
            width: "150px",
            sortValue: (s) => s.nextRenewalAt ?? s.endsAt ?? "9999",
            cell: (s) => <span className="text-[13px]">{nextLine(s)}</span>,
        },
        {
            id: "invoice",
            header: "Latest invoice",
            priority: "detail",
            width: "210px",
            cell: (s) => {
                const note = latestInvoiceNote(s);
                const owed = owedLine(s);
                return s.latestInvoice ? (
                    <span className="min-w-0">
                        <Link
                            href={`/invoices/${s.latestInvoice.id}`}
                            className={
                                s.overdue
                                    ? "block font-mono text-[12.5px] text-destructive-subtle-foreground underline-offset-4 hover:underline"
                                    : "block font-mono text-[12.5px] underline-offset-4 hover:underline"
                            }
                        >
                            {s.latestInvoice.number}
                        </Link>
                        <span className="block text-[11.5px] text-muted-foreground">
                            {s.overdueCount >= 2 && owed
                                ? `${owed} — pause or cancel?`
                                : note}
                        </span>
                    </span>
                ) : (
                    <span className="text-muted-foreground">—</span>
                );
            },
        },
        {
            id: "status",
            header: "Status",
            priority: "secondary",
            width: "112px",
            sortValue: (s) => standing(s),
            cell: (s) => {
                const st = STATUS[standing(s)];
                return <Badge variant={st.variant}>{st.label}</Badge>;
            },
        },
    ];

    return (
        <>
            <PageHeader
                breadcrumb={["Billing", "Subscriptions"]}
                title="Subscriptions"
                className="mb-0"
                actions={
                    <>
                        {canWrite ? (
                            <Button onClick={() => setSubscribing(true)}>
                                Subscribe someone
                            </Button>
                        ) : null}
                        <Button variant="outline" asChild>
                            <Link href="/subscriptions/plans">Plans</Link>
                        </Button>
                    </>
                }
            />
            {renewals ? (
                <p className="flex items-start gap-2 text-[12.5px] text-muted-foreground">
                    <span
                        aria-hidden
                        className="mt-[7px] size-1.5 shrink-0 rounded-full bg-success"
                    />
                    {checkedLine(renewals)}
                </p>
            ) : null}
            <DataView
                viewId="subscriptions"
                rows={subscriptions}
                columns={columns}
                rowKey={(s) => s.id}
                rowActions={
                    canWrite
                        ? (s) => (
                              <RowActions
                                  sub={s}
                                  onCancel={() => setCancelling(s)}
                              />
                          )
                        : undefined
                }
                modes={["table", "list"]}
                hideModeToggle
                filters={FILTERS}
                initialFilterId={initialFilterId}
                noun={{ one: "subscription", other: "subscriptions" }}
                searchPlaceholder="Search members"
                searchableColumnIds={["member", "plan"]}
                emptyState={{
                    icon: <Repeat />,
                    title: "No one is subscribed yet",
                    note: "Put someone on a plan and their first invoice is issued at once; each renewal after that invoices itself.",
                    action: canWrite ? (
                        <Button onClick={() => setSubscribing(true)}>
                            Subscribe someone
                        </Button>
                    ) : undefined,
                }}
            />

            {canWrite ? (
                <SubscribeDialog
                    open={subscribing}
                    onOpenChange={setSubscribing}
                    contacts={contacts}
                    plans={plans}
                />
            ) : null}
            {cancelling ? (
                <CancelDialog
                    sub={cancelling}
                    onClose={() => setCancelling(null)}
                />
            ) : null}
        </>
    );
}

/**
 * A row's menu. Pause is taken back with Undo, since it is reversible;
 * cancel asks first.
 */
function RowActions({
    sub,
    onCancel,
}: {
    sub: Subscription;
    onCancel: () => void;
}) {
    const router = useRouter();
    const name = sub.contact.name;

    async function pause() {
        const res = await pauseSubscription(sub.id);
        if (!res.ok) return showError(res.error);
        router.refresh();
        showUndo(`${name}'s ${sub.plan.name} is paused`, () => {
            void resumeSubscription(sub.id).then((r) => {
                if (!r.ok) showError(r.error);
                router.refresh();
            });
        });
    }

    async function resume() {
        const res = await resumeSubscription(sub.id);
        if (!res.ok) return showError(res.error);
        showSuccess(`${name}'s ${sub.plan.name} is running again`);
        router.refresh();
    }

    async function keep() {
        const res = await keepSubscription(sub.id);
        if (!res.ok) return showError(res.error);
        showSuccess(`${name}'s ${sub.plan.name} will keep renewing`);
        router.refresh();
    }

    if (sub.status === "CANCELLED") return null;
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Actions for ${name}'s subscription`}
                >
                    <MoreHorizontal className="size-4" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
                {sub.status === "ACTIVE" ? (
                    <DropdownMenuItem onSelect={() => void pause()}>
                        Pause
                    </DropdownMenuItem>
                ) : (
                    <DropdownMenuItem onSelect={() => void resume()}>
                        Resume
                    </DropdownMenuItem>
                )}
                {sub.endsAt ? (
                    <DropdownMenuItem onSelect={() => void keep()}>
                        Keep it renewing
                    </DropdownMenuItem>
                ) : (
                    <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onSelect={onCancel}
                    >
                        Cancel…
                    </DropdownMenuItem>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

/**
 * "Now or at the end of this period?", and — when the period has an open
 * invoice — whether to void it too. Unchecked by default: someone who has
 * already had the month may still owe for it.
 */
function CancelDialog({
    sub,
    onClose,
}: {
    sub: Subscription;
    onClose: () => void;
}) {
    const router = useRouter();
    const voidId = useId();
    const paused = sub.status === "PAUSED";
    const [when, setWhen] = useState<"now" | "periodEnd">(
        paused ? "now" : "periodEnd",
    );
    const open =
        sub.latestInvoice?.status === "ISSUED" ? sub.latestInvoice : null;
    const [voidToo, setVoidToo] = useState(false);
    const [busy, setBusy] = useState(false);
    const end = periodEndDay(sub);

    async function run() {
        setBusy(true);
        const res = await cancelSubscription(
            sub.id,
            when,
            voidToo && open ? open.id : undefined,
        );
        setBusy(false);
        if (!res.ok) {
            showError(res.error);
            router.refresh();
            return;
        }
        showSuccess(
            when === "now"
                ? `${sub.contact.name}'s ${sub.plan.name} is cancelled`
                : `${sub.contact.name}'s ${sub.plan.name} ends ${end}`,
        );
        onClose();
        router.refresh();
    }

    return (
        <Dialog open onOpenChange={(o) => (!o ? onClose() : undefined)}>
            <DialogContent className="sm:max-w-[460px]">
                <DialogHeader>
                    <DialogTitle className="font-display text-[18px] tracking-[-0.02em]">
                        Cancel {sub.contact.name}&apos;s {sub.plan.name}?
                    </DialogTitle>
                    <DialogDescription>
                        No more invoices after this. Their invoices and history
                        stay.
                    </DialogDescription>
                </DialogHeader>
                <RadioGroup
                    value={when}
                    onValueChange={(v) => setWhen(v as "now" | "periodEnd")}
                    className="grid gap-2"
                >
                    {!paused ? (
                        <Label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-[10px] border border-border p-3 font-normal">
                            <RadioGroupItem
                                value="periodEnd"
                                className="mt-0.5"
                            />
                            <span>
                                <span className="block font-medium">
                                    At the end of this period
                                </span>
                                <span className="block text-[12.5px] text-muted-foreground">
                                    It runs until {end}, then stops.
                                </span>
                            </span>
                        </Label>
                    ) : null}
                    <Label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-[10px] border border-border p-3 font-normal">
                        <RadioGroupItem value="now" className="mt-0.5" />
                        <span>
                            <span className="block font-medium">Now</span>
                            <span className="block text-[12.5px] text-muted-foreground">
                                It stops today.
                            </span>
                        </span>
                    </Label>
                </RadioGroup>
                {open ? (
                    <div className="flex items-start gap-3">
                        <Checkbox
                            id={voidId}
                            checked={voidToo}
                            onCheckedChange={(c) => setVoidToo(c === true)}
                            className="mt-0.5"
                        />
                        <Label
                            htmlFor={voidId}
                            className="font-normal leading-[1.5]"
                        >
                            Void {open.number} too
                            <span className="block text-[12.5px] text-muted-foreground">
                                Only if they should not pay for this period.
                            </span>
                        </Label>
                    </div>
                ) : null}
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>
                        Keep it
                    </Button>
                    <Button
                        variant="destructive"
                        disabled={busy}
                        onClick={() => void run()}
                    >
                        {busy ? "Cancelling…" : "Cancel subscription"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
