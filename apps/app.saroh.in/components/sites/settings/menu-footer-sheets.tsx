"use client";

import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { cn } from "@saroh/ui/lib/utils";
import { Textarea } from "@saroh/ui/textarea";
import dynamic from "next/dynamic";
import { useState } from "react";

import type {
    SiteFooter,
    SiteNavigationItem,
    SitePage,
} from "@/lib/sites/service";
import { settingsEditId } from "@/lib/sites/settings-edit";

import { MenuEditor } from "./menu-editor";
import { NOTE, SettingsSheetFrame } from "./settings-sheet";

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

interface SheetProps {
    open: boolean;
    pending: boolean;
    onClose: () => void;
}

/** Whether two menus list the same pages under the same labels, in order. */
const sameMenu = (a: SiteNavigationItem[], b: SiteNavigationItem[]) =>
    a.length === b.length &&
    a.every((x, i) => x.pageId === b[i].pageId && x.label === b[i].label);

/**
 * The menu builder, with the sheet's whole height: its entries in order,
 * each renamed, moved and removed in place, and the pages not in it yet
 * under them. Pages are added here; none of it leaves the sheet.
 */
export function MenuSheet({
    saved,
    pages,
    onSave,
    ...frame
}: SheetProps & {
    /** The menu as it is saved; empty when none is built. */
    saved: SiteNavigationItem[];
    pages: SitePage[];
    onSave: (menu: SiteNavigationItem[]) => void;
}) {
    const [menu, setMenu] = useState(saved);
    return (
        <SettingsSheetFrame
            {...frame}
            wide
            editId={settingsEditId("menu")}
            title="Menu"
            description="The links at the top of every page, in this order."
            onSubmit={(e) => {
                e.preventDefault();
                if (sameMenu(menu, saved)) frame.onClose();
                else onSave(menu);
            }}
        >
            <MenuEditor menu={menu} setMenu={setMenu} pages={pages} />
            <p className={cn(NOTE, "mt-2")}>
                A page left with no label goes by its own title. Save with no
                pages to remove the menu.
            </p>
        </SettingsSheetFrame>
    );
}

/** The line at the foot of every page, written as HTML or plain text. */
export function FooterSheet({
    saved,
    onSave,
    ...frame
}: SheetProps & {
    saved: SiteFooter | null;
    /** Null removes the footer: an empty box is the delete. */
    onSave: (footer: SiteFooter | null) => void;
}) {
    const [value, setValue] = useState(saved?.value ?? "");
    const [format, setFormat] = useState<SiteFooter["format"]>(
        saved?.format ?? "html",
    );
    return (
        <SettingsSheetFrame
            {...frame}
            wide
            editId={settingsEditId("footer")}
            title="Footer"
            description="The line at the foot of every page."
            onSubmit={(e) => {
                e.preventDefault();
                if (
                    value === (saved?.value ?? "") &&
                    format === (saved?.format ?? "html")
                ) {
                    frame.onClose();
                    return;
                }
                // Empty IS the delete: the API collapses a blank value to
                // null, so clearing the box removes the footer.
                onSave(value.trim() === "" ? null : { format, value });
            }}
        >
            {format === "html" ? (
                <RichTextEditor
                    value={value}
                    onChange={setValue}
                    placeholder="Your name · your area · how to reach you"
                />
            ) : (
                <Textarea
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    rows={6}
                    placeholder={"Your name\nYour area"}
                    aria-label="Footer text"
                />
            )}
            {/* The two formats a richText section offers: one content
                model, one sanitizer. */}
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>Written as</span>
                {(["html", "markdown"] as const).map((f) => (
                    <button
                        key={f}
                        type="button"
                        onClick={() => setFormat(f)}
                        aria-pressed={format === f}
                        className={cn(
                            "rounded px-2 py-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring coarse:min-h-11",
                            format === f
                                ? "bg-secondary text-secondary-foreground"
                                : "hover:text-foreground active:bg-accent-active",
                        )}
                    >
                        {f === "html" ? "HTML" : "Plain text"}
                    </button>
                ))}
            </div>
            <p className={NOTE}>
                Clear the box to remove the footer. Links and basic formatting
                are kept.
            </p>
        </SettingsSheetFrame>
    );
}

/** Where the site's posts live, with the address it comes to as typed. */
export function PostsPathSheet({
    saved,
    host,
    onSave,
    ...frame
}: SheetProps & {
    /** The saved path; empty for the default, "blog". */
    saved: string;
    /** The site's host, for the example; null before it has an address. */
    host: string | null;
    onSave: (postsPrefix: string) => void;
}) {
    const [path, setPath] = useState(saved);
    return (
        <SettingsSheetFrame
            {...frame}
            editId={settingsEditId("posts-path")}
            title="Posts path"
            description="Where your posts live on your site."
            onSubmit={(e) => {
                e.preventDefault();
                if (path === saved) frame.onClose();
                else onSave(path);
            }}
        >
            <Label htmlFor="settings-posts-path-field">Posts path</Label>
            <Input
                id="settings-posts-path-field"
                value={path}
                placeholder="blog"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                aria-describedby="settings-posts-path-note"
                onChange={(e) => setPath(e.target.value)}
            />
            <p id="settings-posts-path-note" className={NOTE}>
                Posts will live at {host ?? ""}/{path || "blog"}/…
            </p>
        </SettingsSheetFrame>
    );
}
