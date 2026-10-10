"use client";

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
import { SETTINGS_ROW_ID } from "@/lib/sites/settings-edit";
import { automaticMenu } from "@/lib/sites/settings-page";
import type { SiteAddress } from "@/lib/sites/share-links";

import { EditAction } from "./edit-actions";
import { FooterSheet, MenuSheet, PostsPathSheet } from "./menu-footer-sheets";
import type { SettingsSave } from "./use-settings-save";

/**
 * Menu and footer: the links at the top of every page, the line at the
 * foot, and where the site's posts live. All part of the draft.
 *
 * Each row says what is saved and its Edit opens the row's sheet; a save
 * shows in the row at once (`saved`), before the page reads again.
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
    const { editing, run, pending, close } = state;
    // What the rows say: the site's own, then each save as it lands.
    const [saved, setSaved] = useState<{
        menu: SiteNavigationItem[] | null;
        footer: SiteFooter | null;
        postsPrefix: string | null;
    }>({
        menu: site.navigation?.items ?? null,
        footer: site.footer ?? null,
        postsPrefix: site.postsPrefix ?? null,
    });
    const pagesById = new Map(site.pages.map((p) => [p.id, p]));
    const automatic = automaticMenu(site);

    function saveMenu(menu: SiteNavigationItem[]) {
        run(
            () =>
                updateSiteNavigation(
                    site.id,
                    menu.length ? { items: menu } : null,
                ),
            menu.length
                ? "Menu saved. Publish to make it public."
                : "Menu removed. Publish to take it off the site.",
            () => setSaved((s) => ({ ...s, menu: menu.length ? menu : null })),
        );
    }

    function saveFooter(footer: SiteFooter | null) {
        run(
            () => updateSiteFooter(site.id, footer),
            footer === null
                ? "Footer removed. Publish to take it off the site."
                : "Footer saved. Publish to make it public.",
            () => setSaved((s) => ({ ...s, footer })),
        );
    }

    function savePostsPath(postsPrefix: string) {
        run(
            () =>
                updateSiteSettings(site.id, {
                    postsPrefix: postsPrefix || null,
                }),
            "Posts path saved. Publish to make it public.",
            () => setSaved((s) => ({ ...s, postsPrefix: postsPrefix || null })),
        );
    }

    const hasFooter = Boolean(saved.footer?.value.trim());
    const sheet = { open: editing?.open ?? false, pending, onClose: close };

    return (
        <Group id="menu-and-footer" title="Menu and footer">
            <Section>
                <Row
                    id={SETTINGS_ROW_ID.menu}
                    label="Menu"
                    draft
                    action={
                        <EditAction
                            row="menu"
                            state={state}
                            label={saved.menu ? "Edit" : "Build"}
                            name={saved.menu ? "Edit menu" : "Build menu"}
                        />
                    }
                >
                    {saved.menu ? (
                        <span className="[overflow-wrap:anywhere]">
                            {saved.menu
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
                    id={SETTINGS_ROW_ID.footer}
                    label="Footer"
                    draft
                    action={
                        <EditAction
                            row="footer"
                            state={state}
                            label={hasFooter ? "Edit" : "Write"}
                            name={hasFooter ? "Edit footer" : "Write footer"}
                        />
                    }
                >
                    {hasFooter ? (
                        // A template's row with no line yet keeps its layout
                        // (the API's), and reads as no line here.
                        <span className="whitespace-pre-wrap break-words text-muted-foreground">
                            {saved.footer?.value}
                        </span>
                    ) : (
                        <Absent>Not written</Absent>
                    )}
                </Row>

                <Row
                    id={SETTINGS_ROW_ID["posts-path"]}
                    label="Posts path"
                    draft
                    action={
                        <EditAction
                            row="posts-path"
                            state={state}
                            name="Edit posts path"
                        />
                    }
                >
                    <span>
                        /{saved.postsPrefix ?? "blog"}
                        <span className="text-muted-foreground">
                            {" "}
                            · where your posts live
                        </span>
                    </span>
                </Row>
            </Section>

            {/* The open sheet, a fresh draft each time it opens. */}
            {editing?.which === "menu" ? (
                <MenuSheet
                    key={editing.opened}
                    {...sheet}
                    saved={saved.menu ?? []}
                    pages={site.pages}
                    onSave={saveMenu}
                />
            ) : null}
            {editing?.which === "footer" ? (
                <FooterSheet
                    key={editing.opened}
                    {...sheet}
                    saved={saved.footer}
                    onSave={saveFooter}
                />
            ) : null}
            {editing?.which === "posts-path" ? (
                <PostsPathSheet
                    key={editing.opened}
                    {...sheet}
                    saved={saved.postsPrefix ?? ""}
                    host={address?.host ?? null}
                    onSave={savePostsPath}
                />
            ) : null}
        </Group>
    );
}
