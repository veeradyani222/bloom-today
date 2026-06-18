# Bloom Today

Because no mom should have to heal alone.

Bloom Today is a postpartum emotional support platform with a personalized AI companion, real-time voice/video calls, therapist and trusted-person access, and Gemini-powered dashboard insights.

## Tech Stack

React, Vite, Express.js, Node.js, PostgreSQL, Neon, Google Gemini API, Google Gemini Live API, Google ADK, Google OAuth 2.0, Three.js, Radix UI, Recharts, JWT, and Zod.

## Project Structure

```text
bloom-today/
+-- backend/             # Express API, migrations, and services
+-- frontend/            # React + Vite SPA
+-- backend/vercel.json  # Backend Vercel deployment config
+-- frontend/vercel.json # Frontend Vercel deployment config
```

## Local Development

### Backend

```bash
cd backend
cp .env.example .env
pnpm install
pnpm migrate
pnpm dev
```

Backend env:

```env
PORT=8000
FRONTEND_ORIGIN=http://localhost:5000
DATABASE_URL=postgresql://USER:PASSWORD@HOST/DB?sslmode=require
GOOGLE_CLIENT_ID=your-google-oauth-web-client-id.apps.googleusercontent.com
APP_JWT_SECRET=replace-with-a-long-random-string
GEMINI_API_KEY=your-google-ai-studio-api-key
GEMINI_MODEL=gemini-2.5-pro
```

### Frontend

```bash
cd frontend
cp .env.example .env
pnpm install
pnpm dev
```

Frontend env:

```env
VITE_API_BASE_URL=http://localhost:8000
VITE_GOOGLE_CLIENT_ID=your-google-oauth-web-client-id.apps.googleusercontent.com
VITE_GEMINI_API_KEY=your-gemini-api-key
VITE_GEMINI_LIVE_MODEL=gemini-2.5-flash-native-audio-preview-12-2025
```

Open `http://localhost:5000`.

## Vercel Deployment

Deploy the frontend and backend as two separate Vercel projects.

### Backend Project

When importing the GitHub repository in Vercel, set the project root directory to `backend`.

- Install command: `pnpm install --frozen-lockfile`
- Build command: leave empty
- Output directory: leave empty
- API entrypoint: `backend/api/index.js`

Set these backend environment variables:

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST/DB?sslmode=require
GOOGLE_CLIENT_ID=your-google-oauth-web-client-id.apps.googleusercontent.com
APP_JWT_SECRET=replace-with-a-long-random-string
GEMINI_API_KEY=your-google-ai-studio-api-key
GEMINI_MODEL=gemini-2.5-pro
```

Run database migrations before or after deploy with:

```bash
pnpm --dir backend migrate
```

### Frontend Project

Import the same GitHub repository again in Vercel and set the project root directory to `frontend`.

- Install command: `pnpm install --frozen-lockfile`
- Build command: `pnpm build`
- Output directory: `dist`

Set these frontend environment variables:

```env
VITE_API_BASE_URL=https://your-backend-vercel-domain.vercel.app
VITE_GOOGLE_CLIENT_ID=your-google-oauth-web-client-id.apps.googleusercontent.com
VITE_GEMINI_API_KEY=your-gemini-api-key
VITE_GEMINI_LIVE_MODEL=gemini-2.5-flash-native-audio-preview-12-2025
```

## Acknowledgements

This project uses and adapts code from the TalkingHead project by Mika Suominen:
https://github.com/met4citizen/TalkingHead

The original project is licensed under the MIT License.

## License

This project is licensed under the MIT License. See `LICENSE` for details.
