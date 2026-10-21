"use client";

import type { LookId } from "@saroh/block-contract";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import type { InlineCodeHandle } from "../booking-flow/inline-code";
import { InlineCode } from "../booking-flow/inline-code";
import { FRAME_PILL, lookPrimary } from "../booking-flow/look-styles";
import { cn } from "../lib/utils";
import type { SignInApi, SignInOptions } from "./api";
import { backWords } from "./look-account-words";
import type { SignInBack } from "./sign-in-return";
import { forgetSignInBack, readSignInBack } from "./sign-in-return";

/**
 * Signing in on the account's own page under a look (DEC-172, R9, plan
 * U12; boards VA18, VD18, VB18): one screen with the same words for every
 * email. Every address gets a 6-digit code and nothing says whether it is
 * new; an account is made on the first sign-in, without asking.
 *
 * The code is asked the booking's way (`booking-flow/inline-code.tsx`,
 * U10): sent when the email field is left or "Send me a code" is pressed,
 * the code field opening under the email with "Change", checked at the
 * sixth digit, a wrong code said in words and the field's edge, no shake,
 * and "Send a new code" after the API's wait.
 *
 * Signed in, it says so and goes back to the page the visitor was on
 * (`sign-in-return.ts`); opened straight (an email's link to their
 * messages), it stays on the account page that asked (UX-052).
 *
 * The page's title ("Sign in") is the frame's heading.
 */
export function LookSignIn({
    look,
    options,
    api,
    lead,
}: {
    look: LookId;
    options: SignInOptions;
    api: SignInApi;
    /** What signing in is for here, in this business's words. */
    lead: string;
}) {
    const ids = useId();
    const router = useRouter();
    const pathname = usePathname();
    const code = useRef<InlineCodeHandle>(null);
    const [sent, setSent] = useState(false);
    const [done, setDone] = useState(false);
    // Read after the first draw: the server knows no page to go back to.
    const [back, setBack] = useState<SignInBack | null>(null);
    useEffect(() => {
        // Restored once after hydration, never during it.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setBack(readSignInBack(pathname));
    }, [pathname]);
    const backTo = backWords(back);

    return (
        <div
            data-account-sign-in={look}
            // The look's own corner for its one button: a pill under Quiet.
            style={FRAME_PILL}
            className="max-w-[480px] min-[700px]:pt-2"
        >
            <p className="text-site-body text-[length:var(--site-body-size,1.0625rem)] leading-relaxed [text-wrap:pretty]">
                {lead}
                {backTo ? ` You'll come back to ${backTo}.` : null}
            </p>
            {done ? (
                <p
                    role="status"
                    data-site-fade=""
                    className="text-site-fg mt-6 text-[17px] font-semibold"
                >
                    {backTo
                        ? `Signed in. Taking you back to ${backTo}…`
                        : "Signed in."}
                </p>
            ) : (
                <>
                    <InlineCode
                        ids={ids}
                        options={options}
                        api={api}
                        handle={code}
                        onSent={setSent}
                        onSignedIn={() => {
                            setDone(true);
                            if (back) {
                                forgetSignInBack();
                                router.replace(back.from);
                            }
                            router.refresh();
                        }}
                    />
                    {sent ? null : (
                        <button
                            type="button"
                            data-site-primary=""
                            onClick={() => code.current?.press()}
                            className={cn(
                                lookPrimary(false),
                                "mt-5 w-full min-[700px]:w-auto",
                            )}
                        >
                            Send me a code
                        </button>
                    )}
                </>
            )}
        </div>
    );
}
