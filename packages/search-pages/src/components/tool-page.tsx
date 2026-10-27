import type { ToolPageData } from "../tool-schema";
import { ToolSlot } from "../tools/tool-slot";
import { ClosingBand, Crumbs, Questions } from "./page-parts";

/**
 * Where a tool page's links go. saroh.in passes its addresses; the admin
 * preview none, so nothing navigates (an `<a>` with no address).
 */
export interface ToolPageLinks {
    /** The breadcrumb's Home (desk only, as the boards draw it). */
    home?: string;
    /** The breadcrumb's "Free tools": the /tools hub. */
    hub?: string;
    /** The closing band's Start free. */
    startFree?: string;
    /** Its words, from the site's one CTA builder. */
    startFreeLabel?: string;
}

export interface ToolPageProps {
    page: ToolPageData;
    /** A page that isn't live: a small label says so at the top. */
    draft?: boolean;
    links?: ToolPageLinks;
}

/** Desk and phone words: one element when they're the same, two (one shown) when not. */
function Both({ desk, phone }: { desk: string; phone?: string }) {
    if (!phone || phone === desk) return <>{desk}</>;
    return (
        <>
            <span className="sp-d">{desk}</span>
            <span className="sp-p">{phone}</span>
        </>
    );
}

function Lines({ lines }: { lines: readonly string[] }) {
    return (
        <>
            {lines.map((l, i) => (
                <span key={`${i}-${l}`}>
                    {i > 0 ? <br /> : null}
                    {l}
                </span>
            ))}
        </>
    );
}

/**
 * A free tool's page (#1253; boards `tools-all/out/project/tools/
 * <File>{,Phone}.dc.html`): breadcrumb, h1 and lead, the tool from the
 * registry, how it works, the questions and the closing band. The site's
 * header and footer are the app's. One component for desk and the phone
 * board below 900px. The email gate's submit comes from a
 * `ToolGateProvider` around it (saroh.in); without one it only shows the
 * sent state (the admin preview).
 */
export function ToolPage({
    page: p,
    draft = false,
    links = {},
}: ToolPageProps) {
    const how = p.how ?? [];
    return (
        <div className="sp tp">
            <div className="tp-wrap">
                <section className="tp-intro">
                    {draft ? (
                        <p className="sp-draft tp-draft">
                            Draft — not published yet
                        </p>
                    ) : null}
                    <Crumbs
                        crumbs={[
                            { name: "Home", href: links.home, deskOnly: true },
                            { name: "Free tools", href: links.hub },
                            { name: p.name },
                        ]}
                    />
                    <h1 className="tp-h1">{p.h1}</h1>
                    <p className="tp-lead">
                        <Both desk={p.lead} phone={p.phoneLead} />
                    </p>
                </section>

                <ToolSlot slug={p.slug} />

                {how.length ? (
                    <section className="tp-how">
                        <h2 className="tp-h2">{p.howTitle}</h2>
                        {p.howSteps ? (
                            <ol className="tp-steps">
                                {how.map((l) => (
                                    <li key={l}>{l}</li>
                                ))}
                            </ol>
                        ) : (
                            <p className="tp-formula">
                                {p.howPhone ? (
                                    <>
                                        <span className="sp-d">
                                            <Lines lines={how} />
                                        </span>
                                        <span className="sp-p">
                                            <Lines lines={p.howPhone} />
                                        </span>
                                    </>
                                ) : (
                                    <Lines lines={how} />
                                )}
                            </p>
                        )}
                    </section>
                ) : null}

                {p.questions.length ? (
                    <Questions questions={p.questions} headingClass="tp-h2" />
                ) : null}

                {p.ctaTitle ? (
                    <ClosingBand
                        title={p.ctaTitle}
                        line={p.ctaLine}
                        href={links.startFree}
                        label={links.startFreeLabel}
                    />
                ) : null}
            </div>
        </div>
    );
}
