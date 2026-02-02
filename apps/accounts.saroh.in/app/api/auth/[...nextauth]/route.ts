// // import { handlers } from '@/lib/auth';
// import { nextAuthInstance } from "@saroh/auth/auth";
// const { handlers } = nextAuthInstance;
// export const { GET, POST } = handlers;
import { auth } from "@/lib/auth"; // path to your auth file
import { toNextJsHandler } from "better-auth/next-js";

export const { POST, GET } = toNextJsHandler(auth);
