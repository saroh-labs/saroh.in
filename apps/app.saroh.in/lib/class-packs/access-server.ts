import "server-only";

import { contactPickerOptions } from "@/lib/invoices/contacts";
import { moduleAccess, modulesOrUnknown } from "@/lib/modules/guard";
import { permits } from "@/lib/organizations/permits";
import { activeOrganizationOnce } from "@/lib/organizations/service";
import type { ServerRead } from "@/lib/query/route";
import { readServices } from "@/lib/services/service";

import { canReadPacks, canSellPacks } from "./access";
import { cardNotes } from "./pack-card-notes";
import { owedSummary, packKind, rulesNote } from "./pack-cards";
import {
    getPackDetail,
    readPackEvents,
    readPackHolders,
    readPackPurchases,
    readPackSales,
    readPackUsed,
    readSellContext,
} from "./pack-detail-data";
import {
    FALLBACK_ZONE,
    listPackCards,
    readBusinessZone,
    readFreeCancelHours,
    readMembershipPlans,
} from "./packs-page";
import type {
    PackAsk,
    PacksView,
    PackView,
    PurchasesView,
    SellContext,
} from "./queries";
import { packPurchasesRead, packRead, packsListRead } from "./queries";
import { getSellingTerms, listPacks, listPurchases } from "./service";

/**
 * Class packs' reads on the server (DEC-259): the services
 * `/api/class-packs/*` answer with. Who may read them is the pages' gate:
 * `pack:read` while Class packs is on (its layout's `ModuleGate`).
 */
export async function mayReadPacks(): Promise<boolean> {
    const organization = await activeOrganizationOnce();
    if (!canReadPacks(organization)) return false;
    const access = await moduleAccess("CLASS_PACKS");
    return access.state === "available" || access.state === "unknown";
}

/** Plans and receipts live under Payments; unknown fails open (DEC-057). */
async function paymentsOn(): Promise<boolean> {
    const modules = await modulesOrUnknown();
    return modules?.find((m) => m.key === "PAYMENTS")?.readiness !== "DISABLED";
}

const heldOf = (
    purchases: Awaited<ReturnType<typeof listPurchases>>,
): SellContext["held"] =>
    purchases.map((p) => ({
        contactId: p.contact.id,
        packId: p.pack.id,
        left: p.left,
        standing: p.standing,
    }));

/** Bookings › Packs: every pack with its notes, and the sell dialog's reads. */
export async function readPacksView(): Promise<PacksView> {
    const organization = await activeOrganizationOnce();
    const canSell = canSellPacks(organization);
    const payments = await paymentsOn();
    const [
        packs,
        purchases,
        contacts,
        terms,
        freeCancelHours,
        memberships,
        timeZone,
    ] = await Promise.all([
        listPackCards(),
        listPurchases(),
        canSell ? contactPickerOptions() : Promise.resolve([]),
        getSellingTerms(),
        readFreeCancelHours(),
        payments ? readMembershipPlans() : Promise.resolve(null),
        readBusinessZone(),
    ]);
    const now = new Date();
    return {
        packs,
        notes: Object.fromEntries(
            packs.map((p) => [
                p.id,
                cardNotes(
                    {
                        id: p.id,
                        kind: packKind(p),
                        price: p.price,
                        currency: p.currency,
                        // For "bought at an older price": today's price
                        // with its GST.
                        gst: p.gst,
                    },
                    purchases,
                    now,
                    timeZone,
                ),
            ]),
        ),
        contacts,
        held: heldOf(purchases),
        invoicesOnSale: terms.invoicesOnSale,
        summary: owedSummary(purchases),
        rules: rulesNote(freeCancelHours),
        memberships,
    };
}

/** Who holds a pack, and the sell dialog's reads for someone who may sell. */
export async function readPurchasesView(): Promise<PurchasesView> {
    const canSell = canSellPacks(await activeOrganizationOnce());
    const [purchases, packs, contacts, terms] = await Promise.all([
        listPurchases(),
        listPacks(),
        canSell ? contactPickerOptions() : Promise.resolve([]),
        getSellingTerms(),
    ]);
    return {
        purchases,
        packs,
        contacts,
        invoicesOnSale: terms.invoicesOnSale,
        gst: terms.gst,
    };
}

/** The sell dialog's reads: who to sell to, and what they have had. */
async function readSell(): Promise<SellContext> {
    const [contacts, context, terms] = await Promise.all([
        contactPickerOptions(),
        readSellContext(),
        getSellingTerms(),
    ]);
    return {
        contacts,
        held: heldOf(context.held),
        packs: context.packs,
        invoicesOnSale: terms.invoicesOnSale,
        gst: terms.gst,
    };
}

/**
 * One pack's page; null (a 404) when it isn't this business's. The pack
 * is the required read; every tab's read fails on its own. Receipts are
 * read only for someone who may open invoices while Payments is on, and
 * the sell dialog's reads only for someone who may sell a pack on sale.
 */
export async function readPackView({
    packId,
}: PackAsk): Promise<PackView | null> {
    const [pack, organization, payments] = await Promise.all([
        getPackDetail(packId),
        activeOrganizationOnce(),
        paymentsOn(),
    ]);
    if (!pack) return null;
    const invoices = payments && permits(organization, "invoice:read");
    const sellable = canSellPacks(organization) && pack.status === "ACTIVE";
    const [
        holders,
        used,
        sales,
        events,
        purchases,
        services,
        freeCancelHours,
        sell,
    ] = await Promise.all([
        readPackHolders(pack.id),
        readPackUsed(pack.id),
        readPackSales(pack.id),
        readPackEvents(pack.id),
        invoices ? readPackPurchases(pack.id) : null,
        readServices(),
        readFreeCancelHours(),
        sellable ? readSell() : null,
    ]);
    const own = services.ok
        ? services.services.filter((s) =>
              pack.services.some((p) => p.id === s.id),
          )
        : null;
    if (sell && !sell.packs.some((p) => p.id === pack.id)) {
        sell.packs.push(pack);
    }
    return {
        pack,
        holders,
        used,
        sales,
        events,
        invoices,
        receipts:
            purchases?.state === "ok"
                ? purchases.data.map((p) => ({
                      invoiceId: p.invoiceId,
                      contact: { name: p.contact.name },
                      createdAt: p.createdAt,
                  }))
                : null,
        dropIns:
            own?.map((s) => ({
                id: s.id,
                // What one visit costs to pay, GST and all.
                priceCents: s.payCents ?? s.priceCents,
                currency: s.currency,
            })) ?? null,
        freeCancelHours,
        // Dates read in the zone its services are booked in.
        timeZone: own?.[0]?.timezone ?? FALLBACK_ZONE,
        sell,
    };
}

type NoAsk<R extends { options: (...a: never[]) => unknown }> = Parameters<
    R["options"]
>[1];

export const packsListServer: ServerRead<
    NoAsk<typeof packsListRead>,
    PacksView
> = {
    read: packsListRead,
    service: readPacksView,
};

export const packPurchasesServer: ServerRead<
    NoAsk<typeof packPurchasesRead>,
    PurchasesView
> = { read: packPurchasesRead, service: readPurchasesView };

export const packServer: ServerRead<PackAsk, PackView> = {
    read: packRead,
    service: readPackView,
};
