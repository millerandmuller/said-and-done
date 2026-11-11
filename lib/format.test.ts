import { describe, expect, it } from "vitest";
import { formatElapsed, paidSalesHeader, saidToDoneRow } from "./format";

describe("paidSalesHeader", () => {
  it("counts to one in the singular", () => expect(paidSalesHeader(1, 22)).toBe("1 paid sale · $22"));
  it("uses the plural for zero and for two or more", () => {
    expect(paidSalesHeader(0, 0)).toBe("0 paid sales · $0");
    expect(paidSalesHeader(2, 30.5)).toBe("2 paid sales · $30.50");
  });
});

describe("formatElapsed", () => {
  it("whole seconds under a minute", () => { expect(formatElapsed(41)).toBe("41 s"); expect(formatElapsed(0)).toBe("0 s"); expect(formatElapsed(59.4)).toBe("59 s"); });
  it("minutes and seconds from 60 s", () => { expect(formatElapsed(98)).toBe("1 min 38 s"); expect(formatElapsed(60)).toBe("1 min 0 s"); expect(formatElapsed(125)).toBe("2 min 5 s"); });
});

describe("saidToDoneRow", () => {
  it("writes the row from two stamps", () => expect(saidToDoneRow(1000, 42000)).toBe("said → done 41 s (buyer login included)"));
  it("is absent without both stamps or when the clock ran backwards", () => {
    expect(saidToDoneRow(undefined, 5)).toBeNull();
    expect(saidToDoneRow(5, undefined)).toBeNull();
    expect(saidToDoneRow(9000, 1000)).toBeNull();
  });
});
