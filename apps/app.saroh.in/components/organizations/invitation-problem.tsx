import { Button } from "@saroh/ui/button";
import { EmptyState, FailedState } from "@saroh/ui/data-state";
import Link from "next/link";

import { accountsLoginUrl } from "@/lib/accounts";
import type { InvitationProblem } from "@/lib/invitations/outcome";
import {
    INVITATION_GONE,
    INVITATION_REFUSED_TITLE,
    INVITATION_UNREACHABLE,
    INVITATION_WRONG_PERSON_TITLE,
    switchAccountLabel,
    wrongPersonDescription,
} from "@/lib/invitations/outcome";

import { SwitchAccountButton } from "./switch-account-button";

/**
 * An invitation that was not accepted, for a business's (`/join/:token`) and
 * a location's (`/invitations/:token`): what happened and the way on. The
 * states and their words are `lib/invitations/outcome.ts`.
 */
export function InvitationProblemView({
    problem,
    refusal,
    invitedEmail,
    signedInEmail,
    retryHref,
    signInAs,
}: {
    problem: InvitationProblem;
    /** The API's guarded message, shown for `refused` only. */
    refusal?: string;
    /** Who it was sent to, when the page could find out. */
    invitedEmail?: string | null;
    signedInEmail?: string | null;
    /** This page's own path: trying again is loading it again. */
    retryHref: string;
    /** Where signing in as the invited person starts, when the page knows. */
    signInAs?: string;
}) {
    const home = (
        <Button asChild variant={problem === "gone" ? "brand" : "outline"}>
            <Link href="/">Go to Home</Link>
        </Button>
    );

    return (
        <main className="mx-auto flex min-h-[60vh] max-w-lg items-center p-8">
            {problem === "unreachable" ? (
                <FailedState
                    className="w-full"
                    title={INVITATION_UNREACHABLE.title}
                    description={INVITATION_UNREACHABLE.description}
                    action={
                        <Button asChild variant="brand">
                            {/* A plain link on purpose: a full load of this
                                page is what asks the API again. */}
                            <a href={retryHref}>Try again</a>
                        </Button>
                    }
                />
            ) : problem === "wrong-person" ? (
                <EmptyState
                    className="w-full"
                    title={INVITATION_WRONG_PERSON_TITLE}
                    description={wrongPersonDescription(
                        invitedEmail,
                        signedInEmail,
                    )}
                    action={
                        <div className="flex flex-wrap justify-center gap-2">
                            <SwitchAccountButton
                                label={switchAccountLabel(invitedEmail)}
                                next={signInAs}
                                signInUrl={accountsLoginUrl}
                            />
                            {home}
                        </div>
                    }
                />
            ) : problem === "gone" ? (
                <EmptyState
                    className="w-full"
                    title={INVITATION_GONE.title}
                    description={INVITATION_GONE.description}
                    action={home}
                />
            ) : (
                <EmptyState
                    className="w-full"
                    title={INVITATION_REFUSED_TITLE}
                    description={refusal}
                    action={home}
                />
            )}
        </main>
    );
}
