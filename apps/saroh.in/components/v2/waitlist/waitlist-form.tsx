"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useSyncExternalStore } from "react";
import { Controller, useForm } from "react-hook-form";

import type { WaitlistContent } from "@/content/waitlist";
import { NO_OFFER, WAITLIST_CONTACT, WAITLIST_KINDS } from "@/content/waitlist";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/cn";
import type {
    WaitlistResponse,
    WaitlistTemplate,
    WaitlistValues,
} from "@/lib/waitlist";
import {
    EMPTY_WAITLIST,
    openingDay,
    referralLink,
    WAITLIST_MESSAGES,
    waitlistContext,
    waitlistSchema,
} from "@/lib/waitlist";

import type { WaitlistJoined } from "./waitlist-done";
import { WaitlistDone } from "./waitlist-done";

const RING =
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground focus-visible:[outline-style:solid]";

// `focus:ring-0` takes off the forms plugin's blue focus ring: the design's
// ring is the Ink outline (RING), and the border keeps its own colour.
const INPUT = cn(
    "h-[44px] w-full rounded-mk-control border bg-white px-3 font-sans text-[15px] text-foreground placeholder:text-muted-foreground transition-colors duration-fast ease-out hover:border-border-strong focus:ring-0 focus:ring-offset-0",
    RING,
);

/** The address doesn't change while the form is open: nothing to subscribe to. */
const noSubscription = () => () => undefined;

/** What a failed send tells the visitor; the form keeps what they typed. */
const SEND_FAILED: Record<string, string> = {
    RATE_LIMITED: "Too many tries from here. Wait a minute, then try again.",
    default: "We couldn't add you just now. Try again in a minute.",
};

/**
 * The waitlist card (Waitlist design, plan U30): business name, kind, email
 * and city, then the done state. The design's messages show on submit and
 * clear as the field is changed; city is optional and never refused.
 *
 * A join posts to `/api/waitlist`, which forwards it to the API; the place
 * and referral link come from the API (D-4, D-5). A repeat gets the generic
 * done state (D-8). If the send fails, the form stays filled with a retry
 * message under the button. GA hears `waitlist_join` with the kind, source,
 * plan and whether a referral link was used — never the email or name.
 *
 * The plan, source, referral and saved template come from the page's
 * address (`?plan=`, `?src=`, `?ref=`, `?template=`), read here in the
 * browser, so the page itself reads no query and stays static. A template
 * is kept only when it is one of `templates` (the gallery's), and the form
 * and its done state say it is saved.
 */
