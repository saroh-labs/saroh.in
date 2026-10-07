import type {
    EnquiryThread,
    PacksFeed,
    PlansFeed,
    PricesActions,
    SignInOptions,
} from "@saroh/site-blocks";
import { modulePageTopOf, PageSections } from "@saroh/site-blocks";

import {
    requestSignInCode,
    verifySignInCode,
} from "@/app/[domain]/account/actions";
import { sendMessage } from "@/app/[domain]/account/messages/actions";
import {
    buyPack,
    joinPlan,
    joinStartAutopay,
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
        getProductGridFeeds(
            page.sections,
            siteId,
            page.kind === "SHOP" || page.path === "/shop",
        ),
    ]);
    const [prices, thread] = await Promise.all([
        pricesActions(snapshot.site.name, plans, packs),
        threadActions(snapshot.site.name, page.sections),
    ]);

    return (
        <PageSections
            sections={page.sections}
            // A module page opens with its title (DEC-073 #9).
            top={modulePageTopOf(page)}
            apiUrl={publicApiUrl()}
            bookHref="/book"
            siteId={siteId}
            journal={journal}
            plans={plans}
            packs={packs}
            prices={prices}
            thread={thread}
            productGrids={productGrids}
        />
    );
}

/**
 * The Contact page's form for a signed-in customer (A13): it writes to
 * their thread with the business instead of starting an enquiry. Only on a
 * page with a form, while the account area is on (SITE_ACCOUNT_AREA, the
 * switch the account's Messages sit behind), and when someone is signed in;
 * otherwise the form is the public enquiry, as before.
 */
async function threadActions(
    businessName: string,
    sections: PublicationPage["sections"],
): Promise<EnquiryThread | null> {
    if (!sections.some((s) => s.type === "enquiry")) return null;
    if (!accountAreaOn()) return null;
    const customer = await getSignedInCustomer().catch(() => null);
    if (!customer) return null;
    return {
        businessName,
        customer,
        send: sendMessage,
        messagesHref: "/account/messages",
    };
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
        join: {
            join: joinPlan,
            standing: planJoinStanding,
            // The join's eMandate step (D12).
            startAutopay: joinStartAutopay,
        },
        packs: { buy: buyPack, standing: packPayment },
        accountHref: "/account/plan",
    };
}
