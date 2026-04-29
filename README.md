# Bloom Today

Because no mom should have to heal alone.

Bloom Today is a postpartum emotional support platform with a personalized AI companion, real-time voice/video calls, therapist and trusted-person access, and Gemini-powered dashboard insights.

## Tech Stack

React, Vite, Express.js, Node.js, PostgreSQL, Neon, Google Gemini API, Google Gemini Live API, Google ADK, Google OAuth 2.0, Three.js, Radix UI, Recharts, JWT, and Zod.

## Project Structure

```text
bloom-today/
├── api/                # Vercel serverless entrypoint for the Express backend
├── backend/            # Express API, migrations, and services
├── frontend/           # React + Vite SPA
├── vercel.json         # Vercel deployment config
└── .vercelignore       # Files excluded from Vercel uploads
```

## Local Development

### Backend

```bash
cd backend
cp .env.example .env
npm install
npm run migrate
npm run dev
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
npm install
npm run dev
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

The repository is configured for Vercel at the root:

- Install command: `npm install --prefix frontend && npm install --prefix backend`
- Build command: `npm run build --prefix frontend`
- Output directory: `frontend/dist`
- Backend API: `api/index.js`, which serves the existing Express app under `/api/*`

Set these environment variables in the Vercel project:

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST/DB?sslmode=require
GOOGLE_CLIENT_ID=your-google-oauth-web-client-id.apps.googleusercontent.com
APP_JWT_SECRET=replace-with-a-long-random-string
GEMINI_API_KEY=your-google-ai-studio-api-key
GEMINI_MODEL=gemini-2.5-pro
VITE_GOOGLE_CLIENT_ID=your-google-oauth-web-client-id.apps.googleusercontent.com
VITE_GEMINI_API_KEY=your-gemini-api-key
VITE_GEMINI_LIVE_MODEL=gemini-2.5-flash-native-audio-preview-12-2025
```

`VITE_API_BASE_URL` is optional on Vercel. If omitted, the frontend calls the same deployment at `/api`.

Run database migrations before or after deploy with:

```bash
npm run migrate --prefix backend
```

## Acknowledgements

This project uses and adapts code from the TalkingHead project by Mika Suominen:
https://github.com/met4citizen/TalkingHead

The original project is licensed under the MIT License.

## License

This project is licensed under the MIT License. See `LICENSE` for details.
