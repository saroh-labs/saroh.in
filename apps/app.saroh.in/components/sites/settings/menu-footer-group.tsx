"use client";

import { Input } from "@saroh/ui/input";
import { cn } from "@saroh/ui/lib/utils";
import { Textarea } from "@saroh/ui/textarea";
import dynamic from "next/dynamic";
import { useState } from "react";

import { Absent, Group, Row, Section } from "@/components/sites/settings-rows";
import {
    updateSiteFooter,
    updateSiteNavigation,
    updateSiteSettings,
} from "@/lib/sites/actions";
import type {
    SiteDetail,
    SiteFooter,
    SiteNavigationItem,
} from "@/lib/sites/service";
import { automaticMenu, ROW_ANCHORS } from "@/lib/sites/settings-page";
import type { SiteAddress } from "@/lib/sites/share-links";

import { EditActions } from "./edit-actions";
import { MenuEditor } from "./menu-editor";
import type { SettingsSave } from "./use-settings-save";

/* On demand and browser-only, for the same reasons as in the editor. */
const RichTextEditor = dynamic(
    () =>
        import("@/components/sites/rich-text-editor").then(
            (m) => m.RichTextEditor,
        ),
    {
        ssr: false,
        loading: () => (
            <div className="min-h-40 animate-pulse rounded-md border bg-muted" />
        ),
    },
);

/**
 * Menu and footer: the links at the top of every page, the line at the
 * foot, and where the site's posts live. All part of the draft.
 *
 * With no menu built, the live site still lists its module pages on its
 * own (`resolveSiteNavigation`), so the row names them rather than saying
 * the site has no menu at all.
 */
