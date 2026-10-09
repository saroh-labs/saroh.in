import { Badge } from "@saroh/ui/badge";
import { SplitPanel, SplitShell } from "@saroh/ui/split-shell";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { chooseOrganization } from "@/lib/organizations/actions";
import {
    chooseNotice,
    chooserGroups,
    chooserSkips,
    lifecycleLabel,
    PAUSED_LABEL,
    PAUSED_NOTE,
} from "@/lib/organizations/choose";
import type {
    Organization,
    OrganizationRole,
} from "@/lib/organizations/service";
import { listOrganizations } from "@/lib/organizations/service";
import { requireSession } from "@/lib/session";

export const metadata: Metadata = {
    title: "Which business?",
    description: "Choose the business to work in.",
};

const ROLE_LABEL: Record<OrganizationRole, string> = {
    OWNER: "Owner",
    ADMIN: "Admin",
    MEMBER: "Member",
    REVIEWER: "Reviewer",
};

/**
 * Which business, asked once.
 *
 * Someone who has just taken an invitation is now reachable in two places —
 * their own and the one they were invited to — and the workspace used to
 * simply pick for them: the `active_org` cookie, or the first row of the list.
 * That is fine as a default DURING a session and wrong at the start of one,
 * because the person who just accepted an invitation is the person most likely
 * to be dropped somewhere they did not mean to be.
 *
 * This is the landing decision, not the switcher. The switcher in the top bar
 * stays what it is — a change of mind, always to hand. This page is asked
 * before there is anything to change your mind about, which is why it wears
 * the split rather than the workspace chrome.
 *
 * One business means there is no question to ask, so the page steps out of the
 * way. None means the funnel, not the chooser.
 *
 * Two things it says rather than hides (UX-084): a business that isn't open
 * (suspended, closing or closed) is listed after the live ones, under its
 * own heading, with its state; and a link to a business they're not in
 * (`/open/…`, refused) lands here with a line that says so — even with one
 * business or none, so the line is read before anything else happens.
 */
export default async function ChoosePage({
    searchParams,
}: {
    searchParams: Promise<{ notice?: string | string[] }>;
}) {
    await requireSession();
    const [organizations, query] = await Promise.all([
        listOrganizations(),
        searchParams,
    ]);
    const notice = chooseNotice(query.notice);

    // One business is not a choice. Straight through — and without writing the
    // cookie, which a render may not do: `resolveActiveOrganization` already
    // falls back to the only membership there is.
    const skip = chooserSkips(organizations.length, notice);
    if (skip) redirect(skip);

    const {
        owned,
        invited: guest,
        closed,
        paused,
    } = chooserGroups(organizations);

    return (
        <SplitShell
            panel={
                <SplitPanel
                    eyebrow="Where to"
                    heading="You are in more than one business."
                    body="Pick the one you want to work in. Everything — the sidebar, what you can change, what you can see — follows from it."
                    points={[
                        "Your role can differ in each",
                        "Nothing is shared between them except you",
                        "The switcher at the top changes it any time",
                    ]}
                />
            }
        >
            <h1 className="sa-rise font-display text-[25px] font-semibold leading-[1.15] tracking-[-0.03em]">
                Which business?
            </h1>
            <p className="sa-rise mb-[22px] mt-[7px] text-pretty text-[13px] leading-[1.55] text-neutral-600 dark:text-muted-foreground">
                You can change this whenever you like.
            </p>
            {notice ? (
                <p
                    role="status"
                    className="sa-rise -mt-2.5 mb-[22px] text-pretty rounded-[9px] bg-muted px-[13px] py-[11px] text-[13px] leading-[1.55] text-foreground"
                >
                    {notice}
                </p>
            ) : null}

            {owned.length > 0 ? (
                <Group label="Your businesses" organizations={owned} />
            ) : null}
            {guest.length > 0 ? (
                <Group
                    label="Invited to"
                    organizations={guest}
                    spaced={owned.length > 0}
                />
            ) : null}
            {closed.length > 0 ? (
                <Group
                    label="Not open"
                    note="Read-only: what they hold is kept, and nothing new can happen in them."
                    organizations={closed}
                    spaced={owned.length + guest.length > 0}
                />
            ) : null}
            {paused.length > 0 ? (
                <Group
                    label={PAUSED_LABEL}
                    note={PAUSED_NOTE}
                    organizations={paused}
                    spaced={owned.length + guest.length + closed.length > 0}
                    closedDoor
                />
            ) : null}

            <p className="sa-rise mt-5 text-[12.5px] text-muted-foreground">
                Starting something new?{" "}
                <Link
                    href="/onboarding"
                    className="text-foreground underline-offset-4 transition-colors hover:underline"
                >
                    Add a business
                </Link>
            </p>
        </SplitShell>
    );
}

