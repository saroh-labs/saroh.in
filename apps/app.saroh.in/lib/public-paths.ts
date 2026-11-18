/**
 * The app's pages anyone may open, signed in or not (`middleware.ts`):
 * Saroh Social's data deletion status, read by whoever asked Meta to have
 * Saroh delete their data (plan saroh-social U8).
 */
export const isPublicPath = (pathname: string): boolean =>
    /^\/social\/deletion\/[^/]+\/?$/.test(pathname);
