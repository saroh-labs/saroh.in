import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// No incremental cache: every merchant page renders per request in Next (the
// layout reads the request's host and the visitor's session), so Next's ISR
// has nothing it may keep. Pages are kept one level up instead, by the
// Worker's page cache in front of this handler (#863, worker.ts and
// lib/page-cache/), which keeps a page only for a visitor who is nobody in
// particular and only when the render tagged it with its site.
export default defineCloudflareConfig({});
