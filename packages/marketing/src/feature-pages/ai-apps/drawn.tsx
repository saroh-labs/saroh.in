import { Check, ChevronRight, Lock } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "../../cn";
import type { AiAppsWords } from "./words";

/**
 * The AI apps page's drawn screens, shared by its sections and its "How it
 * works" steps: Claude's connector form, Saroh's sign-in and consent (one
 * per move in `connect.moves`), and Saroh's record of a connection.
 */
export const PANEL =
    "overflow-hidden rounded-mk-card border border-border bg-card";

/** Move `i` of "Connected in three moves", drawn. */
export function MovePanel({
    w,
    i,
    className,
}: {
    w: AiAppsWords;
    i: number;
    className?: string;
}) {
    const m = w.connect.moves[i];
    return (
        <div
            role="img"
            aria-label={m.label}
            className={cn(PANEL, "min-h-[300px]", className)}
        >
            <div className="flex h-10 items-center gap-1.5 border-b border-mk-line-row bg-mk-noon px-3.5 text-[13px] text-mk-copy">
                {m.claude ? (
                    <>
                        {m.bar[0]}
                        <ChevronRight aria-hidden className="size-3.5" />
                        {m.bar[1]}
                    </>
                ) : (
                    <>
                        <Lock aria-hidden className="size-3.5" />
                        {w.connect.signIn.host}
                    </>
                )}
            </div>
            <div className="grid gap-3 p-4">
                {i === 0 ? (
                    <>
                        <div className="text-[15px] font-semibold">
                            {w.connect.form.title}
                        </div>
                        <Field label={w.connect.form.name[0]}>
                            {w.connect.form.name[1]}
                        </Field>
                        <Field label={w.connect.form.addr}>
                            <span className="truncate font-mono text-[13px]">
                                {w.connect.address}
                            </span>
                            <em className="ml-auto text-[12.5px] font-semibold not-italic">
                                {w.connect.form.copy}
                            </em>
                        </Field>
                        <Block>{w.connect.form.add}</Block>
                    </>
                ) : i === 1 ? (
                    <>
                        <span className="font-display text-[20px] font-bold tracking-[-0.04em]">
                            Saroh
                            <i className="ml-0.5 inline-block size-1.5 rounded-full bg-brand-500" />
                        </span>
                        <h5 className="m-0 text-[17px] font-semibold">
                            {w.connect.signIn.title}
                        </h5>
                        <Field label={w.connect.signIn.email[0]}>
                            {w.connect.signIn.email[1]}
                        </Field>
                        <Block>{w.connect.signIn.go}</Block>
                        <p className="m-0 text-[13px] text-muted-foreground">
                            {w.connect.signIn.note}
                        </p>
                    </>
                ) : (
                    <>
                        <h5 className="m-0 text-[16px] font-semibold leading-snug">
                            {w.connect.consent.title}
                        </h5>
                        <div className="grid gap-1.5 text-[14px]">
                            <span className="flex items-center gap-2.5">
                                <span className="size-[18px] rounded border border-border-strong" />
                                {w.connect.consent.all}
                            </span>
                            <span className="flex items-center gap-2.5 font-semibold">
                                <span className="flex size-[18px] items-center justify-center rounded bg-foreground text-background">
                                    <Check aria-hidden className="size-3" />
                                </span>
                                {w.connect.consent.one}
                            </span>
                        </div>
                        <div className="rounded-xl bg-mk-noon px-3 py-2.5 text-[13px]">
                            <b className="font-semibold">
                                {w.connect.consent.able}
                            </b>
                            <ul className="m-0 mt-1 grid gap-1 pl-4">
                                {w.connect.consent.can.map((x) => (
                                    <li key={x}>{x}</li>
                                ))}
                            </ul>
                        </div>
                        <Block>{w.connect.consent.allow}</Block>
                    </>
                )}
            </div>
        </div>
    );
}

/** Saroh's panel for one connection: what it changed, Roll back and Disconnect. */
export function RecordPanel({
    w,
    className,
}: {
    w: AiAppsWords;
    className?: string;
}) {
    return (
        <div
            role="img"
            aria-label={w.cant.panel.label}
            className={cn(PANEL, "p-4", className)}
        >
            <h5 className="m-0 text-[16px] font-semibold">
                {w.cant.panel.title}
            </h5>
            <div className="text-[13px] text-muted-foreground">
                {w.cant.panel.sub}
            </div>
            {w.cant.panel.rows.map(([x, t]) => (
                <div
                    key={x}
                    className="mt-2 flex justify-between gap-3 border-t border-mk-line-row pt-2 text-[14px]"
                >
                    {x}
                    <span className="shrink-0 font-mono text-[13px] text-muted-foreground">
                        {t}
                    </span>
                </div>
            ))}
            <div className="mt-3 flex flex-wrap gap-2">
                <span className="inline-flex h-10 items-center rounded-[9px] border border-border-strong px-3.5 text-[14px] font-semibold">
                    {w.cant.panel.buttons[0]}
                </span>
                <span className="ml-auto inline-flex h-10 items-center rounded-[9px] border border-border-strong px-3.5 text-[14px] font-semibold text-mk-warn">
                    {w.cant.panel.buttons[1]}
                </span>
            </div>
        </div>
    );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div>
            <span className="block text-[12.5px] font-semibold text-mk-copy">
                {label}
            </span>
            <div className="mt-1 flex h-10 items-center gap-2 rounded-[9px] border border-border px-3 text-[14px]">
                {children}
            </div>
        </div>
    );
}

function Block({ children }: { children: ReactNode }) {
    return (
        <span className="flex h-10 items-center justify-center rounded-[9px] bg-foreground text-[14px] font-semibold text-background">
            {children}
        </span>
    );
}
