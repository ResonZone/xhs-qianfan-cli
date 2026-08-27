import { cp, mkdir } from "node:fs/promises";

await mkdir(new URL("../dist/catalog/", import.meta.url), { recursive: true });
await cp(
  new URL("../catalog/endpoints.json", import.meta.url),
  new URL("../dist/catalog/endpoints.json", import.meta.url),
);
await cp(
  new URL("../catalog/static-candidates.json", import.meta.url),
  new URL("../dist/catalog/static-candidates.json", import.meta.url),
);
await cp(
  new URL("../catalog/live-observed.json", import.meta.url),
  new URL("../dist/catalog/live-observed.json", import.meta.url),
);
await cp(
  new URL("../catalog/menu.json", import.meta.url),
  new URL("../dist/catalog/menu.json", import.meta.url),
);
await cp(
  new URL("../catalog/coverage-matrix.json", import.meta.url),
  new URL("../dist/catalog/coverage-matrix.json", import.meta.url),
);
await cp(
  new URL("../catalog/parameter-validation.json", import.meta.url),
  new URL("../dist/catalog/parameter-validation.json", import.meta.url),
);