/**
 * Owned and invited are listed apart for the reason the switcher lists them
 * apart: the second kind is somebody else's business, and knowing that before
 * you walk in is worth a heading.
 */
function Group({
    label,
    note,
    organizations,
    spaced,
    closedDoor,
}: {
    label: string;
    /** A line under the heading, for what the group has in common. */
    note?: string;
    organizations: Organization[];
    spaced?: boolean;
    /**
     * Their access is paused (#800): listed so they know it's there, but
     * not offered as a door — opening it would only be refused.
     */
    closedDoor?: boolean;
}) {
    if (closedDoor) {
        return (
            <div className={spaced ? "mt-5" : undefined}>
                <p className="sa-rise mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                    {label}
                </p>
                {note ? (
                    <p className="sa-rise -mt-1 mb-2 text-pretty text-[12.5px] leading-[1.5] text-muted-foreground">
                        {note}
                    </p>
                ) : null}
                <ul className="flex flex-col gap-2">
                    {organizations.map((org) => (
                        <li
                            key={org.id}
                            className="sa-rise flex items-center gap-[11px] rounded-[9px] border border-input bg-muted px-[13px] py-[11px]"
                        >
                            <span
                                aria-hidden
                                className="flex size-[30px] shrink-0 items-center justify-center rounded-lg bg-card font-display text-[12.5px] font-semibold text-muted-foreground"
                            >
                                {org.name.trim().charAt(0).toUpperCase()}
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-[13.5px] font-medium text-muted-foreground">
                                    {org.name}
                                </span>
                                <span className="block text-[11.5px] text-muted-foreground">
                                    {org.roleLabel ?? ROLE_LABEL[org.role]}
                                </span>
                            </span>
                            <Badge variant="neutral" className="shrink-0">
                                {PAUSED_LABEL}
                            </Badge>
                        </li>
                    ))}
                </ul>
            </div>
        );
    }
    return (
        <div className={spaced ? "mt-5" : undefined}>
            <p className="sa-rise mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                {label}
            </p>
            {note ? (
                <p className="sa-rise -mt-1 mb-2 text-pretty text-[12.5px] leading-[1.5] text-muted-foreground">
                    {note}
                </p>
            ) : null}
            <ul className="flex flex-col gap-2">
                {organizations.map((org) => (
                    <li key={org.id}>
                        <form action={chooseOrganization}>
                            <input
                                type="hidden"
                                name="organizationId"
                                value={org.id}
                            />
                            <button
                                type="submit"
                                className="sa-rise flex w-full items-center gap-[11px] rounded-[9px] border border-input bg-card px-[13px] py-[11px] text-left transition-colors duration-fast hover:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                            >
                                <span
                                    aria-hidden
                                    className="flex size-[30px] shrink-0 items-center justify-center rounded-lg bg-muted font-display text-[12.5px] font-semibold text-neutral-700 dark:text-foreground"
                                >
                                    {org.name.trim().charAt(0).toUpperCase()}
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-[13.5px] font-medium">
                                        {org.name}
                                    </span>
                                    <span className="block text-[11.5px] text-muted-foreground">
                                        {org.roleLabel ?? ROLE_LABEL[org.role]}
                                    </span>
                                </span>
                                {lifecycleLabel(org.lifecycleStatus) ? (
                                    <Badge
                                        variant="neutral"
                                        className="shrink-0"
                                    >
                                        {lifecycleLabel(org.lifecycleStatus)}
                                    </Badge>
                                ) : null}
                            </button>
                        </form>
                    </li>
                ))}
            </ul>
        </div>
    );
}
