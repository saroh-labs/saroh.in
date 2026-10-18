"use client";

import { submitOnModEnter } from "@/lib/hooks/keyboard-save";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormField, FormItem } from "@saroh/ui/form";
import { useRouter } from "next/navigation";
import {
    useEffect,
    useMemo,
    useRef,
    useState,
    useSyncExternalStore,
} from "react";
import { useForm, useWatch } from "react-hook-form";

import { PAGE_FORM, toFirstErrorIn } from "@/lib/hooks/page-form";
import { addressFromName } from "@/lib/organizations/address";
import type {
    BillingProfileOption,
    SetupBilling,
} from "@/lib/organizations/setup-billing";
import { NO_BILLING } from "@/lib/organizations/setup-billing";
import { defaultGoal, setupGoals } from "@/lib/organizations/setup-plan";
import type { SetupDraft, SetupValues } from "@/lib/organizations/setup-steps";
import {
    clearSetupDraft,
    firstUnanswered,
    isLastStep,
    readSetupDraft,
    setupSchema,
    stepAfter,
    stepBefore,
    stepCount,
    stepEyebrow,
    stepHeading,
    stepLead,
    stepOfField,
    stepPosition,
    stepPrimary,
    writeSetupDraft,
} from "@/lib/organizations/setup-steps";

import { SetupBillingStep, toChoices } from "./setup-billing-step";
import { createFromSetup } from "./setup-create";
import { SetupFoot } from "./setup-foot";
import { SetupGoalChoice } from "./setup-goal-choice";
import { SetupKindChoice } from "./setup-kind-choice";
import { SetupNameStep } from "./setup-name-step";
import {
    SetupStepFrame,
    STEP_LEAD_ID,
    stepHeadingId,
} from "./setup-step-frame";
import { isTaken, useAddressCheck } from "./use-address-check";
import { fieldsOf, useSetupWalk } from "./use-setup-walk";

/**
 * Setup, as a stepper (DEC-130, amended 11 Oct 2026): one question to a
 * screen, with Back and Continue, and only the question being asked on show.
 *
 *  1. What are you setting up? (DEC-070), with "A business" chosen. It
 *     changes words and defaults only.
 *  2. Its name and web address, your own name if the account has none, and
 *     where it is.
 *  …  Who Saroh bills for it (DEC-167, R7), only for an owner who has a
 *     billing profile already: one of theirs, or a new one. None is
 *     chosen for them.
 *  3. What will you do first? The step's button creates the business, turns
 *     that first thing on with its defaults and opens it: a new product, a
 *     new service, the site ready to publish, a new contact.
 *
 * ONE form holds every step's answers, so moving between steps loses
 * nothing and Back never asks. Only the step on show is drawn: the others
 * are out of the page, the tab order and a screen reader's reach, and their
 * answers stay in the form. The step's heading takes the keyboard when the
 * step changes.
 *
 * Continue is the step's gate. It checks that step's own fields, says what
 * is wrong under each, and puts the keyboard on the first. On the name step
 * it also waits for the web address's answer, so a taken address is never
 * passed on. Enter in a text field is Continue.
 *
 * Which step is on show is in the address (`setup-step-context.tsx`), and
 * what was typed is kept for the tab (`setup-steps.ts`, the draft), so a
 * reload stays on the step with its answers. A step asked for before the
 * ones ahead of it are answered opens the first that is not.
 *
 * Whether it is a registered company is not asked here. The Finish setup
 * step "Choose your business type" asks, once something invoices or takes
 * money. The rest of the business profile is in Settings › Business.
 */
export function BusinessSetupForm(props: SetupFormProps) {
    /*
     * The tab's draft can only be read in the browser. The server, and the
     * browser's first pass over the server's page, draw the form without
     * it. Then the form is drawn afresh with the draft as its starting
     * answers, before anything is painted.
     */
    const inBrowser = useSyncExternalStore(subscribe, onClient, onServer);
    return (
        <SetupSteps
            key={inBrowser ? "tab" : "page"}
            ready={inBrowser}
            {...props}
        />
    );
}

const subscribe = () => () => undefined;
const onClient = () => true;
const onServer = () => false;

/** The answers setup starts from: the tab's draft over the page's own. */
function startingAnswers(
    draft: SetupDraft | null,
    defaultName: string | undefined,
): SetupValues {
    const typed = draft?.values.name ?? "";
    return {
        kind: "BUSINESS",
        yourName: "",
        address: "",
        country: "IN",
        goal: defaultGoal("BUSINESS"),
        ...NO_BILLING,
        ...draft?.values,
        // A name the page came with (an invite) stands until one is typed.
        name: typed === "" ? (defaultName ?? "") : typed,
    };
}

