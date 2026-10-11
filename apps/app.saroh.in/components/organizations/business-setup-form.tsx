"use client";

import { submitOnModEnter } from "@/lib/hooks/keyboard-save";
import { zodResolver } from "@hookform/resolvers/zod";
import { authClient } from "@saroh/auth/client";
import { Button } from "@saroh/ui/button";
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@saroh/ui/form";
import { Input } from "@saroh/ui/input";
import { cn } from "@saroh/ui/lib/utils";
import { showError, showInfo } from "@saroh/ui/toast";
import { Tip } from "@saroh/ui/tooltip";
import { Check } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { Chip } from "@/components/shared/chip";
import { CountrySelect } from "@/components/shared/country-select";
import { accountsLoginUrl } from "@/lib/accounts";
import { startWithGoalAction } from "@/lib/modules/first-goal-actions";
import { GOAL_LATER } from "@/lib/modules/goals";
import { checkAddress, createOrganization } from "@/lib/organizations/actions";
import {
    addressFromName,
    cleanAddressInput,
} from "@/lib/organizations/address";
import {
    kindDefaults,
    kindWords,
    ORGANIZATION_KINDS,
} from "@/lib/organizations/kind";
import type { AddressAvailability } from "@/lib/organizations/service";
import { defaultGoal, setupGoals } from "@/lib/organizations/setup-plan";
import { browserZone } from "@/lib/organizations/time-zones";
import {
    startCheckoutAfterOnboarding,
    takeLaunchOfferAfterOnboarding,
} from "@/lib/saroh-billing/checkout-actions";

import { PAGE_FORM, toFirstError } from "@/lib/hooks/page-form";
import { SetupGoalChoice } from "./setup-goal-choice";
import { SetupKindChoice } from "./setup-kind-choice";

/**
 * The countries a merchant is most likely to be in, offered as chips, as the
 * design draws them. Any other is one tap further, through the full list —
 * the chips are a shortcut, never the limit of what can be chosen.
 */
const COMMON_COUNTRIES = [
    { code: "IN", name: "India" },
    { code: "AE", name: "UAE" },
    { code: "SG", name: "Singapore" },
    { code: "GB", name: "United Kingdom" },
    { code: "US", name: "United States" },
] as const;

function schemaFor(needsName: boolean) {
    return z.object({
        // "A business" to start with (owner, 10 Oct): the form is open from
        // the first moment, and the answer is one press to change.
        kind: z.enum(ORGANIZATION_KINDS),
        // Asked only of an account that has no name yet: one made with an
        // emailed code, which asks for nothing but the address.
        yourName: needsName
            ? z.string().trim().min(1, { message: "Enter your name" }).max(120)
            : z.string().optional(),
        name: z.string().trim().min(1, { message: "It needs a name" }),
        address: z.string().min(3, {
            message: "A web address needs at least 3 characters",
        }),
        country: z.string().length(2),
        // A goal's key, or "LATER".
        goal: z.string().min(1),
    });
}

type FormValues = z.infer<ReturnType<typeof schemaFor>>;

/**
 * Setup, on one screen (UX audit, 10 Oct): your name if the account has
 * none, what it is called, its web address, where it is, and what you will
 * do first. "Create" then turns that first thing on with its defaults and
 * opens it: a new product, a new service, the site ready to publish, a new
 * contact. No second sheet of questions, and no empty list to land on.
 *
 * "What are you setting up?" (DEC-070) stays as a small choice at the top,
 * with "A business" chosen. It is not a gate: every field is on screen from
 * the start, and the answer changes words and defaults only.
 *
 * The web address follows the name until the merchant edits it, and is
 * checked as they go. It is the one thing here that is hard to change later,
 * because it is where the business's website lives (`<address>.saroh.app`),
 * so it is asked once, here, and never again when Website is turned on.
 *
 * Whether it is a registered company is not asked here any more. The Finish
 * setup step "Choose your business type" asks, once something invoices or
 * takes money. The rest of the business profile is in Settings › Business.
 */
