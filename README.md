# Gemini Hackathon - Postpartum Support App

Project structure:
- `frontend/` - React (Vite) mobile-first client
- `backend/` - Express API + Neon(Postgres) schema/migration

## Features implemented
- Google sign-in (Google Identity Services on frontend, token verification in backend)
- Onboarding flow:
  - Name
  - AI companion name
  - Optional companion instructions
  - Optional therapist key
  - Optional trusted person key
- Dashboard (mobile-first):
  - My Patients
  - People That Trust Me
  - People I Trust
  - My Therapists
- Connect to therapist/trusted person by short key
- User share key generation (8-char short code)
- Neon/Postgres schema + migration script
- Real Google ADK companion creation + conversation runtime in `backend/src/services/googleAdk.js`

## Run locally
1. Configure env files:
- `backend/.env` from `backend/.env.example`
- `frontend/.env` from `frontend/.env.example`

2. Backend:
```bash
cd backend
npm run migrate
npm run dev
```

3. Frontend:
```bash
cd frontend
npm run dev
```

## Database tables
Created by `backend/migrations/001_init.sql`:
- `users`
- `connections`