export function MenuFooterGroup({
    site,
    address,
    state,
}: {
    site: SiteDetail;
    address: SiteAddress | null;
    state: SettingsSave;
}) {
    const { editing, run } = state;
    const [menu, setMenu] = useState<SiteNavigationItem[]>(
        site.navigation?.items ?? [],
    );
    const [footerValue, setFooterValue] = useState(site.footer?.value ?? "");
    const [footerFormat, setFooterFormat] = useState<SiteFooter["format"]>(
        site.footer?.format ?? "html",
    );
    const [postsPrefix, setPostsPrefix] = useState(site.postsPrefix ?? "");
    const pagesById = new Map(site.pages.map((p) => [p.id, p]));
    const automatic = automaticMenu(site);

    function saveMenu() {
        run(
            "menu",
            () =>
                updateSiteNavigation(
                    site.id,
                    menu.length ? { items: menu } : null,
                ),
            menu.length
                ? "Menu saved. Publish to make it public."
                : "Menu removed. Publish to take it off the site.",
        );
    }

    function saveFooter() {
        // Empty IS the delete: the API collapses a blank value to null, so
        // clearing the box removes the footer.
        const next: SiteFooter | null =
            footerValue.trim() === ""
                ? null
                : { format: footerFormat, value: footerValue };
        run(
            "footer",
            () => updateSiteFooter(site.id, next),
            next === null
                ? "Footer removed. Publish to take it off the site."
                : "Footer saved. Publish to make it public.",
        );
    }

    const hasFooter = Boolean(site.footer?.value.trim());

    return (
        <Group id="menu-and-footer" title="Menu and footer">
            <Section>
                <Row
                    id={ROW_ANCHORS.menu}
                    label="Menu"
                    draft
                    action={
                        <EditActions
                            row="menu"
                            state={state}
                            editLabel={site.navigation ? "Edit" : "Build"}
                            onSave={saveMenu}
                            onCancel={() =>
                                setMenu(site.navigation?.items ?? [])
                            }
                        />
                    }
                >
                    {editing === "menu" ? (
                        <MenuEditor
                            menu={menu}
                            setMenu={setMenu}
                            pages={site.pages}
                        />
                    ) : site.navigation ? (
                        <span className="[overflow-wrap:anywhere]">
                            {site.navigation.items
                                .map(
                                    (i) =>
                                        i.label ??
                                        pagesById.get(i.pageId)?.title ??
                                        "?",
                                )
                                .join(" · ")}
                        </span>
                    ) : automatic.length ? (
                        <span className="[overflow-wrap:anywhere]">
                            <Absent>Not built</Absent>{" "}
                            <span className="text-muted-foreground">
                                · {automatic.join(" · ")}{" "}
                                {automatic.length === 1 ? "shows" : "show"} on
                                their own
                            </span>
                        </span>
                    ) : (
                        <Absent>Not built</Absent>
                    )}
                </Row>

                <Row
                    label="Footer"
                    draft
                    action={
                        <EditActions
                            row="footer"
                            state={state}
                            editLabel={hasFooter ? "Edit" : "Write"}
                            onSave={saveFooter}
                            onCancel={() => {
                                setFooterValue(site.footer?.value ?? "");
                                setFooterFormat(site.footer?.format ?? "html");
                            }}
                        />
                    }
                >
                    {editing === "footer" ? (
                        <div className="space-y-2">
                            {footerFormat === "html" ? (
                                <RichTextEditor
                                    value={footerValue}
                                    onChange={setFooterValue}
                                    placeholder="Your name · your area · how to reach you"
                                />
                            ) : (
                                <Textarea
                                    value={footerValue}
                                    onChange={(e) =>
                                        setFooterValue(e.target.value)
                                    }
                                    rows={4}
                                    placeholder={"Your name\nYour area"}
                                    aria-label="Footer text"
                                />
                            )}
                            {/* The two formats a richText section offers:
                                one content model, one sanitizer. */}
                            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                <span>Written as</span>
                                {(["html", "markdown"] as const).map((f) => (
                                    <button
                                        key={f}
                                        type="button"
                                        onClick={() => setFooterFormat(f)}
                                        aria-pressed={footerFormat === f}
                                        className={cn(
                                            "rounded px-2 py-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring coarse:min-h-11",
                                            footerFormat === f
                                                ? "bg-secondary text-secondary-foreground"
                                                : "hover:text-foreground active:bg-accent-active",
                                        )}
                                    >
                                        {f === "html" ? "HTML" : "Plain text"}
                                    </button>
                                ))}
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Clear the box to remove the footer. Links and
                                basic formatting are kept.
                            </p>
                        </div>
                    ) : hasFooter ? (
                        // A template's row with no line yet keeps its layout
                        // (the API's), and reads as no line here.
                        <span className="whitespace-pre-wrap break-words text-muted-foreground">
                            {site.footer?.value}
                        </span>
                    ) : (
                        <Absent>Not written</Absent>
                    )}
                </Row>

                <Row
                    label="Posts path"
                    draft
                    action={
                        <EditActions
                            row="postsPrefix"
                            state={state}
                            onSave={() =>
                                run(
                                    "postsPrefix",
                                    () =>
                                        updateSiteSettings(site.id, {
                                            postsPrefix: postsPrefix || null,
                                        }),
                                    "Posts path saved. Publish to make it public.",
                                )
                            }
                            onCancel={() =>
                                setPostsPrefix(site.postsPrefix ?? "")
                            }
                        />
                    }
                >
                    {editing === "postsPrefix" ? (
                        <div className="space-y-1">
                            <Input
                                value={postsPrefix}
                                autoFocus
                                placeholder="blog"
                                onChange={(e) => setPostsPrefix(e.target.value)}
                                aria-label="Posts path"
                            />
                            <p className="text-xs text-muted-foreground">
                                Posts will live at {address ? address.host : ""}
                                /{postsPrefix || "blog"}/…
                            </p>
                        </div>
                    ) : (
                        <span>
                            /{site.postsPrefix ?? "blog"}
                            <span className="text-muted-foreground">
                                {" "}
                                · where your posts live
                            </span>
                        </span>
                    )}
                </Row>
            </Section>
        </Group>
    );
}
