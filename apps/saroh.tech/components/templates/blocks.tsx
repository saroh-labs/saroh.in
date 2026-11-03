import Link from "next/link";
import type { ReactNode } from "react";

import { buttonClass, ButtonLink } from "@/components/shared/button";
import { DocumentPreview } from "@/components/tools/document-preview";
import type {
    CountryFact,
    ExampleItem,
    FieldNote,
    Tip,
} from "@/content/templates/types";
import type { TemplateCardData, TemplatePage } from "@/lib/templates/pages";
import { downloads, fillHref, templateView } from "@/lib/templates/pages";

export const H2 =
    "m-0 font-display text-[28px] font-bold leading-[1.05] tracking-[-0.04em] md:text-4xl";
const COPY = "m-0 text-[16.5px] leading-relaxed text-body";
const HINT = "text-[13px] text-quiet";

const TH =
    "border-b border-strong px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-[0.08em] text-quiet";
const TD = "border-b border-line p-3 align-top";

/** A filter or a related link: looks like a chip, but it's a page. */
export function ChipLink({
    href,
    on = false,
    children,
}: {
    href: string;
    on?: boolean;
    children: ReactNode;
}) {
    return (
        <Link
            prefetch={false}
            href={href}
            aria-current={on ? "page" : undefined}
            className={`inline-flex h-11 items-center rounded-full border px-3.5 text-[14.5px] no-underline md:h-9 ${
                on
                    ? "border-ink bg-ink text-paper"
                    : "border-control bg-surface text-ink"
            }`}
        >
            {children}
        </Link>
    );
}

export function TemplateHero({ page }: { page: TemplatePage }) {
    return (
        <>
            <h1 className="m-0 font-display text-[40px] font-bold leading-none tracking-[-0.05em] md:text-[60px]">
                {page.h1}
            </h1>
            <p className="m-0 text-[17px] leading-relaxed text-body md:text-[18.5px]">
                {page.lede}
            </p>
            <ButtonLink
                href={fillHref(page)}
                data-cta="fill-online"
                className="self-stretch md:self-start"
            >
                Fill it online, free
            </ButtonLink>
        </>
    );
}

/** The page's own data, drawn: every page shows a different filled document. */
export function PreviewImage({ page }: { page: TemplatePage }) {
    return (
        <div className="rounded-[20px] bg-[#EAE6DE] p-3 md:p-4">
            <div
                role="img"
                aria-label={`Preview: ${page.h1}, filled with example items`}
            >
                <DocumentPreview view={templateView(page)} />
            </div>
        </div>
    );
}

const FILE_BUTTON = buttonClass("secondary", "!h-12 bg-surface !px-3.5");

export function DownloadRow({ page }: { page: TemplatePage }) {
    const files = downloads(page);
    const row = [
        { name: "PDF", href: files.pdf, kind: "pdf" },
        { name: "Word", href: files.word, kind: "word" },
        { name: "Google Docs", href: files.word, kind: "docs" },
        { name: "Sheets", href: files.sheets, kind: "sheets" },
    ];
    return (
        <div className="flex flex-col gap-2">
            <span className={HINT}>Or download</span>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                {row.map((f) => (
                    // A file, not a page: next/link would try to route to it.
                    <a
                        key={f.kind}
                        href={f.href}
                        download
                        data-cta={`download-${f.kind}`}
                        className={FILE_BUTTON}
                    >
                        {f.name}
                    </a>
                ))}
            </div>
            <span className={HINT}>
                Google Docs and Sheets get a Word or Excel file. Upload it to
                Google Drive, then choose Open with Google Docs or Sheets.
            </span>
        </div>
    );
}

