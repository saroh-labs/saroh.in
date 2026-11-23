/**
 * Ask AI's panel opens from anywhere (the top bar's button, ⌘J) by an
 * app-wide event the host in the shell listens for, as the command menu's
 * does. The host says back whether it is open, so the button can show it.
 */
export const OPEN_ASK_AI = "saroh:open-ask-ai";
export const ASK_AI_SHOWN = "saroh:ask-ai-shown";

/**
 * On the full page (`/ask`) the conversation is already open: the button
 * and ⌘J put the cursor in its box, not a panel over it.
 */
export function onAskPage(): boolean {
    if (window.location.pathname !== "/ask") return false;
    document
        .querySelector<HTMLTextAreaElement>("#ask-ai-page textarea")
        ?.focus();
    return true;
}

export function openAskAi() {
    if (onAskPage()) return;
    window.dispatchEvent(new Event(OPEN_ASK_AI));
}

export function sayAskAiShown(open: boolean) {
    window.dispatchEvent(new CustomEvent(ASK_AI_SHOWN, { detail: open }));
}

/**
 * Ask AI applied or undid a change to a website's draft (owner, 21 Nov):
 * the open editor reads its draft again. `detail` is the site's id.
 */
export const SITE_DRAFT_CHANGED = "saroh:site-draft-changed";

export function saySiteDraftChanged(siteId: string) {
    window.dispatchEvent(
        new CustomEvent(SITE_DRAFT_CHANGED, { detail: siteId }),
    );
}

/**
 * A photo Ask AI drafted for a section, shown on the open page's canvas
 * before it is applied (owner, 22 Nov; board AIImgApply A): a dashed
 * outline, "Preview · not applied yet", the photo in place. A card says it
 * while it is open and takes it back (`clear`) when it is applied, undone,
 * dismissed or gone.
 */
export const SITE_PHOTO_PREVIEW = "saroh:site-photo-preview";

export type SitePhotoPreview =
    | {
          kind: "set";
          siteId: string;
          pageId: string;
          sectionKey: string;
          src: string;
          alt: string;
      }
    | { kind: "clear"; sectionKey: string };

export function saySitePhotoPreview(detail: SitePhotoPreview) {
    window.dispatchEvent(new CustomEvent(SITE_PHOTO_PREVIEW, { detail }));
}