export function BusinessSetupForm({
    email,
    needsName = false,
    backTo,
    checkout,
    invite,
    defaultName,
}: {
    /** Who is signed in — named beside the way out, so it is clear whose. */
    email: string;
    /** The account has no name yet, so setup asks for it. */
    needsName?: boolean;
    /** Where Back goes: the workspace, when they already have a business. */
    backTo?: string;
    /**
     * The paid plan picked on saroh.in (plan U27): once the business exists,
     * its checkout. Null: it starts on Free, as every business does.
     */
    checkout?: { plan: string; cycle: "month" | "year"; name: string } | null;
    /**
     * An opening-day invite's token (plan U31): once the business exists,
     * it takes the launch offer. It wins over `checkout`.
     */
    invite?: string | null;
    /** The name the business was listed under on the waitlist (U31). */
    defaultName?: string;
}) {
    const router = useRouter();
    const form = useForm<FormValues>({
        resolver: zodResolver(schemaFor(needsName)),
        ...PAGE_FORM,
        defaultValues: {
            kind: "BUSINESS",
            yourName: "",
            name: defaultName ?? "",
            address: "",
            country: "IN",
            goal: defaultGoal("BUSINESS"),
        },
    });
    const { isSubmitting } = form.formState;
    // Set up, and on the way in: the push takes a moment, and the button
    // stays "Setting up…" until the page goes (UX-076).
    const [leaving, setLeaving] = useState(false);
    const busy = isSubmitting || leaving;

    /** Whether the merchant has typed a web address of their own. */
    const [edited, setEdited] = useState(false);
    /** Whether they have picked a goal, so a change of kind leaves it be. */
    const goalPicked = useRef(false);
    const name = useWatch({ control: form.control, name: "name" });
    const address = useWatch({ control: form.control, name: "address" });
    const country = useWatch({ control: form.control, name: "country" });
    const kind = useWatch({ control: form.control, name: "kind" });
    const words = kindWords(kind);
    const defaults = kindDefaults(kind);
    const goals = setupGoals(kind);
    const [otherCountry, setOtherCountry] = useState(false);

    // The web address follows the name until it is edited.
    useEffect(() => {
        if (!edited) {
            form.setValue("address", addressFromName(name), {
                shouldValidate: false,
            });
        }
    }, [name, edited, form]);

    /*
     * The live check. Debounced, and only the newest answer may land: a slow
     * answer for "rye" arriving after a fast one for "ryeandco" must not say
     * the wrong address is taken.
     */
    /** The last answer, or `unchecked` when the API could not be asked. */
    const [answer, setAnswer] = useState<
        AddressAvailability | { address: string; unchecked: true } | null
    >(null);
    const asked = useRef(0);
    useEffect(() => {
        if (address.length < 3) return;
        const ask = ++asked.current;
        const timer = setTimeout(() => {
            void checkAddress(address).then((next) => {
                if (ask !== asked.current) return;
                // Could not ask: say nothing rather than guess — the create
                // checks the address again either way.
                setAnswer(next ?? { address, unchecked: true });
            });
        }, 350);
        return () => clearTimeout(timer);
    }, [address]);

    /*
     * Derived, not stored: the answer is "checking" whenever it is about an
     * address other than the one in the field, so a stale answer can never be
     * shown against a new address.
     */
    const availability: AddressAvailability | "checking" | null =
        address.length < 3
            ? null
            : answer?.address !== address
              ? "checking"
              : "unchecked" in answer
                ? null
                : answer;

    const taken =
        availability !== null &&
        availability !== "checking" &&
        !availability.available;

    async function onSubmit(values: FormValues) {
        const businessName = values.name.trim();
        // The account's own name first: the business's team, its invoices
        // and its welcome email all say who made it.
        if (needsName) {
            const saved = await authClient
                .updateUser({ name: (values.yourName ?? "").trim() })
                .then(
                    (res) => !res.error,
                    () => false,
                );
            if (!saved) {
                form.setError("yourName", {
                    message: "Couldn't save your name. Try again.",
                });
                return;
            }
        }
        const zone = browserZone();
        const res = await createOrganization({
            name: businessName,
            kind: values.kind,
            address: values.address,
            // What they chose to do first: the welcome email leads with it.
            ...(values.goal === GOAL_LATER ? {} : { goal: values.goal }),
            profile: {
                country: values.country,
                // The browser's zone (UX-008): the business's for a country
                // that keeps several; one that keeps one zone uses that.
                ...(zone ? { timezone: zone } : {}),
            },
        });
        if (!res.ok) {
            if (res.field === "name" || res.field === "address") {
                form.setError(res.field, { message: res.error });
            } else {
                showError(res.error);
            }
            return;
        }
        // The business exists. Turn its first goal on with the defaults
        // and learn where to land. A goal that can't be turned on lands on
        // Home with the reason: the business is set up either way.
        const start = await startWithGoalAction(values.goal, values.kind).catch(
            () => ({
                href: "/",
                said: `${businessName} is set up. Pick what to do first from Home.`,
            }),
        );
        if (invite) {
            // Where the waitlist entry is marked joined and the offer
            // starts; the API checks the invite against this account.
            const taken = await takeLaunchOfferAfterOnboarding(invite);
            if (!taken.ok) {
                showError(
                    `${businessName} is set up, but the launch offer isn't applied yet.`,
                    taken.error,
                );
            }
        } else if (checkout) {
            const started = await startCheckoutAfterOnboarding({
                plan: checkout.plan,
                cycle: checkout.cycle,
            });
            if (started.kind === "authorise") {
                // The provider's page, given once (U15). Leaving the app,
                // so the button stays "Setting up…" until the page goes.
                window.location.assign(started.url);
                await new Promise(() => undefined);
                return;
            }
            if (started.kind === "failed") {
                showError(
                    `${businessName} is set up, but ${checkout.name} isn't started yet.`,
                    started.error,
                );
            }
        }
        if (start.said) showInfo(start.said);
        setLeaving(true);
        router.push(start.href);
        router.refresh();
    }

    return (
        <Form {...form}>
            <form
                onKeyDown={submitOnModEnter}
                onSubmit={form.handleSubmit(onSubmit, toFirstError)}
                className="grid gap-5"
                noValidate
            >
                <FormField
                    control={form.control}
                    name="kind"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel id="kind-label">
                                What are you setting up?
                            </FormLabel>
                            <SetupKindChoice
                                value={field.value}
                                onChange={(next) => {
                                    field.onChange(next);
                                    // The goal follows the kind until one
                                    // is picked by hand.
                                    if (!goalPicked.current) {
                                        form.setValue(
                                            "goal",
                                            defaultGoal(next),
                                        );
                                    }
                                }}
                                labelledBy="kind-label"
                            />
                        </FormItem>
                    )}
                />

                {needsName ? (
                    <FormField
                        control={form.control}
                        name="yourName"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Your name</FormLabel>
                                <FormControl>
                                    <Input
                                        autoComplete="name"
                                        className="coarse:text-base"
                                        {...field}
                                        value={field.value ?? ""}
                                    />
                                </FormControl>
                                <FormDescription>
                                    What your team sees when you invite them.
                                </FormDescription>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                ) : null}

                <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel data-ph-unmask="">
                                {words.nameLabel}
                            </FormLabel>
                            <FormControl>
                                <Input
                                    placeholder={defaults.namePlaceholder}
                                    autoComplete="organization"
                                    className="coarse:text-base"
                                    {...field}
                                />
                            </FormControl>
                            <FormDescription>
                                People see this on your site and invoices. You
                                can change it later.
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="address"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Web address</FormLabel>
                            {/* FormControl on the Input itself, so the label,
                                the description and any error are wired to the
                                field a screen reader lands on, not its frame. */}
                            <div
                                className={cn(
                                    "flex h-[38px] items-center rounded-md border border-input bg-field pr-3 font-mono text-sm focus-within:ring-2 focus-within:ring-ring coarse:h-11",
                                    taken && "border-destructive",
                                )}
                            >
                                <FormControl>
                                    <Input
                                        {...field}
                                        onChange={(e) => {
                                            setEdited(true);
                                            field.onChange(
                                                cleanAddressInput(
                                                    e.target.value,
                                                ),
                                            );
                                        }}
                                        spellCheck={false}
                                        autoCapitalize="off"
                                        // The frame around it is the field;
                                        // the input itself is borderless so
                                        // the address and `.saroh.app` read
                                        // as one value.
                                        className="h-full min-w-0 flex-1 rounded-none border-0 bg-transparent pr-0 text-right font-mono shadow-none focus-visible:ring-0 coarse:h-full coarse:text-base"
                                    />
                                </FormControl>
                                <span className="text-muted-foreground">
                                    .saroh.app
                                </span>
                            </div>
                            <p
                                id="address-status"
                                role="status"
                                className={cn(
                                    "min-h-[1.2em] text-[12px]",
                                    taken
                                        ? "text-destructive"
                                        : "text-muted-foreground",
                                )}
                            >
                                {availability === "checking" ? (
                                    "Checking…"
                                ) : availability?.available ? (
                                    <span className="inline-flex items-center gap-1 text-success">
                                        <Check
                                            aria-hidden
                                            className="size-3.5"
                                        />
                                        Available. Your website will live here.
                                    </span>
                                ) : taken ? (
                                    availability.reason
                                ) : null}
                            </p>
                            <FormDescription>
                                {edited
                                    ? "Changing it later breaks saved links, so it is worth getting right now."
                                    : "Follows the name until you edit it. Changing it later breaks saved links, so it is worth getting right now."}
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormItem>
                    <FormLabel id="country-label">
                        {kind === "BUSINESS"
                            ? "Where does it trade?"
                            : "Where are you based?"}
                    </FormLabel>
                    <div
                        role="radiogroup"
                        aria-labelledby="country-label"
                        className="flex flex-wrap gap-1.5"
                    >
                        {COMMON_COUNTRIES.map((c) => (
                            <Chip
                                key={c.code}
                                on={!otherCountry && country === c.code}
                                onClick={() => {
                                    setOtherCountry(false);
                                    form.setValue("country", c.code);
                                }}
                            >
                                <span className="font-mono text-[11px] opacity-70">
                                    {c.code}
                                </span>
                                {c.name}
                            </Chip>
                        ))}
                        <Chip
                            on={otherCountry}
                            onClick={() => setOtherCountry(true)}
                        >
                            Another country
                        </Chip>
                    </div>
                    {otherCountry ? (
                        <CountrySelect
                            value={country}
                            onValueChange={(code) =>
                                form.setValue("country", code)
                            }
                            aria-describedby="country-note"
                        />
                    ) : null}
                    <FormDescription id="country-note">
                        {kind === "BUSINESS"
                            ? "Where the business is based."
                            : "Where you work from."}{" "}
                        You can change it in Settings.
                    </FormDescription>
                </FormItem>

                <FormField
                    control={form.control}
                    name="goal"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel id="goal-label">
                                What will you do first?
                            </FormLabel>
                            <SetupGoalChoice
                                goals={goals}
                                value={field.value}
                                onChange={(next) => {
                                    goalPicked.current = true;
                                    field.onChange(next);
                                }}
                                labelledBy="goal-label"
                                describedBy="goal-note"
                            />
                            <FormDescription id="goal-note">
                                It is set up with sensible defaults and opens
                                ready to fill in. You can add the others
                                whenever.
                            </FormDescription>
                        </FormItem>
                    )}
                />

                <div className="flex gap-2 pt-1">
                    {backTo ? (
                        <Button asChild variant="outline">
                            <Link href={backTo}>Back</Link>
                        </Button>
                    ) : null}
                    <Tip
                        label={
                            taken && availability.reason
                                ? availability.reason
                                : undefined
                        }
                    >
                        <Button
                            type="submit"
                            className="wk-press flex-1"
                            disabled={taken}
                            busy={busy}
                            busyLabel="Setting up…"
                        >
                            {kind === "BUSINESS"
                                ? "Create the business"
                                : "Set it up"}
                        </Button>
                    </Tip>
                </div>

                <p className="text-[12px] text-muted-foreground">
                    Signed in as{" "}
                    <span className="text-foreground">{email}</span> ·{" "}
                    <Button
                        variant="link"
                        size="inline"
                        type="button"
                        onClick={() => {
                            void authClient.signOut().then(() => {
                                window.location.href = accountsLoginUrl;
                            });
                        }}
                    >
                        Sign out
                    </Button>
                </p>
            </form>
        </Form>
    );
}
