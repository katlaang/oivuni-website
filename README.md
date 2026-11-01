# Oivuni AI website

Company website for **Oivuni AI** — Applied AI Research & Commercialization.
Built with [Expo](https://expo.dev) (React Native + React Native Web), so the same code runs as a website on Vercel and can later ship as iOS and Android apps.

## Edit the content
All copy lives in `src/content.ts`. Layout is in `App.tsx`; colors and fonts in `src/theme.ts`.

Before launch, replace every `[bracketed]` placeholder:
- Founder names, roles, bios, photos and profile links (`about.founders`)
- `CONTACT_EMAIL` — the contact button stays hidden until this is set
- The temporary logo mark (`src/components/Logo.tsx`, `assets/`) once the final logo is chosen

Keep research status labels accurate (Proposed → Exploratory → Feasibility research → In development → Available).

## Run locally
```bash
npm install
npm run web        # browser
npm start          # Expo Go on a phone
```

## Deploy to Vercel
Import this repo in Vercel. `vercel.json` already sets:
- Build command: `npx expo export --platform web`
- Output directory: `dist`

No environment variables are needed.
