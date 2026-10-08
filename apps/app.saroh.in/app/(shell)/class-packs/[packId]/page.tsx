import { notFound } from "next/navigation";

import { DetailCrumbs } from "@/components/class-packs/pack-detail/detail-crumbs";
import type { SellContext } from "@/components/class-packs/pack-detail/pack-detail";
import { PackDetailScreen } from "@/components/class-packs/pack-detail/pack-detail";
import { PackEditorState } from "@/components/class-packs/pack-editor/editor-states";
import { PageContainer } from "@/components/shared/page-container";
import {
    canReadPacks,
    canSellPacks,
    canWritePacks,
} from "@/lib/class-packs/access";
import { detailHeader, tabFromQuery } from "@/lib/class-packs/pack-detail";
import {
    getPackDetail,
    readPackEvents,
    readPackHolders,
    readPackPurchases,
    readPackSales,
    readPackUsed,
    readSellContext,
} from "@/lib/class-packs/pack-detail-data";
import { readFreeCancelHours } from "@/lib/class-packs/packs-page";
import { getSellingTerms } from "@/lib/class-packs/service";
import { contactPickerOptions } from "@/lib/invoices/contacts";
import { modulesOrUnknown } from "@/lib/modules/guard";
import { permits } from "@/lib/organizations/permits";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { readServices } from "@/lib/services/service";
import { requireSession } from "@/lib/session";

export const metadata = { title: "Pack" };

const FALLBACK_ZONE = "Asia/Kolkata";

/**
 * Bookings › Packs › one pack (round-2 E16 and E17), after "Saroh Pack
 * Detail": Overview, Who has it with Extend, Used this week, Sales and
 * Activity, each tab's read on its own. `pack:read` covers the whole pack,
 * its prices and takings included (DEC-039), so it is the one gate; the
 * receipts behind the Overview's card are asked for only by someone who
 * may open invoices while Payments is on, and the sell dialog's reads
 * only by someone who may sell a pack on sale.
 *
 * The pack is the required read — an unknown id is the not-found state.
 * Everything else is optional and costs only its own part when it fails.
 */
export default async function PackDetailPage({
    params,
    searchParams,
}: {
    params: Promise<{ packId: string }>;
    searchParams: Promise<{ tab?: string }>;
}) {
    await requireSession();
    const [{ packId }, query, organization] = await Promise.all([
        params,
        searchParams,
        resolveActiveOrganization(),
    ]);
    if (!canReadPacks(organization)) {
        return <PackEditorState state="forbidden" retryHref="/class-packs" />;
    }

    const [pack, modules] = await Promise.all([
        getPackDetail(packId),
        modulesOrUnknown(),
    ]);
    if (!pack) notFound();

    const canWrite = canWritePacks(organization);
    const canSell = canSellPacks(organization);
    // Receipts live in Invoices, under Payments: switched off or rolled out
    // of, the card is never drawn (DEC-057). Unknown fails open, as the rail.
    const paymentsOn =
        modules?.find((m) => m.key === "PAYMENTS")?.readiness !== "DISABLED";
    const readsInvoices = paymentsOn && permits(organization, "invoice:read");

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
        readsInvoices ? readPackPurchases(pack.id) : null,
        readServices(),
        readFreeCancelHours(),
        canSell && pack.status === "ACTIVE" ? readSell() : null,
    ]);
    const own = services.ok
        ? services.services.filter((s) =>
              pack.services.some((p) => p.id === s.id),
          )
        : null;
    // Dates read in the zone its services are booked in.
    const timeZone = own?.[0]?.timezone ?? FALLBACK_ZONE;
    if (sell && !sell.packs.some((p) => p.id === pack.id)) {
        sell.packs.push(pack);
    }

    return (
        <PageContainer width="full" className="space-y-0 p-0 sm:p-0">
            <DetailCrumbs
                here={pack.name}
                aside={detailHeader(pack).bookingPage}
            />
            <PackDetailScreen
                // Another pack starts on its own tab and lens.
                key={pack.id}
                pack={pack}
                holders={holders}
                used={used}
                sales={sales}
                events={events}
                invoices={readsInvoices}
                receipts={
                    purchases?.state === "ok"
                        ? purchases.data.map((p) => ({
                              invoiceId: p.invoiceId,
                              contact: { name: p.contact.name },
                              createdAt: p.createdAt,
                          }))
                        : null
                }
                dropIns={
                    own?.map((s) => ({
                        id: s.id,
                        priceCents: s.priceCents,
                        currency: s.currency,
                    })) ?? null
                }
                freeCancelHours={freeCancelHours}
                timeZone={timeZone}
                nowIso={new Date().toISOString()}
                canWrite={canWrite}
                canSell={canSell}
                sell={sell}
                initialTab={tabFromQuery(query.tab)}
            />
        </PageContainer>
    );
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
        held: context.held.map((p) => ({
            contactId: p.contact.id,
            packId: p.pack.id,
            left: p.left,
            standing: p.standing,
        })),
        packs: context.packs,
        invoicesOnSale: terms.invoicesOnSale,
    };
}
