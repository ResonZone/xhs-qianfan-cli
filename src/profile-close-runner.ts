import { readFile } from "node:fs/promises";
import { chromium } from "playwright-core";

async function main(): Promise<void> {
  const requestPath = process.argv[2];
  if (!requestPath) throw new Error("Missing profile close request file");
  const request = JSON.parse(await readFile(requestPath, "utf8")) as { cdpSocket: string };
  const browser = await chromium.connectOverCDP(request.cdpSocket);
  const session = await browser.newBrowserCDPSession();
  await session.send("Browser.close");
  process.stdout.write("closed\n", () => process.exit(0));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  process.stderr.write(`${message}\n`, () => process.exit(2));
});
