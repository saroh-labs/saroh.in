import type { ReactNode } from "react";

import type { Question } from "../schema";

/*
 * The parts every package page draws the same (DEC-195, A11): the crumb
 * trail, the questions, the closing band and the start button. One copy
 * for SearchPage, ToolPage and ToolsHub, each with one block in
 * styles.css. The package can't import saroh.in's, so these are its own,
 * at saroh.in's numbers: Breadcrumbs (14px, "/"), Faq (17px rows, a
 * chevron), CtaBand (the mk-band radius and padding), the 52px button.
 */

const cls = (...names: (string | false | undefined)[]) =>
    names.filter(Boolean).join(" ");

export interface Crumb {
    name: ReactNode;
    /** Every crumb but the last links; undefined (the admin preview) draws an `<a>` that goes nowhere. */
    href?: string;
    /** Shown on a desk only (a tool page's Home). */
    deskOnly?: boolean;
}

/**
 * The trail above a page's title, "/" between. The last crumb is the page
 * itself, `aria-current`; `brand` draws it amber 600, as saroh.in's
 * solution heroes do.
 */
export function Crumbs({
    crumbs,
    brand = false,
}: {
    crumbs: Crumb[];
    brand?: boolean;
}) {
    return (
        <nav aria-label="Breadcrumb" className="sp-crumb">
            {crumbs.map((c, i) => {
                const last = i === crumbs.length - 1;
                const d = c.deskOnly ? "sp-d" : undefined;
                return (
                    <span key={i} className={cls("sp-crumb-i", d)}>
                        {i > 0 ? <span aria-hidden="true">/</span> : null}
                        {last ? (
                            <span
                                aria-current="page"
                                className={brand ? "sp-crumb-brand" : undefined}
                            >
                                {c.name}
                            </span>
                        ) : (
                            <a href={c.href}>{c.name}</a>
                        )}
                    </span>
                );
            })}
        </nav>
    );
}

/** "Questions": native `<details>` rows with a chevron that turns when open. */
export function Questions({
    questions,
    openFirst = false,
    headingClass,
    className,
}: {
    questions: readonly Question[];
    /** The first answer starts open (a /for/ page). */
    openFirst?: boolean;
    /** The page's own H2 class, so "Questions" matches its other headings. */
    headingClass: string;
    className?: string;
}) {
    return (
        <section className={cls("sp-faq", className)}>
            <h2 className={headingClass}>Questions</h2>
            <div className="sp-faq-list">
                {questions.map((q, i) => (
                    <details key={q.question} open={openFirst && i === 0}>
                        <summary>
                            {q.question}
                            <svg
                                aria-hidden="true"
                                className="sp-chev"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth={2}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            >
                                <path d="m6 9 6 6 6-6" />
                            </svg>
                        </summary>
                        {q.answer.map((a) => (
                            <p key={a}>{a}</p>
                        ))}
                    </details>
                ))}
            </div>
        </section>
    );
}

/** A start button: Ink, or amber on the closing band. `data-cta` is what saroh.in's CtaClickArea tracks. */
export function StartButton({
    href,
    label,
    amber = false,
}: {
    href?: string;
    label?: string;
    amber?: boolean;
}) {
    return (
        <a
            className={cls("sp-btn", amber && "sp-btn-amber")}
            href={href}
            data-cta=""
        >
            {label ?? "Start free"}
        </a>
    );
}

/** The dark band a page closes with: its title, a line, the amber start button and an optional note. */
export function ClosingBand({
    title,
    line,
    lineDeskOnly = false,
    note,
    href,
    label,
    className,
}: {
    title: ReactNode;
    line?: ReactNode;
    /** The line shows on a desk only (a /for/ page). */
    lineDeskOnly?: boolean;
    /** The words under the button, e.g. "No card needed to start." */
    note?: string;
    href?: string;
    label?: string;
    className?: string;
}) {
    return (
        <section className={cls("sp-cta", className)}>
            <div className="sp-cta-copy">
                <h2 className="sp-cta-h">{title}</h2>
                {line ? (
                    <p className={cls("sp-cta-line", lineDeskOnly && "sp-d")}>
                        {line}
                    </p>
                ) : null}
            </div>
            <div className="sp-cta-act">
                <StartButton href={href} label={label} amber />
                {note ? <span className="sp-cta-note">{note}</span> : null}
            </div>
        </section>
    );
}
