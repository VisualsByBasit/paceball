# Paceball website

The public site: landing page, privacy policy and terms. A separate Next.js
project with its own package.json and lockfile. The Expo app never imports
from here, and nothing here imports from the app.

    npm install
    npm run dev     # http://localhost:3000
    npm run lint
    npm run build

`BETA_URL`, the contact address and the social links live in `lib/site.ts`.
The accent colour in `app/globals.css` mirrors `src/ui/tokens.ts`; a root test
keeps the two in step.

Deployed on Vercel with Root Directory set to `website`.
