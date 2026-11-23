"use client";

import type { AskAiDraftCard, AskAiDraftResult } from "@saroh/api-contract";
import { Button } from "@saroh/ui/button";
import { CheckRow } from "@saroh/ui/check-row";
import { Input } from "@saroh/ui/input";
import { cn } from "@saroh/ui/lib/utils";
import { Notice } from "@saroh/ui/notice";
import { Check, Info, PenLine, TriangleAlert, Undo2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { reportFailure } from "@/components/billing/plan-refusal";
import { useCanChangePlan } from "@/components/billing/plan-way";
import { CustomerPicker } from "@/components/commerce/new-order/customer-picker";
import { runAction } from "@/lib/api/run-action";
import {
    confirmDraft,
    handOffDraft,
    redraftDraft,
    undoDraft,
} from "@/lib/ask-ai/panel-actions";
import { upgradeHref } from "@/lib/billing/access";
import type { CustomerPick } from "@/lib/customers/picker";
import { plansShown } from "@/lib/saroh-billing/plans-shown";
import { WHO_CAN_CHANGE_PLAN } from "@saroh/ui/lib/state-copy";
import { saySiteDraftChanged, saySitePhotoPreview } from "./open";
import {
    draftWords,
    editorHref,
    recordHref,
    valueText,
    wordDiff,
} from "./words";

/**
 * A draft Ask AI made, for the person to check (boards 4, 5, 14, 15, 16).
 * The AI only fills the card; Confirm runs the normal create or edit, and
 * Saroh checks it with the form's rules. A refusal lands inside the card
 * with every value kept. After Confirm: an edit is Done with Undo until the
 * business's day ends; a create is Added with Open it, never Undo. Every
 * value is drawn as text.
 *
 * A blog post can also go to the post editor unsaved (Open in editor,
 * owner 14 Nov): the draft is marked handed off, so the card says so and
 * no longer offers Save as draft (one post, saved from the editor).
 */

/** Fields typed on the card are numbers when the tool takes a number. */
const NUMERIC = new Set(["price", "stock", "duration_minutes", "capacity"]);

/**
 * What a card became (applied, undone), by draft: a card drawn again (the
 * editor's right column switching tabs, the editor reading its draft
 * again after Apply) shows where it got to, not the draft it began as.
 */
const settled = new Map<
    string,
    { card: AskAiDraftCard; result: AskAiDraftResult }
>();

/** Tests draw the same draft ids again. */
export function forgetSettledDrafts() {
    settled.clear();
}

export function DraftCard({
    card: first,
    phone = false,
    now = () => new Date(),
}: {
    card: AskAiDraftCard;
    phone?: boolean;
    now?: () => Date;
}) {
    const [card, setCard] = useState(
        () => settled.get(first.draftId)?.card ?? first,
    );
    const [result, setResult] = useState<AskAiDraftResult | null>(
        () => settled.get(first.draftId)?.result ?? null,
    );
    const [typed, setTyped] = useState<Record<string, string>>({});
    const [who, setWho] = useState<CustomerPick | null>(null);
    const [cancelled, setCancelled] = useState(false);
    const [busy, setBusy] = useState(false);
    // Check this (RULES §5): the facts the person said are right.
    const [sure, setSure] = useState<ReadonlySet<string>>(new Set());
    const router = useRouter();
    const words = draftWords(card);
    const big = phone ? "coarse:h-11 h-11" : "";
    // A photo drafted for a section shows on the open page's canvas, dashed
    // and "not applied yet", for as long as the card is open (AIImgApply A).
    const place = card.kind === "image" ? card.targetId?.split(":") : undefined;
    const previewing =
        place?.[0] === "section" &&
        card.status === "drafted" &&
        !cancelled &&
        !result;
    const previewSrc = thumbSrc(
        card.fields.find((f) => f.field === "photo")?.new,
    );
    const previewAlt = card.fields.find((f) => f.field === "alt")?.new;
    const placeKey = place?.join(":");
    useEffect(() => {
        if (!previewing || !previewSrc || !placeKey) return;
        const [, siteId = "", pageId = "", ...key] = placeKey.split(":");
        const sectionKey = key.join(":");
        saySitePhotoPreview({
            kind: "set",
            siteId,
            pageId,
            sectionKey,
            src: previewSrc,
            alt: typeof previewAlt === "string" ? previewAlt : "",
        });
        return () => saySitePhotoPreview({ kind: "clear", sectionKey });
    }, [previewing, previewSrc, previewAlt, placeKey]);

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
        settled.set(res.data.card.draftId, {
            card: res.data.card,
            result: res.data,
        });
        // A section's words changed in the website's draft: the open
        // editor reads it again (owner, 21 Nov).
        const outcome = res.data.outcome;
        if (
            res.data.card.kind === "section" &&
            (outcome === "done" || outcome === "undone")
        ) {
            saySiteDraftChanged(res.data.card.targetId?.split(":")[0] ?? "");
        }
        // A photo on a section or a post changed the website's draft too.
        const place = res.data.card.targetId?.split(":");
        if (
            res.data.card.kind === "image" &&
            (place?.[0] === "section" || place?.[0] === "post") &&
            (outcome === "done" || outcome === "undone")
        ) {
            saySiteDraftChanged(place[1] ?? "");
        }
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
                    card.checks?.length
                        ? confirmDraft(
                              card.draftId,
                              undefined,
                              Array.from(sure),
                          )
                        : confirmDraft(
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
    const openEditor = async () => {
        const res = await runAction(() => handOffDraft(card.draftId), {
            setBusy,
        });
        if (!res) return;
        if (!res.ok) {
            reportFailure(res);
            return;
        }
        setCard(res.data.card);
        router.push(editorHref(res.data.siteId, card.draftId));
    };

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
        // A blog post's preview is long: its card says it is a draft instead.
        const post = card.kind === "blog_post";
        // A booking made here can be called off the same day (AF 4).
        const undoable = !create || card.tool === "create_booking";
        const canUndo = result
            ? result.canUndo
            : undoable && now().getTime() < Date.parse(card.expiresAt);
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
                            {words.done} · {card.targetName}
                        </b>
                        {post ? null : (
                            <span className="mt-px block text-[13px] text-neutral-700 dark:text-foreground">
                                {card.fields
                                    .map((f) => valueText(f.new, f.field))
                                    .filter(Boolean)
                                    .join(" · ")}
                            </span>
                        )}
                    </div>
                </div>
                <div className="flex flex-wrap gap-2">
                    {openId && card.kind !== "section" ? (
                        <Button
                            asChild
                            variant="outline"
                            size="sm"
                            className={big}
                        >
                            <Link href={recordHref(openKind, openId)}>
                                {create
                                    ? (words.editor ?? "Open it")
                                    : words.open}
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
                {(!create || post) && card.note ? (
                    <p className="m-0 text-[12.5px] leading-[1.4] text-muted-foreground">
                        {card.note}
                    </p>
                ) : null}
            </div>
        );
    }

    if (card.status === "handed_off" && words.editor) {
        return (
            <div className="flex flex-col gap-2.5 rounded-xl border border-border bg-card px-3.5 py-3">
                <div className="flex items-start gap-2.5" role="status">
                    <span className="inline-flex size-[26px] shrink-0 items-center justify-center rounded-full bg-muted text-foreground">
                        <PenLine className="size-[14px]" aria-hidden />
                    </span>
                    <b className="min-w-0 text-sm [overflow-wrap:anywhere]">
                        {words.handedOff} · {card.targetName}
                    </b>
                </div>
                <div>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className={big}
                        onClick={openEditor}
                        disabled={busy}
                        aria-busy={busy}
                    >
                        {words.editor}
                    </Button>
                </div>
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
                <span className="inline-flex h-5 items-center rounded-md bg-foreground px-[7px] text-[11px] font-semibold text-background">
                    {words.tag}
                </span>
                <span className="ml-auto text-[12.5px] text-muted-foreground">
                    {card.status === "expired" ? "No longer open" : words.state}
                </span>
            </div>
            {card.kind === "image" ? (
                <PhotoWords card={card} />
            ) : card.kind === "section" ? (
                <SectionWords
                    card={card}
                    open={open}
                    sure={sure}
                    onSure={(id, on) =>
                        setSure((all) => {
                            const next = new Set(all);
                            if (on) next.add(id);
                            else next.delete(id);
                            return next;
                        })
                    }
                />
            ) : (
                <dl className="m-0 grid grid-cols-[104px_minmax(0,1fr)] gap-x-3 px-3.5 py-1">
                    {card.tool === "update_orders_status" ? (
                        // AF 8: which orders, before the step they move to.
                        <Row first label="Orders">
                            {card.targetName}
                        </Row>
                    ) : null}
                    {card.fields
                        .filter((f) => !missingIds.has(f.field))
                        .map((f, i) => (
                            <Row
                                key={f.field}
                                first={
                                    i === 0 &&
                                    card.tool !== "update_orders_status"
                                }
                                label={f.label}
                            >
                                {card.action === "edit" &&
                                valueText(f.old, f.field) ? (
                                    <>
                                        <span className="font-normal text-muted-foreground line-through">
                                            {valueText(f.old, f.field)}
                                        </span>
                                        <span className="block font-semibold">
                                            {valueText(f.new, f.field)}
                                        </span>
                                    </>
                                ) : (
                                    valueText(f.new, f.field)
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
                                  {m.field === "customer_id" ? (
                                      // Who a booking is for (AF 4): one of the
                                      // business's customers, picked by search.
                                      <CustomerPicker
                                          value={who}
                                          allowAdd={false}
                                          showAttention={false}
                                          onPick={(pick) => {
                                              setWho(pick);
                                              setTyped((t) => ({
                                                  ...t,
                                                  customer_id:
                                                      pick?.kind === "contact"
                                                          ? pick.id
                                                          : "",
                                              }));
                                          }}
                                      />
                                  ) : (
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
                                  )}
                                  <span
                                      data-ph-unmask=""
                                      // A prompt, not an error: nothing was tried yet.
                                      className="mt-1 block text-[12.5px] text-muted-foreground"
                                  >
                                      {m.field === "customer_id"
                                          ? "Needed to book it"
                                          : "Needed to add it"}
                                  </span>
                              </Row>
                          ))
                        : null}
                </dl>
            )}
            {open && card.missing.length ? (
                <Notice
                    tone="neutral"
                    icon={<Info />}
                    className="mx-3.5 mb-3 px-[11px] py-[9px] text-[13px]"
                >
                    {card.tool === "create_booking"
                        ? "Pick who it's for. They get a confirmation. This card doesn't use a question."
                        : "Type it on the card. Changes to this card don't use a question."}
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
                            disabled={
                                busy ||
                                !missingDone ||
                                (card.checks ?? []).some((c) => !sure.has(c.id))
                            }
                            aria-busy={busy}
                        >
                            {words.confirm}
                        </Button>
                        {words.editor ? (
                            <Button
                                type="button"
                                variant="outline"
                                className={big}
                                onClick={openEditor}
                                disabled={busy}
                                aria-busy={busy}
                            >
                                {words.editor}
                            </Button>
                        ) : null}
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
                        {card.kind === "section" || card.kind === "image"
                            ? "Not now"
                            : "Cancel"}
                    </Button>
                ) : null}
            </div>
        </div>
    );
}

/**
 * A section's words (owner, 21 Nov; plan U42): the section's name, then
 * Now and New for each field, the words that differ marked; then Check
 * this for every fact the owner never gave (RULES §5), each ticked before
 * Apply; and what the suggestion is based on.
 */
function SectionWords({
    card,
    open,
    sure,
    onSure,
}: {
    card: AskAiDraftCard;
    open: boolean;
    sure: ReadonlySet<string>;
    onSure: (id: string, on: boolean) => void;
}) {
    const checks = card.checks ?? [];
    return (
        <div data-section-words="" className="flex flex-col gap-3 px-3.5 py-3">
            <b className="text-sm [overflow-wrap:anywhere]">
                {card.targetName}
            </b>
            {card.fields.map((f) => {
                const diff = wordDiff(
                    valueText(f.old, f.field),
                    valueText(f.new, f.field),
                );
                return (
                    <div key={f.field} className="flex flex-col gap-1">
                        <span className="label text-muted-foreground">
                            {f.label}
                        </span>
                        <p className="m-0 text-[13.5px] text-muted-foreground [overflow-wrap:anywhere]">
                            <span
                                data-ph-unmask=""
                                className="mr-1.5 text-[12px] font-semibold"
                            >
                                Now
                            </span>
                            <Words words={diff.now} mark="del" />
                        </p>
                        <p className="m-0 text-[13.5px] font-medium [overflow-wrap:anywhere]">
                            <span
                                data-ph-unmask=""
                                className="mr-1.5 text-[12px] font-semibold text-muted-foreground"
                            >
                                New
                            </span>
                            <Words words={diff.next} mark="ins" />
                        </p>
                    </div>
                );
            })}
            {checks.length ? (
                <div
                    data-check-this=""
                    className="flex flex-col gap-1.5 rounded-lg border border-warning-subtle-foreground/40 bg-warning-subtle px-3 py-2.5 text-warning-subtle-foreground"
                >
                    <b className="flex items-center gap-1.5 text-[13px]">
                        <TriangleAlert aria-hidden className="size-3.5" />
                        Check this
                    </b>
                    {checks.map((c) => (
                        <CheckRow
                            key={c.id}
                            checked={sure.has(c.id)}
                            disabled={!open}
                            onChange={(on) => onSure(c.id, on)}
                            className="items-start text-foreground"
                        >
                            <span>
                                <b>“{c.words}”</b> is right.{" "}
                                <span className="text-muted-foreground">
                                    {c.why}.
                                </span>
                            </span>
                        </CheckRow>
                    ))}
                </div>
            ) : null}
            {card.basedOn ? (
                <p className="m-0 text-[12.5px] text-muted-foreground">
                    Based on: {card.basedOn}.
                </p>
            ) : null}
        </div>
    );
}

/** A photo's address, only when it is a web address of ours to draw. */
export function thumbSrc(value: unknown): string | null {
    return typeof value === "string" && value.startsWith("https://")
        ? value
        : null;
}

/**
 * A photo placed (owner, 22 Nov): where it goes, then Now and New, each a
 * thumbnail with its words (the card's only new part), and what the
 * suggestion is based on.
 */
function PhotoWords({ card }: { card: AskAiDraftCard }) {
    const photo = card.fields.find((f) => f.field === "photo");
    const alt = card.fields.find((f) => f.field === "alt");
    const rows = [
        { key: "Now", value: photo?.old, words: undefined },
        { key: "New", value: photo?.new, words: alt?.new },
    ];
    return (
        <div data-photo-words="" className="flex flex-col gap-3 px-3.5 py-3">
            <b className="text-sm [overflow-wrap:anywhere]">
                {card.targetName}
            </b>
            <span className="label text-muted-foreground">
                {photo?.label ?? "Photo"}
            </span>
            {rows.map((r) => {
                const src = thumbSrc(r.value);
                return (
                    <div
                        key={r.key}
                        className="grid grid-cols-[44px_minmax(0,1fr)] items-center gap-2 text-[13.5px]"
                    >
                        <span
                            data-ph-unmask=""
                            className={cn(
                                "text-[12px] font-semibold",
                                r.key === "Now" && "text-muted-foreground",
                            )}
                        >
                            {r.key}
                        </span>
                        {src ? (
                            <span className="flex min-w-0 items-center gap-2.5">
                                {/* eslint-disable-next-line @next/next/no-img-element -- the business's own photo, by address */}
                                <img
                                    src={src}
                                    alt=""
                                    className="size-14 shrink-0 rounded-[10px] border border-border object-cover"
                                />
                                {typeof r.words === "string" && r.words ? (
                                    <span className="min-w-0 [overflow-wrap:anywhere]">
                                        {r.words}
                                    </span>
                                ) : null}
                            </span>
                        ) : (
                            <span
                                data-ph-unmask=""
                                className="text-muted-foreground"
                            >
                                No photo
                            </span>
                        )}
                    </div>
                );
            })}
            {card.basedOn ? (
                <p className="m-0 text-[12.5px] text-muted-foreground">
                    Based on: {card.basedOn}.
                </p>
            ) : null}
        </div>
    );
}

/** Words drawn as text, the changed ones marked. */
function Words({
    words,
    mark,
}: {
    words: { word: string; changed: boolean }[];
    mark: "del" | "ins";
}) {
    if (!words.length) return <span data-ph-unmask="">(none)</span>;
    return (
        <>
            {words.map((w, i) => (
                <span key={i}>
                    {i ? " " : null}
                    {!w.changed ? (
                        w.word
                    ) : mark === "del" ? (
                        <del className="rounded-sm bg-destructive-subtle px-0.5 text-destructive-subtle-foreground">
                            {w.word}
                        </del>
                    ) : (
                        <ins className="rounded-sm bg-success-subtle px-0.5 text-success-subtle-foreground no-underline">
                            {w.word}
                        </ins>
                    )}
                </span>
            ))}
        </>
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
