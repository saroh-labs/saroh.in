"use client";

import { Avatar, AvatarFallback, avatarInitials } from "@saroh/ui/avatar";
import { Button } from "@saroh/ui/button";
import { RadioCards } from "@saroh/ui/choice-group";
import { CopyButton } from "@saroh/ui/copy-button";
import { DatePicker } from "@saroh/ui/date-picker";
import { FormSheet } from "@saroh/ui/form-sheet";
import { Label } from "@saroh/ui/label";
import { Switch } from "@saroh/ui/switch";
import { Textarea } from "@saroh/ui/textarea";
import { TimeSelect } from "@saroh/ui/time-select";
import { showError, showSuccess } from "@saroh/ui/toast";
import { AlertCircle, Check, Globe, MessageCircle, Share2 } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useId, useState } from "react";

import { useBusinessZone } from "@/components/shared/dates/business-zone";
import { ShareItemButton } from "@/components/shared/share-item/share-item-sheet";
import { useEditorLayout } from "@/components/sites/editor/use-editor-layout";
import { runAction } from "@/lib/api/run-action";
import {
    requestPostApproval,
    schedulePost,
    unschedulePost,
} from "@/lib/content/actions";
import type {
    PostCheckFlag,
    PostLiveCopy,
    PostRevision,
} from "@/lib/content/service";
import { wallClockToIso } from "@/lib/courses/sessions";
import { formatDateTime } from "@/lib/format/datetime";
import { count } from "@/lib/format/plural";
import { whatsappHref } from "@/lib/share-item/share";
import type { PostDraftView, PostPart } from "@/lib/sites/post-diff";
import { POST_PART_WORDS, postChanges } from "@/lib/sites/post-diff";
import {
    readPostChecks,
    readPostRevision,
    readPostRevisions,
} from "@/lib/sites/post-revisions-read";
import { whatsappMessage } from "@/lib/sites/share-words";
import { nextSlot, whenIn, zoneName } from "@/lib/sites/zone-time";

import type { PostEditorModel } from "../editor/post-model";
import type { PostFields } from "../editor/use-post-draft";
import {
    approversLine,
    approversNote,
    sentForApprovalWords,
} from "../review/approval-words";

/** One line of "Checked": done, or what to do about it. */
export interface PostCheck {
    ok: boolean;
    text: string;
}