export function WaitlistForm({
    content,
    templates = [],
}: {
    content: WaitlistContent;
    templates?: readonly WaitlistTemplate[];
}) {
    const [joined, setJoined] = useState<WaitlistJoined | null>(null);
    // The address is read after hydration: the served page is the same
    // for every address ("" on the server).
    const search = useSyncExternalStore(
        noSubscription,
        () => window.location.search,
        () => "",
    );
    const slugs = templates.map((t) => t.slug);
    const fromAddress = () =>
        waitlistContext(
            Object.fromEntries(new URLSearchParams(window.location.search)),
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
    const {
        register,
        control,
        handleSubmit,
        clearErrors,
        setError,
        reset,
        formState: { errors, isSubmitting },
    } = form;

    const onSubmit = handleSubmit(async (values) => {
        const parsed = waitlistSchema.parse(values);
        const { plan, src, ref: referral, template } = fromAddress();
        let result: WaitlistResponse;
        try {
            const response = await fetch("/api/waitlist", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    business: parsed.business,
                    kind: parsed.kind,
                    email: parsed.email,
                    city: parsed.city || undefined,
                    plan,
                    src,
                    ref: referral,
                    template,
                }),
            });
            result = (await response.json()) as WaitlistResponse;
        } catch {
            result = { status: "failure" };
        }

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
            ref: referral !== undefined,
            template,
        });
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

    if (joined) {
        return (
            <WaitlistDone
                joined={joined}
                content={content}
                onAnother={() => {
                    reset(EMPTY_WAITLIST);
                    setJoined(null);
                    // The form is back: start at its first field.
                    requestAnimationFrame(() => form.setFocus("business"));
                }}
            />
        );
    }

    const offer = content.offer;
    const sendError = errors.root?.message;

    return (
        <form
            noValidate
            onSubmit={onSubmit}
            aria-labelledby="waitlist-title"
            className="flex flex-col gap-5"
        >
            <div className="flex flex-col gap-1.5">
                <h2
                    id="waitlist-title"
                    className="font-display text-[24px] font-semibold tracking-[-0.02em]"
                >
                    Join the waitlist
                </h2>
                <p className="m-0 text-[14px] leading-[1.5] text-neutral-600">
                    Get{" "}
                    <strong className="font-semibold text-foreground">
                        {offer ? offer.headline : NO_OFFER.headline}
                    </strong>
                    {offer?.aside ? ` ${offer.aside}` : null} when we open.
                    {offer ? null : ` ${NO_OFFER.note}`}
                </p>
                {saved ? (
                    <p
                        data-testid="waitlist-template"
                        className="m-0 mt-1 flex items-center gap-2 text-[14px] leading-[1.5] text-foreground"
                    >
                        <span
                            aria-hidden
                            className="size-2 shrink-0 rounded-full bg-brand-500"
                        />
                        <span>
                            Saving the{" "}
                            <strong className="font-semibold">
                                {saved.name}
                            </strong>{" "}
                            template for your invite.
                        </span>
                    </p>
                ) : null}
            </div>

            <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-medium">Business name</span>
                <input
                    {...register("business", {
                        onChange: () => clearErrors("business"),
                    })}
                    autoComplete="organization"
                    maxLength={120}
                    placeholder="Glow Studio"
                    aria-invalid={errors.business ? true : undefined}
                    aria-describedby={
                        errors.business ? "waitlist-business-error" : undefined
                    }
                    className={cn(
                        INPUT,
                        errors.business
                            ? "border-destructive focus:border-destructive"
                            : "border-border focus:border-border",
                    )}
                />
                {errors.business && (
                    <span
                        id="waitlist-business-error"
                        className="text-[12px] text-destructive"
                    >
                        {WAITLIST_MESSAGES.business}
                    </span>
                )}
            </label>

            <Controller
                control={control}
                name="kind"
                render={({ field }) => (
                    <fieldset
                        className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0"
                        aria-describedby={
                            errors.kind ? "waitlist-kind-error" : undefined
                        }
                    >
                        <legend className="mb-2 p-0 text-[13px] font-medium">
                            What kind of business?
                        </legend>
                        <div className="flex flex-wrap gap-2">
                            {WAITLIST_KINDS.map((kind, i) => {
                                const on = field.value === kind.id;
                                return (
                                    <button
                                        key={kind.id}
                                        type="button"
                                        // The first chip takes focus when
                                        // the kind is what is missing.
                                        ref={i === 0 ? field.ref : undefined}
                                        aria-pressed={on}
                                        onClick={() => {
                                            field.onChange(kind.id);
                                            clearErrors("kind");
                                        }}
                                        className={cn(
                                            "inline-flex h-9 cursor-pointer items-center rounded-full border px-[13px] text-[13px] transition-[background-color,border-color,transform] duration-fast ease-out active:scale-[0.97]",
                                            RING,
                                            on
                                                ? "border-foreground bg-foreground text-background"
                                                : cn(
                                                      "bg-white text-foreground hover:border-border-strong",
                                                      errors.kind
                                                          ? "border-destructive"
                                                          : "border-border",
                                                  ),
                                        )}
                                    >
                                        {kind.label}
                                    </button>
                                );
                            })}
                        </div>
                        {errors.kind && (
                            <span
                                id="waitlist-kind-error"
                                className="text-[12px] text-destructive"
                            >
                                {WAITLIST_MESSAGES.kind}
                            </span>
                        )}
                    </fieldset>
                )}
            />

            <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3.5">
                <label className="flex flex-col gap-1.5">
                    <span className="text-[13px] font-medium">Email</span>
                    <input
                        {...register("email", {
                            onChange: () => clearErrors("email"),
                        })}
                        type="email"
                        inputMode="email"
                        autoComplete="email"
                        maxLength={320}
                        placeholder="you@glowstudio.in"
                        aria-invalid={errors.email ? true : undefined}
                        aria-describedby={
                            errors.email ? "waitlist-email-error" : undefined
                        }
                        className={cn(
                            INPUT,
                            errors.email
                                ? "border-destructive focus:border-destructive"
                                : "border-border focus:border-border",
                        )}
                    />
                    {errors.email && (
                        <span
                            id="waitlist-email-error"
                            className="text-[12px] text-destructive"
                        >
                            {WAITLIST_MESSAGES.email}
                        </span>
                    )}
                </label>
                <label className="flex flex-col gap-1.5">
                    <span className="text-[13px] font-medium">City</span>
                    <input
                        {...register("city")}
                        autoComplete="address-level2"
                        maxLength={80}
                        placeholder="Pune"
                        className={cn(
                            INPUT,
                            "border-border focus:border-border",
                        )}
                    />
                </label>
            </div>

            <button
                type="submit"
                disabled={isSubmitting}
                className={cn(
                    "flex h-[45px] cursor-pointer items-center justify-center rounded-[10px] bg-foreground text-[15px] font-medium text-background transition-[background-color,transform] duration-fast ease-out hover:bg-primary-hover active:scale-[0.98] disabled:cursor-wait disabled:opacity-80",
                    RING,
                )}
            >
                {isSubmitting ? "Joining…" : "Join the waitlist"}
            </button>
            {sendError && (
                <p
                    role="alert"
                    className="-mt-2 mb-0 text-[13px] text-destructive"
                >
                    {sendError}
                </p>
            )}
            <p className="m-0 text-[12px] leading-[1.5] text-muted-foreground">
                We&apos;ll email you once
                {content.openingDate
                    ? ` on ${openingDay(content.openingDate)}`
                    : " when we open"}{" "}
                with your invite, and not again unless you reply.
                {offer ? ` ${offer.terms}` : null} We keep your business name,
                kind, email and city only for that invite and to plan the launch
                {saved ? ", with the template you saved" : null}; to be removed,
                write to{" "}
                <a
                    href={`mailto:${WAITLIST_CONTACT}`}
                    className={cn(
                        "cursor-pointer rounded-sm text-muted-foreground underline underline-offset-[3px] hover:text-brand-700",
                        RING,
                    )}
                >
                    {WAITLIST_CONTACT}
                </a>
                .
            </p>
        </form>
    );
}
