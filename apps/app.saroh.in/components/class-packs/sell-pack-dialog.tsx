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
import { Label } from "@saroh/ui/label";
import { showError, showSuccess } from "@saroh/ui/toast";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import type { ContactOption } from "@/components/shared/contact-picker";
import { ContactPicker } from "@/components/shared/contact-picker";
import { OptionSelect } from "@/components/shared/option-select";
import { sellPack } from "@/lib/class-packs/actions";
import type { ClassPack } from "@/lib/class-packs/service";
import { DISPLAY_LOCALE } from "@/lib/format/locale";
import { invoiceMoney } from "@/lib/invoices/money";

const DAY_MS = 86_400_000;

/** "Vinyasa, Hatha and Yin". */
export function usableOn(services: readonly { name: string }[]): string {
    const names = services.map((s) => s.name);
    if (names.length <= 1) return names.join("");
    return `${names.slice(0, -1).join(", ")} and ${names.at(-1) ?? ""}`;
}

/**
 * Sell a class pack, after the design's dialog: who, which pack, and the
 * day it runs out — worked out, not chosen, because a pack is valid for its
 * days from the sale.
 *
 * The invoice is mentioned only when Payments is on, because only then is
 * one issued; with it off the sale is recorded at the pack's price.
 */
export function SellPackDialog({
    open,
    onOpenChange,
    contacts,
    packs,
    initialPackId,
    invoicesOnSale,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    contacts: readonly ContactOption[];
    packs: readonly ClassPack[];
    initialPackId?: string;
    invoicesOnSale: boolean;
}) {
    const router = useRouter();
    const ids = { who: useId(), pack: useId(), until: useId() };
    const onSale = packs.filter((p) => p.status === "ACTIVE");
    const [contactId, setContactId] = useState("");
    const [packId, setPackId] = useState(
        initialPackId ?? onSale.at(0)?.id ?? "",
    );
    const [busy, setBusy] = useState(false);
    // Read once, when the dialog is made: "today" for the expiry line.
    const [today] = useState(() => Date.now());

    const pack = onSale.find((p) => p.id === packId);
    const person = contacts.find((c) => c.id === contactId);
    const until = pack
        ? new Intl.DateTimeFormat(DISPLAY_LOCALE, {
              day: "numeric",
              month: "long",
              year: "numeric",
          }).format(new Date(today + pack.validityDays * DAY_MS))
        : null;

    async function save() {
        if (!contactId) return showError("Choose who is buying it.");
        if (!pack) return showError("Choose a pack.");
        setBusy(true);
        const res = await sellPack(pack.id, contactId);
        setBusy(false);
        if (!res.ok) return showError(res.error);
        const who = person?.name ?? "They";
        showSuccess(
            res.data.invoiceId
                ? `${who} has ${pack.name} — the invoice is issued`
                : `${who} has ${pack.name}, ${pack.credits} ${pack.credits === 1 ? "class" : "classes"}`,
        );
        onOpenChange(false);
        setContactId("");
        router.refresh();
    }

    const nothingToSell = onSale.length === 0;
    const nobody = contacts.length === 0;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[460px]">
                <DialogHeader>
                    <DialogTitle className="font-display text-[18px] tracking-[-0.02em]">
                        Sell a class pack
                    </DialogTitle>
                    <DialogDescription>
                        Classes come off when they book and go back if they
                        cancel.
                    </DialogDescription>
                </DialogHeader>
                {nothingToSell ? (
                    <p className="text-[13px] text-muted-foreground">
                        There is no pack on sale yet.{" "}
                        <Link
                            href="/class-packs/new"
                            className="font-medium text-foreground underline underline-offset-4"
                        >
                            Make one
                        </Link>{" "}
                        first.
                    </p>
                ) : nobody ? (
                    <p className="text-[13px] text-muted-foreground">
                        A pack is sold to someone in your contacts, and there is
                        nobody there yet — or Contacts is not open to you. Add
                        them in Contacts first.
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
                            <Label htmlFor={ids.pack}>Pack</Label>
                            <OptionSelect
                                id={ids.pack}
                                value={packId}
                                onValueChange={setPackId}
                                aria-describedby={`${ids.pack}-help`}
                                options={onSale.map((p) => ({
                                    value: p.id,
                                    label: `${p.name} · ${invoiceMoney(p.price, p.currency)}`,
                                }))}
                            />
                            {pack ? (
                                <p
                                    id={`${ids.pack}-help`}
                                    className="text-[12px] leading-[1.5] text-muted-foreground"
                                >
                                    Usable on {usableOn(pack.services)}.
                                </p>
                            ) : null}
                        </div>
                        {pack && until ? (
                            <div className="grid gap-1.5">
                                <div
                                    id={ids.until}
                                    className="text-[12.5px] font-medium"
                                >
                                    Valid until
                                </div>
                                <p
                                    aria-labelledby={ids.until}
                                    className="flex h-10 items-center rounded-[9px] border border-border bg-muted/40 px-3 text-[13.5px]"
                                >
                                    {until}
                                </p>
                                <p className="text-[12px] leading-[1.5] text-muted-foreground">
                                    {pack.validityDays}{" "}
                                    {pack.validityDays === 1 ? "day" : "days"}{" "}
                                    from today. Unused classes stop then.
                                </p>
                            </div>
                        ) : null}
                        <p className="rounded-[10px] bg-muted/60 px-3.5 py-3 text-[12.5px] leading-[1.55] text-muted-foreground">
                            {invoicesOnSale
                                ? "An invoice is issued as you sell it. Saroh doesn't send it — open it from Invoices to print it."
                                : "The sale is recorded at the pack's price. Payments is off, so no invoice is issued."}
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
                        disabled={busy || nothingToSell || nobody}
                        onClick={() => void save()}
                    >
                        {busy
                            ? "Selling…"
                            : invoicesOnSale
                              ? "Sell and invoice"
                              : "Sell"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