/** The photos in a post's writing, and how many carry no description. */
function bodyPhotos(html: string): { all: number; bare: number } {
    const tags = html.match(/<img\b[^>]*>/gi) ?? [];
    const bare = tags.filter(
        (t) => !/\balt\s*=\s*(["'])\s*\S[^"']*\1/i.test(t),
    ).length;
    return { all: tags.length, bare };
}

/**
 * What Publish post checks before it goes (RULES §6, the part the editor
 * can see for itself): every photo described, and a short description for
 * the blog and share cards. Prices beside services and links that don't
 * open are the API's (`serverChecks`). Each is a warning: none stops the
 * post.
 */
export function postChecks(fields: PostFields): PostCheck[] {
    const checks: PostCheck[] = [];
    const body = bodyPhotos(fields.content);
    const cover = fields.image.trim() !== "";
    const bareCover = cover && fields.imageAlt.trim() === "";
    const bare = body.bare + (bareCover ? 1 : 0);
    if (body.all + (cover ? 1 : 0) > 0) {
        checks.push(
            bare === 0
                ? { ok: true, text: "Every photo is described" }
                : {
                      ok: false,
                      text: `${count(bare, "photo")} not described.${bareCover ? " Describe the cover in Details › Cover." : ""}${body.bare > 0 ? " Select a photo in the writing to describe it." : ""}`,
                  },
        );
    }
    checks.push(
        fields.excerpt.trim()
            ? { ok: true, text: "Short description is set" }
            : {
                  ok: false,
                  text: "No short description. The blog and share cards show the first lines instead.",
              },
    );
    return checks;
}

/**
 * The API's checks as Checked lines (U18): each flag as it is, else that
 * prices agree with Services and every link opens. `null` is a check that
 * couldn't run, said so rather than passed.
 */
export function serverChecks(flags: PostCheckFlag[] | null): PostCheck[] {
    if (flags === null) {
        return [
            {
                ok: false,
                text: "Couldn't check prices and links. Publishing still works.",
            },
        ];
    }
    const prices = flags.filter(
        (f) => f.type === "priceMismatch" || f.type === "freeClaim",
    );
    const links = flags.filter((f) => f.type === "brokenLink");
    const rest = flags.filter((f) => !prices.includes(f) && !links.includes(f));
    return [
        ...(prices.length === 0
            ? [{ ok: true, text: "Prices match Services" }]
            : prices.map((f) => ({ ok: false, text: f.message }))),
        ...(links.length === 0
            ? [{ ok: true, text: "Every link opens" }]
            : links.map((f) => ({ ok: false, text: f.message }))),
        ...rest.map((f) => ({ ok: false, text: f.message })),
    ];
}

/** A copy of the post as `postChanges` compares against it. */
function asLive(view: PostDraftView): PostLiveCopy {
    return { ...view, shareImageUrl: null, path: null, publishedAt: null };
}

/**
 * Who last changed each part since the live copy (U18 "who made them"),
 * from the versions kept since, oldest first. What is on screen after the
 * newest version is its writer's: anyone else's save keeps a version.
 */
export function lastChangedBy(
    live: PostLiveCopy,
    versions: { view: PostDraftView; by: string | null }[],
    draft: PostDraftView,
): Partial<Record<PostPart, string>> {
    const out: Partial<Record<PostPart, string>> = {};
    let before = live;
    for (const step of [
        ...versions,
        { view: draft, by: versions.at(-1)?.by ?? null },
    ]) {
        for (const part of postChanges(step.view, before)) {
            if (step.by) out[part] = step.by;
        }
        before = asLive(step.view);
    }
    return out;
}

/** How many versions since the live copy are read to say who changed what. */
const VERSIONS_READ = 10;

/** The API's checks and who changed what, read once the sheet opens. */
function usePublishReads(
    model: PostEditorModel,
    category: string,
): {
    flags: PostCheckFlag[] | null | "loading";
    by: Partial<Record<PostPart, string>>;
} {
    const { data, draft, liveCopy } = model;
    const postId = draft.postId;
    const [flags, setFlags] = useState<PostCheckFlag[] | null | "loading">(
        postId ? "loading" : [],
    );
    const [by, setBy] = useState<Partial<Record<PostPart, string>>>({});
    // Read once per opening (the sheet is mounted per opening), from what
    // was on screen when it opened.
    const [start] = useState(() => ({ ...draft.fields, category }));
    const { content } = start;
    useEffect(() => {
        if (!postId) return;
        let gone = false;
        void readPostChecks(data.siteId, postId, content).then((f) => {
            if (!gone) setFlags(f);
        });
        return () => {
            gone = true;
        };
    }, [data.siteId, postId, content]);

    const since = draft.live ? liveCopy?.publishedAt : null;
    useEffect(() => {
        if (!postId || !liveCopy || !since) return;
        const run = { gone: false };
        const nameOf = (id: string | null) =>
            data.categories.find((c) => c.id === id)?.name ?? "";
        const viewOf = (r: PostRevision): PostDraftView => ({
            title: r.title,
            content: r.content,
            excerpt: r.excerpt ?? "",
            image: r.image ?? "",
            imageAlt: r.imageAlt ?? "",
            slug: r.slug,
            category: nameOf(r.categoryId),
            seoTitle: r.seoTitle ?? "",
            seoDescription: r.seoDescription ?? "",
        });
        void (async () => {
            // Names are a nicety: any read that fails leaves them out.
            const list = await readPostRevisions(data.siteId, postId);
            if (!list.ok) return;
            const newer = list.rows
                .filter((r) => r.createdAt >= since)
                .slice(0, VERSIONS_READ)
                .reverse();
            const full = await Promise.all(
                newer.map((r) => readPostRevision(data.siteId, postId, r.id)),
            );
            if (run.gone || full.some((r) => r === null)) return;
            setBy(
                lastChangedBy(
                    liveCopy,
                    (full as PostRevision[]).map((r) => ({
                        view: viewOf(r),
                        by: r.savedBy?.name ?? null,
                    })),
                    start,
                ),
            );
        })().catch(() => undefined);
        return () => {
            run.gone = true;
        };
    }, [data.siteId, data.categories, postId, since, liveCopy, start]);
    return { flags, by };
}

/** The post's public link: the page read's, else built from the address. */
export function postUrl(model: PostEditorModel): string | null {
    const { data, draft } = model;
    const slug = draft.fields.slug.trim();
    if (data.address && slug) {
        return `https://${data.address}/${data.postsPrefix}/${slug}`;
    }
    return data.share?.url ?? null;
}

/** A day picked in the date picker, as "2026-11-21". */
function dayKey(date: Date): string {
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${date.getFullYear()}-${m}-${d}`;
}

function dateOf(key: string): Date {
    const [y = 1970, m = 1, d = 1] = key.split("-").map(Number);
    return new Date(y, m - 1, d);
}

const H3 = "text-sm font-semibold";

/** When's rows: focus is the row's inset ink edge; only this sheet's radios lose their ring. */
const WHEN_FOCUS =
    "has-[:focus-visible]:shadow-[inset_0_0_0_1px_hsl(var(--foreground))] [&_[role=radio]:focus-visible]:ring-0 [&_[role=radio]:focus-visible]:ring-offset-0";

/**
 * Publish post (U18, `blogdesk/WXWPublish`, `blogphone/WXYPublish`): the post
 * and where it lives, the changes that go live (against the live copy, no
 * Leave out: a post goes whole, C9), Checked, When (Now, or Later at a day
 * and time in the business's zone), then "Goes live now, on its own". Once
 * it is live the same sheet is Tell people.
 *
 * `open` runs on Publish post and on the status chip; `node` is drawn once
 * by the shell. The phone post editor calls the same hook with its model:
 * a side sheet at a desk, a bottom sheet on a phone.
 */
export function usePublishPost(model: PostEditorModel): {
    open: () => void;
    node: ReactNode;
} {
    const [open, setOpen] = useState(false);
    return {
        open: () => {
            if (model.needsTitle()) return;
            setOpen(true);
        },
        node: open ? (
            <PublishPostSheet model={model} onClose={() => setOpen(false)} />
        ) : null,
    };
}

/** The sheet itself, mounted per opening so each starts at Now. */
export function PublishPostSheet({
    model,
    onClose,
}: {
    model: PostEditorModel;
    onClose: () => void;
}) {
    const zone = useBusinessZone();
    const id = useId();
    const phone = useEditorLayout() === "phone";
    const { data, draft, liveCopy } = model;
    const { fields } = draft;
    const slot = nextSlot(new Date(), zone);
    const [when, setWhen] = useState<"now" | "later">("now");
    const [date, setDate] = useState<Date | undefined>(dateOf(slot.date));
    const [time, setTime] = useState(slot.time);
    const [timeError, setTimeError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [live, setLive] = useState(false);
    const [note, setNote] = useState("");
    // Y2: what to open once it is live, chosen before it goes.
    const [tell, setTell] = useState<TellChoice>({
        social: true,
        whatsapp: true,
    });
    // O7: a teammate's Publish post is Send for approval (WXYApproval).
    const asking = model.approval?.mustAsk ?? false;
    const approvers = model.approval?.approvers ?? [];

    const url = postUrl(model);
    const shown = url?.replace(/^https?:\/\//, "") ?? null;
    const at = date ? wallClockToIso(dayKey(date), time, zone) : null;
    const category =
        data.categories.find((c) => c.id === fields.categoryId)?.name ?? "";
    const changes = draft.live
        ? postChanges({ ...fields, category }, liveCopy)
        : [];
    const reads = usePublishReads(model, category);

    if (live) {
        return (
            <FormSheet
                open
                bottomOnPhone
                title="Live now"
                description={shown ?? fields.title}
                dirty={false}
                doneOnly
                onClose={onClose}
            >
                <TellPeople model={model} only={tell} />
            </FormSheet>
        );
    }

    async function publishNow() {
        if (!(await draft.publish())) return;
        // Nothing to tell anyone: the sheet's job is done.
        if (!tell.social && !tell.whatsapp) onClose();
        else setLive(true);
    }

    async function publishLater() {
        if (!at) {
            setTimeError("Pick a day for it to go live.");
            return;
        }
        setBusy(true);
        const postId =
            draft.dirty || !draft.postId
                ? await runAction(() => draft.save({ silent: true }))
                : draft.postId;
        if (!postId) {
            setBusy(false);
            return;
        }
        const res = await runAction(
            () => schedulePost(data.siteId, postId, at),
            {
                setBusy,
            },
        );
        if (!res) return;
        if (!res.ok) {
            if (res.field === "at") setTimeError(res.error);
            else showError(res.error);
            return;
        }
        showSuccess(`Scheduled for ${whenIn(res.data.scheduledAt, zone)}.`);
        draft.refresh();
        onClose();
    }

    /** Save first if needed, so what is approved is what they see. */
    async function savedId(): Promise<string | null> {
        const postId =
            draft.dirty || !draft.postId
                ? await runAction(() => draft.save({ silent: true }))
                : draft.postId;
        return postId ?? null;
    }

    async function sendForApproval() {
        if (when === "later" && !at) {
            setTimeError("Pick a day for it to go live.");
            return;
        }
        setBusy(true);
        const postId = await runAction(savedId);
        if (!postId) {
            setBusy(false);
            return;
        }
        const res = await runAction(
            () =>
                requestPostApproval(data.siteId, postId, {
                    note: note.trim() || null,
                    ...(when === "later" && at ? { at } : {}),
                }),
            { setBusy },
        );
        if (!res) return;
        if (!res.ok) {
            if (res.field === "at") setTimeError(res.error);
            else showError(res.error);
            return;
        }
        showSuccess(sentForApprovalWords(approvers));
        draft.refresh();
        onClose();
    }

    async function unschedule() {
        if (!draft.postId) return;
        const postId = draft.postId;
        const res = await runAction(() => unschedulePost(data.siteId, postId), {
            setBusy,
        });
        if (!res) return;
        if (!res.ok) {
            showError(res.error);
            return;
        }
        showSuccess("It won't go live later. It stays a draft.");
        draft.refresh();
    }

    const checks = [
        ...postChecks(fields),
        ...(reads.flags === "loading" ? [] : serverChecks(reads.flags)),
    ];

    const whenSection = (
        <section className="grid gap-2">
            <h3 id={`${id}-when`} className={H3}>
                When
            </h3>
            <RadioCards
                labelledBy={`${id}-when`}
                // The sheet opens with the keyboard on the chosen radio:
                // the board's light focus (`WXYPublish`, Y2·4), an inset
                // ink edge on the row, not the radio's 2px offset ring.
                rowClassName={WHEN_FOCUS}
                value={when}
                onChange={(v) => {
                    setWhen(v);
                    setTimeError(null);
                }}
                options={
                    asking
                        ? [
                              {
                                  value: "now",
                                  label: "As soon as it is approved",
                              },
                              {
                                  value: "later",
                                  label: "After approval, on a day I pick",
                              },
                          ]
                        : [
                              {
                                  value: "now",
                                  label: "Now",
                                  note: "Visitors see it in a minute or two.",
                              },
                              {
                                  value: "later",
                                  label: "Later",
                                  note: "Pick a day and time. The live copy stays as it is until then.",
                              },
                          ]
                }
            />
            {when === "later" ? (
                <div className="grid gap-2">
                    <div className="flex flex-wrap gap-3">
                        <div className="grid gap-1.5">
                            <Label htmlFor={`${id}-date`}>Day</Label>
                            <DatePicker
                                id={`${id}-date`}
                                value={date}
                                onValueChange={(d) => {
                                    setDate(d);
                                    setTimeError(null);
                                }}
                                disabledDays={{ before: dateOf(slot.date) }}
                            />
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor={`${id}-time`}>Time</Label>
                            <TimeSelect
                                id={`${id}-time`}
                                value={time}
                                onValueChange={(t) => {
                                    setTime(t);
                                    setTimeError(null);
                                }}
                            />
                        </div>
                    </div>
                    {timeError ? (
                        <p
                            role="alert"
                            className="text-[0.8125rem] font-semibold text-destructive"
                        >
                            {timeError}
                        </p>
                    ) : null}
                    <p className="text-xs text-muted-foreground">
                        In {zoneName(zone)}, your business&apos;s time zone.
                        Changes you make before then go live with it.
                    </p>
                </div>
            ) : null}
        </section>
    );

    return (
        <FormSheet
            open
            bottomOnPhone
            title={asking ? "Send for approval" : "Publish this post"}
            // The phone's sheet title is the board's 28px bold (Y2.3).
            className="max-sm:[&_h2]:text-[1.75rem] max-sm:[&_h2]:font-bold max-sm:[&_h2]:leading-tight"
            description={
                asking
                    ? "Posts on this site go live once a reviewer, an admin or the owner approves them. Any one of them is enough. Nothing changes on the site until then."
                    : "Only this post goes live. Other changes on your site keep waiting until you publish them."
            }
            dirty={false}
            pending={busy || draft.publishing}
            saveLabel={
                asking
                    ? "Send for approval"
                    : when === "now"
                      ? "Publish post"
                      : "Schedule"
            }
            savingLabel={
                asking
                    ? "Sending…"
                    : when === "now"
                      ? "Publishing…"
                      : "Scheduling…"
            }
            footNote={
                // O7: a teammate's request (WXWPublish's variant, WXYApproval).
                asking
                    ? "You can keep writing. Changes after you send go for approval too."
                    : when === "now"
                      ? "Goes live now, on its own. Site changes waiting stay waiting."
                      : at
                        ? `Goes live ${whenIn(at, zone)}, on its own. Until then the live copy stays as it is.`
                        : "Goes live on the day you pick, on its own."
            }
            onClose={onClose}
            onSubmit={
                asking
                    ? sendForApproval
                    : when === "now"
                      ? publishNow
                      : publishLater
            }
            // One column that may shrink: a long link or title truncates
            // instead of pushing the sheet sideways.
            fieldsClassName="grid-cols-[minmax(0,1fr)] gap-5"
        >
            {asking ? (
                <section data-approvers="" className="grid gap-3">
                    <div className="flex items-center gap-3 rounded-xl border bg-card p-3">
                        <span aria-hidden className="flex shrink-0 -space-x-2">
                            {approvers.slice(0, 3).map((a) => (
                                <Avatar key={a.id} size="list">
                                    <AvatarFallback>
                                        {avatarInitials(a.name)}
                                    </AvatarFallback>
                                </Avatar>
                            ))}
                        </span>
                        <span className="min-w-0 text-[0.8125rem] text-muted-foreground">
                            <b className="block text-sm text-foreground">
                                {approvers.length > 0
                                    ? approversLine(approvers)
                                    : "A reviewer, an admin or the owner"}
                            </b>
                            {approversNote(approvers.length)}
                        </span>
                    </div>
                    <div className="grid gap-1.5">
                        <Label
                            htmlFor={`${id}-note`}
                            className="flex items-baseline justify-between"
                        >
                            Note for whoever approves
                            <span className="text-xs font-normal text-muted-foreground">
                                Optional
                            </span>
                        </Label>
                        <Textarea
                            id={`${id}-note`}
                            rows={3}
                            maxLength={500}
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                        />
                    </div>
                </section>
            ) : null}
            {/* On a phone, one link row with a globe (`WXYPublish`): the title is the page's. */}
            <div className="flex items-center gap-3.5 rounded-xl border bg-card p-3 max-sm:gap-2.5 max-sm:py-2.5">
                {fields.image.trim() ? (
                    // eslint-disable-next-line @next/next/no-img-element -- a merchant-supplied absolute URL
                    <img
                        src={fields.image}
                        alt=""
                        className="h-[54px] w-24 shrink-0 rounded-md object-cover max-sm:hidden"
                    />
                ) : null}
                {shown ? (
                    <Globe
                        aria-hidden
                        className="size-4 shrink-0 text-muted-foreground sm:hidden"
                    />
                ) : null}
                <div className="min-w-0 text-[0.8125rem] text-muted-foreground">
                    <b className="block truncate text-sm text-foreground max-sm:sr-only">
                        {fields.title}
                    </b>
                    {shown ? (
                        <span className="block truncate font-mono text-xs max-sm:text-[0.8125rem] max-sm:text-foreground">
                            {shown}
                        </span>
                    ) : null}
                    <span className="block max-sm:sr-only">
                        {draft.liveAt
                            ? `Live since ${formatDateTime(draft.liveAt, zone)}`
                            : "Not live yet"}
                        {draft.live && data.readBy !== null
                            ? ` · Read by ${data.readBy}`
                            : ""}
                    </span>
                </div>
            </div>

            {/* A phone puts When straight under the link (`WXYPublish`, Y2). */}
            {phone ? whenSection : null}

            {model.scheduledAt ? (
                <div
                    data-scheduled=""
                    className="flex flex-wrap items-center gap-2 rounded-xl border bg-info-subtle px-3.5 py-2.5 text-[0.8125rem] text-info-subtle-foreground"
                >
                    <span className="min-w-0 flex-1">
                        Scheduled for {formatDateTime(model.scheduledAt, zone)}.
                        Publishing now goes instead.
                    </span>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() => void unschedule()}
                    >
                        Don&apos;t publish it later
                    </Button>
                </div>
            ) : null}

            {draft.live ? (
                <section className="grid gap-2" data-post-changes="">
                    <h3 className={H3}>
                        {changes.length === 0
                            ? "Nothing has changed since it went live"
                            : `${count(changes.length, "change")} go${changes.length === 1 ? "es" : ""} live`}
                    </h3>
                    {changes.length > 0 ? (
                        <ul className="divide-y rounded-xl border bg-card text-sm">
                            {changes.map((p) => (
                                <li
                                    key={p}
                                    className="flex items-baseline gap-2 px-3.5 py-2.5"
                                >
                                    {POST_PART_WORDS[p]}
                                    {reads.by[p] ? (
                                        <span className="min-w-0 truncate text-[0.8125rem] text-muted-foreground">
                                            {reads.by[p]}
                                        </span>
                                    ) : null}
                                </li>
                            ))}
                        </ul>
                    ) : null}
                </section>
            ) : null}

            <section className="grid gap-2">
                <h3 className={H3}>Checked</h3>
                {reads.flags === "loading" ? (
                    <p className="text-[0.8125rem] text-muted-foreground">
                        Checking prices and links…
                    </p>
                ) : null}
                <ul className="grid gap-1.5 text-[0.8125rem]">
                    {checks.map((c) => (
                        <li
                            key={c.text}
                            data-check={c.ok ? "ok" : "warn"}
                            className="flex items-start gap-2"
                        >
                            {c.ok ? (
                                <Check
                                    aria-hidden
                                    className="mt-0.5 size-4 shrink-0 text-success"
                                />
                            ) : (
                                <AlertCircle
                                    aria-hidden
                                    className="mt-0.5 size-4 shrink-0 text-warning"
                                />
                            )}
                            {c.text}
                        </li>
                    ))}
                </ul>
            </section>

            {phone ? null : whenSection}

            {/* Last, after When (`WXWPublish`, `WXYPublish`): never under the footer's fold first. */}
            {asking || when === "later" ? null : (
                <TellOnceLive model={model} value={tell} onChange={setTell} />
            )}
        </FormSheet>
    );
}

/**
 * Tell people (`WXWStates`/`WXYStates` "Just published"): the post's link to
 * copy, Share as a post for Instagram and Facebook (#1375, once the page has
 * read its share setup), and a WhatsApp caption with the link. Each is
 * optional. Email to subscribers waits for the newsletter (batch 4); a QR
 * per post waits for a post target in QR codes.
 *
 * Exported for the phone editor's "Just published" sheet.
 */
/** Which of Tell people's ways to show once it is live (Y2). */
export interface TellChoice {
    social: boolean;
    whatsapp: boolean;
}

/**
 * "Tell people once it is live" (Y2, `WXWPublish`, `WXYPublish`): before
 * Publish, the ways Tell people will offer, each on or off. Nothing is
 * sent: once it is live the sheet shows the ones left on. Email waits for
 * the newsletter (batch 4); short links and QR wait for batch 6 (C5).
 */
function TellOnceLive({
    model,
    value,
    onChange,
}: {
    model: PostEditorModel;
    value: TellChoice;
    onChange: (next: TellChoice) => void;
}) {
    const id = useId();
    const rows: { key: keyof TellChoice; title: string; note: string }[] = [
        ...(model.data.share
            ? [
                  {
                      key: "social" as const,
                      title: "Post to Instagram and Facebook",
                      note: "Opens Share with the cover and short description filled in.",
                  },
              ]
            : []),
        {
            key: "whatsapp",
            title: "WhatsApp status",
            note: "A caption with the post's link.",
        },
    ];
    return (
        // Switches in one card, its heading inside (`WXYPublish`, Y2).
        <section
            data-tell-once-live=""
            aria-labelledby={`${id}-tell`}
            className="grid gap-1 rounded-xl border bg-card px-3.5 py-3"
        >
            <h3 id={`${id}-tell`} className={H3}>
                Tell people once it is live
            </h3>
            <ul className="grid">
                {rows.map((r) => (
                    <li key={r.key} className="flex items-center gap-3 py-2">
                        <Label
                            data-ph-unmask=""
                            htmlFor={`${id}-${r.key}`}
                            className="grid min-w-0 flex-1 gap-0.5 font-normal"
                        >
                            <b className="text-sm font-semibold">{r.title}</b>
                            <span className="text-[0.8125rem] text-muted-foreground">
                                {r.note}
                            </span>
                        </Label>
                        <Switch
                            id={`${id}-${r.key}`}
                            checked={value[r.key]}
                            onCheckedChange={(on) =>
                                onChange({ ...value, [r.key]: on })
                            }
                        />
                    </li>
                ))}
            </ul>
        </section>
    );
}

export function TellPeople({
    model,
    only = { social: true, whatsapp: true },
}: {
    model: PostEditorModel;
    /** The ways chosen in Publish post (Y2); every way by default. */
    only?: TellChoice;
}) {
    const { data, draft } = model;
    const { fields } = draft;
    const url = postUrl(model);
    const shown = url?.replace(/^https?:\/\//, "") ?? null;
    const caption = shown
        ? whatsappMessage(
              {
                  title: fields.title,
                  seoDescription: fields.excerpt || null,
              },
              data.siteName,
              shown,
          )
        : null;
    const row =
        "flex min-h-14 items-center gap-3 rounded-xl border bg-card px-3.5 py-2.5";
    return (
        <div data-tell-people="" className="grid gap-3">
            <p
                role="status"
                className="flex items-center gap-2 text-sm font-semibold text-success"
            >
                <Check aria-hidden className="size-[18px]" />
                Live now
            </p>
            {url && shown ? (
                <div className="flex min-w-0 items-center gap-2 rounded-lg border bg-muted/50 py-1 pl-3 pr-1">
                    <span className="min-w-0 flex-1 truncate font-mono text-sm">
                        {shown}
                    </span>
                    <CopyButton
                        value={url}
                        label="Copy link"
                        thing="link"
                        variant="ghost"
                        className="coarse:min-h-11"
                    />
                </div>
            ) : null}
            <h3 className={H3}>Tell people</h3>
            {data.share && only.social ? (
                <div className={row}>
                    <Share2 aria-hidden className="size-[18px] shrink-0" />
                    <span className="min-w-0 flex-1 text-[0.8125rem] text-muted-foreground">
                        <b className="block text-sm text-foreground">
                            Instagram and Facebook
                        </b>
                        Cover and short description filled in
                    </span>
                    <ShareItemButton
                        setup={data.share.setup}
                        className="border"
                        item={{
                            kind: "post",
                            ref: fields.slug,
                            name: fields.title,
                            price: null,
                            url: data.share.url,
                            offerId: null,
                            hasPhoto: Boolean(fields.image.trim()),
                            summary: fields.excerpt,
                        }}
                    />
                </div>
            ) : null}
            {caption && only.whatsapp ? (
                <div className={row}>
                    <MessageCircle
                        aria-hidden
                        className="size-[18px] shrink-0"
                    />
                    <span className="min-w-0 flex-1 text-[0.8125rem] text-muted-foreground">
                        <b className="block text-sm text-foreground">
                            WhatsApp status
                        </b>
                        A caption with the post&apos;s link
                    </span>
                    <CopyButton
                        value={caption}
                        label="Copy caption"
                        thing="caption"
                        variant="outline"
                        icon={false}
                    />
                    <Button asChild variant="outline" size="sm">
                        <a
                            href={whatsappHref(caption)}
                            target="_blank"
                            rel="noreferrer"
                        >
                            Open WhatsApp
                        </a>
                    </Button>
                </div>
            ) : null}
        </div>
    );
}
