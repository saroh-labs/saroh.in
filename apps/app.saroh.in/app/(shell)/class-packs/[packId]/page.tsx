import { notFound } from "next/navigation";
import { cache } from "react";

import { PackDetailContainer } from "@/components/class-packs/pack-detail/pack-detail";
import { PackEditorState } from "@/components/class-packs/pack-editor/editor-states";
import { PageContainer } from "@/components/shared/page/page-container";
import {
    canReadPacks,
    canSellPacks,
    canWritePacks,
} from "@/lib/class-packs/access";
import { tabFromQuery } from "@/lib/class-packs/pack-detail";
import { getPackDetail } from "@/lib/class-packs/pack-detail-data";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { recordTitle } from "@/lib/page-title";
import { requireSession } from "@/lib/session";

import Loading from "./loading";

// One read for the tab's title and the page's not-found.
const readPack = cache((packId: string) => getPackDetail(packId));

/** The pack's own name in the tab; "Class pack" when it can't be read. */
export async function generateMetadata({
    params,
}: {
    params: Promise<{ packId: string }>;
}) {
    const { packId } = await params;
    return recordTitle(
        () => readPack(packId),
        (pack) => pack.name,
        "Class pack",
    );
}

/**
 * Bookings › Packs › one pack (round-2 E16 and E17), after "Saroh Pack
 * Detail": Overview, Who has it with Extend, Used this week, Sales and
 * Activity. `pack:read` covers the whole pack, its prices and takings
 * included (DEC-039), so it is the one gate.
 *
 * On React Query (DEC-259), loaded in the browser: the gate is decided
 * here, with the pack the tab's title reads anyway (missing, or another
 * business's, is this page's 404); the pack and each tab's read
 * (`/api/class-packs/[packId]`) are `PackDetailContainer`'s query, read
 * from the browser behind the route's loader.
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
    if (!(await readPack(packId))) notFound();

    return (
        <PageContainer width="full" className="space-y-0 p-0 sm:p-0">
            <PackDetailContainer
                packId={packId}
                skeleton={<Loading />}
                canWrite={canWritePacks(organization)}
                canSell={canSellPacks(organization)}
                initialTab={tabFromQuery(query.tab)}
            />
        </PageContainer>
    );
}
