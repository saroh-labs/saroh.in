/**
 * Keeps a draft preview's visitor inside the preview (#198, UX-069).
 *
 * The menu already takes a base path. Buttons and links inside sections and
 * rich text point at the live site's paths (`/about`), and on the preview's
 * host those 404. This script, run once on the preview page, catches a click
 * on any root-relative link outside the preview and:
 *
 * - rewrites the link's `href` under the preview, so a middle-click, a
 *   modified click or "copy link" gets the preview's address;
 * - for a plain click, navigates there itself and stops the event. A section
 *   button is a `next/link`, which routes by its own `href` prop on click and
 *   never reads the rewritten attribute — so rewriting alone still left the
 *   preview (the audit's 404 on the hero's "About").
 *
 * The body is a constant, and the base reaches it through a `data-` attribute
 * React escapes: a script spliced together from strings is one refactor away
 * from letting a value close the element (CodeQL js/bad-code-sanitization).
 */
export const KEEP_LINKS_INSIDE = `(function(s){var base=s&&s.getAttribute("data-preview-base");if(!base)return;document.addEventListener("click",function(e){var t=e.target;var a=t&&t.closest?t.closest("a[href]"):null;if(!a)return;var h=a.getAttribute("href");if(!h||h.charAt(0)!=="/"||h.indexOf("//")===0||h.indexOf(base)===0)return;a.setAttribute("href",base+h);if(e.defaultPrevented||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;var g=a.getAttribute("target");if(g&&g!=="_self")return;e.preventDefault();e.stopPropagation();window.location.assign(base+h);},true);})(document.currentScript);`;
