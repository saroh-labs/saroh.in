import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { track } from "@/lib/analytics";
import { readAddress } from "@/lib/page-address";
import { keptReferral } from "@/lib/referral";
import { fireConversion } from "@/lib/tags";
import { useBrowserValue } from "@/lib/use-browser-value";
import type { WaitlistTemplate } from "@/lib/waitlist";
import {
    postWaitlist,
    referralLink,
    SEND_FAILED,
    WAITLIST_MESSAGES,
    waitlistContext,
} from "@/lib/waitlist";
import type { WaitlistValues } from "@/lib/waitlist-schema";
import { EMPTY_WAITLIST, waitlistSchema } from "@/lib/waitlist-schema";

import type { WaitlistJoined } from "./waitlist-done";

/**
 * The waitlist form's state and join (DEC-183: the rules stay out of the
 * drawing). See `WaitlistForm` for what it does on screen.
 */
export function useWaitlistForm(templates: readonly WaitlistTemplate[]) {
    const [joined, setJoined] = useState<WaitlistJoined | null>(null);
    // The address is read after hydration: the served page is the same
    // for every address ("" on the server).
    const search = useBrowserValue(() => readAddress(), "");
    const slugs = templates.map((t) => t.slug);
    const fromAddress = () =>
        waitlistContext(
            Object.fromEntries(new URLSearchParams(readAddress())),
            slugs,
        );
    const savedSlug = waitlistContext(
        Object.fromEntries(new URLSearchParams(search)),
        slugs,
    ).template;
    const saved = templates.find((t) => t.slug === savedSlug) ?? null;
    const form = useForm<WaitlistValues>({
        resolver: zodResolver(waitlistSchema),
        defaultValues: EMPTY_WAITLIST,
        mode: "onSubmit",
        reValidateMode: "onSubmit",
        shouldFocusError: true,
    });
    const { handleSubmit, setError } = form;

    const onSubmit = handleSubmit(async (values) => {
        const parsed = waitlistSchema.parse(values);
        const { plan, src, ref: linked, template } = fromAddress();
        // This page's own `?ref=`, an entrant's id, comes first. With none,
        // the business's code a visitor arrived on another page with
        // (DEC-156); the API tells the two apart.
        const referral = linked ?? keptReferral(document.cookie) ?? undefined;
        const result = await postWaitlist({
            business: parsed.business,
            kind: parsed.kind,
            email: parsed.email,
            city: parsed.city || undefined,
            plan,
            src,
            ref: referral,
            template,
        });

        if (result.status === "failure") {
            if (result.reason?.code === "INVALID") {
                // The API is stricter about addresses than the design's
                // check; anything else it refuses the form already checked.
                setError("email", { message: WAITLIST_MESSAGES.email });
                return;
            }
            setError("root", {
                message:
                    SEND_FAILED[result.reason?.code ?? ""] ??
                    SEND_FAILED.default,
            });
            return;
        }

        track("waitlist_join", {
            kind: parsed.kind,
            src,
            plan,
            // The page's own link only: a kept code says nothing to GA.
            ref: linked !== undefined,
            template,
        });
        if (result.created) fireConversion("waitlist_joined");
        setJoined({
            business: parsed.business,
            email: parsed.email,
            position: result.created ? result.position : undefined,
            template: templates.find((t) => t.slug === template)?.name,
            outsideIndia: result.outsideIndia === true,
            link:
                result.created && result.ref
                    ? referralLink(window.location.origin, result.ref)
                    : undefined,
        });
    });

    return { joined, setJoined, saved, form, onSubmit };
}
