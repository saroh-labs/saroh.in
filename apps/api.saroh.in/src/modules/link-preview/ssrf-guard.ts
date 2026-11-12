/**
 * The link preview tool's guard lives in `common/net/ssrf.ts` since outbound
 * webhooks, the AI apps' client metadata fetch and `upload_image` share it
 * (plan 2026-11-10-001, U13). Kept here so link preview's imports stay put.
 */
export * from "../../common/net/ssrf";
