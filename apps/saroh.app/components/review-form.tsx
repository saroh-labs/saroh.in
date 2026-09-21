"use client";

import { ctaClasses, destructiveAlertClasses } from "@saroh/site-blocks";
import { cn } from "@saroh/ui/lib/utils";
import { useId, useState, useTransition } from "react";

import { submitReview } from "@/app/review/[token]/actions";
import type { ReviewInvitation, ReviewLine } from "@/lib/reviews";

const STARS = [1, 2, 3, 4, 5] as const;

/**
 * One card per thing bought. The name is asked once, at the top, and used
 * for every card. A posted card folds into "Posted — thank you"; the others
 * stay open, so a customer can review one now and the rest later.
 */
export function ReviewForm({
    token,
    invitation,
}: {
    token: string;
    invitation: ReviewInvitation;
}) {
    const [name, setName] = useState(invitation.suggestedName);
    const [posted, setPosted] = useState<Set<string>>(
        () =>
            new Set(
                invitation.lines
                    .filter((l) => l.reviewed)
                    .map((l) => l.orderItemId),
            ),
    );
    const allDone = invitation.lines.every((l) => posted.has(l.orderItemId));

    return (
        <section className="mx-auto w-full max-w-xl px-5 py-12 sm:px-8 sm:py-16">
            <p className="text-sm text-site-muted">{invitation.storeName}</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-site-fg">
                {allDone ? "Thank you" : "How was your order?"}
            </h1>
            <p className="mt-2 text-site-muted">
                {allDone
                    ? "Every item has been reviewed. You can close this page."
                    : "Rate each item you bought. A review is posted under the name below and can't be changed after posting."}
            </p>

            {allDone ? null : (
                <div className="mt-8 grid gap-1.5">
                    <label
                        htmlFor="review-name"
                        className="text-sm font-medium text-site-fg"
                    >
                        Your name, as it appears
                    </label>
                    <input
                        id="review-name"
                        value={name}
                        maxLength={60}
                        onChange={(e) => setName(e.target.value)}
                        className="h-11 w-full max-w-xs rounded-md border border-site-border bg-site-bg px-3 text-site-fg outline-none focus-visible:ring-2 focus-visible:ring-site-accent"
                    />
                </div>
            )}

            <ul className="mt-8 grid gap-4">
                {invitation.lines.map((line) => (
                    <li key={line.orderItemId}>
                        <LineCard
                            token={token}
                            line={line}
                            name={name}
                            done={posted.has(line.orderItemId)}
                            onPosted={() =>
                                setPosted((p) =>
                                    new Set(p).add(line.orderItemId),
                                )
                            }
                        />
                    </li>
                ))}
            </ul>
        </section>
    );
}

function LineCard({
    token,
    line,
    name,
    done,
    onPosted,
}: {
    token: string;
    line: ReviewLine;
    name: string;
    done: boolean;
    onPosted: () => void;
}) {
    const [rating, setRating] = useState<number | null>(null);
    const [body, setBody] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();
    const group = useId();

    const header = (
        <div className="flex items-center gap-3">
            {line.image ? (
                // eslint-disable-next-line @next/next/no-img-element -- merchant media on arbitrary hosts
                <img
                    src={line.image}
                    alt=""
                    className="size-12 shrink-0 rounded-md border border-site-border object-cover"
                />
            ) : null}
            <p className="font-medium text-site-fg">{line.productName}</p>
        </div>
    );

    if (done) {
        return (
            <div className="rounded-xl border border-site-border bg-site-surface p-5">
                {header}
                <p className="mt-2 text-sm text-site-muted">
                    Posted — thank you.
                </p>
            </div>
        );
    }

    const post = () => {
        if (rating === null) {
            setError("Choose from one to five stars.");
            return;
        }
        if (!name.trim()) {
            setError("Say how your name should appear, at the top.");
            return;
        }
        setError(null);
        startTransition(async () => {
            const res = await submitReview(token, {
                orderItemId: line.orderItemId,
                rating,
                ...(body.trim() ? { body: body.trim() } : {}),
                displayName: name.trim(),
            });
            if (res.ok) onPosted();
            else setError(res.message);
        });
    };

    return (
        <form
            className="rounded-xl border border-site-border p-5"
            onSubmit={(e) => {
                e.preventDefault();
                post();
            }}
        >
            {header}
            <fieldset className="mt-4">
                <legend className="text-sm font-medium text-site-fg">
                    Your rating
                </legend>
                <div className="mt-2 flex gap-1" role="radiogroup">
                    {STARS.map((n) => {
                        const on = rating !== null && n <= rating;
                        return (
                            <label
                                key={n}
                                className="flex size-11 cursor-pointer items-center justify-center rounded-md text-2xl focus-within:ring-2 focus-within:ring-site-accent"
                            >
                                <input
                                    type="radio"
                                    name={group}
                                    value={n}
                                    checked={rating === n}
                                    onChange={() => setRating(n)}
                                    className="sr-only"
                                    aria-label={
                                        n === 1 ? "1 star" : `${n} stars`
                                    }
                                />
                                <span
                                    aria-hidden
                                    className={cn(
                                        on
                                            ? "text-site-accent"
                                            : "text-site-border",
                                    )}
                                >
                                    ★
                                </span>
                            </label>
                        );
                    })}
                </div>
            </fieldset>
            <label className="mt-4 grid gap-1.5">
                <span className="text-sm font-medium text-site-fg">
                    Anything to add? (optional)
                </span>
                <textarea
                    value={body}
                    maxLength={2000}
                    rows={3}
                    onChange={(e) => setBody(e.target.value)}
                    className="w-full rounded-md border border-site-border bg-site-bg px-3 py-2 text-site-fg outline-none focus-visible:ring-2 focus-visible:ring-site-accent"
                />
            </label>
            {error ? (
                <p role="alert" className={cn(destructiveAlertClasses, "mt-3")}>
                    {error}
                </p>
            ) : null}
            <button
                type="submit"
                disabled={pending}
                className={cn(
                    ctaClasses("primary"),
                    "mt-4 w-full disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto",
                )}
            >
                {pending ? "Posting…" : "Post review"}
            </button>
        </form>
    );
}
