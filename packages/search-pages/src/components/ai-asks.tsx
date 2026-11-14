import type { AiBlock, AiOutcome } from "../schema";
import { AlsoSvg } from "./icons";
import type { NewFeature } from "./parts";
import { Pill } from "./parts";

/** Each outcome's pill: its words say it, not its colour alone. */
const OUTCOME: Record<
    AiOutcome,
    { tone: "paid" | "amb" | "grey"; text: string }
> = {
    at_once: { tone: "paid", text: "Changed at once" },
    draft: { tone: "amb", text: "Draft to publish" },
    answer: { tone: "grey", text: "Just an answer" },
};

/** The "New" mark beside a part whose feature has just turned on. */
export function NewMark() {
    return <Pill tone="amb" text="New" sp={false} style={{ marginLeft: 8 }} />;
}

/**
 * "Ask your AI assistant" (board VTSalonsA, plan 2026-11-13-002 U13): three
 * asks, each drawn as the owner's message and the reply with its outcome,
 * then the Ask AI and Share lines while their switches are on.
 */
export function AiAsks({
    ai,
    isOn,
    feature,
}: {
    ai: AiBlock;
    isOn: (f: NewFeature) => boolean;
    feature?: (slug: NewFeature) => string | undefined;
}) {
    const lines = [
        { f: "ask-ai", icon: "ask", text: ai.askAiLine, link: "See Ask AI" },
        { f: "social", icon: "share", text: ai.shareLine, link: "See Social" },
    ] as const;
    const shown = lines.filter((l) => isOn(l.f));
    return (
        <section className="sp-easier sp-sec sp-ai" aria-labelledby="sp-ai-h">
            <div className="sp-easier-head">
                <span className="sp-eyebrow">
                    AI apps
                    <NewMark />
                </span>
                <h2 id="sp-ai-h" className="vc-h sp-h2-big">
                    Ask your AI assistant.
                </h2>
                <p className="sp-starter-line sp-ai-lead">
                    {ai.lead}{" "}
                    <a className="sp-go" href={feature?.("ai-apps")}>
                        See AI apps →
                    </a>
                </p>
            </div>
            <div className="sp-bento">
                {ai.asks.map((a) => {
                    const o = OUTCOME[a.outcome];
                    return (
                        <article key={a.title} className="vc-t sp-card">
                            <figure className="vc-pic sp-ai-chat">
                                <figcaption className="sp-ai-sr">
                                    Drawing of a chat with an AI assistant
                                </figcaption>
                                <p className="sp-ai-ask">{a.ask}</p>
                                <div className="sp-ai-reply">
                                    <p>{a.reply}</p>
                                    <Pill
                                        tone={o.tone}
                                        text={o.text}
                                        sp={false}
                                    />
                                </div>
                            </figure>
                            <div className="vc-txt">
                                <h3 className="vc-tt">{a.title}</h3>
                                <p className="vc-tl">{a.line}</p>
                            </div>
                        </article>
                    );
                })}
            </div>
            {shown.length ? (
                <ul className="sp-ai-lines">
                    {shown.map((l) => (
                        <li key={l.f}>
                            <span className="va-icon">
                                <AlsoSvg icon={l.icon} />
                            </span>
                            <span className="sp-also-tl">
                                {l.text}{" "}
                                <a className="sp-go" href={feature?.(l.f)}>
                                    {l.link} →
                                </a>
                            </span>
                        </li>
                    ))}
                </ul>
            ) : null}
        </section>
    );
}
