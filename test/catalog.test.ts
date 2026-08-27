import { describe, expect, it } from "vitest";
import { loadCoverageMatrix } from "../src/catalog.js";

describe("coverage matrix", () => {
  it("assigns a terminal state to every current static candidate", async () => {
    const matrix = await loadCoverageMatrix();
    expect(matrix.staticCandidates).toHaveLength(1_926);
    expect(matrix.staticCandidates.every((entry) => Boolean(entry.state) && Boolean(entry.parameterCoverage))).toBe(true);
  });

  it("never enables write-classified static candidates", async () => {
    const matrix = await loadCoverageMatrix();
    const writes = matrix.staticCandidates.filter((entry) => entry.state === "WRITE_UNTESTED");
    expect(writes.length).toBeGreaterThan(0);
    expect(writes.every((entry) => entry.executionAllowed === false)).toBe(true);
  });

  it("keeps observed operations separate from static path candidates", async () => {
    const matrix = await loadCoverageMatrix();
    expect(matrix.observedOperations).toHaveLength(138);
    expect(matrix.observedOperations.filter((entry) => entry.executionAllowed && entry.risk === "read")).toHaveLength(137);
    expect(matrix.observedOperations.filter((entry) => !entry.executionAllowed)).toHaveLength(1);
  });
});
