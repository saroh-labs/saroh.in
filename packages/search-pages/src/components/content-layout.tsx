import type { ReactNode } from "react";

/**
 * The shell every content page sits in (BLOCKS.md): the Draft label, the
 * main column, an optional aside, the closing band and what comes below.
 *
 * - `rail` (GST): 760px main + a 300px sticky aside; on a phone the main
 *   column, then the band, then the aside.
 * - `solo` (guide): one 760px column, the band inside it.
 * - `hero` (download): two columns, the copy and the aside (U9's
 *   DownloadGate goes there), stacked on a phone.
 * - `hub`: one full-width column.
 */
export function ContentLayout({
    layout,
    draft = false,
    aside,
    band,
    below,
    children,
}: {
    layout: "rail" | "solo" | "hero" | "hub";
    /** Development and the admin preview: the page isn't live yet. */
    draft?: boolean;
    aside?: ReactNode;
    band?: ReactNode;
    /** Full-width blocks after the band (rail, hub) or after the hero (download). */
    below?: ReactNode;
    children: ReactNode;
}) {
    const Main = layout === "rail" || layout === "solo" ? "article" : "div";
    return (
        <div className="sp">
            <div className={`sp-cl sp-cl-${layout}`}>
                {draft ? (
                    <p className="sp-draft sp-cl-draft">
                        Draft — not published yet
                    </p>
                ) : null}
                <div className="sp-cl-grid">
                    <Main className="sp-cl-main">
                        {children}
                        {layout === "solo" ? band : null}
                    </Main>
                    {aside ? (
                        <aside className="sp-cl-aside">{aside}</aside>
                    ) : null}
                    {band && layout !== "solo" ? (
                        <div className="sp-cl-band">{band}</div>
                    ) : null}
                </div>
                {below}
            </div>
        </div>
    );
}
