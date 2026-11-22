"use client";

import { Button } from "@saroh/ui/button";

import { FixedBlockInspector } from "@/components/sites/blocks/fixed-block-inspector";
import type { FixedPart } from "@/components/sites/editor/use-editor-selection";
import { MenuEditor } from "@/components/sites/menu-footer/menu-editor";

import type { EditorModel } from "../shell/editor-model";
import type { InspectorTab } from "./inspector-tab";

const NOTE = "text-[0.8125rem] leading-relaxed text-muted-foreground";

/**
 * The header or footer in the inspector (H1–H4, `fix/WXMGlobal`): the same
 * tabs as every section. Content holds the name, the menu (added, moved,
 * renamed and removed here) and the logo for the header, the line for the
 * footer; Style and Visibility say where those are decided; Feedback goes
 * to the whole site's notes. No Move or Remove: they are on every page.
 * The phone's section sheet draws this same pane (H4).
 */
export function ChromePanel({
    part,
    tab,
    model,
    onBrand = () => model.openRail("brand"),
    onWholeSite = () => model.openRail("feedback"),
}: {
    part: FixedPart;
    tab: InspectorTab;
    model: EditorModel;
    /** Brand: the rail's tab on a desk, its sheet on a phone. */
    onBrand?: () => void;
    /** The whole site's notes. */
    onWholeSite?: () => void;
}) {
    const { chrome } = model;
    if (tab === "style") {
        return (
            <div className="grid gap-3">
                <p className={NOTE}>
                    The {part} follows your site&apos;s look: its fonts and
                    colours are set in Brand, for every page at once.
                </p>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="justify-self-start"
                    onClick={onBrand}
                >
                    Open Brand
                </Button>
            </div>
        );
    }
    if (tab === "visibility") {
        return (
            <p className={NOTE}>
                On every page, on desk and phone. The {part} can&apos;t be
                hidden, moved or removed.
            </p>
        );
    }
    if (tab === "feedback") {
        return (
            <div className="grid gap-3">
                <p className={NOTE}>
                    Notes about the {part} are kept with the whole site&apos;s.
                </p>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="justify-self-start"
                    onClick={onWholeSite}
                >
                    All notes on this site
                </Button>
            </div>
        );
    }
    const editable = part === "header" && chrome.canUpdate && !model.readOnly;
    return (
        <FixedBlockInspector
            part={part}
            siteId={model.siteId}
            text={chrome}
            bare
            moves={false}
            menu={
                editable ? (
                    <>
                        <section
                            aria-labelledby="header-menu"
                            className="grid gap-2 border-t pt-3"
                        >
                            <h3
                                id="header-menu"
                                className="text-xs font-medium"
                            >
                                Menu
                            </h3>
                            <MenuEditor
                                menu={chrome.menu}
                                setMenu={chrome.setMenu}
                                pages={model.pages}
                            />
                            <p className={NOTE}>
                                Renaming here never renames the page. A link
                                with no name goes by its page&apos;s title.
                            </p>
                        </section>
                        <section className="flex items-center gap-2 border-t pt-3">
                            <span className="min-w-0 flex-1">
                                <span className="block text-xs font-medium">
                                    Logo
                                </span>
                                <span className={NOTE}>
                                    Beside the name, with the tab icon.
                                </span>
                            </span>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                aria-label="Change the logo"
                                onClick={onBrand}
                            >
                                Change
                            </Button>
                        </section>
                    </>
                ) : undefined
            }
        />
    );
}
