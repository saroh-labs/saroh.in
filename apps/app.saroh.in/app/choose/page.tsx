import { SplitPanel, SplitShell } from "@saroh/ui/split-shell";
import { ThemeToggle } from "@saroh/ui/theme-toggle";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { chooseOrganization } from "@/lib/organizations/actions";
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
 */
export default async function ChoosePage() {
    await requireSession();
    const organizations = await listOrganizations();

    if (organizations.length === 0) redirect("/onboarding");
    // One business is not a choice. Straight through — and without writing the
    // cookie, which a render may not do: `resolveActiveOrganization` already
    // falls back to the only membership there is.
    if (organizations.length === 1) redirect("/");

    const owned = organizations.filter((o) => o.role === "OWNER");
    const guest = organizations.filter((o) => o.role !== "OWNER");

    return (
        <SplitShell
            action={<ThemeToggle />}
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
    organizations,
    spaced,
}: {
    label: string;
    organizations: Organization[];
    spaced?: boolean;
}) {
    return (
        <div className={spaced ? "mt-5" : undefined}>
            <p className="sa-rise mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                {label}
            </p>
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
                                        {ROLE_LABEL[org.role]}
                                    </span>
                                </span>
                            </button>
                        </form>
                    </li>
                ))}
            </ul>
        </div>
    );
}
