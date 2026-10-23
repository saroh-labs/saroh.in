"use client";

import { cn } from "@saroh/ui/lib/utils";
import {
    Eye,
    FlaskConical,
    Link2,
    MessageSquare,
    Plus,
    Undo2,
    UserCheck,
} from "lucide-react";
import type { ReactNode } from "react";

import type { TopBarActionProps } from "./top-bar-actions";
import { ViewControls } from "./top-bar-actions";

/**
 * A phone's ⋯ More (DEC-185): everything the desk's bar has that a phone
 * has no room for, in the desk's words. Check (Preview, the view, Feedback
 * with its open notes), Share (ask a teammate to review, or withdraw the
 * request while one is open; a preview link) and Test releases. What the
 * status says is written out on top, since a phone has no hover. Each
 * choice puts the sheet away first (`done`), then does its work.
 */
export function MoreSheet({
    status,
    done,
    onFeedback,
    ...p
}: TopBarActionProps & {
    /** The status pill and its line, written out. */
    status: ReactNode;
    /** Put the sheet away. */
    done: () => void;
    /** Open the whole site's Feedback. */
    onFeedback: () => void;
}) {
    const then = (run: () => void) => () => {
        done();
        run();
    };
    const release = p.testRelease;
    return (
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-4">
            <div className="flex min-w-0 flex-wrap items-center gap-1">
                {status}
            </div>
            {p.publishHint ? (
                <p className="-mt-2 text-xs leading-relaxed text-muted-foreground">
                    {p.publishHint}
                </p>
            ) : null}

            <Group title="Check">
                <Row
                    icon={<Eye />}
                    label={p.previewing ? "Back to editing" : "Preview"}
                    hint="See the page as visitors will, at phone or desk width"
                    onClick={then(() => p.setPreviewing(!p.previewing))}
                />
                <Row
                    icon={<MessageSquare />}
                    label="Feedback"
                    hint="Notes from your team on this site"
                    count={p.openNotes}
                    onClick={then(onFeedback)}
                />
                <li className="px-3 py-2">
                    <ViewControls {...p} />
                </li>
            </Group>

            <Group title={p.inReview ? "In review" : "Share"}>
                {p.inReview ? (
                    <Row
                        icon={<Undo2 />}
                        label="Withdraw the review request"
                        hint="The site stops reading In review. Notes stay."
                        disabled={p.asking}
                        onClick={then(p.withdrawReview)}
                    />
                ) : (
                    <Row
                        icon={<UserCheck />}
                        label="Ask a teammate to review"
                        hint="Puts the site In review. Reviewers comment on blocks, and publishing still works."
                        disabled={p.asking}
                        onClick={then(p.askForReview)}
                    />
                )}
                <Row
                    icon={<Link2 />}
                    label="Share a preview link"
                    hint="A link anyone can open to read the draft. Nothing goes live."
                    onClick={then(p.onSharePreview)}
                />
            </Group>

            {release ? (
                <Group title="Test releases">
                    {release.onMake ? (
                        <Row
                            icon={<Plus />}
                            label="Make a test release"
                            hint="Freeze the draft to share and go live with later"
                            onClick={then(release.onMake)}
                        />
                    ) : null}
                    <Row
                        icon={<FlaskConical />}
                        label="Test releases"
                        count={release.count}
                        onClick={then(release.onOpenList)}
                    />
                </Group>
            ) : null}
        </div>
    );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
    return (
        <section aria-label={title}>
            <h3 className="label pb-1.5">{title}</h3>
            <ul className="divide-y rounded-lg border">{children}</ul>
        </section>
    );
}

function Row({
    icon,
    label,
    hint,
    count,
    disabled,
    onClick,
}: {
    icon: ReactNode;
    label: string;
    hint?: string;
    count?: number;
    disabled?: boolean;
    onClick: () => void;
}) {
    return (
        <li>
            <button
                type="button"
                disabled={disabled}
                onClick={onClick}
                className={cn(
                    "flex min-h-11 w-full items-center gap-3 px-3 py-2 text-left transition-colors duration-fast hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:text-disabled-foreground",
                    "[&>svg]:size-4",
                )}
            >
                <span
                    aria-hidden
                    className="shrink-0 text-muted-foreground [&>svg]:size-4"
                >
                    {icon}
                </span>
                <span className="grid min-w-0 flex-1 gap-0.5">
                    <span className="text-sm font-semibold">{label}</span>
                    {hint ? (
                        <span className="text-xs leading-snug text-muted-foreground">
                            {hint}
                        </span>
                    ) : null}
                </span>
                {count ? (
                    <span className="shrink-0 text-sm font-semibold tabular-nums">
                        {count}
                    </span>
                ) : null}
            </button>
        </li>
    );
}
