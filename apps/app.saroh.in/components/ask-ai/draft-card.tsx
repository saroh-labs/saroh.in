"use client";

import type { AskAiDraftCard, AskAiDraftResult } from "@saroh/api-contract";
import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { cn } from "@saroh/ui/lib/utils";
import { Notice } from "@saroh/ui/notice";
import { Check, Info, TriangleAlert, Undo2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { reportFailure } from "@/components/billing/plan-refusal";
import { useCanChangePlan } from "@/components/billing/plan-way";
import { runAction } from "@/lib/api/run-action";
import {
    confirmDraft,
    redraftDraft,
    undoDraft,
} from "@/lib/ask-ai/panel-actions";
import { upgradeHref } from "@/lib/billing/access";
import { plansShown } from "@/lib/saroh-billing/plans-shown";
import { WHO_CAN_CHANGE_PLAN } from "@saroh/ui/lib/state-copy";
import { draftWords, recordHref, valueText } from "./words";

/**
 * A draft Ask AI made, for the person to check (boards 4, 5, 14, 15, 16).
 * The AI only fills the card; Confirm runs the normal create or edit, and
 * Saroh checks it with the form's rules. A refusal lands inside the card
 * with every value kept. After Confirm: an edit is Done with Undo until the
 * business's day ends; a create is Added with Open it, never Undo. Every
 * value is drawn as text.
 */

/** Fields typed on the card are numbers when the tool takes a number. */
const NUMERIC = new Set(["price", "stock", "duration_minutes", "capacity"]);

export function DraftCard({
    card: first,
    phone = false,
    now = () => new Date(),
}: {
    card: AskAiDraftCard;
    phone?: boolean;
    now?: () => Date;
}) {
    const [card, setCard] = useState(first);
    const [result, setResult] = useState<AskAiDraftResult | null>(null);
    const [typed, setTyped] = useState<Record<string, string>>({});
    const [cancelled, setCancelled] = useState(false);
    const [busy, setBusy] = useState(false);
    const words = draftWords(card);
    const big = phone ? "coarse:h-11 h-11" : "";

    const settle = (
        res: Awaited<ReturnType<typeof confirmDraft>> | undefined,
    ) => {
        if (!res) return;
        if (!res.ok) {
            reportFailure(res);
            return;
        }
        setCard(res.data.card);
        setResult(res.data);
        setTyped({});
    };

    const confirm = async () => {
        const fields = Object.fromEntries(
            card.missing.map(({ field }) => {
                const v = (typed[field] ?? "").trim();
                return [field, NUMERIC.has(field) ? Number(v) : v];
            }),
        );
        settle(
            await runAction(
                () =>
                    confirmDraft(
                        card.draftId,
                        card.missing.length ? fields : undefined,
                    ),
                { setBusy },
            ),
        );
    };
    const undo = async () =>
        settle(await runAction(() => undoDraft(card.draftId), { setBusy }));
    const redraft = async () =>
        settle(await runAction(() => redraftDraft(card.draftId), { setBusy }));

    if (cancelled) {
        return (
            <p className="m-0 text-[13.5px] text-muted-foreground">
                {words.cancelled}
            </p>
        );
    }

    const confirmed =
        result?.outcome === "done" ||
        result?.outcome === "added" ||
        (!result && card.status === "confirmed");
    if (confirmed) {
        const create = card.action === "create";
        const canUndo = result
            ? result.canUndo
            : !create && now().getTime() < Date.parse(card.expiresAt);
        const openId = result?.open?.id ?? card.targetId;
        const openKind = result?.open?.kind ?? card.kind;
        return (
            <div className="flex flex-col gap-2.5 rounded-xl border border-border bg-card px-3.5 py-3">
                <div className="flex items-start gap-2.5" role="status">
                    <span className="inline-flex size-[26px] shrink-0 items-center justify-center rounded-full bg-success-subtle text-success-subtle-foreground">
                        <Check className="size-[15px]" aria-hidden />
                    </span>
                    <div className="min-w-0">
                        <b className="block text-sm">
                            {create ? "Added" : "Done"} · {card.targetName}
                        </b>
                        <span className="mt-px block text-[13px] text-neutral-700 dark:text-foreground">
                            {card.fields
                                .map((f) => valueText(f.new))
                                .filter(Boolean)
                                .join(" · ")}
                        </span>
                    </div>
                </div>
                <div className="flex flex-wrap gap-2">
                    {openId ? (
                        <Button
                            asChild
                            variant="outline"
                            size="sm"
                            className={big}
                        >
                            <Link href={recordHref(openKind, openId)}>
                                {create ? "Open it" : words.open}
                            </Link>
                        </Button>
                    ) : null}
                    {canUndo ? (
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className={big}
                            onClick={undo}
                            disabled={busy}
                            aria-busy={busy}
                        >
                            <Undo2 aria-hidden />
                            Undo
                        </Button>
                    ) : null}
                </div>
                {!create && card.note ? (
                    <p className="m-0 text-[12.5px] leading-[1.4] text-muted-foreground">
                        {card.note}
                    </p>
                ) : null}
            </div>
        );
    }

    if (result?.outcome === "undone" || card.status === "undone") {
        return (
            <p
                role="status"
                className="m-0 flex items-center gap-2 text-[13.5px] text-neutral-700 dark:text-foreground"
            >
                <Undo2 className="size-3.5 text-muted-foreground" aria-hidden />
                {result?.words ?? "Put back as it was."}
            </p>
        );
    }

    const refused = card.status === "refused" ? card.refusal : null;
    const open = card.status === "drafted";
    const missingDone = card.missing.every(
        ({ field }) => (typed[field] ?? "").trim() !== "",
    );
    const missingIds = new Set(card.missing.map((m) => m.field));

    return (
        <div
            role="group"
            aria-label={`${words.tag}, ${words.state.toLowerCase()}`}
            className="overflow-hidden rounded-xl border-[1.5px] border-foreground bg-card"
        >
            <div className="flex items-center gap-2 border-b border-muted bg-neutral-50 px-3.5 py-2.5 dark:bg-muted">
                <span className="label inline-flex h-5 items-center rounded-md bg-foreground px-[7px] text-background">
                    {words.tag}
                </span>
                <span className="ml-auto text-[12.5px] text-muted-foreground">
                    {card.status === "expired" ? "No longer open" : words.state}
                </span>
            </div>
            <dl className="m-0 grid grid-cols-[104px_minmax(0,1fr)] gap-x-3 px-3.5 py-1">
                {card.fields
                    .filter((f) => !missingIds.has(f.field))
                    .map((f, i) => (
                        <Row key={f.field} first={i === 0} label={f.label}>
                            {card.action === "edit" && valueText(f.old) ? (
                                <>
                                    <span className="font-normal text-muted-foreground line-through">
                                        {valueText(f.old)}
                                    </span>
                                    <span className="block font-semibold">
                                        {valueText(f.new)}
                                    </span>
                                </>
                            ) : (
                                valueText(f.new)
                            )}
                        </Row>
                    ))}
                {open
                    ? card.missing.map((m, i) => (
                          <Row
                              key={m.field}
                              first={i === 0 && card.fields.length === 0}
                              label={m.label}
                          >
                              <Input
                                  aria-label={`${m.label}, needed`}
                                  className={cn(
                                      "h-[34px] rounded-lg border-[1.5px] border-foreground px-2.5 font-medium placeholder:font-normal placeholder:text-destructive-subtle-foreground",
                                      phone && "h-11",
                                  )}
                                  inputMode={
                                      NUMERIC.has(m.field)
                                          ? "decimal"
                                          : undefined
                                  }
                                  placeholder={`Type the ${m.label.toLowerCase()}`}
                                  value={typed[m.field] ?? ""}
                                  onChange={(e) =>
                                      setTyped((t) => ({
                                          ...t,
                                          [m.field]: e.target.value,
                                      }))
                                  }
                              />
                              <span
                                  data-ph-unmask=""
                                  className="mt-1 block text-[12.5px] font-semibold text-destructive-subtle-foreground"
                              >
                                  Needed to add it
                              </span>
                          </Row>
                      ))
                    : null}
            </dl>
            {open && card.missing.length ? (
                <Notice
                    tone="warning"
                    icon={<Info />}
                    className="mx-3.5 mb-3 px-[11px] py-[9px] text-[13px]"
                >
                    Type it on the card. Changes to this card don&apos;t use a
                    question.
                </Notice>
            ) : null}
            {refused ? (
                <Notice
                    tone="warning"
                    role="alert"
                    icon={
                        refused.reason === "duplicate" ||
                        refused.reason === "missing" ? (
                            <Info />
                        ) : (
                            <TriangleAlert />
                        )
                    }
                    className="mx-3.5 mb-3 px-[11px] py-[9px] text-[13px]"
                >
                    {refused.words}
                </Notice>
            ) : null}
            <div className="flex flex-wrap items-center gap-2 border-t border-muted px-3.5 py-3">
                {open ? (
                    <>
                        {card.note ? (
                            <p className="m-0 basis-full text-[12.5px] leading-[1.4] text-muted-foreground">
                                {card.note}
                            </p>
                        ) : null}
                        <Button
                            type="button"
                            className={big}
                            onClick={confirm}
                            disabled={busy || !missingDone}
                            aria-busy={busy}
                        >
                            {words.confirm}
                        </Button>
                    </>
                ) : null}
                {refused ? (
                    <RefusedWays
                        card={card}
                        busy={busy}
                        big={big}
                        onRedraft={redraft}
                        openLabel={words.open}
                    />
                ) : null}
                {open || refused ? (
                    <Button
                        type="button"
                        variant="link"
                        size="inline"
                        className="ml-1 min-h-11 px-1.5 text-[13px] text-foreground underline decoration-border-strong underline-offset-[3px] min-[760px]:min-h-0"
                        onClick={() => setCancelled(true)}
                    >
                        Cancel
                    </Button>
                ) : null}
            </div>
        </div>
    );
}

function Row({
    first,
    label,
    children,
}: {
    first: boolean;
    label: string;
    children: React.ReactNode;
}) {
    const line = first ? "" : "border-t border-muted";
    return (
        <>
            <dt
                className={cn(
                    "m-0 py-2 text-[13.5px] text-muted-foreground",
                    line,
                )}
            >
                {label}
            </dt>
            <dd
                className={cn(
                    "m-0 min-w-0 py-2 text-[13.5px] font-medium [overflow-wrap:anywhere]",
                    line,
                )}
            >
                {children}
            </dd>
        </>
    );
}

function RefusedWays({
    card,
    busy,
    big,
    onRedraft,
    openLabel,
}: {
    card: AskAiDraftCard;
    busy: boolean;
    big: string;
    onRedraft: () => void;
    openLabel: string;
}) {
    const canChangePlan = useCanChangePlan();
    const reason = card.refusal?.reason;
    if (reason === "plan-limit") {
        if (!canChangePlan) {
            return (
                <p className="m-0 basis-full text-[12.5px] leading-[1.4] text-muted-foreground">
                    {WHO_CAN_CHANGE_PLAN}
                </p>
            );
        }
        return plansShown() ? (
            <Button asChild className={big}>
                <Link href={upgradeHref()}>See plans</Link>
            </Button>
        ) : null;
    }
    if (reason === "duplicate" && card.refusal?.existingId) {
        return (
            <Button asChild variant="outline" className={big}>
                <Link href={recordHref(card.kind, card.refusal.existingId)}>
                    Open the one you have
                </Link>
            </Button>
        );
    }
    if (reason === "changed") {
        return (
            <>
                <p
                    data-ph-unmask=""
                    className="m-0 basis-full text-[12.5px] leading-[1.4] text-muted-foreground"
                >
                    Draft again doesn&apos;t use a question.
                </p>
                <Button
                    type="button"
                    className={big}
                    onClick={onRedraft}
                    disabled={busy}
                    aria-busy={busy}
                >
                    Draft again
                </Button>
                {card.targetId ? (
                    <Button asChild variant="outline" className={big}>
                        <Link href={recordHref(card.kind, card.targetId)}>
                            {openLabel}
                        </Link>
                    </Button>
                ) : null}
            </>
        );
    }
    return null;
}
