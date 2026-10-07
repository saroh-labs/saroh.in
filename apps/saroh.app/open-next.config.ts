import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// No incremental cache yet: every merchant page renders per request today
// (the layout reads the request headers), so there is nothing to cache.
export default defineCloudflareConfig({});
