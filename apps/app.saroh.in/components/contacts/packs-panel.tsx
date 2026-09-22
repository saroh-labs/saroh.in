"use client";

import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import Link from "next/link";
import { useState } from "react";

import { SellPackDialog } from "@/components/class-packs/sell-pack-dialog";
import type { ContactOption } from "@/components/shared/contact-picker";
import { ViewerDate } from "@/components/shared/viewer-date";
import { balanceLabel, packStanding } from "@/lib/class-packs/balance";
import type { ClassPack, PackPurchase } from "@/lib/class-packs/service";

import { ContactPanelSection, ROW } from "./contact-panel";

/**
 * A person's class packs: classes left and when each runs out, the live
 * ones first. The balance is U10's helper over the API's counts, so this
 * says what the booking dialog and the holders list say. "Sell a pack"
 * opens the Class packs screen's own dialog with this person chosen.
 *
 * An invoice is linked only when the page may mention one (Payments on and
 * invoices readable here).
 */
export function PacksPanel({
    contact,
    purchases,
    packs,
    invoicesOnSale,
    mentionInvoices,
    now,
}: {
    contact: ContactOption;
    /** Null when they could not be read. */
    purchases: PackPurchase[] | null;
    /** Packs to sell them; null when this person may not, or they failed. */
    packs: ClassPack[] | null;
    invoicesOnSale: boolean;
    mentionInvoices: boolean;
    /** ISO; the page's clock, so server and browser agree on the balance. */
    now: string;
}) {
    const [selling, setSelling] = useState(false);
    const at = new Date(now);
    const rows = purchases
        ? [...purchases].sort(
              (a, b) =>
                  Number(packStanding(a, at) !== "ACTIVE") -
                  Number(packStanding(b, at) !== "ACTIVE"),
          )
        : null;

    return (
        <>
            <ContactPanelSection
                title="Class packs"
                count={rows ? rows.length : null}
                failed="Their class packs"
                empty={`${contact.name} has no class pack.${packs ? " Sell them one and their classes come off it as they book." : ""}`}
                action={
                    packs ? (
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setSelling(true)}
                        >
                            Sell a pack
                        </Button>
                    ) : null
                }
            >
                {rows ? (
                    <ul>
                        {rows.map((p) => {
                            const standing = packStanding(p, at);
                            const live = standing === "ACTIVE";
                            return (
                                <li key={p.id} className={ROW}>
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-[13.5px] font-medium">
                                            {p.pack.name}
                                        </span>
                                        <span className="block truncate text-[11.5px] text-muted-foreground">
                                            {standing === "EXPIRED"
                                                ? "Expired"
                                                : "Expires"}{" "}
                                            <ViewerDate iso={p.expiresAt} />
                                            {mentionInvoices && p.invoiceId ? (
                                                <>
                                                    {" · "}
                                                    <Link
                                                        href={`/billing/invoices/${p.invoiceId}`}
                                                        className="underline underline-offset-4"
                                                    >
                                                        Invoice
                                                    </Link>
                                                </>
                                            ) : null}
                                        </span>
                                    </span>
                                    <Badge
                                        variant={live ? "success" : "neutral"}
                                    >
                                        {balanceLabel(p, at)}
                                    </Badge>
                                </li>
                            );
                        })}
                    </ul>
                ) : null}
            </ContactPanelSection>
            {packs ? (
                <SellPackDialog
                    open={selling}
                    onOpenChange={setSelling}
                    contacts={[contact]}
                    packs={packs}
                    initialContactId={contact.id}
                    invoicesOnSale={invoicesOnSale}
                />
            ) : null}
        </>
    );
}
