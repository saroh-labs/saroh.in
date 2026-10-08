import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Every page here is per request (sign-in, the business chooser), so there is
// no incremental cache to configure.
export default defineCloudflareConfig({});
