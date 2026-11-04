import path from "node:path";
import { fileURLToPath } from "node:url";

/** Absolute path to the agent project root (`job-search/`). */
export function projectRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
}

export function dataDir(): string {
  return path.join(projectRoot(), "data");
}

export function cvProfilePath(): string {
  return path.join(dataDir(), "cv-profile.json");
}

export function cvPdfPath(fileName: string): string {
  return path.join(dataDir(), fileName);
}
