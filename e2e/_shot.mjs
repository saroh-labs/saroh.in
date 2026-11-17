import { chromium } from '@playwright/test';
const [url, out, w, h] = process.argv.slice(2);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: +w, height: +h }, ignoreHTTPSErrors: true });
await p.goto(url, { waitUntil: 'networkidle', timeout: 180000 });
await p.screenshot({ path: out, fullPage: false });
console.log(await p.evaluate(() => [document.documentElement.scrollHeight, document.documentElement.scrollWidth > innerWidth]));
await b.close();
