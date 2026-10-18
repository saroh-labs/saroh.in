"use client";

import { Button } from "@saroh/ui/button";
import { useState, useTransition } from "react";

import { acceptStaffInviteAction } from "@/app/staff-invite/actions";
import { authClient } from "@/lib/auth.client";
import type { StaffInviteAcceptResult } from "@/lib/staff-invite-words";
import { STAFF_INVITE_COPY, STAFF_INVITE_PATH } from "@/lib/staff-invite-words";

/**
 * The one action on a staff invite: Join the team. The answer replaces the
 * button: the way into the console once joined, or why not and what to do.
 * A refusal whose fix is another account offers Sign out, which comes back
 * here to sign in again (the invite's cookie stays for its hour).
 */
export function AcceptStaffInvite({
    consoleUrl,
    email,
}: {
    consoleUrl: string;
    email: string;
}) {
    const [pending, startTransition] = useTransition();
    const [result, setResult] = useState<StaffInviteAcceptResult | null>(null);

    if (result?.ok) {
        return (
            <div role="status" className="sa-rise">
                <h2 className="font-display text-[18px] font-semibold">
                    {STAFF_INVITE_COPY.joined.title}
                </h2>
                <p className="dark:text-muted-foreground mb-[18px] mt-[6px] text-pretty text-[13px] leading-[1.55] text-neutral-600">
                    {STAFF_INVITE_COPY.joined.description}
                </p>
                <Button
                    asChild
                    className="sa-cta h-10 w-full rounded-[9px] text-[13.5px] font-semibold"
                >
                    <a href={consoleUrl}>Open the console</a>
                </Button>
            </div>
        );
    }

    return (
        <div>
            {result ? (
                <div
                    role="alert"
                    className="bg-muted sa-rise mb-4 rounded-[9px] px-[13px] py-[11px]"
                >
                    <p className="text-[13px] font-semibold">{result.title}</p>
                    <p className="dark:text-muted-foreground mt-1 text-pretty text-[12.5px] leading-[1.5] text-neutral-600">
                        {result.description}
                    </p>
                </div>
            ) : null}
            {result?.signOut ? (
                <SignOutAndReturn email={email} />
            ) : result?.final ? null : (
                <Button
                    className="sa-cta h-10 w-full rounded-[9px] text-[13.5px] font-semibold"
                    disabled={pending}
                    onClick={() =>
                        startTransition(async () => {
                            setResult(await acceptStaffInviteAction());
                        })
                    }
                >
                    {pending ? "Joining…" : "Join the team"}
                </Button>
            )}
        </div>
    );
}

/**
 * Sign out, then sign in again as the invite's address and come back here.
 * The invite's cookie stays for its hour, so the page picks up where it was.
 */
export function SignOutAndReturn({ email }: { email: string }) {
    const [pending, startTransition] = useTransition();
    return (
        <Button
            variant="outline"
            className="h-10 w-full rounded-[9px] text-[13.5px] font-semibold"
            disabled={pending}
            onClick={() =>
                startTransition(async () => {
                    await authClient.signOut();
                    // A full load: the sign-in page reads the session afresh.
                    window.location.assign(
                        `/login?redirect=${encodeURIComponent(STAFF_INVITE_PATH)}&email=${encodeURIComponent(email)}`,
                    );
                })
            }
        >
            {pending ? "Signing out…" : "Sign out and use another account"}
        </Button>
    );
}