function SetupSteps({
    email,
    needsName = false,
    another = false,
    backTo,
    checkout,
    invite,
    defaultName,
    arrival,
    note,
    billingProfiles,
    ready,
}: SetupFormProps & {
    /** In the browser, with the tab's draft read. */
    ready: boolean;
}) {
    const router = useRouter();
    const [draft] = useState(() => (ready ? readSetupDraft(email) : null));
    // Who Saroh bills is asked only of an owner with a profile (DEC-167).
    const billing = useMemo<SetupBilling | null>(
        () =>
            billingProfiles && billingProfiles.length > 0
                ? { profiles: billingProfiles }
                : null,
        [billingProfiles],
    );
    const asksBilling = billing !== null;
    const form = useForm<SetupValues>({
        resolver: zodResolver(setupSchema(needsName, billing)),
        ...PAGE_FORM,
        defaultValues: startingAnswers(draft, defaultName),
    });
    const { isSubmitting } = form.formState;
    // Set up, and on the way in: the push takes a moment, and the button
    // stays "Setting up…" until the page goes (UX-076).
    const [leaving, setLeaving] = useState(false);
    const busy = isSubmitting || leaving;
    /** Continue is waiting for the web address's answer. */
    const [holding, setHolding] = useState(false);

    /** Whether the merchant has typed a web address of their own. */
    const [edited, setEdited] = useState(draft?.edited ?? false);
    /** Whether they have picked a goal, so a change of kind leaves it be. */
    const goalPicked = useRef(draft?.goalPicked ?? false);
    const [otherCountry, setOtherCountry] = useState(
        draft?.otherCountry ?? false,
    );
    const name = useWatch({ control: form.control, name: "name" });
    const address = useWatch({ control: form.control, name: "address" });
    const kind = useWatch({ control: form.control, name: "kind" });
    const check = useAddressCheck(address);

    // Which step is on show, and where the keyboard goes when it changes.
    const {
        step,
        moved,
        formRef,
        headingRef,
        current,
        go,
        back,
        showProblemOn,
    } = useSetupWalk({ ready, needsName, billing, form });

    // The web address follows the name until it is edited.
    useEffect(() => {
        if (ready && !edited) {
            form.setValue("address", addressFromName(name), {
                // Said to be too short: it clears as the name fixes it.
                shouldValidate: form.getFieldState("address").invalid,
            });
        }
    }, [ready, name, edited, form]);

    // The draft, kept as it is typed, until the business is made.
    const answers = useWatch({ control: form.control });
    const made = useRef(false);
    useEffect(() => {
        if (!ready || made.current) return;
        writeSetupDraft(email, {
            values: form.getValues(),
            edited,
            goalPicked: goalPicked.current,
            otherCountry,
        });
    }, [ready, email, form, answers, edited, otherCountry]);

    /** The step's gate. True when it may be left. */
    async function passes(): Promise<boolean> {
        const fields = fieldsOf(step);
        for (;;) {
            if (!(await form.trigger([...fields]))) {
                // Checked without being left (Enter in the field): from
                // here each one clears as it is fixed.
                for (const field of fields) {
                    form.setValue(field, form.getValues(field), {
                        shouldTouch: true,
                    });
                }
                return false;
            }
            if (step !== "name") return true;
            // The web address's answer, awaited: a taken address is never
            // passed on to the last step.
            const asked = form.getValues("address");
            setHolding(true);
            const answer = await check.ask(asked).finally(() => {
                setHolding(false);
            });
            // Changed while it was being asked: check what is there now.
            if (form.getValues("address") !== asked) continue;
            return !isTaken(answer);
        }
    }

    async function onContinue() {
        const from = step;
        const ok = await passes();
        // Left by the browser's Back while the address was being asked.
        if (current.current !== from) return;
        if (!ok) {
            if (from === "billing" && toChoices(form, formRef.current)) {
                return;
            }
            toFirstErrorIn(formRef.current);
            return;
        }
        const next = stepAfter(from, asksBilling);
        if (next) go(next);
    }

    async function onCreate(values: SetupValues) {
        const outcome = await createFromSetup(values, {
            needsName,
            checkout,
            invite,
            billing: asksBilling,
            // The business exists: the draft has done its work.
            onMade: () => {
                made.current = true;
                clearSetupDraft();
            },
        });
        if (outcome.made) {
            // On the way in: the push takes a moment, and the button stays
            // "Setting up…" until the page goes (UX-076).
            setLeaving(true);
            router.push(outcome.href);
            router.refresh();
            return;
        }
        // Every answer is kept. A problem with a field is said under that
        // field, on its own step. Anything else has been said already.
        if (outcome.field) {
            form.setError(outcome.field, { message: outcome.message });
            showProblemOn(stepOfField(outcome.field) ?? "name");
        }
    }

    /** Create pressed over an answer an earlier step would refuse. */
    function onRefused() {
        const stuck = firstUnanswered(form.getValues(), needsName, billing);
        if (stuck) showProblemOn(stuck);
    }

    function onSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (busy || holding) return;
        if (isLastStep(step)) {
            void form.handleSubmit(onCreate, onRefused)(event);
        } else {
            void onContinue();
        }
    }

    const before = stepBefore(step, asksBilling);
    // The choices' own names: the heading is the question each answers.
    const headingId = stepHeadingId(step);

    return (
        <Form {...form}>
            <form
                ref={formRef}
                onKeyDown={submitOnModEnter}
                onSubmit={onSubmit}
                data-step={step}
                noValidate
            >
                {/* Saroh's own words: a recording may read them. Digits
                    are hidden even here. */}
                <p
                    className="label mb-3 text-muted-foreground"
                    data-ph-unmask=""
                >
                    {stepEyebrow(step, another, asksBilling)}
                </p>

                {/* One step, and only this one. Keyed, so each arrives as
                    a new block and nothing of the step before is left in
                    the page. */}
                <SetupStepFrame
                    key={step}
                    step={step}
                    heading={stepHeading(step, kind)}
                    lead={stepLead(step, another)}
                    headingRef={headingRef}
                    hidden={!ready && step !== "kind"}
                    entering={moved}
                    arrival={arrival}
                    note={note}
                >
                    <>
                        {step === "kind" ? (
                            <FormField
                                control={form.control}
                                name="kind"
                                render={({ field }) => (
                                    <FormItem data-ph-unmask="">
                                        <SetupKindChoice
                                            value={field.value}
                                            onChange={(next) => {
                                                field.onChange(next);
                                                // The goal follows the kind
                                                // until one is picked by
                                                // hand.
                                                if (!goalPicked.current) {
                                                    form.setValue(
                                                        "goal",
                                                        defaultGoal(next),
                                                    );
                                                }
                                            }}
                                            labelledBy={headingId}
                                            describedBy={STEP_LEAD_ID}
                                        />
                                    </FormItem>
                                )}
                            />
                        ) : null}

                        {step === "name" ? (
                            <SetupNameStep
                                needsName={needsName}
                                availability={check.state}
                                taken={check.taken}
                                edited={edited}
                                onEdited={() => setEdited(true)}
                                otherCountry={otherCountry}
                                onOtherCountry={setOtherCountry}
                            />
                        ) : null}

                        {step === "billing" && billing ? (
                            <SetupBillingStep
                                billing={billing}
                                labelledBy={headingId}
                                describedBy={STEP_LEAD_ID}
                            />
                        ) : null}

                        {step === "first" ? (
                            <FormField
                                control={form.control}
                                name="goal"
                                render={({ field }) => (
                                    <FormItem data-ph-unmask="">
                                        <SetupGoalChoice
                                            goals={setupGoals(kind)}
                                            value={field.value}
                                            onChange={(next) => {
                                                goalPicked.current = true;
                                                field.onChange(next);
                                            }}
                                            labelledBy={headingId}
                                            describedBy={STEP_LEAD_ID}
                                        />
                                    </FormItem>
                                )}
                            />
                        ) : null}
                    </>
                </SetupStepFrame>

                <SetupFoot
                    position={stepPosition(step, another, asksBilling)}
                    count={stepCount(step, another, asksBilling)}
                    primary={stepPrimary(step, kind)}
                    busy={busy}
                    holding={holding}
                    onBack={before ? () => back(before) : undefined}
                    backTo={backTo}
                    email={email}
                />
            </form>
        </Form>
    );
}

interface SetupFormProps {
    /** Who is signed in, named beside the way out, so it is clear whose. */
    email: string;
    /** The account has no name yet, so setup asks for it. */
    needsName?: boolean;
    /** They have a business already: this is "Set up another". */
    another?: boolean;
    /** Where the first step's Back goes: the workspace they came from. */
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
    /** Said once, on the first step: why they are here again. */
    arrival?: React.ReactNode;
    /** Said on every step: the plan or the invite the create will act on. */
    note?: React.ReactNode;
    /**
     * The owner's billing profiles (DEC-167). With any, setup asks who
     * Saroh bills for the business; with none, it isn't asked, and the
     * first is made from the business.
     */
    billingProfiles?: readonly BillingProfileOption[];
}
