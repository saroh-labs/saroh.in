"use client";

import { Button } from "@saroh/ui/button";
import { Checkbox } from "@saroh/ui/checkbox";
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

/**
 * The businesses the app may work with: tick one or more, or "All my
 * businesses" (the ones listed now, sent as ids), then Continue.
 */
export function PickBusinessForm({
    businesses,
    oauthQuery,
}: {
    businesses: PickableBusiness[];
    oauthQuery: string;
}) {
    const [ticked, setTicked] = useState<ReadonlySet<string>>(
        () => new Set(businesses.length === 1 ? [businesses[0].id] : []),
    );
    const all = ticked.size === businesses.length;
    const toggle = (id: string) =>
        setTicked((now) => {
            const next = new Set(now);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    const { pending, error, run } = useStep();
    const row =
        "border-border has-[[data-state=checked]]:border-foreground flex cursor-pointer items-center gap-3 rounded-[9px] border px-[13px] py-[11px] text-[13.5px]";
    return (
        <form
            onSubmit={(event) => {
                event.preventDefault();
                if (ticked.size > 0) {
                    run(() => pickBusinessAction([...ticked], oauthQuery));
                }
            }}
        >
            <StepError error={error} />
            <fieldset className="mb-[18px] flex flex-col gap-2">
                <legend className="sr-only">Businesses</legend>
                {businesses.length > 1 ? (
                    <label className={row}>
                        <Checkbox
                            checked={all}
                            onCheckedChange={() =>
                                setTicked(
                                    new Set(
                                        all ? [] : businesses.map((b) => b.id),
                                    ),
                                )
                            }
                        />
                        <span>
                            <span className="block font-semibold">
                                {OAUTH_WORDS.allBusinesses}
                            </span>
                            <span className="text-muted-foreground block text-[12px]">
                                {OAUTH_WORDS.allBusinessesNote}
                            </span>
                        </span>
                    </label>
                ) : null}
                {businesses.map((b) => (
                    <label key={b.id} className={row}>
                        <Checkbox
                            checked={ticked.has(b.id)}
                            onCheckedChange={() => toggle(b.id)}
                        />
                        {b.name}
                    </label>
                ))}
            </fieldset>
            <Button
                type="submit"
                className="sa-cta h-10 w-full rounded-[9px] text-[13.5px] font-semibold"
                disabled={pending || ticked.size === 0}
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
