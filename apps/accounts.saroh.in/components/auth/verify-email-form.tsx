"use client";

import { CODE_RESEND_SECONDS } from "@saroh/auth/constants";
import { Button } from "@saroh/ui/button";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { CodeStep } from "@/components/auth/code-step";
import { AuthHeading } from "@/components/auth/field";
import { codeNext, doneLine } from "@/components/auth/panel-copy";
import { afterSignUp, getAppUrl } from "@/lib/app-urls";
import { withCarry } from "@/lib/joining";

/**
 * A password account confirming its address, opened by a link that names it
 * (`/verify-email?email=`). Sign-up no longer comes this way: it is one page
 * with the code step in it, and signing in with a password that still needs
 * its address confirmed shows the step in place. This page stays for a link
 * someone kept, and draws the same step.
 *
 * `returnTo` is where a confirmed account should land (#222), already vetted
 * by the server component that renders this form.
 */
export function VerifyEmailForm({
    returnTo = null,
}: {
    returnTo?: string | null;
} = {}) {
    const router = useRouter();
    const email = useSearchParams().get("email") ?? "";

    // No address means a lost query string: there is nothing to check a code
    // against, so the way on is to start again.
    if (!email) {
        return (
            <div>
                <AuthHeading
                    title="Nothing to check yet"
                    blurb="We don't know which address the code went to. Start again and we'll email you a new one."
                />
                <Button
                    asChild
                    className="sa-cta sa-rise coarse:h-11 h-10 w-full rounded-[9px] text-[13.5px] font-semibold"
                >
                    <Link href={withCarry("/login", returnTo)}>
                        Back to sign in
                    </Link>
                </Button>
            </div>
        );
    }

    return (
        <CodeStep
            email={email}
            kind="email-verification"
            next={codeNext(returnTo, "sign-in")}
            doneLine={doneLine(returnTo, "sign-in")}
            resendAfterSeconds={CODE_RESEND_SECONDS}
            onChangeEmail={() => router.push(withCarry("/login", returnTo))}
            onDone={() => {
                // A newly confirmed account. `afterSignUp` routes it through
                // saroh.in's /welcome when that hand-off is on (DEC-127);
                // this page itself loads no advertising tag.
                window.location.href = afterSignUp(returnTo ?? getAppUrl());
            }}
        />
    );
}
