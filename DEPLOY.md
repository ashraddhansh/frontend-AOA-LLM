# Deploying the frontend on Render

Create a Render Blueprint from this repository and use `render.yaml`, or create a Static Site with these settings:

- Build command: `npm ci && npm run build`
- Publish directory: `dist`
- Add a rewrite from `/*` to `/index.html` so client-side routes load directly.

Set these environment variables in the Render service before deploying:

- `VITE_API_BASE_URL`: the public base URL of the backend Render service, with no trailing slash (for example, `https://your-api.onrender.com`).
- `VITE_GOOGLE_CLIENT_ID`: the Google OAuth web client ID, if Google sign-in is enabled.

Vite embeds `VITE_*` values into the built JavaScript, so changing them requires a new deploy. Configure the backend to allow requests from the frontend's Render URL through its CORS settings. Add both the deployed URL and any custom domain you use.
