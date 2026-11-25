import { readBusinessCurrency } from "@/lib/organizations/business-currency";
import { Button } from "@saroh/ui/button";
import { IntentLink } from "@saroh/ui/intent-link";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";

import { AskAiPageIs } from "@/components/ask-ai/ask-ai-page";
import { CoursesPanel } from "@/components/contacts/courses-panel";
import { SubscribeAction } from "@/components/contacts/subscribe-action";
import { CustomerDetailContainer } from "@/components/customers/detail/customer-detail-container";
import type { PackSale } from "@/components/customers/detail/packs-tab";
import { AccessDenied } from "@/components/shared/states/access-denied";
import { whoCanChange } from "@/components/shared/states/who-can-change";
import { customerPage } from "@/lib/ask-ai/page-hints";
import { canSellPacks, canWritePacks } from "@/lib/class-packs/access";
import { loadContactHoldings } from "@/lib/contacts/holdings";
import { contactPanels, moduleOn, sellPacksOnly } from "@/lib/contacts/panels";
import {
    crumbsToSell,
    personNewActions,
    personStarts,
    personTabActions,
    personTabGates,
} from "@/lib/contacts/person";
import { heldCounts } from "@/lib/contacts/removal";
import { contactSourceLabel } from "@/lib/contacts/source";
import { isRemovedContact, shownEmail } from "@/lib/crm/format";
import {
    maySeeSensitive,
    rolesThatSeeSensitive,
} from "@/lib/customer-workspace/attention";
import {
    isMergedRedirect,
    mergedRedirectPath,
} from "@/lib/customer-workspace/merge";
import type { ReviewsRead, Tab, TabKey } from "@/lib/customer-workspace/view";
import { readCustomerDetailOnce } from "@/lib/customers/access-server";
import { modulesOrUnknown } from "@/lib/modules/guard";
import { sellsProducts } from "@/lib/orders/sells-products";
import { knownRoleName } from "@/lib/organizations/role-name";
import { listRoles } from "@/lib/organizations/roles";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { contactReviews } from "@/lib/product-reviews/service";
import { requireSession } from "@/lib/session";

import Loading from "./loading";

// "Contact", never their name: a tab's title shows in a screen share, in
// history and in bookmarks (`lib/page-title.ts`).
export const metadata = { title: "Contact" };

/**
 * One person, one page (UX-050, #869): everyone the business knows — who
 * enquired, booked or bought — at `/contacts/<id>`, with a tab for each
 * thing it has with them. `/customers/<id>` redirects here.
 *
 * Built on Customer Detail (U18), rooted on the contact and rendered from
 * one read whose blocks the API leaves out where the viewer may not read
 * them or their module is off — orders, bookings, packs, subscriptions,
 * invoices with their amounts (DEC-098) — plus this page's own tabs:
 * Leads and Enquiries where CRM is on and the viewer reads leads, Courses
 * where Courses is on and they read courses (`lib/contacts/person.ts`).
 * The tab lives in `?tab=`.
 *
 * Another record that looks like the same person is offered to merge,
 * never merged on its own (DEC-097); a site account's own record keeps
 * DEC-049's placeholder email out of view.
 *
 * On React Query (DEC-259), loaded in the browser: the gates and the tabs
 * drawn here (Leads, Enquiries, Courses, what Subscribe and a pack sale
 * offer) are the page's, from their record (missing is this page's 404,
 * merged a redirect); the record with their messages, what they'd be
 * offered to link or merge and their open removal request
 * (`/api/customers/[customerId]`) is `CustomerDetailContainer`'s query,
 * read from the browser behind the route's loader and again after a write;
 * so are their leads and enquiries (`/api/contacts/[contactId]`).
 */
