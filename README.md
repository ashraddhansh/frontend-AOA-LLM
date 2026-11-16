# AOA Frontend

The frontend for **AOA (Answer or Abstain)**, a React and Vite application for interacting with the AOA-LLM service.

## Development

Install dependencies and start the local development server:

```bash
npm install
npm run dev
```

Create a production build with:

```bash
npm run build
```

## Docker

Build the production image with `docker build -t aoa-frontend .`. At runtime,
set `PORT` (default `8080`), `API_BASE_URL` to the public backend URL, and
`GOOGLE_CLIENT_ID` when Google sign-in is enabled. These values are read when
the container starts, so the same image can be promoted between environments.
See the backend repository's
[`container deployment guide`](https://github.com/ashraddhansh/AOA-LLM/blob/main/docs/container-deployment.md)
for backend configuration and migration details.

## Backend

The backend repository is available at [AOA-LLM](https://github.com/ashraddhansh/AOA-LLM).
