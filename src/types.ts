export const DOMAINS = [
  "common",
  "overview",
  "product",
  "traffic",
  "livestream",
  "note",
  "trade",
  "search",
  "marketplace",
  "shop",
  "service",
  "market",
  "marketing",
  "data",
  "service-market",
] as const;

export const COMMAND_DOMAINS = [
  "overview",
  "product",
  "traffic",
  "livestream",
  "note",
  "trade",
  "search",
  "marketplace",
  "shop",
  "service",
  "market",
  "marketing",
] as const;

export type Domain = (typeof DOMAINS)[number];
export type CommandDomain = (typeof COMMAND_DOMAINS)[number];
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "UNKNOWN";
export type Risk = "read" | "write" | "unknown";
export type EvidenceLevel = "observed" | "static" | "candidate";

export interface EndpointSpec {
  id: string;
  domain: Domain;
  title: string;
  method: HttpMethod;
  host: string;
  path: string;
  risk: Risk;
  evidence: EvidenceLevel;
  runnable: boolean;
  description?: string;
  query?: string[];
  body?: string[];
  observedStatus?: number;
  source: string;
  domains?: Domain[];
  operation?: string;
  queryExample?: Record<string, unknown>;
  bodyExample?: Record<string, unknown>;
  inputPlaceholders?: string[];
  pages?: string[];
  observedStatuses?: number[];
  sourceFiles?: Array<{ app: string; file: string }>;
  evidenceFiles?: string[];
}

export interface EndpointCatalog {
  catalogVersion: number;
  generatedAt: string;
  target: string;
  endpoints: EndpointSpec[];
}

export interface StaticCandidate {
  path: string;
  domain: Domain;
  methods: HttpMethod[];
  risk: Risk;
  evidence: "static";
  runnable: false;
  sources: Array<{ app?: string; snapshot?: string; file: string; sha: string | null }>;
}

export interface StaticCatalog {
  catalogVersion: number;
  generatedAt: string;
  targetRevision: string;
  disclaimer: string;
  counts: Partial<Record<Domain, number>>;
  candidates: StaticCandidate[];
}

export interface CoverageStaticEntry {
  path: string;
  domain: Domain;
  state: string;
  methods: HttpMethod[];
  risk: Risk;
  executionAllowed: boolean;
  evidence: string;
  parameterCoverage: string;
  parameterFamilies: string[];
  queryKeys: string[];
  bodyKeys: string[];
  pathVariables: string[];
  sourceStatus: string;
  sourceCount: number;
  callsiteCount: number;
}

export interface CoverageObservedOperation {
  id: string;
  path: string;
  method: HttpMethod;
  operation?: string | null;
  domains: Domain[];
  state: string;
  risk: Risk;
  executionAllowed: boolean;
  observedStatuses: number[];
  parameterCoverage: string;
  parameterExampleCount: number;
  parameterFamilies: string[];
  queryKeys: string[];
  bodyKeys: string[];
  placeholders: string[];
  pages: string[];
  evidenceFiles: string[];
}

export interface CoverageMatrix {
  matrixVersion: number;
  generatedAt: string;
  targetRevision: string;
  scope: string;
  definitions: Record<string, string>;
  requestBudget: Record<string, unknown>;
  summary: Record<string, unknown>;
  observedOperations: CoverageObservedOperation[];
  staticCandidates: CoverageStaticEntry[];
}

export interface RuntimeState {
  pid: number;
  port: number;
  startedAt: string;
  executable: string;
  profileDir: string;
}

export interface NamedProfileMetadata {
  version: 1;
  name: string;
  createdAt: string;
  profileRoot: string;
  chromeUserDataDir: string;
  credentialStorage: "chrome-user-data-dir";
  cookieExported: false;
}

export interface NamedProfileRuntime {
  pid: number;
  port: number;
  startedAt: string;
  executable: string;
  profileName: string;
}

export interface ProfileLoginResult {
  profile: string;
  status: "valid" | "login_required" | "stopped";
  running: boolean;
  httpStatus: number | null;
  businessCode: number | null;
  success: boolean | null;
  checkedAt: string;
  checks: number;
  pollIntervalSeconds: number;
  credentialStorage: "chrome-user-data-dir";
  cookiesRead: false;
  cookiesExported: false;
}

export interface ApiResult {
  endpoint: string;
  method: HttpMethod;
  url: string;
  status: number;
  ok: boolean;
  contentType: string;
  data: unknown;
}

export interface CapturedRequest {
  capturedAt: string;
  domain: Domain;
  method: string;
  host: string;
  path: string;
  queryKeys: string[];
  resourceType: string;
  status?: number;
  mimeType?: string;
  initiator?: {
    url?: string;
    lineNumber?: number;
    columnNumber?: number;
  };
  requestBody?: unknown;
  responseShape?: unknown;
}
