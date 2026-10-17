import { expect, test } from "vitest";
import { autoMatchQuery, isConfidentMatch } from "./automatch.server";
test("q", () => {
  expect(autoMatchQuery("Zindagi Na Milegi Dobara Use Vlc Player to avoid sound issues").query).toBe("Zindagi Na Milegi Dobara");
  expect(autoMatchQuery("Mirzapur S01 Combined 2018").query).toBe("Mirzapur");
  expect(autoMatchQuery("Jailer 2 V2 Line HDTC AA").query).toContain("Jailer 2");
  expect(isConfidentMatch("Mirzapur", 2018, { title: "Mirzapur", year: "2018" })).toBe(true);
  expect(isConfidentMatch("Yodha", 2024, { title: "Yodha", year: "2009" })).toBe(false);
});
