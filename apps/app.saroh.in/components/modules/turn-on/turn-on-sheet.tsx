"use client";

import { Button } from "@saroh/ui/button";
import { Skeleton } from "@saroh/ui/skeleton";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import {
    FormSheet,
    FormSheetBody,
    FormSheetFoot,
} from "@/components/shared/forms/form-sheet";
import { BLOCKER_COPY } from "@/lib/modules/blocker-copy";
import type { ModuleView } from "@/lib/modules/schema";
import { listWords } from "@/lib/modules/switch-plan";
import {
    bookingPageLine,
    comesWithLines,
    CONNECT_KEYS,
    GIVES,
    GIVES_OFFLINE,
    hasSetup,
    moduleName,
} from "@/lib/modules/turn-on";
import type { ConnectLock } from "@/lib/providers/connect-lock";
import { connectLockFor, connectLockLine } from "@/lib/providers/connect-lock";

import { PlanWay } from "@/components/billing/plan-way";
import { Refusal } from "@/components/shared/states/refusal";
import { Notice } from "@saroh/ui/notice";
import { TextLink } from "@saroh/ui/text-link";
import { BookingsFields } from "./bookings-fields";
import { Section } from "./field";
import { ConnectChoice, SellFields, WebsiteFields } from "./setup-fields";
import { useTurnOn } from "./use-turn-on";

/**
 * The one "Turn on" sheet (DEC-068), used from every place a module is
 * turned on: Settings › Modules, Home's first run, `/onboarding/modules`
 * and "Also sell". It names the module in the app's words, says what comes
 * with it (the modules it needs, in plain words), and asks only the minimum
 * that makes it work, filled in from the API's defaults. "Turn on" saves:
 * each module in order, what is needed first. Everything else is "Finish
 * setup", on the module's first screen, where the merchant lands.
 *
 * Several picks (onboarding) are one sheet: one form with a section per
 * module that asks for something, and one "Turn on".
 *
 * It is the app's one sheet frame (`FormSheet`): the fields scroll and
 * Cancel and Turn on stay at the foot. Nothing closes it while it is
 * turning things on.
 *
 * Payments or Communications with nothing else to fill in turns on with
 * nothing connected. "Turn on and connect" is the quieter second way: it
 * goes on to Settings › Providers once it is on, because connecting a
 * provider is a sheet of keys of its own and not something to nest here.
 */
export function TurnOnSheet({
    picked,
    modules,
    onOpenChange,
    firstRun,
}: {
    /** The modules to turn on; null when the sheet is closed. */
    picked: readonly string[] | null;
    /** Every module, as the API lists them: for what each one needs. */
    modules: readonly ModuleView[];
    onOpenChange: (open: boolean) => void;
    /**
     * Opened from a first run (Home's "What will you do first?" or the
     * module picker): it lands on the thing itself, as setup does.
     */
    firstRun?: boolean;
}) {
    const [session, setSession] = useState(0);
    // Said by the body, which knows what the plan lets the business connect.
    const [says, setSays] = useState<string | null>(null);
    const open = !!picked && picked.length > 0;
    const close = () => {
        onOpenChange(false);
        setSession((n) => n + 1);
    };
    const names = (picked ?? []).map((k) => moduleName(k, modules));
    const single = picked?.length === 1 ? picked[0] : undefined;
    return (
        <FormSheet
            id="turn-on-form"
            open={open}
            title={`Turn on ${listWords(names)}`}
            description={
                says ??
                (single && GIVES[single]
                    ? GIVES[single]
                    : "Each one works as soon as it's on. Anything else waits in Finish setup.")
            }
            onClose={close}
        >
            {open ? (
                <TurnOnBody
                    key={`${session}:${picked.join(",")}`}
                    picked={picked}
                    modules={modules}
                    onClose={close}
                    onSays={setSays}
                    firstRun={firstRun}
                />
            ) : null}
        </FormSheet>
    );
}

