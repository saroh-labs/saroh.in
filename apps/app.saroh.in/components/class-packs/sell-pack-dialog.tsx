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

import { Chip } from "@/components/shared/chip";
import type { ContactOption } from "@/components/shared/contact-picker";
import { ContactPicker } from "@/components/shared/contact-picker";
import { OptionSelect } from "@/components/shared/option-select";
import { sellPack } from "@/lib/class-packs/actions";
import type { PackKind } from "@/lib/class-packs/pack-cards";
import { money, packKind } from "@/lib/class-packs/pack-cards";
import type {
    DeskPaidBy,
    HeldPack,
    SellPack,
} from "@/lib/class-packs/sell-words";
import {
    DESK_PAID_BY,
    firstPackBlock,
    holdingNow,
    sellFailure,
    sellLabel,
    sellNote,
    sellTerms,
    soldMessage,
} from "@/lib/class-packs/sell-words";

/** "Vinyasa, Hatha and Yin". */
export function usableOn(services: readonly { name: string }[]): string {
    const names = services.map((s) => s.name);
    if (names.length <= 1) return names.join("");
    return `${names.slice(0, -1).join(", ")} and ${names.at(-1) ?? ""}`;
}

/** A pack the dialog can offer: the list's, with its status and services. */
export interface SellablePack extends SellPack {
    status: string;
    services: readonly { name: string }[];
}

/**
 * Sell a pack at the desk (round-2 E15, after "Saroh Packs"): who, how the
 * desk was paid, and the day it runs out — worked out, not chosen, because a
 * pack is valid for its days from the sale.
 *
 * "Paid by" records what the desk took; it never limits how anyone pays
 * (DEC-059). A first-pack-only pack is refused before saving to someone the
 * list shows has had one, and the API's own refusal (409) is said the same
 * way. The invoice is mentioned only when Payments is on, because only then
 * is one issued.
 *
 * Opened from a card, the pack is fixed and named in the title; opened from
 * "Sell a pack" elsewhere, it is chosen here.
 */
