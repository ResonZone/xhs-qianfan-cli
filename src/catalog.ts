import { readFile } from "node:fs/promises";
import type { CoverageMatrix, Domain, EndpointCatalog, EndpointSpec, StaticCandidate, StaticCatalog } from "./types.js";

function catalogUrl(): URL {
  return new URL("../catalog/endpoints.json", import.meta.url);
}

function staticCatalogUrl(): URL {
  return new URL("../catalog/static-candidates.json", import.meta.url);
}

function coverageMatrixUrl(): URL {
  return new URL("../catalog/coverage-matrix.json", import.meta.url);
}

function parameterValidationUrl(): URL {
  return new URL("../catalog/parameter-validation.json", import.meta.url);
}

export async function loadCatalog(): Promise<EndpointCatalog> {
  const raw = await readFile(catalogUrl(), "utf8");
  const catalog = JSON.parse(raw) as EndpointCatalog;
  const ids = new Set<string>();
  for (const endpoint of catalog.endpoints) {
    if (ids.has(endpoint.id)) throw new Error(`Duplicate endpoint id: ${endpoint.id}`);
    ids.add(endpoint.id);
  }
  return catalog;
}

export async function getEndpoint(id: string): Promise<EndpointSpec> {
  const catalog = await loadCatalog();
  const endpoint = catalog.endpoints.find((candidate) => candidate.id === id);
  if (!endpoint) throw new Error(`Unknown endpoint: ${id}`);
  return endpoint;
}

export async function listEndpoints(domain?: Domain): Promise<EndpointSpec[]> {
  const catalog = await loadCatalog();
  return domain
    ? catalog.endpoints.filter((endpoint) => endpoint.domain === domain || endpoint.domains?.includes(domain))
    : catalog.endpoints;
}

export async function loadStaticCatalog(): Promise<StaticCatalog> {
  const raw = await readFile(staticCatalogUrl(), "utf8");
  return JSON.parse(raw) as StaticCatalog;
}

export async function listStaticCandidates(domain?: Domain): Promise<StaticCandidate[]> {
  const catalog = await loadStaticCatalog();
  return domain ? catalog.candidates.filter((candidate) => candidate.domain === domain) : catalog.candidates;
}

export async function loadCoverageMatrix(): Promise<CoverageMatrix> {
  const raw = await readFile(coverageMatrixUrl(), "utf8");
  return JSON.parse(raw) as CoverageMatrix;
}

export async function loadParameterValidation(): Promise<Record<string, unknown>> {
  const raw = await readFile(parameterValidationUrl(), "utf8");
  return JSON.parse(raw) as Record<string, unknown>;
}
