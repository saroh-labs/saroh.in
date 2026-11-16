import { PhoneFold } from "../../kit/phone-fold";
import { SwipeRow } from "../../kit/swipe-row";
import { TextLink } from "../../links/text-link";
import { ScreenshotFrame } from "../../media/screenshot-frame";
import { Section } from "../../sections/section";

import type { Feature } from "../../content/types";
import type { ShotView } from "../../media/shot";
import type { PageSite } from "../site";

/**
 * The feature's real screens, step by step (rule 15: the redesign keeps
 * every word the page had). The boards draw the story; this section keeps
 * the captured shots, each step's words and who it is shown at, and the
 * "How to …" links to Help. Its words are the feature's own, from `content/features.ts`;
 * its shot keys are the same in both editions.
 */
/** Every shot at one shape, cropped from the top, so the row reads as one. */
const CROP =
    "aspect-[16/10] [&_img]:h-full [&_img]:w-full [&_img]:object-cover [&_img]:object-top";

/**
 * What the site resolves for a feature's "In the app" (its own `content/`
 * and `lib/`): the feature's words and its Help links.
 * `worksToday` is what a Limited feature can do today (an edition's
 * `StatedFeature`), said under the lead.
 */
export interface InTheAppData {
    feature: Feature & { worksToday?: string };
    help: readonly { href: string; label: string }[];
    /** Words a claim switch has off this build: a sentence that matches is left out. */
    hide?: RegExp;
}

/** A step's screen; a key the site has no shot or pending frame for draws nothing. */
function Screen({ shot }: { shot: ShotView | undefined }) {
    return shot ? (
        <ScreenshotFrame
            shot={shot}
            zoomable
            sizes="(min-width: 760px) 300px, 90vw"
            className={CROP}
        />
    ) : null;
}

/** The feature's lead and step words, less any sentence whose claim is off. */
export function claimed<F extends Feature>(all: F, hide?: RegExp): F {
    const strip = (text: string) =>
        hide
            ? (text.match(/[^.!?]+[.!?]+/g) ?? [text])
                  .filter((sentence) => !hide.test(sentence))
                  .join("")
                  .trim()
            : text;
    return {
        ...all,
        sub: strip(all.sub),
        steps: all.steps.map((st) => ({ ...st, body: strip(st.body) })),
    };
}

export function InTheApp({
    feature: all,
    help,
    site,
    words,
    hide,
}: InTheAppData & {
    site: PageSite;
    words: {
        of: string;
        /** The phone's fold over the steps. */
        phone: string;
    };
}) {
    const feature = claimed(all, hide);
    return (
        <Section
            id="in-the-app"
            titleId="in-the-app-title"
            title={feature.howTitle}
            lead={feature.sub}
            size="kit-h2"
            className="pt-12 min-[760px]:pt-[120px]"
        >
            {/* The screens stay in sight on a phone, as a swipe row (owner, 16 Nov:
                a screen is never behind a click); the words after them fold. */}
            <SwipeRow
                label={feature.howTitle}
                columns={feature.steps.length >= 3 ? 4 : 3}
                of={words.of}
                className="mt-8 min-[760px]:mt-10"
            >
                {feature.heroChat ? null : (
                    <figure className="m-0 grid h-full content-start gap-3">
                        <Screen
                            shot={site.shot(
                                feature.hero.shot,
                                feature.hero.alt,
                                feature.hero.phone,
                            )}
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
                            <Screen shot={site.shot(step.shot, step.alt)} />
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
            {all.worksToday || help.length ? (
                <PhoneFold
                    summary={words.phone}
                    className="mt-4 min-[760px]:mt-0"
                >
                    {all.worksToday ? (
                        <p className="m-0 mt-8 max-w-[62ch] text-[16px] leading-normal text-mk-copy">
                            {all.worksToday}
                        </p>
                    ) : null}
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
                </PhoneFold>
            ) : null}
        </Section>
    );
}
