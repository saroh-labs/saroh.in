"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetTitle,
} from "@saroh/ui/sheet";
import { Skeleton } from "@saroh/ui/skeleton";
import type { ReactNode } from "react";
import { useRef, useState } from "react";

import { useBottomBarInset } from "@/lib/hooks/use-bottom-bar-inset";
import { useNarrow } from "@/lib/hooks/use-narrow";
import { BLOCKER_COPY } from "@/lib/modules/blocker-copy";
import type { ModuleView } from "@/lib/modules/schema";
import { listWords } from "@/lib/modules/switch-plan";
import {
    comesWithLines,
    CONNECT_KEYS,
    GIVES,
    hasSetup,
    moduleName,
} from "@/lib/modules/turn-on";

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
 * From the right at a desk; from the bottom, full height, on a phone, with
 * its actions stuck to the foot (`useBottomBarInset`).
 */
export function TurnOnSheet({
    picked,
    modules,
    onOpenChange,
}: {
    /** The modules to turn on; null when the sheet is closed. */
    picked: readonly string[] | null;
    /** Every module, as the API lists them: for what each one needs. */
    modules: readonly ModuleView[];
    onOpenChange: (open: boolean) => void;
}) {
    const narrow = useNarrow();
    const [session, setSession] = useState(0);
    const [busy, setBusy] = useState(false);
    const open = !!picked && picked.length > 0;
    const close = () => {
        onOpenChange(false);
        setSession((n) => n + 1);
    };
    const guard = (event: Event) => {
        // Half-way through turning things on, a stray tap doesn't close it.
        if (busy) event.preventDefault();
    };
    return (
        <Sheet open={open} onOpenChange={(o) => (o ? undefined : close())}>
            <SheetContent
                side={narrow ? "bottom" : "right"}
                onInteractOutside={guard}
                onEscapeKeyDown={guard}
                className={cn(
                    "flex flex-col gap-0 p-0",
                    narrow
                        ? "h-dvh max-h-dvh"
                        : "h-full w-full sm:max-w-[460px]",
                )}
            >
                {open ? (
                    <TurnOnBody
                        key={`${session}:${picked.join(",")}`}
                        picked={picked}
                        modules={modules}
                        onClose={close}
                        onBusy={setBusy}
                    />
                ) : null}
            </SheetContent>
        </Sheet>
    );
}

function TurnOnBody({
    picked,
    modules,
    onClose,
    onBusy,
}: {
    picked: readonly string[];
    modules: readonly ModuleView[];
    onClose: () => void;
    onBusy: (busy: boolean) => void;
}) {
    const t = useTurnOn({ picked, modules, onClose });
    const { draft, plan } = t;
    const names = picked.map((k) => moduleName(k, modules));
    const single = picked.length === 1 ? picked[0] : undefined;
    const fielded = plan.order.filter(hasSetup);
    const connecting = plan.order.filter((k) => CONNECT_KEYS.has(k));
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
    ];

    const shopNote = !draft
        ? null
        : plan.websiteForShop
          ? `Your online shop goes on your website at ${draft.WEBSITE.address || "your address"}.saroh.app/shop — we'll set up the website for you.`
          : null;

    const submit = async (connect?: boolean) => {
        onBusy(true);
        await t.submit(connect);
        onBusy(false);
    };

    return (
        <>
            <div className="border-b border-border px-[18px] py-3.5 pr-12">
                <SheetTitle className="font-display text-[18px] font-semibold tracking-[-0.02em]">
                    Turn on {listWords(names)}
                </SheetTitle>
                <SheetDescription className="mt-0.5 text-pretty text-[12.5px] leading-normal text-muted-foreground">
                    {single && GIVES[single]
                        ? GIVES[single]
                        : "Each one works as soon as it's on. Anything else waits in Finish setup."}
                </SheetDescription>
            </div>

            <form
                id="turn-on-form"
                noValidate
                aria-busy={t.saving || !t.ready || undefined}
                onSubmit={(e) => {
                    e.preventDefault();
                    void submit();
                }}
                className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-[18px] py-4"
            >
                {comes.length > 0 ? (
                    <section className="grid gap-1.5">
                        <h3 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                            What comes with it
                        </h3>
                        <ul className="grid gap-1 text-pretty text-[12.5px] leading-normal text-foreground">
                            {comes.map((line) => (
                                <li key={line}>{line}</li>
                            ))}
                        </ul>
                    </section>
                ) : null}

                {t.hidden.length > 0 ? (
                    <p
                        role="alert"
                        className="rounded-[9px] bg-muted px-3 py-2.5 text-[12.5px]"
                    >
                        {BLOCKER_COPY.ROLLOUT_DISABLED}
                    </p>
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
                        {fielded.length === 0 && !connectButtons ? (
                            <p className="text-[12.5px] text-muted-foreground">
                                Nothing to fill in. It works as soon as
                                it&apos;s on.
                            </p>
                        ) : null}
                        {connectButtons ? (
                            <p className="text-pretty text-[12.5px] leading-normal text-muted-foreground">
                                Connect now to go to Settings › Providers once
                                it&apos;s on, or later: it turns on with nothing
                                connected.
                            </p>
                        ) : null}
                    </>
                )}

                {t.failure ? (
                    <p
                        role="alert"
                        className="rounded-[9px] border border-destructive-subtle-foreground/40 bg-destructive-subtle px-3 py-2.5 text-[12.5px] text-destructive-subtle-foreground"
                    >
                        {t.failure}
                    </p>
                ) : null}
            </form>

            <ActionBar>
                {connectButtons ? (
                    <>
                        <Button
                            type="button"
                            variant="outline"
                            disabled={
                                !t.ready || t.saving || t.hidden.length > 0
                            }
                            onClick={() => void submit(false)}
                            className="h-[38px] rounded-[9px] px-3.5 text-[13px] font-semibold coarse:h-11"
                        >
                            Later
                        </Button>
                        <Button
                            type="button"
                            disabled={
                                !t.ready || t.saving || t.hidden.length > 0
                            }
                            onClick={() => void submit(true)}
                            className="h-[38px] rounded-[9px] px-3.5 text-[13px] font-semibold coarse:h-11"
                        >
                            {t.saving ? "Turning on…" : "Connect now"}
                        </Button>
                    </>
                ) : (
                    <>
                        <Button
                            type="button"
                            variant="outline"
                            disabled={t.saving}
                            onClick={onClose}
                            className="h-[38px] rounded-[9px] px-3.5 text-[13px] font-semibold coarse:h-11"
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            form="turn-on-form"
                            disabled={
                                !t.ready || t.saving || t.hidden.length > 0
                            }
                            className="h-[38px] rounded-[9px] px-3.5 text-[13px] font-semibold coarse:h-11"
                        >
                            {t.saving ? "Turning on…" : "Turn on"}
                        </Button>
                    </>
                )}
            </ActionBar>
        </>
    );
}

/** The sheet's foot: its actions, and the height a toast rises above. */
function ActionBar({ children }: { children: ReactNode }) {
    const ref = useRef<HTMLDivElement>(null);
    useBottomBarInset(ref);
    return (
        <div
            ref={ref}
            className="flex flex-wrap items-center justify-end gap-2 border-t border-border bg-card px-[18px] py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
        >
            {children}
        </div>
    );
}
