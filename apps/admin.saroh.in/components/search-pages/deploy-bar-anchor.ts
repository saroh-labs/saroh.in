"use client";

/** The bar's id: the toast after a publish jumps here (audit F6). */
export const DEPLOY_BAR_ID = "deploy-changes";

/** Scrolls to the deploy bar and focuses it; false when it isn't on this screen. */
export function showDeployBar(): boolean {
    const bar = document.getElementById(DEPLOY_BAR_ID);
    if (!bar) return false;
    bar.scrollIntoView({ behavior: "smooth", block: "start" });
    bar.focus({ preventScroll: true });
    return true;
}
