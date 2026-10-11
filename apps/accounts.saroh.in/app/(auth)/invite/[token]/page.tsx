import { Button } from "@saroh/ui/button";
import { SplitPanel, SplitShell } from "@saroh/ui/split-shell";
import type { Metadata } from "next";
import Link from "next/link";

import { INVITE_PANEL } from "@/components/auth/panel-copy";
import { getAppUrl } from "@/lib/app-urls";
import {
    INVITATION_GONE,
    INVITATION_UNREACHABLE,
    ROLE_MEANS,
    getInvitation,
} from "@/lib/invitations";

// The link is a credential, and the page behind it names a business, who
// asked and a role to anyone who holds it. So the tab and a pasted link's
// preview say only this, never the business or the person; and the page
// sends no referrer, so the token never leaves in a Referer header to
// anything it links to (as a pay link does, saroh.app `pay/[token]`).
export const metadata: Metadata = {
    title: "You have been invited",
    description: "Someone has invited you to their business on Saroh.",
    referrer: "no-referrer",
};

const ROLE_LABEL = {
    OWNER: "Owner",
    ADMIN: "Admin",
    MEMBER: "Member",
    REVIEWER: "Reviewer",
} as const;

/**
 * The invitation, before the account.
 *
 * Someone following this link may never have heard of Saroh. Asking them to
 * create an account and only then telling them what they joined is the thing
 * the flow design set out to fix. So this page names the business, who asked,
 * the role, and what that role can actually do, and only then offers the two
 * doors.
 *
 * Nothing is accepted here. Accepting needs a session and happens on the
 * app's host. This page carries the token through sign-up or sign-in so the
 * person lands back on it.
 *
 * An invitation that cannot be shown and an API that did not answer are two
 * states with two ways on (`lib/invitations.ts`): the first is over, the
 * second is worth trying again.
 */
export default async function InvitePage({
    params,
}: {
    params: Promise<{ token: string }>;
}) {
    const { token } = await params;
    const read = await getInvitation(token);

    if (read.status === "unreachable") {
        return (
            <SplitShell>
                <h1 className="sa-rise font-display text-[25px] font-semibold leading-[1.15] tracking-[-0.03em]">
                    {INVITATION_UNREACHABLE.title}
                </h1>
                <p
                    role="alert"
                    className="sa-rise dark:text-muted-foreground mb-[22px] mt-[7px] text-pretty text-[13px] leading-[1.55] text-neutral-600"
                >
                    {INVITATION_UNREACHABLE.description}
                </p>
                <Button
                    asChild
                    className="sa-cta h-10 w-full rounded-[9px] text-[13.5px] font-semibold"
                >
                    {/* A plain link on purpose: a full load of this page is
                        what asks the API again. */}
                    <a href={`/invite/${encodeURIComponent(token)}`}>
                        Try again
                    </a>
                </Button>
            </SplitShell>
        );
    }

    if (read.status === "gone") {
        return (
            <SplitShell>
                <h1 className="sa-rise font-display text-[25px] font-semibold leading-[1.15] tracking-[-0.03em]">
                    {INVITATION_GONE.title}
                </h1>
                <p className="sa-rise dark:text-muted-foreground mb-[22px] mt-[7px] text-pretty text-[13px] leading-[1.55] text-neutral-600">
                    {INVITATION_GONE.description}
                </p>
                <p className="sa-rise text-muted-foreground text-[12.5px]">
                    <Link
                        href="/login"
                        className="text-foreground decoration-border-strong hover:decoration-foreground active:text-muted-foreground underline underline-offset-4 transition-colors"
                    >
                        Sign in
                    </Link>{" "}
                    if you already have an account.
                </p>
            </SplitShell>
        );
    }

    const { invitation } = read;

    // Both doors carry where this ends, not where it started. `/join/:token`
    // on the app's host is the route that ACCEPTS. Coming back here would
    // only redraw this page and its two doors, forever. It is an absolute URL
    // on a trusted origin, which `safeDestination` passes and the sign-in form
    // knows to reach with a full navigation rather than the client router.
    //
    // The account has to be the one the invitation was sent to (`accept`
    // refuses any other), so the address rides along and fills the field in.
    const carry =
        `?redirect=${encodeURIComponent(`${getAppUrl()}/join/${token}`)}` +
        `&email=${encodeURIComponent(invitation.email)}`;

    return (
        <SplitShell panel={<SplitPanel {...INVITE_PANEL} />}>
            <p className="sa-rise text-muted-foreground text-[11px] font-semibold uppercase tracking-[0.1em]">
                {invitation.invitedByName
                    ? `${invitation.invitedByName} invited you`
                    : "You have been invited"}
            </p>
            <h1 className="sa-rise font-display mt-2 text-[25px] font-semibold leading-[1.15] tracking-[-0.03em]">
                {invitation.organizationName}
            </h1>
            <p className="sa-rise dark:text-muted-foreground mt-[7px] text-pretty text-[13px] leading-[1.55] text-neutral-600">
                as {invitation.roleLabel ?? ROLE_LABEL[invitation.role]}, at{" "}
                <span className="font-mono text-[12.5px]">
                    {invitation.email}
                </span>
            </p>

            <div className="sa-rise bg-muted mb-[22px] mt-4 rounded-[9px] px-[13px] py-[11px]">
                {/* A role the business made is described by what it GRANTS,
                    the only true thing to say about it. Describing it as the
                    built-in it maps to would tell someone they are joining
                    with powers they will not have. */}
                <p className="dark:text-muted-foreground text-pretty text-[12.5px] leading-[1.5] text-neutral-600">
                    {invitation.grants
                        ? invitation.grants.length === 0
                            ? `${invitation.roleLabel ?? "This role"} was made by ${invitation.organizationName}, and does not grant anything yet.`
                            : `${invitation.roleLabel ?? "This role"} was made by ${invitation.organizationName}. It can: ${invitation.grants.join(", ").toLowerCase()}.`
                        : ROLE_MEANS[invitation.role]}
                </p>
            </div>

            <Button
                asChild
                className="sa-cta h-10 w-full rounded-[9px] text-[13.5px] font-semibold"
            >
                <Link href={`/signup${carry}`}>Create an account to join</Link>
            </Button>
            <p className="sa-rise text-muted-foreground mt-5 text-[12.5px]">
                Already have one?{" "}
                <Link
                    href={`/login${carry}`}
                    className="text-foreground decoration-border-strong hover:decoration-foreground active:text-muted-foreground underline underline-offset-4 transition-colors"
                >
                    Sign in
                </Link>
            </p>
        </SplitShell>
    );
}