function TurnOnBody({
    picked,
    modules,
    onClose,
    onSays,
    firstRun,
}: {
    picked: readonly string[];
    modules: readonly ModuleView[];
    onClose: () => void;
    firstRun?: boolean;
    /** The line under the title, once what can be connected is known. */
    onSays: (line: string | null) => void;
}) {
    const t = useTurnOn({ picked, modules, onClose, firstRun });
    const { draft, plan } = t;
    const single = picked.length === 1 ? picked[0] : undefined;
    const fielded = plan.order.filter(hasSetup);
    // A provider the plan won't let the business connect is never offered
    // (UX-006): its module says so in place of "Connect now / Later".
    const lockOf = (k: string) => connectLockFor(k, t.locks);
    const connecting = plan.order.filter(
        (k) => CONNECT_KEYS.has(k) && !lockOf(k),
    );
    // Payments or Communications with nothing else to fill in: its two
    // answers are the sheet's two buttons.
    const connectButtons =
        connecting.length > 0 && fielded.length === 0 ? connecting : null;
    const titled = plan.order.length > 1;
    const errorsOf = (k: string) => t.errors[k] ?? {};

    const comes = [
        ...(picked.length > 1
            ? picked.flatMap((k) =>
                  GIVES[k] ? [`${moduleName(k, modules)}: ${GIVES[k]}`] : [],
              )
            : []),
        ...comesWithLines(plan, modules, t.apiDeps),
        ...(plan.websiteForShop
            ? [
                  "Selling online needs a website for your online shop, so Website comes with it.",
              ]
            : []),
        ...[bookingPageLine(plan, t.bookingPage)].flatMap((line) =>
            line ? [line] : [],
        ),
    ];

    const shopNote = !draft
        ? null
        : plan.websiteForShop
          ? `Your online shop goes on your website at ${draft.WEBSITE.address ? `${draft.WEBSITE.address}.saroh.app/shop` : "/shop on your web address"}. We'll set up the website for you.`
          : null;

    // A module whose provider the plan won't connect is described as the
    // kind it turns on as.
    const offline =
        single && lockOf(single) && GIVES_OFFLINE[single]
            ? GIVES_OFFLINE[single]
            : null;
    useEffect(() => {
        onSays(offline);
        return () => onSays(null);
    }, [offline, onSays]);

    const off = !t.ready || t.hidden.length > 0;

    return (
        <>
            <FormSheetBody className="gap-5">
                {comes.length > 0 ? (
                    <section className="grid gap-1.5">
                        <h3 className="label">What comes with it</h3>
                        <ul className="grid gap-1 text-pretty text-[12.5px] leading-normal text-foreground">
                            {comes.map((line) => (
                                <li key={line}>{line}</li>
                            ))}
                        </ul>
                    </section>
                ) : null}

                {t.hidden.length > 0 ? (
                    <Notice role="alert">
                        {BLOCKER_COPY.ROLLOUT_DISABLED}
                    </Notice>
                ) : !draft ? (
                    <div className="grid gap-3" aria-label="Loading">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-[38px] w-full" />
                        <Skeleton className="h-4 w-40" />
                        <Skeleton className="h-[38px] w-full" />
                    </div>
                ) : (
                    <>
                        {plan.order.map((k): ReactNode => {
                            const title = titled
                                ? moduleName(k, modules)
                                : undefined;
                            if (k === "COMMERCE") {
                                return (
                                    <Section key={k} title={title}>
                                        <SellFields
                                            draft={draft}
                                            update={t.update}
                                            errors={errorsOf(k)}
                                            shopNote={shopNote}
                                        />
                                    </Section>
                                );
                            }
                            if (k === "APPOINTMENTS") {
                                return (
                                    <Section key={k} title={title}>
                                        <BookingsFields
                                            draft={draft}
                                            update={t.update}
                                            errors={errorsOf(k)}
                                        />
                                    </Section>
                                );
                            }
                            if (k === "WEBSITE") {
                                return (
                                    <Section key={k} title={title}>
                                        <WebsiteFields
                                            draft={draft}
                                            update={t.update}
                                            errors={errorsOf(k)}
                                            suggestion={t.suggestion}
                                            template={t.websiteTemplate}
                                            choices={t.websiteChoices}
                                            addressFixed={t.websiteAddressFixed}
                                        />
                                    </Section>
                                );
                            }
                            const lock = CONNECT_KEYS.has(k) ? lockOf(k) : null;
                            if (lock) {
                                return (
                                    <Section key={k} title={title}>
                                        <ConnectLocked
                                            moduleKey={k}
                                            lock={lock}
                                        />
                                    </Section>
                                );
                            }
                            if (CONNECT_KEYS.has(k) && !connectButtons) {
                                return (
                                    <Section key={k} title={title}>
                                        <ConnectChoice
                                            moduleKey={k}
                                            draft={draft}
                                            update={t.update}
                                        />
                                    </Section>
                                );
                            }
                            return null;
                        })}
                        {fielded.length === 0 &&
                        !connectButtons &&
                        !plan.order.some((k) => lockOf(k)) ? (
                            <p className="text-[12.5px] text-muted-foreground">
                                Nothing to fill in here. Anything it still needs
                                is said once it&apos;s on.
                            </p>
                        ) : null}
                        {connectButtons ? (
                            <p className="text-pretty text-[12.5px] leading-normal text-muted-foreground">
                                It turns on with nothing connected. Turn on and
                                connect goes on to Settings › Providers once
                                it&apos;s on.
                            </p>
                        ) : null}
                    </>
                )}

                <Refusal>{t.failure}</Refusal>
            </FormSheetBody>
            <FormSheetFoot
                saveLabel="Turn on"
                savingLabel="Turning on…"
                pending={t.saving}
                saveOff={off}
                extra={
                    connectButtons ? (
                        <Button
                            type="button"
                            variant="outline"
                            disabled={off || t.saving}
                            onClick={() => void t.submit(true)}
                        >
                            Turn on and connect
                        </Button>
                    ) : null
                }
                onSubmit={() => t.submit(connectButtons ? false : undefined)}
            />
        </>
    );
}

/**
 * In place of "Connect now / Later" when the plan won't let the business
 * connect this provider (DEC-091, UX-006): what it means, and See plans.
 * The module still turns on — Payments as the offline kind.
 */
function ConnectLocked({
    moduleKey,
    lock,
}: {
    moduleKey: string;
    lock: ConnectLock;
}) {
    return (
        <div className="grid gap-2 rounded-[9px] bg-muted px-3 py-2.5 text-[12.5px] leading-normal">
            <p className="text-pretty">{connectLockLine(moduleKey, lock)}</p>
            <PlanWay className="text-[length:inherit]">
                <TextLink href={lock.href} className="justify-self-start">
                    {lock.cta}
                </TextLink>
            </PlanWay>
        </div>
    );
}
