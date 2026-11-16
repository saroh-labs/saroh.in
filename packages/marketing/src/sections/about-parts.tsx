import type { PropsWithChildren } from "react";

import { Container } from "../layout/container";

import { Section } from "./section";

/** Noto Sans Devanagari, loaded by each edition's /about route. */
const HINDI = "font-[family-name:var(--font-devanagari)]";

interface NamePart {
    hi: string;
    roman: string;
    means: string;
    example: string;
    gloss: string;
}

/** What "सारोह" means, from each edition's `content/about.ts`. */
export interface NameMeaning {
    eyebrow: string;
    word: string;
    parts: readonly NamePart[];
    together: { before: string; strong: string; after: string };
    line: string;
}

/** /about's Ink band: the name, its two halves and what they make together. */
export function AboutName({ meaning }: { meaning: NameMeaning }) {
    return (
        <Container as="section" aria-labelledby="about-name">
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,320px),1fr))] items-center gap-10 rounded-mk-card bg-foreground p-[clamp(32px,6vw,72px)] text-background">
                <div className="grid gap-[14px]">
                    <h2
                        id="about-name"
                        className="m-0 font-display text-mk-kit-h3 font-bold text-mk-on-ink"
                    >
                        {meaning.eyebrow}
                    </h2>
                    <div className="flex items-end gap-2.5">
                        <span
                            lang="hi"
                            // The design's clamp(72px, 10vw, 120px); under about
                            // 343px wide it eases down so the word and its
                            // dot stay inside the band.
                            className={`${HINDI} text-[min(clamp(72px,10vw,120px),21vw)] font-bold leading-[1.15]`}
                        >
                            {meaning.word}
                        </span>
                        <span
                            aria-hidden
                            className="mb-[clamp(26px,3.6vw,40px)] size-4 flex-none rounded-full bg-mk-saffron"
                        />
                    </div>
                </div>
                <div className="grid gap-[18px] text-mk-band-body text-mk-on-ink">
                    <div className="grid grid-cols-[auto_1fr] items-baseline gap-x-[18px] gap-y-1.5">
                        {meaning.parts.map((part) => (
                            <NameLine key={part.roman} part={part} />
                        ))}
                    </div>
                    <p className="m-0 border-t border-mk-ink-hover pt-[18px] [text-wrap:pretty]">
                        {meaning.together.before}
                        <strong className="font-semibold text-background">
                            {meaning.together.strong}
                        </strong>
                        {meaning.together.after}
                    </p>
                    <span className="font-display text-[22px] font-semibold text-mk-saffron">
                        {meaning.line}
                    </span>
                </div>
            </div>
        </Container>
    );
}

/** "स  **sa**, with. As in सपरिवार, with the family." */
function NameLine({ part }: { part: NamePart }) {
    return (
        <>
            <span
                lang="hi"
                className={`${HINDI} text-[28px] font-bold text-background`}
            >
                {part.hi}
            </span>
            <span>
                <strong className="font-semibold text-background">
                    {part.roman}
                </strong>
                {part.means}
                <span lang="hi" className={HINDI}>
                    {part.example}
                </span>
                {part.gloss}
            </span>
        </>
    );
}

/** "What we hold ourselves to": a card per value. */
export function AboutValues({
    title,
    cards,
}: {
    title: string;
    cards: readonly { title: string; body: string }[];
}) {
    return (
        <Section
            titleId="about-values"
            title={title}
            size="kit-h2"
            space="kit"
            className="grid gap-10 pb-0 min-[760px]:pb-0"
        >
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,250px),1fr))] gap-4">
                {cards.map((card) => (
                    <div
                        key={card.title}
                        className="grid content-start gap-2.5 rounded-mk-card border border-border bg-card p-6"
                    >
                        <h3 className="m-0 font-display text-mk-kit-h3 font-bold">
                            {card.title}
                        </h3>
                        <p className="m-0 text-[16px] leading-[1.6] text-mk-copy">
                            {card.body}
                        </p>
                    </div>
                ))}
            </div>
        </Section>
    );
}

/** One fact in /about's company row: its label over its words. */
export function CompanyFact({
    label,
    children,
}: PropsWithChildren<{ label: string }>) {
    return (
        // `content-start`: a cell beside a taller one (a three-line address)
        // keeps its words right under its label, not spread down the cell.
        <div className="grid content-start gap-1">
            <dt className="font-semibold text-foreground">{label}</dt>
            <dd className="m-0">{children}</dd>
        </div>
    );
}
