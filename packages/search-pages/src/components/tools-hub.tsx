import type { ToolPageEntry } from "../schema";
import { TOOL_GROUPS } from "../tool-schema";

export interface ToolsHubProps {
    /** The tools to list: on saroh.in those this build has, in admin all of them. */
    tools: ToolPageEntry[];
    /** A tool's address; undefined draws the card without one. */
    href?: (tool: ToolPageEntry) => string | undefined;
    /** Tools to mark "new". */
    isNew?: (tool: ToolPageEntry) => boolean;
    /** The breadcrumb's Home. */
    home?: string;
    /** The closing band's Start free. */
    startFree?: string;
}

/**
 * /tools (design Hub.dc.html, HubPhone.dc.html): every tool the site has,
 * in the hub's sections, each a card with its line. A section with no
 * tool is left out.
 */
export function ToolsHub({
    tools,
    href = (t) => t.path,
    isNew = () => false,
    home,
    startFree,
}: ToolsHubProps) {
    const groups = TOOL_GROUPS.map((g) => ({
        group: g,
        tools: tools.filter((t) => t.group === g),
    })).filter((g) => g.tools.length);
    return (
        <div className="sp tp">
            <div className="tp-wrap">
                <section className="tp-intro">
                    <nav aria-label="Breadcrumb" className="tp-crumb">
                        <a href={home}>Home</a>
                        <span aria-hidden="true">›</span>
                        <span aria-current="page">Free tools</span>
                    </nav>
                    <h1 className="tp-h1 tp-hub-h1">
                        Free tools for small businesses in India
                    </h1>
                    <p className="tp-lead tp-hub-lead">
                        Each one works in your browser. The ones that make a
                        file email you a link back to it; no newsletter unless
                        you ask.
                    </p>
                </section>
                {groups.map((g) => (
                    <section key={g.group} className="tp-hub-group">
                        <h2 className="tp-hub-h2">{g.group}</h2>
                        <ul className="tp-hub-grid">
                            {g.tools.map((t) => (
                                <li key={t.slug}>
                                    <a className="tp-hub-card" href={href(t)}>
                                        <span className="tp-hub-name">
                                            <span className="tp-hub-title">
                                                {t.name}
                                            </span>
                                            {isNew(t) ? (
                                                <span className="tp-new">
                                                    new
                                                </span>
                                            ) : null}
                                        </span>
                                        <span className="tp-hub-line">
                                            {t.line}
                                        </span>
                                        <span
                                            aria-hidden="true"
                                            className="tp-hub-open"
                                        >
                                            Open →
                                        </span>
                                    </a>
                                </li>
                            ))}
                        </ul>
                    </section>
                ))}
                <section className="tp-cta">
                    <div className="tp-cta-copy">
                        <h2 className="tp-cta-h">All of it, in one place.</h2>
                        <p className="tp-cta-line">
                            Saroh does these for every order and booking,
                            without you opening a tool.
                        </p>
                    </div>
                    <a className="tp-cta-btn" href={startFree}>
                        Start free
                    </a>
                </section>
            </div>
        </div>
    );
}
