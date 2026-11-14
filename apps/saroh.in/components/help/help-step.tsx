import { stepId, stepNumber } from "@/content/help";
import type { HelpAppCard, HelpStep as Step } from "@/content/help-frontmatter";
import { CAPTURED } from "@/content/shots.captured";

import { CodeSample } from "@saroh/marketing/code-sample";
import { DrawnPanel } from "@saroh/marketing/drawn-panel";

import { ShotImage } from "../shared/media/shot-image";

/**
 * One step of a Help article (design 2a): its number and title, what to
 * do, its picture with its caption, and a tip where one is needed.
 *
 * The picture is one of three (plan 2026-11-13-002, U9):
 * - a Saroh screen's capture in the designs' frame. A step whose control is
 *   named (`marker`) rings it in Saffron (#F0A92B), at the place the capture
 *   measured (`mark`), over the clean image; the ring is decoration, the
 *   words say what to press. Only an article waiting on a release switch
 *   may name a shot not captured yet (`helpErrors`): it draws a neutral
 *   frame until the capture lands;
 * - another company's screen, drawn (`DrawnPanel`), captioned as a drawing;
 * - for a step that lists apps, a card per app with its own anchor.
 */
export function HelpStep({ step, index }: { step: Step; index: number }) {
    return (
        <section
            id={step.anchor}
            aria-labelledby={stepId(index)}
            className="grid scroll-mt-6 gap-3.5"
        >
            <h2
                id={stepId(index)}
                className="m-0 flex items-baseline gap-3.5 font-display text-[22px] font-bold leading-[1.15] tracking-[-0.02em] [text-wrap:balance] sm:text-[26px]"
            >
                <span className="font-mono text-[15px] font-normal tracking-normal text-brand-700">
                    {stepNumber(index)}
                </span>
                {step.title}
            </h2>
            <p className="m-0 text-[17px] leading-[1.7] text-mk-prose [text-wrap:pretty]">
                {step.body}
            </p>
            {step.shot !== undefined ? (
                <StepShot step={step} shotKey={step.shot} />
            ) : null}
            {step.panel ? (
                <DrawnPanel panel={step.panel} caption={step.caption ?? ""} />
            ) : null}
            {step.apps ? <AppCards apps={step.apps} /> : null}
            {step.tip ? (
                <p className="m-0 border-l-2 border-border-strong pl-[18px] text-mk-faq leading-[1.6] text-mk-copy [text-wrap:pretty]">
                    {step.tip}
                </p>
            ) : null}
        </section>
    );
}

/** A shot not captured yet: its frame's shape until the capture lands. */
const PENDING = { src: null, width: 1600, height: 1000 } as const;

function StepShot({ step, shotKey }: { step: Step; shotKey: string }) {
    const captured = (CAPTURED as Partial<typeof CAPTURED>)[shotKey];
    const shot = captured ?? { ...PENDING, alt: step.caption ?? "" };
    const mark = step.marker && captured ? captured.mark : undefined;
    return (
        <figure className="m-0 grid gap-2">
            <div
                data-shot={shotKey}
                className="relative overflow-hidden rounded-xl border border-border bg-card shadow-mk-lift"
            >
                {/* Files, never the optimizer (it re-encoded on every
                    request, and in CI one request could hang): the
                    capture and its copies in shots/help/sized, so a phone
                    fetches a 640 or 960 one, not the 2048 capture. */}
                <ShotImage
                    shot={shot}
                    alt={shot.alt}
                    sizes="(min-width: 900px) 680px, 100vw"
                />
                {mark ? (
                    <span
                        aria-hidden
                        data-marker
                        className="pointer-events-none absolute rounded-[10px] border-[3px] border-mk-saffron shadow-[0_0_0_4px_rgba(240,169,43,0.22)]"
                        style={{
                            left: `${mark.x * 100}%`,
                            top: `${mark.y * 100}%`,
                            width: `${mark.w * 100}%`,
                            height: `${mark.h * 100}%`,
                        }}
                    />
                ) : null}
            </div>
            <figcaption className="text-mk-note text-muted-foreground">
                {step.caption}
            </figcaption>
        </figure>
    );
}

/** One card per app, each at its own anchor (Integrations links to them). */
function AppCards({ apps }: { apps: readonly HelpAppCard[] }) {
    return (
        <div className="grid gap-2.5">
            {apps.map((app) => (
                <div
                    key={app.id}
                    id={app.id}
                    className="grid scroll-mt-6 gap-2 rounded-xl border border-border bg-card p-4"
                >
                    <h3 className="m-0 text-mk-faq font-semibold">
                        {app.name}
                    </h3>
                    <p className="m-0 text-mk-faq leading-[1.6] text-mk-copy [text-wrap:pretty]">
                        {app.how}
                    </p>
                    {app.code ? (
                        <CodeSample code={app.code} title={app.name} />
                    ) : null}
                    {app.who ? (
                        <p className="m-0 text-mk-note text-muted-foreground">
                            {app.who}
                        </p>
                    ) : null}
                </div>
            ))}
        </div>
    );
}
