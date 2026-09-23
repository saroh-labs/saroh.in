import { resolveServerSession } from "@saroh/auth/next";
import { Badge } from "@saroh/ui/badge";
import { SplitPanel, SplitShell } from "@saroh/ui/split-shell";
import {
    ArrowUpRight,
    ChevronRight,
    ShieldCheck,
    UserRound,
} from "lucide-react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { SignOut } from "@/components/businesses/sign-out";
import { getOnboardingUrl } from "@/lib/app-urls";
import type { Business } from "@/lib/businesses";
import {
    consoleUrl,
    isStaff,
    listBusinesses,
    openBusinessUrl,
    ROLE_LABEL,
    ROLE_SHORT,
} from "@/lib/businesses";

export const metadata: Metadata = {
    title: "Your businesses | Saroh",
    description:
        "Choose a business to open, see your role in each, and manage your account.",
};

const STATE: Record<
    string,
    { label: string; variant: "warning" | "error" } | undefined
> = {
    SUSPENDED: { label: "Suspended", variant: "warning" },
    PENDING_DELETION: { label: "Closing", variant: "error" },
};

/**
 * Where a person lands after signing in: every business they belong to, the
 * role they hold in each, and the way into their own account. Choosing a
 * business happens here, one place for every app; the workspace's switcher
 * is only a shortcut to the same choice.
 */
export default async function BusinessesPage() {
    const result = await resolveServerSession(await headers());
    if (result.status === "anonymous") redirect("/login?redirect=/businesses");
    if (result.status === "unavailable") {
        throw new Error("Could not check your session. Try again in a moment.");
    }
    const { user } = result.session;

    const [businesses, staff] = await Promise.all([
        listBusinesses(),
        isStaff(),
    ]);
    // Nobody to choose between yet: straight on to setting one up.
    if (businesses.length === 0 && !staff) redirect(getOnboardingUrl());

    const owned = businesses.filter((b) => b.role === "OWNER");
    const invited = businesses.filter((b) => b.role !== "OWNER");
    const firstName = user.name?.trim().split(/\s+/)[0];

    return (
        <SplitShell
            panel={
                <SplitPanel
                    eyebrow="Your account"
                    heading="One sign-in, every business you belong to."
                    body="Open any of them from here. What you can do in each depends on the role that business gave you."
                    points={[
                        "Your role can differ in each",
                        "Nothing is shared between them except you",
                        "Your profile and sign-in live here, not in any one business",
                    ]}
                />
            }
        >
            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
                <div className="min-w-0">
                    <h1 className="sa-rise font-display text-[25px] font-semibold leading-[1.15] tracking-[-0.03em]">
                        {firstName ? `Hello, ${firstName}` : "Your businesses"}
                    </h1>
                    <p className="sa-rise text-muted-foreground mt-[7px] truncate text-[13px] leading-[1.55]">
                        Signed in as {user.email}
                    </p>
                </div>
                <SignOut />
            </div>

            <div className="mt-[22px] grid gap-5">
                {owned.length > 0 && (
                    <Group label="Your businesses" businesses={owned} />
                )}
                {invited.length > 0 && (
                    <Group label="Invited to" businesses={invited} />
                )}
                {businesses.length === 0 && (
                    <p className="text-muted-foreground text-[13px]">
                        You do not belong to a business yet.
                    </p>
                )}

                <p className="sa-rise text-muted-foreground text-[12.5px]">
                    Starting something new?{" "}
                    <a
                        href={getOnboardingUrl()}
                        className="text-foreground underline-offset-4 hover:underline"
                    >
                        Add a business
                    </a>
                </p>

                <div>
                    <p className="sa-rise text-muted-foreground mb-2 text-[11px] font-semibold uppercase tracking-[0.1em]">
                        You
                    </p>
                    <ul className="flex flex-col gap-2">
                        <li>
                            <Row
                                href="/account"
                                icon={<UserRound className="size-4" />}
                                title="Profile and sign-in"
                                detail="Your name, email, password and where you are signed in"
                            />
                        </li>
                        {staff && (
                            <li>
                                <Row
                                    href={consoleUrl()}
                                    external
                                    icon={<ShieldCheck className="size-4" />}
                                    title="Console"
                                    detail="Run this instance: its businesses, people and machinery"
                                />
                            </li>
                        )}
                    </ul>
                </div>
            </div>
        </SplitShell>
    );
}

function Group({
    label,
    businesses,
}: {
    label: string;
    businesses: Business[];
}) {
    return (
        <div>
            <p className="sa-rise text-muted-foreground mb-2 text-[11px] font-semibold uppercase tracking-[0.1em]">
                {label}
            </p>
            <ul className="flex flex-col gap-2">
                {businesses.map((business) => {
                    const state = STATE[business.lifecycleStatus];
                    return (
                        <li key={business.id}>
                            <Row
                                href={openBusinessUrl(business.id)}
                                external
                                icon={
                                    <span className="font-display text-[12.5px] font-semibold">
                                        {business.name
                                            .trim()
                                            .charAt(0)
                                            .toUpperCase()}
                                    </span>
                                }
                                title={business.name}
                                detail={
                                    business.roleLabel
                                        ? `${business.roleLabel} — a role this business made`
                                        : `${ROLE_LABEL[business.role]} · ${ROLE_SHORT[business.role]}`
                                }
                                badge={state}
                            />
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}

/** One row: a square mark, a title and a line under it, and where it goes. */
function Row({
    href,
    external = false,
    icon,
    title,
    detail,
    badge,
}: {
    href: string;
    external?: boolean;
    icon: React.ReactNode;
    title: string;
    detail: string;
    badge?: { label: string; variant: "warning" | "error" };
}) {
    const className =
        "sa-rise flex w-full items-center gap-[11px] rounded-[9px] border border-input bg-card px-[13px] py-[11px] text-left transition-colors duration-fast hover:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";
    const body = (
        <>
            <span
                aria-hidden
                className="bg-muted dark:text-foreground flex size-[30px] shrink-0 items-center justify-center rounded-lg text-neutral-700"
            >
                {icon}
            </span>
            {/* Divs, not spans: a Badge renders a div. */}
            <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-[13.5px] font-medium">
                        {title}
                    </span>
                    {badge && (
                        <Badge variant={badge.variant}>{badge.label}</Badge>
                    )}
                </div>
                <span className="text-muted-foreground block text-[11.5px] leading-snug">
                    {detail}
                </span>
            </div>
            {external ? (
                <ArrowUpRight
                    aria-hidden
                    className="text-muted-foreground size-4 shrink-0"
                />
            ) : (
                <ChevronRight
                    aria-hidden
                    className="text-muted-foreground size-4 shrink-0"
                />
            )}
        </>
    );
    return external ? (
        <a href={href} className={className}>
            {body}
        </a>
    ) : (
        <Link href={href} className={className}>
            {body}
        </Link>
    );
}
