import { resolveServerSession } from "@saroh/auth/next";
import { Button } from "@saroh/ui/button";
import { SplitPanel, SplitShell } from "@saroh/ui/split-shell";
import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import Link from "next/link";

import { STAFF_INVITE_PANEL } from "@/components/auth/panel-copy";
import {
    AcceptStaffInvite,
    SignOutAndReturn,
} from "@/components/staff-invite/accept-staff-invite";
import { consoleUrl } from "@/lib/businesses";
import { readStaffInvite, staffInviteToken } from "@/lib/staff-invite";
import type { StaffInvitePreview } from "@/lib/staff-invite-words";
import {
    doneWords,
    rolesInWords,
    STAFF_INVITE_COPY,
    STAFF_INVITE_DONE_COOKIE,
    STAFF_INVITE_PATH,
    staffInviteDoneOf,
    staffInviteScreen,
    WORKS_AS_LABEL,
} from "@/lib/staff-invite-words";

// The tab and a pasted address's preview say only this, never who sent it
// or which roles; the page sends no referrer to anything it links to (also
// a header, next.config.mjs); and error tracking leaves it out
// (`lib/untracked-pages.ts`). The token itself is never in this address:
// `open/route.ts` swapped it for an httpOnly cookie.
export const metadata: Metadata = {
    title: "Join Saroh's team",
    description: "An invitation to work on Saroh's console.",
    referrer: "no-referrer",
};

const BODY =
    "dark:text-muted-foreground mt-[7px] text-pretty text-[13px] leading-[1.55] text-neutral-600";
const LINK =
    "text-foreground decoration-border-strong hover:decoration-foreground active:text-muted-foreground underline underline-offset-4 transition-colors";

/**
 * A staff invite, before and at the accept (admin console U24, R32).
 *
 * Who it is for, who sent it and the console roles it carries, then one
 * door: sign in or make an account with the invite's address (and come
 * back here), or, signed in as that address, Join the team. The API decides
 * the accept: the address must be the person's own, verified by their own
 * code, and the sender must still be able to add them.
 */
export default async function StaffInvitePage() {
    const token = await staffInviteToken();
    // Just used here: say how it ended (`actions.ts`), not "can't be used".
    const done = token
        ? null
        : staffInviteDoneOf(
              (await cookies()).get(STAFF_INVITE_DONE_COOKIE)?.value,
          );
    if (done === "joined") {
        return (
            <Notice {...STAFF_INVITE_COPY.joined}>
                <Button
                    asChild
                    className="sa-cta h-10 w-full rounded-[9px] text-[13.5px] font-semibold"
                >
                    <a href={consoleUrl()}>Open the console</a>
                </Button>
            </Notice>
        );
    }
    if (done) return <Notice {...doneWords(done)} />;
    const [read, session] = await Promise.all([
        token ? readStaffInvite(token) : Promise.resolve(null),
        resolveServerSession(await headers()),
    ]);
    const screen = staffInviteScreen({
        hasToken: Boolean(token),
        read,
        signedInAs:
            session.status === "authenticated"
                ? session.session.user.email
                : null,
    });

    switch (screen.kind) {
        case "no-link":
            return <Notice {...STAFF_INVITE_COPY.noLink} />;
        case "gone":
            return <Notice {...STAFF_INVITE_COPY.gone} />;
        case "unreachable":
            return (
                <Notice {...STAFF_INVITE_COPY.unreachable} alert>
                    <Button
                        asChild
                        className="sa-cta h-10 w-full rounded-[9px] text-[13.5px] font-semibold"
                    >
                        {/* A full load is what asks the API again. */}
                        <a href={STAFF_INVITE_PATH}>Try again</a>
                    </Button>
                </Notice>
            );
    }

    const { invite } = screen;
    const carry =
        `?redirect=${encodeURIComponent(STAFF_INVITE_PATH)}` +
        `&email=${encodeURIComponent(invite.email)}`;

    return (
        <SplitShell panel={<SplitPanel {...STAFF_INVITE_PANEL} />}>
            <InviteSummary invite={invite} />
            {screen.kind === "sign-in" ? (
                <>
                    <Button
                        asChild
                        className="sa-cta h-10 w-full rounded-[9px] text-[13.5px] font-semibold"
                    >
                        <Link href={`/login${carry}`}>Sign in to join</Link>
                    </Button>
                    <p className="sa-rise text-muted-foreground mt-5 text-[12.5px]">
                        No Saroh account yet?{" "}
                        <Link href={`/signup${carry}`} className={LINK}>
                            Create one with this email
                        </Link>
                    </p>
                </>
            ) : screen.kind === "wrong-account" ? (
                <div role="alert">
                    <p className={`${BODY} mb-4`}>
                        You&apos;re signed in as{" "}
                        <span className="font-mono text-[12.5px]">
                            {screen.signedInAs}
                        </span>
                        . This invite only works for{" "}
                        <span className="font-mono text-[12.5px]">
                            {invite.email}
                        </span>
                        . Sign out, then sign in with that address.
                    </p>
                    <SignOutAndReturn email={invite.email} />
                </div>
            ) : (
                <AcceptStaffInvite
                    consoleUrl={consoleUrl()}
                    email={invite.email}
                />
            )}
        </SplitShell>
    );
}

function InviteSummary({ invite }: { invite: StaffInvitePreview }) {
    return (
        <>
            <p className="sa-rise text-muted-foreground text-[11px] font-semibold uppercase tracking-[0.1em]">
                {invite.invitedByName
                    ? `${invite.invitedByName} invited you`
                    : "You have been invited"}
            </p>
            <h1 className="sa-rise font-display mt-2 text-[25px] font-semibold leading-[1.15] tracking-[-0.03em]">
                Join Saroh&apos;s team
            </h1>
            <p className={`sa-rise ${BODY}`}>
                {invite.name}, as{" "}
                {WORKS_AS_LABEL[invite.worksAs] ?? "part of the team"}, at{" "}
                <span className="font-mono text-[12.5px]">{invite.email}</span>
            </p>
            <div className="sa-rise bg-muted mb-[22px] mt-4 rounded-[9px] px-[13px] py-[11px]">
                <p className="dark:text-muted-foreground text-pretty text-[12.5px] leading-[1.5] text-neutral-600">
                    On the console you&apos;ll be {rolesInWords(invite.roles)}.
                    The link works once, with this email address.
                </p>
            </div>
        </>
    );
}

function Notice({
    title,
    description,
    alert,
    children,
}: {
    title: string;
    description: string;
    alert?: boolean;
    children?: React.ReactNode;
}) {
    return (
        <SplitShell>
            <h1 className="sa-rise font-display text-[25px] font-semibold leading-[1.15] tracking-[-0.03em]">
                {title}
            </h1>
            <p
                role={alert ? "alert" : undefined}
                className={`sa-rise ${BODY} mb-[22px]`}
            >
                {description}
            </p>
            {children}
        </SplitShell>
    );
}