export function SellPackDialog({
    open,
    onOpenChange,
    contacts,
    packs,
    initialPackId,
    initialContactId,
    invoicesOnSale,
    held = [],
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    contacts: readonly ContactOption[];
    /** Every pack the page read; archived ones name the kind of old sales. */
    packs: readonly SellablePack[];
    /** Fixed: opened from that pack's card. */
    initialPackId?: string;
    /** Who, already chosen — the contact page sells to its own person. */
    initialContactId?: string;
    invoicesOnSale: boolean;
    /** Purchases the page read, for first-pack-only and "Has 4 left". */
    held?: readonly HeldPack[];
}) {
    const router = useRouter();
    const ids = {
        who: useId(),
        pack: useId(),
        paid: useId(),
        block: useId(),
        missing: useId(),
    };
    const onSale = packs.filter((p) => p.status === "ACTIVE");
    const fixed = initialPackId
        ? onSale.find((p) => p.id === initialPackId)
        : undefined;
    const [contactId, setContactId] = useState(initialContactId ?? "");
    const [packId, setPackId] = useState(
        initialPackId ?? onSale.at(0)?.id ?? "",
    );
    const [paidBy, setPaidBy] = useState<DeskPaidBy | "">("");
    const [busy, setBusy] = useState(false);
    // Read once, when the dialog is made: "today" for the use-by date.
    const [today] = useState(() => Date.now());

    const pack = fixed ?? onSale.find((p) => p.id === packId);
    const person = contacts.find((c) => c.id === contactId);
    const who = person?.name ?? "They";
    const kinds = new Map<string, PackKind>(
        packs.map((p) => [p.id, packKind(p)]),
    );
    const kindOf = (id: string) => kinds.get(id);
    const blocked = pack
        ? firstPackBlock(pack, contactId, who, held, kindOf)
        : null;
    const holding = pack
        ? holdingNow(held, contactId, packKind(pack), kindOf)
        : null;
    const missing = !contactId || !paidBy || !pack;

    async function save() {
        if (!pack || !contactId || !paidBy || blocked) return;
        setBusy(true);
        const res = await sellPack(pack.id, contactId, paidBy);
        setBusy(false);
        if (!res.ok) return showError(sellFailure(res.error, pack.name, who));
        showSuccess(soldMessage(who, pack, today, Boolean(res.data.invoiceId)));
        onOpenChange(false);
        setContactId(initialContactId ?? "");
        setPaidBy("");
        router.refresh();
    }

    const nothingToSell = onSale.length === 0 || (initialPackId && !fixed);
    const nobody = contacts.length === 0;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[440px]">
                <DialogHeader>
                    <DialogTitle className="font-display text-[17px] tracking-[-0.02em]">
                        {fixed ? `Sell ${fixed.name}` : "Sell a pack"}
                    </DialogTitle>
                    <DialogDescription className="text-[12.5px]">
                        {pack
                            ? sellTerms(pack, today)
                            : "Classes come off when they book and go back if they cancel in time."}
                    </DialogDescription>
                </DialogHeader>
                {nothingToSell ? (
                    <p className="text-[13px] text-muted-foreground">
                        There is no pack on sale yet.{" "}
                        <Link
                            href="/class-packs/new"
                            className="font-medium text-foreground underline underline-offset-4 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        >
                            Make one
                        </Link>{" "}
                        first.
                    </p>
                ) : nobody ? (
                    <p className="text-[13px] text-muted-foreground">
                        A pack is sold to one of your customers, and there is
                        nobody there yet — or Customers is not open to you. Add
                        them in Customers first.
                    </p>
                ) : (
                    <div className="grid gap-3">
                        {fixed ? null : (
                            <div className="grid gap-1.5">
                                <Label htmlFor={ids.pack}>Pack</Label>
                                <OptionSelect
                                    id={ids.pack}
                                    value={packId}
                                    onValueChange={setPackId}
                                    aria-describedby={`${ids.pack}-help`}
                                    options={onSale.map((p) => ({
                                        value: p.id,
                                        label: `${p.name} · ${money(p.price, p.currency)}`,
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
                        )}
                        <div className="grid gap-1.5">
                            <Label htmlFor={ids.who}>Customer</Label>
                            <ContactPicker
                                id={ids.who}
                                contacts={contacts}
                                value={contactId}
                                onValueChange={setContactId}
                                placeholder="Choose a customer"
                                aria-invalid={blocked ? true : undefined}
                                aria-describedby={
                                    blocked ? ids.block : undefined
                                }
                            />
                            {blocked ? (
                                <p
                                    id={ids.block}
                                    role="alert"
                                    className="text-[12.5px] font-medium text-destructive"
                                >
                                    {blocked}
                                </p>
                            ) : holding ? (
                                <p className="text-[12.5px] text-foreground/80">
                                    {holding}
                                </p>
                            ) : null}
                        </div>
                        <div className="grid gap-1.5">
                            <div
                                id={ids.paid}
                                className="text-[12.5px] font-medium"
                            >
                                Paid by
                            </div>
                            <div
                                role="radiogroup"
                                aria-labelledby={ids.paid}
                                className="flex flex-wrap gap-1.5"
                            >
                                {DESK_PAID_BY.map((m) => (
                                    <Chip
                                        key={m.value}
                                        on={paidBy === m.value}
                                        onClick={() => setPaidBy(m.value)}
                                    >
                                        {m.label}
                                    </Chip>
                                ))}
                            </div>
                        </div>
                        {pack ? (
                            <p className="text-pretty text-[12.5px] leading-[1.5] text-muted-foreground">
                                {sellNote(pack, invoicesOnSale)}
                            </p>
                        ) : null}
                    </div>
                )}
                <DialogFooter className="gap-2 sm:gap-2">
                    {missing && !nothingToSell && !nobody ? (
                        <p
                            id={ids.missing}
                            className="text-[12px] text-muted-foreground sm:mr-auto sm:self-center"
                        >
                            Choose a customer and how they paid.
                        </p>
                    ) : null}
                    <Button
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                    >
                        Cancel
                    </Button>
                    <Button
                        disabled={
                            busy ||
                            Boolean(nothingToSell) ||
                            nobody ||
                            missing ||
                            Boolean(blocked)
                        }
                        aria-describedby={
                            blocked
                                ? ids.block
                                : missing
                                  ? ids.missing
                                  : undefined
                        }
                        onClick={() => void save()}
                    >
                        {busy
                            ? "Selling…"
                            : sellLabel(pack, paidBy, invoicesOnSale)}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
