"use client";

import { FailedState, LoadingState } from "@saroh/ui/data-state";
import { FormSheet } from "@saroh/ui/form-sheet";
import { showError, showSuccess } from "@saroh/ui/toast";
import { useEffect, useState } from "react";

import { useBusinessZone } from "@/components/shared/dates/business-zone";
import { runAction } from "@/lib/api/run-action";
import { restorePostRevision } from "@/lib/content/actions";
import { postParagraphs } from "@/lib/content/plain-text";
import type { PostRevision, PostRevisionRow } from "@/lib/content/service";
import { formatDateTime } from "@/lib/format/datetime";
import { formatNumber } from "@/lib/format/money";
import {
    diffCounts,
    paragraphDiff,
    POST_PART_WORDS,
    postChanges,
} from "@/lib/sites/post-diff";
import { readPostRevision } from "@/lib/sites/post-revisions-read";

import type { PostEditorModel } from "../editor/post-model";
import { readingOf } from "../editor/writing-surface";
import { DiffKey, DiffParagraphs, DiffRuns } from "../review/diff-text";
import { revisionWhy } from "./version-words";

/** "50 fewer than now", "12 more than now", "the same as now". */
export function lengthAgainstNow(then: number, now: number): string {
    if (then === now) return "the same as now";
    const d = Math.abs(then - now);
    return `${formatNumber(d)} ${then < now ? "fewer" : "more"} than now`;
}

/**
 * One version beside now (`blogdesk/WXWHistory`): red is in that version
 * and not now (it comes back on Restore), green is in now and not then (it
 * goes). Restore this version makes it the draft: what is written now is
 * saved first and kept as a version, and the site doesn't change until
 * Publish post.
 */
export function PostVersionSheet({
    model,
    row,
    live,
    copy,
    onClose,
}: {
    model: PostEditorModel;
    row: PostRevisionRow;
    /** The copy visitors read now. */
    live: boolean;
    /** The version in full when it is already at hand (the live copy). */
    copy?: PostRevision;
    onClose: () => void;
}) {
    const zone = useBusinessZone();
    const { data, draft } = model;
    const postId = draft.postId ?? "";
    const [read, setRead] = useState<PostRevision | "loading" | "failed">(
        copy ?? "loading",
    );
    const [busy, setBusy] = useState(false);
    const when = formatDateTime(row.createdAt, zone);

    const [attempt, setAttempt] = useState(0);
    useEffect(() => {
        if (copy) return;
        let gone = false;
        void readPostRevision(data.siteId, postId, row.id)
            .catch(() => null)
            .then((r) => {
                if (!gone) setRead(r ?? "failed");
            });
        return () => {
            gone = true;
        };
    }, [data.siteId, postId, row.id, attempt, copy]);

    async function restore() {
        // What is on screen now is kept: saved first, so the API keeps it
        // as a version when it restores this one.
        if (draft.dirty && (await draft.save({ silent: true })) === null) {
            return;
        }
        const res = await runAction(
            () => restorePostRevision(data.siteId, postId, row.id),
            { setBusy },
        );
        if (!res) return;
        if (!res.ok) {
            showError(res.error);
            return;
        }
        showSuccess(
            "Restored. It is the draft now. The site changes when you publish.",
        );
        draft.guard.release();
        // The draft lives in the editor's state and the rich text editor's
        // own: a fresh load reads the restored copy into both.
        window.location.reload();
    }

    const version = typeof read === "object" ? read : null;
    const nameOf = (id: string | null) =>
        data.categories.find((c) => c.id === id)?.name ?? "";
    const paragraphs = version
        ? paragraphDiff(
              postParagraphs(version.content),
              postParagraphs(draft.fields.content),
          )
        : [];
    const counts = diffCounts(paragraphs);
    const changed = version
        ? postChanges(
              {
                  ...draft.fields,
                  category: nameOf(draft.fields.categoryId),
              },
              {
                  ...version,
                  category: nameOf(version.categoryId),
                  path: null,
                  publishedAt: null,
              },
          )
        : [];

    return (
        <FormSheet
            open
            wide
            title="Version"
            description={`${when} · ${live ? "the copy visitors see now" : revisionWhy(row)}`}
            dirty={false}
            pending={busy}
            saveLabel="Restore this version"
            savingLabel="Restoring…"
            // The stand-in for a live copy kept before versions were has no
            // version to restore; it is here to compare against.
            saveOff={!version || copy !== undefined}
            footNote={
                copy
                    ? "This is the copy on your site now, to compare with. It was published before versions were kept, so it can't be restored from here."
                    : "Restore brings this copy back: red returns, green goes. It becomes the draft. What is written now stays here as a version, and the site doesn't change until you publish."
            }
            onClose={onClose}
            onSubmit={restore}
        >
            {read === "loading" ? (
                <LoadingState label="Getting this version" rows={6} />
            ) : read === "failed" ? (
                <FailedState
                    size="inline"
                    title="Couldn't load this version"
                    onRetry={() => {
                        setRead("loading");
                        setAttempt((n) => n + 1);
                    }}
                />
            ) : (
                <div data-version-compare="" className="grid gap-4">
                    <dl className="grid grid-cols-[88px_1fr] gap-x-3 gap-y-2 text-[0.8125rem]">
                        <dt className="text-muted-foreground">Version</dt>
                        <dd>
                            {when}
                            <small className="block text-muted-foreground">
                                {row.savedBy?.name
                                    ? `${row.savedBy.name} · `
                                    : ""}
                                {live
                                    ? "the copy visitors see now"
                                    : revisionWhy(row)}
                            </small>
                        </dd>
                        <dt className="text-muted-foreground">Length</dt>
                        <dd>
                            {formatNumber(readingOf(read.content).words)} words
                            <small className="block text-muted-foreground">
                                {lengthAgainstNow(
                                    readingOf(read.content).words,
                                    readingOf(draft.fields.content).words,
                                )}
                            </small>
                        </dd>
                        <dt className="text-muted-foreground">Changed</dt>
                        <dd>
                            {changed.length === 0
                                ? "Nothing: this is what is written now."
                                : `${changed.length} since: ${changed
                                      .map((p) =>
                                          // No word differs: only its look did.
                                          p === "words" &&
                                          counts.added + counts.removed === 0
                                              ? "The writing's formatting"
                                              : POST_PART_WORDS[p],
                                      )
                                      .join(", ")}`}
                        </dd>
                    </dl>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-y py-2">
                        <span className="text-[0.8125rem] text-foreground/80">
                            Comparing {when} with now
                        </span>
                        <DiffKey
                            added={`${counts.added} added since`}
                            removed={`${counts.removed} taken out since`}
                        />
                    </div>
                    <p className="text-xs text-muted-foreground">
                        Red comes back · Green goes
                    </p>
                    <article className="grid gap-3">
                        <h3 className="text-lg font-semibold">
                            <DiffRuns
                                runs={
                                    read.title === draft.fields.title
                                        ? [{ kind: "same", text: read.title }]
                                        : [
                                              {
                                                  kind: "removed",
                                                  text: read.title,
                                              },
                                              {
                                                  kind: "added",
                                                  text: ` ${draft.fields.title}`,
                                              },
                                          ]
                                }
                            />
                        </h3>
                        <DiffParagraphs paragraphs={paragraphs} />
                    </article>
                </div>
            )}
        </FormSheet>
    );
}
