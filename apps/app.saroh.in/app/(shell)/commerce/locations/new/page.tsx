import { Button } from "@saroh/ui/button";
import { LimitReachedState } from "@saroh/ui/data-state";
import { PageHeader } from "@saroh/ui/page-header";
import Link from "next/link";

import { sellCrumbs } from "@/components/commerce/sell-pages/sell-crumbs";
import { PageContainer } from "@/components/shared/page/page-container";
import { CreateStoreForm } from "@/components/stores/locations/create-store-form";
import { requireCan } from "@/lib/access/require-can";
import { mayAddStorefront } from "@/lib/business-limits";
import { requireSession } from "@/lib/session";
import { locationsWord } from "@/lib/stores/pick";
import {
    getStorefrontAllowance,
    listStorefronts,
} from "@/lib/stores/storefronts";

export const metadata = { title: "New location" };

/**
 * Sell → Location → New location.
 *
 * A business may have several locations, up to Saroh's ceiling (ADR-010) —
 * a counter and a stall count their stock apart. A new one is online, so
 * no plan caps it (DEC-109): the plan's places customers visit are asked
 * when one becomes a shop. At the ceiling the API refuses another, so this
 * says so before the form, not after Save.
 * An allowance that cannot be read shows the form and leaves it to the API.
 */
export default async function NewStorefrontPage() {
    await requireSession();
    // Asked before the form is drawn: `store:create` is what the API asks of
    // the save (`requireCan`).
    const access = await requireCan("store:create", {
        thing: "New location",
        back: {
            href: "/commerce/locations",
            label: "Back to Locations",
            needs: "store:read",
        },
    });
    if (access.denied) return access.denied;
    const [storefronts, allowance] = await Promise.all([
        listStorefronts(),
        getStorefrontAllowance().catch(() => null),
    ]);
    // The ceiling, when the business already has that many.
    const full =
        allowance &&
        !mayAddStorefront({ used: storefronts.length, limit: allowance.limit })
            ? allowance.limit
            : null;
    const first = storefronts.at(0);

    return (
        <PageContainer width="form">
            <PageHeader
                holdsData="description"
                breadcrumb={sellCrumbs(
                    {
                        label: locationsWord(storefronts.length),
                        href: "/commerce/locations",
                    },
                    "New location",
                )}
                title="New location"
                description={
                    full !== null
                        ? undefined
                        : first
                          ? `Another place to sell from, beside ${storefronts.length === 1 ? first.name : `your ${storefronts.length} locations`}. It sells from the same catalogue and counts its own stock. Its hours, checkout and payments are set up on the next screen.`
                          : "A place you sell from: a shop counter, a studio, a market stall. Its hours, checkout and payments are set up on the next screen."
                }
            />
            {full !== null ? (
                <LimitReachedState
                    title={`You're at ${full} of ${full} locations`}
                    description="Close one you no longer sell from to add another."
                    secondary={
                        <Button asChild variant="outline">
                            <Link href="/commerce/locations">
                                {storefronts.length === 1
                                    ? "Go to your location"
                                    : "Go to locations"}
                            </Link>
                        </Button>
                    }
                />
            ) : (
                <CreateStoreForm />
            )}
        </PageContainer>
    );
}
