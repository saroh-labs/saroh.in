import { PackEditorState } from "@/components/class-packs/pack-editor/editor-states";
import { PurchasesContainer } from "@/components/class-packs/purchases/purchases-screen";
import { PageContainer } from "@/components/shared/page/page-container";
import { canReadPacks, canSellPacks } from "@/lib/class-packs/access";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { requireSession } from "@/lib/session";

export const metadata = { title: "Class pack holders" };

/**
 * Class packs → who holds one, with classes left and when it runs out.
 * On React Query (DEC-259): the gates are the page's; the purchases and
 * the sell dialog's reads are `PurchasesContainer`'s query
 * (`/api/class-packs/purchases`), drawn into the screen's frame.
 */
export default async function PackPurchasesPage({
    searchParams,
}: {
    searchParams: Promise<{ view?: string }>;
}) {
    await requireSession();
    const [organization, params] = await Promise.all([
        resolveActiveOrganization(),
        searchParams,
    ]);
    if (!canReadPacks(organization)) {
        return (
            <PackEditorState
                state="forbidden"
                retryHref="/class-packs/purchases"
            />
        );
    }

    return (
        <PageContainer width="full">
            <PurchasesContainer
                // The only write here is selling one (E26: `pack:sell`).
                canWrite={canSellPacks(organization)}
                initialFilterId={params.view}
            />
        </PageContainer>
    );
}
