# CV data folder

Drop curriculum vitae PDF files in this folder.

## Canonical CV for this project

- PDF: `Joao_Mendes_de_Almeida_CV.pdf`
- Structured profile used by tools: `cv-profile.json`

To switch candidates:

1. Add the new PDF here (example: `Maria_Silva_CV.pdf`).
2. Update `cv-profile.json` to match that person (name, contact, experience, skills).
3. Set `ageYears` when age should count in the 0–10 fit score. Leave it `null` if unknown.
4. Tell the agent which PDF / profile to use.

The Project store also keeps a copy at:

`/cursor/stores/self/media/Joao_Mendes_de_Almeida_CV.pdf`
