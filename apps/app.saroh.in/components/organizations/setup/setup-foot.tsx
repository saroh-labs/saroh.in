"use client";

import { authClient } from "@saroh/auth/client";
import { Button } from "@saroh/ui/button";
import { ProgressBar } from "@saroh/ui/progress-bar";
import Link from "next/link";

import { accountsLoginUrl } from "@/lib/accounts";
import { clearSetupDraft } from "@/lib/organizations/setup-steps";

/**
 * The foot of every setup step, in the same order on each: how far along
 * (a thin bar the width of the column), then a quiet Back on the left and
 * the step's button on the right, then who is signed in and the way out.
 *
 * It sits right under the step's own content, never pinned to the window.
 * On a phone Back and the button stack full width with the button on top,
 * each a full touch target (`Button` grows to 44px for a touch pointer).
 *
 * The step's button is the form's one submit, so Enter in a field presses
 * it. Back is a plain button, or a link when the first step has a
 * workspace behind it.
 */
export function SetupFoot({
    position,
    count,
    primary,
    busy,
    holding,
    onBack,
    backTo,
    email,
}: {
    position: { now: number; of: number };
    /** "Step 2 of 4": what the bar measures, said to a screen reader. */
    count: string;
    /** The step's button: Continue, or the create on the last step. */
    primary: string;
    /** The business is being made. */
    busy: boolean;
    /** Continue is waiting for the web address's answer. */
    holding: boolean;
    /** To the step before. Absent on the first step. */
    onBack?: () => void;
    /** The first step's Back, when there is a workspace to go back to. */
    backTo?: string;
    email: string;
}) {
    return (
        <>
            <ProgressBar
                className="mt-9"
                size="xs"
                value={position.now}
                max={position.of}
                label={count}
            />
            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
                {onBack ? (
                    <Button
                        type="button"
                        variant="ghost"
                        className="sm:-ml-4 sm:mr-auto"
                        disabled={busy}
                        onClick={onBack}
                    >
                        Back
                    </Button>
                ) : backTo ? (
                    <Button
                        asChild
                        variant="ghost"
                        className="sm:-ml-4 sm:mr-auto"
                    >
                        <Link href={backTo}>Back</Link>
                    </Button>
                ) : null}
                <Button
                    type="submit"
                    className="wk-press sm:min-w-[9.5rem]"
                    busy={busy || holding}
                    busyLabel={holding ? "Checking…" : "Setting up…"}
                >
                    {primary}
                </Button>
            </div>

            <p className="mt-6 text-[12px] text-muted-foreground">
                Signed in as{" "}
                <span className="text-foreground" data-ph-mask="">
                    {email}
                </span>{" "}
                ·{" "}
                <Button
                    variant="link"
                    size="inline"
                    type="button"
                    onClick={() => {
                        // The draft is this account's: it goes with it.
                        clearSetupDraft();
                        void authClient.signOut().then(() => {
                            window.location.href = accountsLoginUrl;
                        });
                    }}
                >
                    Sign out
                </Button>
            </p>
        </>
    );
}
