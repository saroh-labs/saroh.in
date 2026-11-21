"use client";

import { ListCard, ListRow } from "@saroh/ui/list-card";
import { PageHeader } from "@saroh/ui/page-header";
import { Row, Section } from "@saroh/ui/settings-rows";
import { Skeleton } from "@saroh/ui/skeleton";
import { usePathname } from "next/navigation";

import { ListHead } from "@/components/billing-profiles/profile-list";
import { LoadingProfiles } from "@/components/billing-profiles/states";

/**
 * A page of the account area while it is read, inside the frame (the
 * layout's bar and menu stay drawn). Shaped like the page that is coming,
 * with its real title, so only the parts that wait are grey and nothing
 * jumps when it lands. The URL is already the new page's while this shows,
 * so the path picks the shape.
 */
export function AreaLoading() {
    const path = usePathname();
    if (path.startsWith("/businesses")) return <BusinessesLoading />;
    if (path === "/account/billing-profiles") {
        return (
            <div className="flex max-w-[760px] flex-col gap-6">
                <ListHead />
                <LoadingProfiles cards />
            </div>
        );
    }
    if (path.startsWith("/account/billing-profiles/")) {
        return <BillingProfileLoading />;
    }
    return <ProfileLoading />;
}

const CARD = "overflow-hidden rounded-xl border border-border bg-card";
const CARD_HEAD =
    "m-0 border-b border-border/70 px-[18px] py-3 text-sm font-semibold";

/**
 * One billing profile: its breadcrumb, name and line, then Pays for and
 * Invoices beside On Saroh's invoices, as `ProfilePage` lays them out.
 */
export function BillingProfileLoading() {
    return (
        <div
            className="flex max-w-[980px] flex-col gap-4"
            aria-busy="true"
            aria-live="polite"
        >
            <span className="sr-only">Loading this billing profile</span>
            <PageHeader
                breadcrumb={[
                    "Billing profiles",
                    <InlineBar key="name" className="h-3 w-28" />,
                ]}
                title={<InlineBar className="h-8 w-72 max-w-full" />}
                holdsData={false}
                description={<Bar w="w-64" />}
            />
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
                <div className="contents lg:flex lg:min-w-0 lg:flex-[2_1_480px] lg:flex-col lg:gap-4">
                    <div className={CARD}>
                        <p className={CARD_HEAD}>Pays for</p>
                        <div className="flex items-center gap-3 px-[18px] py-3">
                            <div className="flex-1">
                                <Bar w="w-32" />
                            </div>
                            <Skeleton aria-hidden className="h-8 w-20" />
                        </div>
                    </div>
                    <div className={CARD}>
                        <p className={CARD_HEAD}>
                            Invoices from Saroh to this profile
                        </p>
                        <div className="px-[18px] py-3">
                            <Bar w="w-80 max-w-full" />
                        </div>
                    </div>
                </div>
                <div className="contents lg:flex lg:min-w-0 lg:flex-[1_1_280px] lg:flex-col lg:gap-4">
                    <div className={`${CARD} order-first lg:order-none`}>
                        <p className={CARD_HEAD}>On Saroh&apos;s invoices</p>
                        <div className="grid gap-4 px-[18px] py-3">
                            {["w-40", "w-32", "w-56", "w-36"].map((w) => (
                                <div key={w} className="grid gap-1.5">
                                    <div className="bg-muted/70 h-3 w-20 rounded-[4px]" />
                                    <Bar w={w} />
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

/** A value's place in a row. */
function Bar({ w }: { w: string }) {
    return <Skeleton aria-hidden className={`h-4 ${w}`} />;
}

/** A bar that may sit in a heading or a line of text (a span, not a div). */
function InlineBar({ className }: { className: string }) {
    return (
        <span
            aria-hidden
            className={`skeleton-sweep bg-muted inline-block rounded-md align-middle ${className}`}
        />
    );
}

/** A row's Change button, held so the row is its real height. */
const ACTION = <Skeleton aria-hidden className="h-8 w-[4.5rem]" />;

/** Profile and sign-in's sections and rows, their values grey. */
export function ProfileLoading() {
    return (
        <div className="max-w-[760px]" aria-busy="true" aria-live="polite">
            <span className="sr-only">Loading your profile</span>
            <PageHeader
                title="Profile and sign-in"
                description={<Bar w="w-48" />}
                actions={<Skeleton aria-hidden className="h-10 w-[7.5rem]" />}
            />
            <div className="mt-6 grid gap-6">
                <Section title="You">
                    <Row label="Name" action={ACTION}>
                        <Bar w="w-32" />
                    </Row>
                </Section>
                <Section title="Signing in">
                    <Row label="Email" action={ACTION}>
                        <Bar w="w-40" />
                    </Row>
                    <Row label="Password" action={ACTION}>
                        <Bar w="w-12" />
                    </Row>
                    <Row label="Devices" action={ACTION}>
                        <Bar w="w-36" />
                    </Row>
                </Section>
                <Section title="Leaving Saroh">
                    <Row label="Delete account" action={ACTION}>
                        <Bar w="w-64" />
                    </Row>
                </Section>
            </div>
        </div>
    );
}

/** Your businesses: its header, then the list's card of rows. */
export function BusinessesLoading() {
    return (
        <div className="max-w-[760px]" aria-busy="true" aria-live="polite">
            <span className="sr-only">Loading your businesses</span>
            <PageHeader
                title="Your businesses"
                description="What you can do in each depends on the role that business gave you."
                actions={<Skeleton aria-hidden className="h-10 w-[8.5rem]" />}
            />
            <ListCard main="Yours" end="Open" className="mt-6">
                {[0, 1, 2].map((i) => (
                    <li key={i} aria-hidden>
                        <ListRow
                            title={
                                <span className="skeleton-sweep bg-muted inline-block h-3 w-40 rounded-[4px] align-middle" />
                            }
                            sub={
                                <span className="bg-muted/70 inline-block h-2 w-64 max-w-full rounded-[4px] align-middle" />
                            }
                            end={<Skeleton className="h-8 w-14" />}
                        />
                    </li>
                ))}
            </ListCard>
        </div>
    );
}
