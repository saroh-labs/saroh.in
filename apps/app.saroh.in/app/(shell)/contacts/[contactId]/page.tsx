import { Button } from "@saroh/ui/button";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";

import { CoursesPanel } from "@/components/contacts/courses-panel";
import { EnquiriesPanel } from "@/components/contacts/enquiries-panel";
import { LeadsPanel } from "@/components/contacts/leads-panel";
import { SubscribeAction } from "@/components/contacts/subscribe-action";
import { CustomerDetailScreen } from "@/components/customers/detail/detail-screen";
import type { PackSale } from "@/components/customers/detail/packs-tab";
import { AccessDenied } from "@/components/shared/access-denied";
import { PageContainer } from "@/components/shared/page-container";
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
import { deleteQuestion, heldCounts } from "@/lib/contacts/removal";
import type { ContactDetail } from "@/lib/contacts/service";
import { getContact } from "@/lib/contacts/service";
import { contactSourceLabel } from "@/lib/contacts/source";
import { isRemovedContact, shownEmail } from "@/lib/crm/format";
import { rolesThatSeeSensitive } from "@/lib/customer-workspace/attention";
import { getCustomerDetail } from "@/lib/customer-workspace/detail";
import {
    isMergedRedirect,
    mergedRedirectPath,
} from "@/lib/customer-workspace/merge";
import type {
    DuplicateSuggestion,
    IdentitySuggestion,
    Suggestion,
} from "@/lib/customer-workspace/service";
import { getSuggestions, getThread } from "@/lib/customer-workspace/service";
import type {
    ReviewsRead,
    Tab,
    TabKey,
    ThreadRead,
} from "@/lib/customer-workspace/view";
import { tabFromQuery, tabsFor } from "@/lib/customer-workspace/view";
import { loadAddLead } from "@/lib/leads/add-lead-data";
import { modulesOrUnknown } from "@/lib/modules/guard";
import { sellsProducts } from "@/lib/orders/sells-products";
import { listRoles } from "@/lib/organizations/roles";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { contactReviews } from "@/lib/product-reviews/service";
import { requireSession } from "@/lib/session";

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
                title="You can't open contacts"
                description={`Your role in ${organization.name} can't see the people the business knows. An owner or admin can change that in Team.`}
            />
        );
    }

    const detail = await getCustomerDetail(contactId);
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

    const [suggestions, thread, reviews, packSale, crm, holdings, products] =
        await Promise.all([
            // Only whoever may link or merge reads what they'd be offered.
            canWrite || canMerge
                ? getSuggestions(contactId, { includeContacts: true }).catch(
                      (): Suggestion[] => [],
                  )
                : Promise.resolve<Suggestion[]>([]),
            // Their message thread (A13). A failed read shows the tab with
            // the failure said, never an empty thread.
            may("message:read")
                ? getThread(contactId).catch((): ThreadRead => "failed")
                : Promise.resolve<ThreadRead>(null),
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
                                }
                              : null,
                  )
                : Promise.resolve(null),
            // Their leads and enquiries, only where CRM is on and the viewer
            // reads leads; null when the read failed.
            gates.leads
                ? getContact(contactId).catch((): ContactDetail | null => null)
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
    const removed = isRemovedContact(crm ?? detail.contact);
    // Never the placeholder a site account's own record holds (UX-013).
    const email = shownEmail(crm ?? detail.contact);
    const person = { id: contactId, name, email: email ?? "" };
    const stages =
        gates.leads && canWrite && !removed
            ? (await loadAddLead()).stages
            : null;

    const extra: (Tab & { panel: ReactNode })[] = [];
    if (gates.leads) {
        extra.push({
            key: "lead",
            label: "Leads",
            count: crm ? crm.leads.length : null,
            panel: (
                <LeadsPanel
                    person={person}
                    leads={crm ? crm.leads : null}
                    stages={stages}
                />
            ),
        });
    }
    if (gates.enquiries) {
        const enquiries = crm ? (crm.enquiries ?? []) : null;
        extra.push({
            key: "enq",
            label: "Enquiries",
            count: enquiries ? enquiries.length : null,
            panel: (
                <EnquiriesPanel
                    enquiries={enquiries}
                    knownEmail={email}
                    first={first}
                />
            ),
        });
    }
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
            <Button size="sm" variant="outline" className="coarse:h-11" asChild>
                <Link
                    href={`/billing/invoices/new?contactId=${encodeURIComponent(contactId)}`}
                >
                    New invoice
                </Link>
            </Button>
        );
    }

    const tabs = [
        ...tabsFor(detail, thread, reviews),
        ...extra.map(({ key, label, count }) => ({ key, label, count })),
    ];
    const canSensitive =
        may("customer:sensitive") ||
        organization?.role === "OWNER" ||
        organization?.role === "ADMIN";
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
    // read; a kind it couldn't read keeps the sentence general.
    const deleteWords = deleteQuestion(
        crm ? crm.leads.length : null,
        heldCounts(
            {
                subscriptions: detail.subscriptions?.rows,
                packs: detail.packs?.rows,
                courses: holdings.courses,
            },
            now,
        ),
    );

    return (
        <PageContainer width="full" className="space-y-0 p-0 sm:p-0">
            <CustomerDetailScreen
                d={detail}
                initialTab={tabFromQuery(query.tab, tabs)}
                bizName={organization?.name ?? null}
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
                suggestions={suggestions.filter(
                    (s): s is IdentitySuggestion => s.kind === "customer",
                )}
                duplicates={suggestions.filter(
                    (s): s is DuplicateSuggestion => s.kind === "contact",
                )}
                thread={thread}
                reviews={reviews}
                canReplyReviews={may("product-review:write")}
                packSale={packSale}
                canExtendPacks={packsShown && canWritePacks(organization)}
                nowIso={now.toISOString()}
                extra={extra}
                actions={actions}
                deleteWords={deleteWords}
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
        </PageContainer>
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
                        <dt className="text-[12.5px] text-muted-foreground">
                            {label}
                        </dt>
                        <dd className="truncate">
                            {value ?? (
                                <span className="text-muted-foreground">
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
