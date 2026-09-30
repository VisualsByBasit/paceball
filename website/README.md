# Paceball website

The public site: landing page, privacy policy and terms. A separate Next.js
project with its own package.json and lockfile. The Expo app never imports
from here, and nothing here imports from the app.

    npm install
    npm run dev     # http://localhost:3000
    npm run lint
    npm run build

`BETA_URL`, the Play listing, the demo video (`DEMO_VIDEO_EMBED_URL`, empty
until there is one), the contact address and the social links live in
`lib/site.ts`. The page's words are in `lib/content.ts`, and the judges' steps
in `components/JudgeSteps.tsx` follow `docs/JUDGES.md`.

`public/screenshots/` holds 720 px WebP copies of `docs/screenshots/*.png`,
listed in `lib/screens.ts`. After new screenshots, remake them with sharp
(installed with Next):

    node -e "const s=require('sharp'),fs=require('fs');for(const f of fs.readdirSync('../docs/screenshots'))s('../docs/screenshots/'+f).resize({width:720}).webp({quality:80,effort:6}).toFile('public/screenshots/'+f.replace(/\.png$/,'.webp'))"

`public/wordmark.png` is a copy of the app's `assets/brand/wordmark.png`.
The accent colour in `app/globals.css` mirrors `src/ui/tokens.ts`; a root test
keeps the two in step.

Deployed on Vercel with Root Directory set to `website`.