export function ExampleItems({
    items,
    fields,
}: {
    items: readonly ExampleItem[];
    fields: readonly FieldNote[];
}) {
    return (
        <div className="flex min-w-0 flex-col gap-4">
            {items.length ? (
                <div className="flex items-center gap-3">
                    <h2 className={H2}>What's on it</h2>
                    <span className="rounded-full bg-[#F7E8D2] px-2 py-[3px] text-[11px] font-semibold uppercase tracking-[0.08em] text-saffron-text">
                        Example
                    </span>
                </div>
            ) : null}
            {items.length ? (
                <table className="w-full border-collapse text-[15.5px]">
                    <thead>
                        <tr>
                            <th scope="col" className={TH}>
                                Line
                            </th>
                            <th scope="col" className={TH}>
                                Usually billed by
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.map((i) => (
                            <tr key={i.description}>
                                <td className={TD}>{i.line}</td>
                                <td className={TD}>{i.billedBy}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            ) : null}
            {fields.length ? (
                <>
                    <h3
                        className={
                            items.length
                                ? "m-0 mt-2 text-[17px] font-semibold"
                                : H2
                        }
                    >
                        Fields to add
                    </h3>
                    <ul className="m-0 flex list-disc flex-col gap-2 pl-5 text-[15.5px] leading-normal text-body">
                        {fields.map((f) => (
                            <li key={f.name}>
                                <b className="font-semibold text-ink">
                                    {f.name}.
                                </b>{" "}
                                {f.why}
                            </li>
                        ))}
                    </ul>
                </>
            ) : null}
        </div>
    );
}

export function PaymentTerms({
    title,
    text,
    points,
}: {
    title: string;
    text: string;
    points: readonly string[];
}) {
    return (
        <div className="flex min-w-0 flex-col gap-4">
            <h2 className={H2}>{title}</h2>
            <p className={COPY}>{text}</p>
            <ul className="m-0 list-disc pl-[22px] text-[16.5px] leading-[1.8]">
                {points.map((p) => (
                    <li key={p}>{p}</li>
                ))}
            </ul>
        </div>
    );
}

export function TipsList({ tips }: { tips: readonly Tip[] }) {
    return (
        <section className="flex flex-col gap-[18px]">
            <h2 className={H2}>Three things to get right</h2>
            <div className="grid gap-3 md:grid-cols-3 md:gap-5">
                {tips.map((t) => (
                    <div
                        key={t.title}
                        className="flex flex-col gap-2 rounded-card border border-line bg-surface p-6"
                    >
                        <b className="text-lg">{t.title}</b>
                        <p className="m-0 text-[15.5px] leading-relaxed text-body">
                            {t.text}
                        </p>
                    </div>
                ))}
            </div>
        </section>
    );
}

/** What a country asks for: sourced and dated, or plainly not confirmed yet. */
export function CountryFacts({
    name,
    facts,
}: {
    name: string;
    facts: readonly CountryFact[];
}) {
    if (!facts.length) return null;
    return (
        <section className="flex flex-col gap-4">
            <h2 className={H2}>What {name} asks for</h2>
            <div
                tabIndex={0}
                role="region"
                aria-label="Facts table"
                className="overflow-x-auto"
            >
                <table className="w-full min-w-[560px] border-collapse text-[15.5px]">
                    <thead>
                        <tr>
                            <th scope="col" className={TH}>
                                Fact
                            </th>
                            <th scope="col" className={TH}>
                                What it says
                            </th>
                            <th scope="col" className={TH}>
                                Source
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {facts.map((f) => (
                            <tr key={f.label}>
                                <td className={TD}>{f.label}</td>
                                <td className={TD}>{f.value}</td>
                                <td className={TD}>
                                    {"source" in f ? (
                                        <>
                                            <a
                                                href={f.source.url}
                                                rel="noopener"
                                            >
                                                {f.source.name}
                                            </a>
                                            <span className={`block ${HINT}`}>
                                                Checked on {f.checkedOn}
                                            </span>
                                        </>
                                    ) : (
                                        <span className="rounded-full bg-[#F7E8D2] px-2 py-[3px] text-xs font-semibold text-saffron-text">
                                            [confirm]
                                        </span>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    );
}

/** A card in the gallery and the hubs: a small sheet of paper with the page's first lines. */
export function TemplateCard({ card }: { card: TemplateCardData }) {
    return (
        <Link
            prefetch={false}
            href={card.href}
            className="flex flex-col overflow-hidden rounded-card border border-line bg-surface text-ink no-underline transition-colors duration-150 hover:border-strong"
        >
            <span
                aria-hidden="true"
                className="flex h-[220px] items-end justify-center bg-[#EAE6DE] pt-6"
            >
                <span className="flex h-[196px] w-[170px] flex-col gap-[7px] rounded-t-md bg-surface px-3.5 py-4 shadow-[0_6px_18px_-8px_rgba(28,28,26,.35)]">
                    <span className="font-display text-xs font-bold">
                        {card.doc}
                    </span>
                    <span className="h-[5px] w-3/5 rounded-[3px] bg-[#D9D5CC]" />
                    <span className="h-1.5" />
                    {card.lines.map((l) => (
                        <span
                            key={l}
                            className="flex justify-between gap-1.5 border-b border-[#ECE8E0] pb-[3px] text-[7.5px] leading-[1.2] text-body"
                        >
                            <span>{l}</span>
                            <span className="h-1 w-[18px] shrink-0 self-center rounded-sm bg-[#D9D5CC]" />
                        </span>
                    ))}
                    <span className="mt-auto h-[5px] w-1/2 self-end rounded-[3px] bg-ink" />
                </span>
            </span>
            <span className="flex flex-col gap-1 px-[18px] pb-[18px] pt-4">
                <span className="text-base font-semibold">{card.title}</span>
                <span className="text-[13px] text-quiet">
                    PDF · Word · Docs · Sheets
                </span>
            </span>
        </Link>
    );
}

export const CARD_GRID = "grid gap-3 sm:grid-cols-2 md:gap-5 xl:grid-cols-4";

const CARDS_SHOWN = 12;

/** Past twelve, the rest open in place: every card is in the page's HTML for search. */
export function CardGrid({ cards }: { cards: readonly TemplateCardData[] }) {
    const rest = cards.slice(CARDS_SHOWN);
    return (
        <>
            <div className={CARD_GRID}>
                {cards.slice(0, CARDS_SHOWN).map((c) => (
                    <TemplateCard key={c.href} card={c} />
                ))}
            </div>
            {rest.length ? (
                <details className="group flex flex-col">
                    <summary className="mx-auto flex h-12 w-fit cursor-pointer list-none items-center justify-center rounded-button border border-strong px-[22px] text-[15px] font-semibold group-open:hidden [&::-webkit-details-marker]:hidden">
                        Show more templates
                    </summary>
                    <div className={CARD_GRID}>
                        {rest.map((c) => (
                            <TemplateCard key={c.href} card={c} />
                        ))}
                    </div>
                </details>
            ) : null}
        </>
    );
}
