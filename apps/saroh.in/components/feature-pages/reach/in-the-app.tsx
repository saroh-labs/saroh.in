import { Chip } from "@saroh/marketing/kit/chip";
import { SwipeRow } from "@saroh/marketing/kit/swipe-row";
import { ScreenshotFrame } from "@saroh/marketing/screenshot-frame";
import { Section } from "@saroh/marketing/section";
import { TextLink } from "@saroh/marketing/text-link";

import { featureHelpLinks } from "@/content/feature-help";
import { features } from "@/content/features";
import { summarise } from "@/content/help";
import { solutions } from "@/content/solutions";
import type { FeatureSlug } from "@/content/types";
import { helpArticles } from "@/lib/help-docs";
import { LAUNCH_MODE } from "@/lib/links";
import { resourcesContext } from "@/lib/resources-context";
import { solutionLink } from "@/lib/search-pages";

import { PhoneFold } from "../../shared/layout/phone-fold";
import { shotView } from "../../shared/media/shot-view";
import { Fold } from "./fold";

/**
 * The feature's real screens, step by step (rule 15: the redesign keeps
 * every word the page had). The boards draw the story; this section keeps
 * the captured shots, each step's words and who it is shown at, the
 * "How to …" links to Help, every point in a closed fold, and the trades
 * that use it. Its words are the feature's own, from `content/features.ts`;
 * its shot keys are the same in both editions.
 */
/** Every shot at one shape, cropped from the top, so the row reads as one. */
const CROP =
    "aspect-[16/10] [&_img]:h-full [&_img]:w-full [&_img]:object-cover [&_img]:object-top";

export function InTheApp({
    slug,
    words,
    hide,
}: {
    slug: FeatureSlug;
    words: {
        everything: string;
        usedBy: string;
        of: string;
        /** The phone's fold over the steps. */
        phone: string;
    };
    /** Words a claim switch has off this build: a sentence that matches is left out. */
    hide?: RegExp;
}) {
    const all = features[slug];
    // A sentence whose claim is off goes; a point named for it goes whole.
    const strip = (text: string) =>
        hide
            ? (text.match(/[^.!?]+[.!?]+/g) ?? [text])
                  .filter((sentence) => !hide.test(sentence))
                  .join("")
                  .trim()
            : text;
    const feature = {
        ...all,
        sub: strip(all.sub),
        steps: all.steps.map((st) => ({ ...st, body: strip(st.body) })),
        points: all.points
            .filter((pt) => !hide?.test(pt.title))
            .map((pt) => ({ ...pt, body: strip(pt.body) })),
    };
    const help = featureHelpLinks(
        slug,
        helpArticles().map(summarise),
        resourcesContext(),
    );
    return (
        <Section
            id="in-the-app"
            titleId="in-the-app-title"
            title={feature.howTitle}
            lead={feature.sub}
            size="kit-h2"
            className="pt-12 min-[760px]:pt-[120px]"
        >
            {/* A phone: the title and lead, then the rest folds (PHONE.md). */}
            <PhoneFold summary={words.phone} className="mt-6 min-[760px]:mt-0">
                <SwipeRow
                    label={feature.howTitle}
                    columns={feature.steps.length >= 3 ? 4 : 3}
                    of={words.of}
                    className="mt-10"
                >
                    {feature.heroChat ? null : (
                        <figure className="m-0 grid h-full content-start gap-3">
                            <ScreenshotFrame
                                shot={shotView(
                                    feature.hero.shot,
                                    feature.hero.alt,
                                    feature.hero.phone,
                                )}
                                zoomable
                                sizes="(min-width: 760px) 300px, 90vw"
                                className={CROP}
                            />
                            <figcaption>
                                <h3 className="m-0 font-display text-mk-kit-h3 font-bold [text-wrap:balance]">
                                    {feature.cardLine}
                                </h3>
                            </figcaption>
                        </figure>
                    )}
                    {feature.steps.map((step) => (
                        <figure
                            key={step.title}
                            className="m-0 grid h-full content-start gap-3"
                        >
                            {step.chat ? null : (
                                <ScreenshotFrame
                                    shot={shotView(step.shot, step.alt)}
                                    zoomable
                                    sizes="(min-width: 760px) 300px, 90vw"
                                    className={CROP}
                                />
                            )}
                            <figcaption className="grid gap-1.5">
                                <h3 className="m-0 font-display text-mk-kit-h3 font-bold [text-wrap:balance]">
                                    {step.title}
                                </h3>
                                <p className="m-0 text-[15.5px] leading-normal text-mk-copy [text-wrap:pretty]">
                                    {step.body}
                                </p>
                                {step.who ? (
                                    <span className="text-[13px] text-muted-foreground">
                                        {step.who}
                                    </span>
                                ) : null}
                            </figcaption>
                        </figure>
                    ))}
                </SwipeRow>
                {help.length ? (
                    <div className="mt-8 flex flex-wrap gap-x-8 gap-y-1">
                        {help.map((link) => (
                            <TextLink
                                key={link.href}
                                href={link.href}
                                tone="ink"
                                arrow
                                className="text-[15px]"
                            >
                                {link.label}
                            </TextLink>
                        ))}
                    </div>
                ) : null}
                <Fold
                    label={words.everything}
                    meta={`${feature.points.length}`}
                    className="mt-6 max-w-[62ch]"
                >
                    <ul className="list-none !pl-0">
                        {feature.points.map((p) => (
                            <li key={p.title}>
                                <b className="font-semibold text-foreground">
                                    {p.title}.
                                </b>{" "}
                                {p.body}
                                {LAUNCH_MODE === "open" && p.openNote
                                    ? ` ${p.openNote}`
                                    : ""}
                            </li>
                        ))}
                    </ul>
                </Fold>
                <nav
                    aria-label={words.usedBy}
                    className="mt-6 flex flex-wrap items-center gap-2.5"
                >
                    <span className="mr-1.5 text-[15px] text-muted-foreground">
                        {words.usedBy}
                    </span>
                    {feature.usedBy.map((s) => (
                        <Chip key={s} href={solutionLink(s)}>
                            {solutions[s].longName}
                        </Chip>
                    ))}
                </nav>
            </PhoneFold>
        </Section>
    );
}
