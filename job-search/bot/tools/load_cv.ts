import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import { loadCvProfile } from "../lib/cv.js";

export default defineTool({
  description:
    "Load the candidate CV profile from data/cv-profile.json and confirm the PDF path under data/.",
  execution: "server",
  effect: "read",
  inputSchema: z.object({}),
  async execute() {
    const { profile, pdfAbsolutePath, pdfExists } = await loadCvProfile();
    return {
      profile,
      pdfAbsolutePath,
      pdfExists,
      dataFolderHint:
        "Coloque PDFs de CV em job-search/data/ e atualize cv-profile.json.",
    };
  },
});
