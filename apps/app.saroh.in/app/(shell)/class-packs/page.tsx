import { PacksScreen } from "@/components/class-packs/packs-screen";
import { PageContainer } from "@/components/shared/page-container";
import { canSellPacks, canWritePacks } from "@/lib/class-packs/access";
import { owedSummary, rulesNote } from "@/lib/class-packs/pack-cards";
import {
    listPackCards,
    readFreeCancelHours,
    readMembershipPlans,
} from "@/lib/class-packs/packs-page";
import { getSellingTerms, listPurchases } from "@/lib/class-packs/service";
import { contactPickerOptions } from "@/lib/invoices/contacts";
import { modulesOrUnknown } from "@/lib/modules/guard";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { requireSession } from "@/lib/session";

export const metadata = { title: "Class packs" };

/**
 * Bookings › Packs (round-2 E15): a card per pack, drafts included, with
 * the sell dialog. The packs and their purchases are the page's reads; the
 * booking rule and the memberships are extras that cost only their line.
 */
export default async function ClassPacksPage({
    searchParams,
}: {
    searchParams: Promise<{ sell?: string }>;
}) {
    await requireSession();
    const [packs, purchases, organization, params, modules] = await Promise.all(
        [
            listPackCards(),
            listPurchases(),
            resolveActiveOrganization(),
            searchParams,
            modulesOrUnknown(),
        ],
    );
    const canWrite = canWritePacks(organization);
    const canSell = canSellPacks(organization);
    // Plans live under Payments: switched off or rolled out of, the note is
    // never drawn (DEC-057). Unknown fails open, as the rail does.
    const paymentsOn =
        modules?.find((m) => m.key === "PAYMENTS")?.readiness !== "DISABLED";
    const [contacts, terms, freeCancelHours, memberships] = await Promise.all([
        canSell ? contactPickerOptions() : Promise.resolve([]),
        getSellingTerms(),
        readFreeCancelHours(),
        paymentsOn ? readMembershipPlans() : Promise.resolve(null),
    ]);

    return (
        <PageContainer width="full">
            <PacksScreen
                packs={packs}
                contacts={contacts}
                held={purchases.map((p) => ({
                    contactId: p.contact.id,
                    packId: p.pack.id,
                    left: p.left,
                    standing: p.standing,
                }))}
                canWrite={canWrite}
                canSell={canSell}
                invoicesOnSale={terms.invoicesOnSale}
                summary={owedSummary(purchases)}
                rules={rulesNote(freeCancelHours)}
                memberships={memberships}
                openSell={canSell && params.sell === "1"}
            />
        </PageContainer>
    );
}
