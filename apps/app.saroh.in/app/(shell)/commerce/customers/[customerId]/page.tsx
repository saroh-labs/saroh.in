import { badgeVariants } from "@saroh/ui/badge";
import { PageHeader } from "@saroh/ui/page-header";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { PageContainer } from "@/components/shared/page-container";
import { ViewerDate } from "@/components/shared/viewer-date";
import { CustomerForm } from "@/components/stores/customer-form";
import { customerHref } from "@/lib/customers/links";
import type { Customer, CustomerListItem } from "@/lib/customers/service";
import { getCustomer, listCustomers } from "@/lib/customers/service";
import { formatMoneyMajor } from "@/lib/format/money";
import type { OrderStanding } from "@/lib/orders/business-service";
import { listBusinessOrders } from "@/lib/orders/business-service";
import { requireSession } from "@/lib/session";
import type { Store } from "@/lib/stores/service";
import { listBusinessStores } from "@/lib/stores/service";

export const metadata = { title: "Customer" };

const STANDING: Record<
    OrderStanding,
    { label: string; variant: "draft" | "success" | "neutral" }
> = {
    UNFULFILLED: { label: "Unfulfilled", variant: "draft" },
    FULFILLED: { label: "Fulfilled", variant: "success" },
    REFUNDED: { label: "Refunded", variant: "neutral" },
    CANCELLED: { label: "Cancelled", variant: "neutral" },
};

/**
 * Sell → Customers → one customer.
 *
 * A customer is stored per storefront, and the list merges the records that
 * share an email into one person. This page is one of those records — its
 * details are what that storefront knows — with the person's orders beside
 * it, and the other storefronts they buy at one click away.
 */
