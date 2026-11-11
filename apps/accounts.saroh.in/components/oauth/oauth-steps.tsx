"use client";

import { Button } from "@saroh/ui/button";
import { useState, useTransition } from "react";

import type { OAuthStepResult } from "@/app/(auth)/oauth/actions";
import { consentAction, pickBusinessAction } from "@/app/(auth)/oauth/actions";
import { AuthError } from "@/components/auth/field";
import type { PickableBusiness } from "@/lib/oauth-sign-in";
import { OAUTH_WORDS } from "@/lib/oauth-sign-in";

/** Follow a step's answer: a full load, since it may leave Saroh for the app. */
function useStep() {
    const [pending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);
    const run = (step: () => Promise<OAuthStepResult>) =>
        startTransition(async () => {
            setError(null);
            const result = await step();
            if (result.ok) window.location.assign(result.url);
            else setError(result.error);
        });
    return { pending, error, run };
}

function StepError({ error }: { error: string | null }) {
    return error ? <AuthError>{error}</AuthError> : null;
}

/** One business, picked from this person's, then Continue. */
export function PickBusinessForm({
    businesses,
    oauthQuery,
}: {
    businesses: PickableBusiness[];
    oauthQuery: string;
}) {
    const [picked, setPicked] = useState(
        businesses.length === 1 ? businesses[0].id : "",
    );
    const { pending, error, run } = useStep();
    return (
        <form
            onSubmit={(event) => {
                event.preventDefault();
                if (picked) run(() => pickBusinessAction(picked, oauthQuery));
            }}
        >
            <StepError error={error} />
            <fieldset className="mb-[18px] flex flex-col gap-2">
                <legend className="sr-only">Business</legend>
                {businesses.map((b) => (
                    <label
                        key={b.id}
                        className="border-border has-[:checked]:border-foreground flex cursor-pointer items-center gap-3 rounded-[9px] border px-[13px] py-[11px] text-[13.5px]"
                    >
                        <input
                            type="radio"
                            name="business"
                            value={b.id}
                            checked={picked === b.id}
                            onChange={() => setPicked(b.id)}
                        />
                        {b.name}
                    </label>
                ))}
            </fieldset>
            <Button
                type="submit"
                className="sa-cta h-10 w-full rounded-[9px] text-[13.5px] font-semibold"
                disabled={pending || !picked}
            >
                {pending ? OAUTH_WORDS.continuing : OAUTH_WORDS.continue}
            </Button>
        </form>
    );
}

/** Allow, or Don't allow; both go back to the app. */
export function ConsentButtons({ oauthQuery }: { oauthQuery: string }) {
    const { pending, error, run } = useStep();
    return (
        <div>
            <StepError error={error} />
            <div className="flex flex-col gap-2">
                <Button
                    className="sa-cta h-10 w-full rounded-[9px] text-[13.5px] font-semibold"
                    disabled={pending}
                    onClick={() => run(() => consentAction(true, oauthQuery))}
                >
                    {pending ? OAUTH_WORDS.allowing : OAUTH_WORDS.allow}
                </Button>
                <Button
                    variant="outline"
                    className="h-10 w-full rounded-[9px] text-[13.5px] font-semibold"
                    disabled={pending}
                    onClick={() => run(() => consentAction(false, oauthQuery))}
                >
                    {OAUTH_WORDS.deny}
                </Button>
            </div>
        </div>
    );
}
