import type { useAddBlock } from "@/components/sites/blocks/use-add-block";
import type { EditorViewport } from "@/components/sites/canvas/use-editor-viewport";
import type { useEditorStyle } from "@/components/sites/looks/use-editor-style";
import type { usePublish } from "@/components/sites/publish/use-publish";
import type { usePublishChanges } from "@/components/sites/publish/use-publish-changes";
import type { EditorTestReleases } from "@/components/sites/test-releases/use-test-releases";
import type { ModulePageKind, SitePage } from "@/lib/sites/service";
import type { SiteStateTone } from "@/lib/sites/site-state";
import type { SiteStyleOptions } from "@/lib/sites/style";

import type { EditorDraft } from "../use-editor-draft";
import type { EditorLayout, EditorSheets } from "../use-editor-layout";
import type { EditorReview } from "../use-editor-review";
import type { ActiveSection, EditorSelection } from "../use-editor-selection";
import type { SiteChrome } from "../use-site-chrome";
import type { EditorUndo } from "../use-undo";

/** The rail's tabs (U46): the site editor's five, a reader's three. */
export type TrailKey = "pages" | "add" | "brand" | "history" | "feedback";

/**
 * Everything the editor's hooks hold, handed to the shell and to every
 * panel, sheet and phone piece a later unit fills (KTD-E2). Built once in
 * `site-editor.tsx`; a stub reads what it needs from here, so filling it
 * never means editing the shell or adding a prop.
 *
 * Read it, don't copy it: each field is the live hook value of this render.
 */
export interface EditorModel {
    siteId: string;
    pageId: string;
    pages: SitePage[];
    /** The open page, or undefined for a stale id. */
    page: SitePage | undefined;
    /** The business name the header draws (the chrome hook's). */
    siteName: string;
    /** "gulmohar.saroh.app", or null before the site has one. */
    address: string | null;
    layout: EditorLayout;
    /** A Reviewer (DEC-200): nothing here writes. */
    readOnly: boolean;
    /** `site:update`: page settings, Add a page, the name and footer. */
    canUpdateSite: boolean;
    canPublish: boolean;
    /** Ask AI's panel is on for this person (`askAiOn`, not a Reviewer). */
    askAi: boolean;
    /** The page, the look, the name or the footer has unsaved work. */
    unsaved: boolean;
    /** The chip's status in the Website area's words (`siteStatus`, RULES §2). */
    status: { label: string; tone: SiteStateTone; waiting: number };
    styleOptions: SiteStyleOptions;
    addablePageKinds: ModulePageKind[];
    shopOpen: boolean;
    packsOpen: boolean;
    /** The selected section and its index, or null. */
    active: ActiveSection | null;
    draft: EditorDraft;
    selection: EditorSelection;
    sheets: EditorSheets;
    viewport: EditorViewport;
    edits: EditorUndo;
    review: EditorReview;
    publish: ReturnType<typeof usePublish>;
    /** The Publish sheet's changes by person (loads on open). */
    publishChanges: ReturnType<typeof usePublishChanges>;
    siteStyle: ReturnType<typeof useEditorStyle>;
    chrome: SiteChrome;
    add: ReturnType<typeof useAddBlock>;
    /** Test links (DEC-071) with this person's abilities. */
    releases: EditorTestReleases;
    /** Open the Publish sheet, settling Undo first (the chip and Publish). */
    openPublish: () => void;
    /** Open the one page settings sheet (batch 1) for a page. */
    openPageSettings: (pageId: string) => void;
    /** Show a rail tab on a desk (the trail), e.g. History from More. */
    openRail: (tab: TrailKey) => void;
    /** Open the page a note is on, its section selected with its notes. */
    jumpToNote: (pageId: string, sectionKey: string) => void;
    /** The desk rail's open tab. */
    trail: TrailKey;
    /** Scroll the canvas to a section after it moves or is chosen. */
    scrollToSection: (index: number) => void;
    /** Start the editor afresh (a look's starter content, a restore). */
    reloadDraft?: (pageId?: string) => void;
}