export default async function PersonPage({
    params,
    searchParams,
}: {
    params: Promise<{ contactId: string }>;
    searchParams: Promise<{ tab?: string }>;
}) {
    const session = await requireSession();
    const [{ contactId }, query, organization, modules] = await Promise.all([
        params,
        searchParams,
        resolveActiveOrganization(),
        modulesOrUnknown(),
    ]);
    // Non-money reads: without resolved actions the built-in roles decide,
    // as Customer Detail did. Money is asked of `permits` alone, in
    // `lib/contacts/person.ts` and `panels.ts` (DEC-098).
    const may = (action: string) =>
        organization?.actions
            ? organization.actions.includes(action)
            : organization?.role === "OWNER" || organization?.role === "ADMIN";

    // Told so, and who can change it — not a "not found" that reads like a
    // broken link.
    if (organization?.actions && !may("contact:read")) {
        return (
            <AccessDenied
                {...whoCanChange({
                    thing: "Contacts",
                    business: organization.name,
                    role: knownRoleName(organization),
                })}
            />
        );
    }

    if (!organization) notFound();
    // No such contact here. A read that failed otherwise is the page
    // failing (`error.tsx`), as before.
    const detail = await readCustomerDetailOnce(contactId);
    if (!detail) notFound();
    // A record merged into another (C9): its old address leads to the one
    // kept, on the same tab.
    if (isMergedRedirect(detail)) {
        redirect(mergedRedirectPath(detail.mergedInto, query.tab));
    }

    const canWrite = may("contact:write");
    const canMerge = may("customer:merge");
    const canRemove = may("customer:remove");
    const gates = personTabGates(organization, modules);
    const acts = personTabActions(organization, modules);
    // New order and New booking for them (#247): the module on and the
    // role allowed, each as its own flow's button asks.
    const opens = personNewActions(organization, modules);
    // Courses and what Subscribe offers come from the contact's holdings;
    // the rest is in the detail read.
    const panels = contactPanels(organization, modules);
    const holdingsPlan = {
        ...panels,
        panels: panels.panels.filter((p) => p === "courses"),
        canAct: {
            ...panels.canAct,
            subscriptions: acts.subscribe && detail.subscriptions !== undefined,
            packs: false,
            invoices: false,
        },
    };
    const packsShown = detail.packs !== undefined;

    const [reviews, packSale, holdings, products] = await Promise.all([
        // Their product reviews (C6), where the business sells.
        detail.linkedCustomers !== undefined && may("product-review:read")
            ? contactReviews(contactId).catch((): ReviewsRead => "failed")
            : Promise.resolve<ReviewsRead>(null),
        // Selling a pack needs the packs on sale (C7).
        packsShown && canSellPacks(organization)
            ? loadContactHoldings(contactId, sellPacksOnly()).then(
                  ({ choices }): PackSale | null =>
                      choices.packs
                          ? {
                                packs: choices.packs,
                                invoicesOnSale: choices.invoicesOnSale,
                                gst: choices.gst,
                            }
                          : null,
              )
            : Promise.resolve(null),
        loadContactHoldings(contactId, holdingsPlan),
        // New order is for a business that sells products (B13).
        opens.newOrder ? sellsProducts() : Promise.resolve(false),
    ]);

    const name = detail.contact.name;
    const first = detail.contact.firstName?.trim()
        ? detail.contact.firstName.trim()
        : (name.split(" ")[0] ?? name);
    // Removed for a privacy request (C11): their leads stay, but nothing can
    // put details back or add to them.
    const removed = isRemovedContact(detail.contact);
    // Never the placeholder a site account's own record holds (UX-013).
    const email = shownEmail(detail.contact);
    const person = { id: contactId, name, email: email ?? "" };
    // What a lead is worth is in the business's currency (owner, 11 Oct).
    const currency = gates.leads ? await readBusinessCurrency() : "";

    const extra: (Tab & { panel: ReactNode })[] = [];
    if (holdingsPlan.panels.includes("courses")) {
        const enrollments = holdings.courses ?? null;
        extra.push({
            key: "crs",
            label: "Courses",
            count: enrollments ? enrollments.length : null,
            panel: (
                <CoursesPanel
                    contact={person}
                    enrollments={enrollments}
                    courses={holdings.choices.courses}
                    invoicesOnEnrol={panels.paymentsOn}
                    gst={holdings.choices.gst}
                    mentionInvoices={panels.mentionInvoices}
                />
            ),
        });
    }

    const actions: Partial<Record<TabKey, ReactNode>> = {};
    if (holdingsPlan.canAct.subscriptions && holdings.choices.plans) {
        actions.sub = (
            <SubscribeAction contact={person} plans={holdings.choices.plans} />
        );
    }
    if (acts.newInvoice && detail.invoices !== undefined && !removed) {
        actions.inv = (
            <Button size="sm" variant="outline" asChild>
                <IntentLink
                    href={`/billing/invoices/new?contactId=${encodeURIComponent(contactId)}`}
                >
                    New invoice
                </IntentLink>
            </Button>
        );
    }

    const canSensitive = maySeeSensitive(organization);
    // C12's sensitive tick names who can read the note (DEC-073).
    const sensitiveRoles =
        canWrite && canSensitive && detail.attention?.suggestions?.length
            ? await listRoles()
                  .then(rolesThatSeeSensitive)
                  .catch(() => null)
            : null;
    // Linked store customers are read only where the business sells.
    const sells = detail.linkedCustomers !== undefined;
    const now = new Date();
    // The delete confirm names what deleting them ends, from what this page
    // read (their leads are the container's); a kind it couldn't read keeps
    // the sentence general.
    const deleteHeld = heldCounts(
        {
            subscriptions: detail.subscriptions?.rows,
            packs: detail.packs?.rows,
            courses: holdings.courses,
        },
        now,
    );

    return (
        <>
            {/* What Ask AI offers on this person, from this read (AF 5). */}
            <AskAiPageIs
                page={customerPage(detail.contact, {
                    zone: detail.timezone,
                    total: detail.stats.orders,
                    orders: detail.orders?.rows,
                    visits: detail.bookings?.past.map((b) => b.startAt),
                })}
            />
            <CustomerDetailContainer
                skeleton={<Loading />}
                ask={{ customerId: contactId }}
                tab={query.tab}
                bizName={organization.name}
                sells={sells}
                // Contacts, the person page's own list; Sell › Customers
                // only where Contacts is off and they buy (#858).
                crumbsSell={crumbsToSell(
                    moduleOn(modules, "CRM"),
                    sells,
                    detail.linkedCustomers?.length ?? 0,
                )}
                canWrite={canWrite}
                canMerge={canMerge}
                canRemove={canRemove}
                canConsent={may("consent:write")}
                canSensitive={canSensitive}
                sensitiveRoles={sensitiveRoles}
                userId={session.user.id}
                reviews={reviews}
                canReplyReviews={may("product-review:write")}
                packSale={packSale}
                canExtendPacks={packsShown && canWritePacks(organization)}
                nowIso={now.toISOString()}
                extra={extra}
                crm={
                    gates.leads
                        ? { person, currency, knownEmail: email, first }
                        : null
                }
                actions={actions}
                deleteHeld={deleteHeld}
                canRecordPayment={acts.recordPayment}
                starts={personStarts(contactId, opens, {
                    removed,
                    sellsProducts: products,
                })}
                overviewExtra={
                    removed ? null : (
                        <PersonFacts
                            company={detail.contact.company}
                            source={detail.contact.source}
                        />
                    )
                }
            />
        </>
    );
}

/**
 * What the Contacts page kept about them beside their email and phone (in
 * the header): their company and where they came from, said in words.
 */
function PersonFacts({
    company,
    source,
}: {
    company: string | null;
    source: string | null;
}) {
    const facts: [string, string | null][] = [
        // An empty string is a field someone cleared: shown as not given.
        ["Company", company?.trim() ? company : null],
        ["Came from", source ? contactSourceLabel(source) : null],
    ];
    return (
        <section
            aria-label="Details"
            className="mt-4 rounded-xl border border-border bg-card px-4 py-3.5"
        >
            <dl className="grid gap-x-6 gap-y-3 text-[13px] sm:grid-cols-2">
                {facts.map(([label, value]) => (
                    <div key={label} className="min-w-0">
                        {/* "Company", "Came from": the facts' own names. */}
                        <dt
                            data-ph-unmask=""
                            className="text-[12.5px] text-muted-foreground"
                        >
                            {label}
                        </dt>
                        <dd className="truncate">
                            {value ?? (
                                <span
                                    data-ph-unmask=""
                                    className="text-muted-foreground"
                                >
                                    Not given
                                </span>
                            )}
                        </dd>
                    </div>
                ))}
            </dl>
        </section>
    );
}
