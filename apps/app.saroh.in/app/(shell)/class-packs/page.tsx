import { PacksContainer } from "@/components/class-packs/list/packs-screen";
import { PackEditorState } from "@/components/class-packs/pack-editor/editor-states";
import { PageContainer } from "@/components/shared/page/page-container";
import {
    canReadPacks,
    canSellPacks,
    canWritePacks,
} from "@/lib/class-packs/access";
import { readMissingRates } from "@/lib/gst-rates/service";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { requireSession } from "@/lib/session";

export const metadata = { title: "Class packs" };

/**
 * Bookings › Packs (round-2 E15): a card per pack, drafts included, with
 * the sell dialog.
 *
 * On React Query (DEC-259), loaded in the browser: the gates (who may
 * read, change and sell packs) are the page's; the packs, their notes and
 * the sell dialog's reads are `PacksContainer`'s query
 * (`/api/class-packs`), drawn into the screen's frame. What is on sale
 * with no GST rate stays the page's own read, as on Invoices: its sheet
 * renders the page again when a rate is saved.
 */
export default async function ClassPacksPage({
    searchParams,
}: {
    searchParams: Promise<{ sell?: string }>;
}) {
    await requireSession();
    const [organization, params] = await Promise.all([
        resolveActiveOrganization(),
        searchParams,
    ]);
    if (!canReadPacks(organization)) {
        return <PackEditorState state="forbidden" retryHref="/class-packs" />;
    }
    const canSell = canSellPacks(organization);
    // What is on sale with no GST rate; null draws no notice.
    const rates = await readMissingRates();

    return (
        <PageContainer width="full">
            <PacksContainer
                canWrite={canWritePacks(organization)}
                canSell={canSell}
                openSell={canSell && params.sell === "1"}
                missingRates={rates}
            />
        </PageContainer>
    );
}
