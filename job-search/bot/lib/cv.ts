import { readFile } from "node:fs/promises";
import { cvPdfPath, cvProfilePath } from "./paths.js";
import type { CvProfile } from "./types.js";

export async function loadCvProfile(): Promise<{
  profile: CvProfile;
  pdfAbsolutePath: string;
  pdfExists: boolean;
}> {
  const raw = await readFile(cvProfilePath(), "utf8");
  const profile = JSON.parse(raw) as CvProfile;
  const pdfAbsolutePath = cvPdfPath(profile.pdfFile);
  let pdfExists = false;
  try {
    await readFile(pdfAbsolutePath);
    pdfExists = true;
  } catch {
    pdfExists = false;
  }
  return { profile, pdfAbsolutePath, pdfExists };
}