export default async function CustomerPage({
    params,
    searchParams,
}: {
    params: Promise<{ customerId: string }>;
    searchParams: Promise<{ storefront?: string }>;
}) {
    await requireSession();
    const [{ customerId }, { storefront }, stores] = await Promise.all([
        params,
        searchParams,
        listBusinessStores(),
    ]);
    const found = await findCustomer(stores, customerId, storefront);
    if (!found) notFound();
    const { store, customer } = found;

    const [orders, elsewhere] = await Promise.all([
        listBusinessOrders().catch(() => null),
        otherPlaces(stores, store, customer),
    ]);
    const theirs = (orders ?? []).filter((o) => o.customer?.id === customer.id);
    const name =
        [customer.firstName, customer.lastName]
            .filter(Boolean)
            .join(" ")
            .trim() || customer.email;

    return (
        <PageContainer width="full">
            <div className="flex flex-col gap-6">
                <PageHeader
                    className="mb-0"
                    breadcrumb={[
                        "Sell",
                        <Link
                            key="customers"
                            href="/commerce/customers"
                            className="hover:text-foreground"
                        >
                            Customers
                        </Link>,
                        name,
                    ]}
                    title={name}
                    description={`${customer.email} · at ${store.name}`}
                />
                <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
                    <Card title="Details">
                        <div className="max-w-[560px] p-4 sm:p-5">
                            <CustomerForm
                                key={customer.id}
                                storeId={store.id}
                                customer={customer}
                            />
                        </div>
                    </Card>
                    <div className="flex min-w-0 flex-col gap-4">
                        <Card title="Orders">
                            {orders === null ? (
                                <p className="px-4 py-3.5 text-[12.5px] text-muted-foreground">
                                    Their orders could not be read just now.
                                    Nothing about them has changed.
                                </p>
                            ) : theirs.length === 0 ? (
                                <p className="text-pretty px-4 py-3.5 text-[12.5px] leading-[1.5] text-muted-foreground">
                                    No orders at {store.name} yet. An order
                                    taken for them shows up here.
                                </p>
                            ) : (
                                <ul>
                                    {theirs.map((o) => {
                                        const s = STANDING[o.standing];
                                        return (
                                            <li
                                                key={o.id}
                                                className="border-b border-foreground/10 last:border-b-0"
                                            >
                                                <Link
                                                    href={`/commerce/orders/${o.id}?storefront=${o.store.id}`}
                                                    className="flex items-center gap-3 px-4 py-3 transition-colors duration-fast hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                                                >
                                                    <span className="min-w-0 flex-1">
                                                        <span className="flex items-center gap-2">
                                                            <span className="font-mono text-[12.5px]">
                                                                #{o.orderId}
                                                            </span>
                                                            <span
                                                                className={badgeVariants(
                                                                    {
                                                                        variant:
                                                                            s.variant,
                                                                    },
                                                                )}
                                                            >
                                                                {s.label}
                                                            </span>
                                                        </span>
                                                        <ViewerDate
                                                            iso={o.placedAt}
                                                            className="mt-0.5 block text-[11.5px] text-muted-foreground"
                                                        />
                                                    </span>
                                                    <span className="font-display text-[13.5px] font-semibold tabular-nums">
                                                        {formatMoneyMajor(
                                                            o.total,
                                                            o.currency,
                                                        )}
                                                    </span>
                                                </Link>
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </Card>
                        {elsewhere.length > 0 ? (
                            <Card title="Also buys at">
                                <ul>
                                    {elsewhere.map((p) => (
                                        <li
                                            key={p.store.id}
                                            className="border-b border-foreground/10 last:border-b-0"
                                        >
                                            <Link
                                                href={customerHref(
                                                    p.store.id,
                                                    p.customer.id,
                                                )}
                                                className="flex items-center justify-between gap-3 px-4 py-3 text-[13px] transition-colors duration-fast hover:bg-accent"
                                            >
                                                <span className="truncate font-medium">
                                                    {p.store.name}
                                                </span>
                                                <span className="shrink-0 text-[12px] text-muted-foreground">
                                                    {p.customer.orderCount === 1
                                                        ? "1 order"
                                                        : `${p.customer.orderCount} orders`}
                                                </span>
                                            </Link>
                                        </li>
                                    ))}
                                </ul>
                                <p className="text-pretty border-t border-foreground/10 px-4 py-2.5 text-[11.5px] leading-[1.45] text-muted-foreground">
                                    The same email at another storefront. Each
                                    storefront keeps its own details for them.
                                </p>
                            </Card>
                        ) : null}
                    </div>
                </div>
            </div>
        </PageContainer>
    );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
    return (
        <section className="overflow-hidden rounded-[12px] border border-border bg-card">
            <h2 className="border-b border-muted px-4 py-[13px] text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                {title}
            </h2>
            {children}
        </section>
    );
}

async function findCustomer(
    stores: Store[],
    customerId: string,
    storefront: string | undefined,
): Promise<{ store: Store; customer: Customer } | null> {
    const named = stores.find((s) => s.id === storefront);
    if (named) {
        const customer = await getCustomer(named.id, customerId).catch(
            () => null,
        );
        if (customer) return { store: named, customer };
    }
    const others = stores.filter((s) => s !== named);
    const hits = await Promise.all(
        others.map((s) => getCustomer(s.id, customerId).catch(() => null)),
    );
    for (let i = 0; i < hits.length; i++) {
        const customer = hits[i];
        if (customer) return { store: others[i], customer };
    }
    return null;
}

/** The same person — the same email — at the business's other storefronts. */
async function otherPlaces(
    stores: Store[],
    here: Store,
    customer: Customer,
): Promise<{ store: Store; customer: CustomerListItem }[]> {
    const others = stores.filter((s) => s.id !== here.id);
    const lists = await Promise.all(
        others.map((s) => listCustomers(s.id).catch(() => [])),
    );
    const email = customer.email.trim().toLowerCase();
    const out: { store: Store; customer: CustomerListItem }[] = [];
    for (let i = 0; i < others.length; i++) {
        const match = lists[i].find(
            (c) => c.email.trim().toLowerCase() === email,
        );
        if (match) out.push({ store: others[i], customer: match });
    }
    return out;
}
