"use client";

import { Controller } from "react-hook-form";

import type { WaitlistContent } from "@/content/waitlist";
import { NO_OFFER, WAITLIST_CONTACT, WAITLIST_KINDS } from "@/content/waitlist";
import type { WaitlistTemplate } from "@/lib/waitlist";
import { EMPTY_WAITLIST, openingDay, WAITLIST_MESSAGES } from "@/lib/waitlist";

import { Button } from "../shared/buttons/button";
import { ChoiceChip } from "../shared/fields/choice-chips";
import { fieldClasses } from "../shared/fields/field-classes";
import { textLinkClasses } from "../shared/links/text-link";
import { useWaitlistForm } from "./use-waitlist-form";
import { WaitlistDone } from "./waitlist-done";

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
 * A new entry (not a repeat) is also the `waitlist_joined` ad conversion
 * (DEC-127): Google Ads and Meta are told that one happened and nothing
 * else, and only for a visitor who accepted advertising cookies.
 *
 * The plan, source, referral and saved template come from the page's
 * address (`?plan=`, `?src=`, `?ref=`, `?template=`), read here in the
 * browser, so the page itself reads no query and stays static. With no
 * `?ref=` of its own, it sends the business's referral code the visitor
 * arrived on another page with, if one was kept (`lib/referral.ts`). A template
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
    const { joined, setJoined, saved, form, onSubmit } =
        useWaitlistForm(templates);
    const {
        register,
        control,
        clearErrors,
        reset,
        formState: { errors, isSubmitting },
    } = form;

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
                    className={fieldClasses({
                        invalid: Boolean(errors.business),
                        className: "h-11 w-full",
                    })}
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
                                    <ChoiceChip
                                        key={kind.id}
                                        // The first chip takes focus when
                                        // the kind is what is missing.
                                        ref={i === 0 ? field.ref : undefined}
                                        aria-pressed={on}
                                        on={on}
                                        invalid={Boolean(errors.kind)}
                                        onClick={() => {
                                            field.onChange(kind.id);
                                            clearErrors("kind");
                                        }}
                                    >
                                        {kind.label}
                                    </ChoiceChip>
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
                        className={fieldClasses({
                            invalid: Boolean(errors.email),
                            className: "h-11 w-full",
                        })}
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
                        className={fieldClasses({ className: "h-11 w-full" })}
                    />
                </label>
            </div>

            <Button type="submit" size="md" disabled={isSubmitting}>
                {isSubmitting ? "Joining…" : "Join the waitlist"}
            </Button>
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
                    className={textLinkClasses({
                        tone: "prose",
                        className: "text-muted-foreground hover:text-brand-700",
                    })}
                >
                    {WAITLIST_CONTACT}
                </a>
                .
            </p>
        </form>
    );
}
