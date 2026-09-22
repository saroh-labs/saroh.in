"use client";

import { Button } from "@saroh/ui/button";
import { DatePicker } from "@saroh/ui/date-picker";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@saroh/ui/dialog";
import { Label } from "@saroh/ui/label";
import { showError, showSuccess } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import type { ContactOption } from "@/components/shared/contact-picker";
import { ContactPicker } from "@/components/shared/contact-picker";
import { OptionSelect } from "@/components/shared/option-select";
import { invoiceMoney } from "@/lib/invoices/money";
import { subscribe } from "@/lib/subscriptions/actions";
import { explainStart, intervalWords } from "@/lib/subscriptions/renewal";
import type { Plan } from "@/lib/subscriptions/service";

/** A local calendar day as YYYY-MM-DD — the day the merchant picked. */
function ymd(d: Date): string {
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Subscribe someone, after the design's dialog: who, which plan, and when
 * it starts. A start in the past is allowed — someone moved over from a
 * spreadsheet — and the help under it says, in words, which period is
 * invoiced now and that the ones before are not billed.
 *
 * The first invoice is issued as they subscribe, so the button says so —
 * unless the start is still ahead, when it waits for that day.
 * The subscription keeps the browser's timezone for its renewal days.
 */
export function SubscribeDialog({
    open,
    onOpenChange,
    contacts,
    plans,
    initialPlanId,
    initialContactId,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    contacts: readonly ContactOption[];
    plans: readonly Plan[];
    initialPlanId?: string;
    /** Who, already chosen — the contact page subscribes its own person. */
    initialContactId?: string;
}) {
    const router = useRouter();
    const ids = { who: useId(), plan: useId(), start: useId() };
    const active = plans.filter((p) => p.status === "ACTIVE");
    const [contactId, setContactId] = useState(initialContactId ?? "");
    const [planId, setPlanId] = useState(
        initialPlanId ?? active.at(0)?.id ?? "",
    );
    const [start, setStart] = useState<Date | undefined>(new Date());
    const [busy, setBusy] = useState(false);

    const plan = active.find((p) => p.id === planId);
    const person = contacts.find((c) => c.id === contactId);
    const startsLater = start ? ymd(start) > ymd(new Date()) : false;
    const help =
        plan && start
            ? explainStart(ymd(start), plan.interval, ymd(new Date()))
            : null;

    async function save() {
        if (!contactId) return showError("Choose who is subscribing.");
        if (!plan) return showError("Choose a plan.");
        setBusy(true);
        const res = await subscribe({
            contactId,
            planId: plan.id,
            ...(start ? { startDate: ymd(start) } : {}),
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        });
        setBusy(false);
        if (!res.ok) return showError(res.error);
        showSuccess(
            res.data.startsAt
                ? `${person?.name ?? "They"} subscribed to ${plan.name} — the first invoice goes out when they start`
                : `${person?.name ?? "They"} subscribed to ${plan.name} — the first invoice is issued`,
        );
        onOpenChange(false);
        setContactId(initialContactId ?? "");
        setStart(new Date());
        router.refresh();
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[460px]">
                <DialogHeader>
                    <DialogTitle className="font-display text-[18px] tracking-[-0.02em]">
                        Subscribe someone
                    </DialogTitle>
                    <DialogDescription>
                        Invoiced each period. Nothing is charged and nobody is
                        contacted.
                    </DialogDescription>
                </DialogHeader>
                {active.length === 0 ? (
                    <p className="text-[13px] text-muted-foreground">
                        There is no plan to put anyone on yet. Make one in Plans
                        first.
                    </p>
                ) : (
                    <div className="grid gap-4">
                        <div className="grid gap-1.5">
                            <Label htmlFor={ids.who}>Who</Label>
                            <ContactPicker
                                id={ids.who}
                                contacts={contacts}
                                value={contactId}
                                onValueChange={setContactId}
                            />
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor={ids.plan}>Plan</Label>
                            <OptionSelect
                                id={ids.plan}
                                value={planId}
                                onValueChange={setPlanId}
                                options={active.map((p) => ({
                                    value: p.id,
                                    label: `${p.name} · ${invoiceMoney(p.price, p.currency)} ${intervalWords(p.interval).per}`,
                                }))}
                            />
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor={ids.start}>Starting</Label>
                            <DatePicker
                                id={ids.start}
                                value={start}
                                onValueChange={setStart}
                                className="w-full"
                                aria-describedby={`${ids.start}-help`}
                            />
                            {help ? (
                                <p
                                    id={`${ids.start}-help`}
                                    className="text-[12px] leading-[1.5] text-muted-foreground"
                                >
                                    {help}
                                </p>
                            ) : null}
                        </div>
                        <p className="rounded-[10px] bg-muted/60 px-3.5 py-3 text-[12.5px] leading-[1.55] text-muted-foreground">
                            The price is copied onto the subscription. Changing
                            the plan later will not change what{" "}
                            {person ? person.name.split(" ")[0] : "they"} pay
                            {person ? "s" : ""}.
                        </p>
                    </div>
                )}
                <DialogFooter>
                    <Button
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                    >
                        Cancel
                    </Button>
                    <Button
                        disabled={busy || active.length === 0}
                        onClick={() => void save()}
                    >
                        {busy
                            ? "Subscribing…"
                            : startsLater
                              ? "Subscribe"
                              : "Subscribe and invoice"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
