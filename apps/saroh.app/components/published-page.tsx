import type {
    PacksFeed,
    PlansFeed,
    PricesActions,
    SignInOptions,
} from "@saroh/site-blocks";
import { PageSections } from "@saroh/site-blocks";

import {
    requestSignInCode,
    verifySignInCode,
} from "@/app/[domain]/account/actions";
import {
    buyPack,
    joinPlan,
    packPayment,
    planJoinStanding,
} from "@/app/[domain]/account/plan/actions";
import { accountAreaOn } from "@/lib/account-area";
import { publicApiUrl } from "@/lib/api-url";
import { getSignedInCustomer } from "@/lib/customer-session";
import type { PublicationPage, PublicationSnapshot } from "@/lib/publication";
import { getJournalFeed } from "@/lib/publication";
import { getSignInOptions } from "@/lib/sign-in";
import { getPacksFeed } from "@/lib/site-packs";
import { getPlansFeed } from "@/lib/site-plans";
import { getProductGridFeeds } from "@/lib/site-product-grids";

/**
 * One published page's sections, as the live site draws them: home, `[slug]`
 * and the Book and Shop pages at `/book` and `/shop` (G15), so a page is
 * drawn one way wherever its address is.
 *
 * The Journal's posts (G10), the plans (G9) and class packs (G20) on sale
 * and each Product grid's products (G12) are read only when the page draws
 * their block.
 */
export async function PublishedPage({
    page,
    snapshot,
    siteId,
}: {
    page: PublicationPage;
    snapshot: PublicationSnapshot;
    siteId: string | null;
}) {
    const [journal, plans, packs, productGrids] = await Promise.all([
        getJournalFeed(page.sections, snapshot, siteId),
        getPlansFeed(page.sections, snapshot, siteId),
        getPacksFeed(page.sections, snapshot, siteId),
        getProductGridFeeds(page.sections, siteId),
    ]);
    const prices = await pricesActions(snapshot.site.name, plans, packs);

    return (
        <PageSections
            sections={page.sections}
            apiUrl={publicApiUrl()}
            bookHref="/book"
            siteId={siteId}
            journal={journal}
            plans={plans}
            packs={packs}
            prices={prices}
            productGrids={productGrids}
        />
    );
}

/**
 * Join and Buy's actions (G20), for a page whose Plans or Class packs block
 * can be paid for online: who is signed in, how to sign in, and the
 * server actions. Only while the account area is switched on
 * (SITE_ACCOUNT_AREA): without it there is no signing in, and the blocks
 * ask about joining or the pack instead. Who is signed in is read only
 * here, so every other page costs nothing extra.
 */
async function pricesActions(
    businessName: string,
    plans: PlansFeed | undefined,
    packs: PacksFeed | undefined,
): Promise<PricesActions | null> {
    const payable =
        (plans?.payOnline === true && plans.plans.length > 0) ||
        (packs?.payOnline === true && packs.packs.length > 0);
    if (!payable || !accountAreaOn()) return null;
    const [customer, options] = await Promise.all([
        getSignedInCustomer().catch(() => null),
        getSignInOptions().catch((): SignInOptions | null => null),
    ]);
    return {
        businessName,
        customer,
        signInOptions: options ?? {
            businessName,
            phone: null,
            challenge: { required: false, siteKey: null },
        },
        signIn: {
            requestCode: requestSignInCode,
            verifyCode: verifySignInCode,
        },
        join: { join: joinPlan, standing: planJoinStanding },
        packs: { buy: buyPack, standing: packPayment },
        accountHref: "/account/plan",
    };
}
