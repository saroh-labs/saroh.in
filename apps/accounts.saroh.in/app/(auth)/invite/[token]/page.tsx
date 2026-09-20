import { Button } from "@saroh/ui/button";
import { SplitPanel, SplitShell } from "@saroh/ui/split-shell";
import { ThemeToggle } from "@saroh/ui/theme-toggle";
import type { Metadata } from "next";
import Link from "next/link";

import { INVITE_PANEL } from "@/components/auth/panel-copy";
import { ROLE_MEANS, getInvitation } from "@/lib/invitations";

export const metadata: Metadata = {
    title: "You have been invited | Saroh",
    description: "Someone has invited you to their business on Saroh.",
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
 * the flow design set out to fix — so this page names the business, who asked,
 * the role, and what that role can actually do, and only then offers the two
 * doors.
 *
 * Nothing is accepted here. Accepting needs a session and happens on the
 * workspace host; this page carries the token through sign-up or log-in so the
 * person lands back on it.
 */
export default async function InvitePage({
    params,
}: {
    params: Promise<{ token: string }>;
}) {
    const { token } = await params;
    const invitation = await getInvitation(token);

    if (!invitation) {
        return (
            <SplitShell action={<ThemeToggle />}>
                <h1 className="sa-rise font-display text-[25px] font-semibold leading-[1.15] tracking-[-0.03em]">
                    This invitation is no longer valid
                </h1>
                <p className="sa-rise dark:text-muted-foreground mb-[22px] mt-[7px] text-pretty text-[13px] leading-[1.55] text-neutral-600">
                    It may have been withdrawn, already used, or simply run out.
                    Whoever invited you can send another.
                </p>
                <p className="sa-rise text-muted-foreground text-[12.5px]">
                    <Link
                        href="/login"
                        className="text-foreground underline-offset-4 transition-colors hover:underline"
                    >
                        Log in
                    </Link>{" "}
                    if you already have an account.
                </p>
            </SplitShell>
        );
    }

    // The account has to be the one the invitation was sent to — `accept`
    // refuses any other — so both doors carry the address as well as the token.
    const carry =
        `?redirect=${encodeURIComponent(`/invite/${token}`)}` +
        `&email=${encodeURIComponent(invitation.email)}`;

    return (
        <SplitShell
            action={<ThemeToggle />}
            panel={<SplitPanel {...INVITE_PANEL} />}
        >
            <p className="sa-rise text-muted-foreground text-[11px] font-semibold uppercase tracking-[0.1em]">
                {invitation.invitedByName
                    ? `${invitation.invitedByName} invited you`
                    : "You have been invited"}
            </p>
            <h1 className="sa-rise font-display mt-2 text-[25px] font-semibold leading-[1.15] tracking-[-0.03em]">
                {invitation.organizationName}
            </h1>
            <p className="sa-rise dark:text-muted-foreground mt-[7px] text-pretty text-[13px] leading-[1.55] text-neutral-600">
                as {ROLE_LABEL[invitation.role]}, at{" "}
                <span className="font-mono text-[12.5px]">
                    {invitation.email}
                </span>
            </p>

            <div className="sa-rise bg-muted mb-[22px] mt-4 rounded-[9px] px-[13px] py-[11px]">
                <p className="dark:text-muted-foreground text-pretty text-[12.5px] leading-[1.5] text-neutral-600">
                    {ROLE_MEANS[invitation.role]}
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
                    className="text-foreground underline-offset-4 transition-colors hover:underline"
                >
                    Log in
                </Link>
            </p>
        </SplitShell>
    );
}
