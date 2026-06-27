# Bloom Today

Because no mom should have to heal alone.

Bloom Today is a postpartum emotional support platform that gives every new mother a personalized AI companion she can talk to anytime, about anything, through real-time voice and video calls.

It is strictly not a therapy or therapist app. The AI companion does not give clinical advice unless a connected therapist or doctor explicitly guides how it should respond. Instead, Bloom Today focuses on emotional support, listening, validation, and helping the people around a mother understand how to show up for her.

## Inspiration

I am the youngest in my family, the only son, born years after my two older sisters. By the time I was growing up, my sisters were already starting families of their own. I watched them give everything to their children, my two nephews, whom I absolutely adore, but I also watched them go through something nobody in our family fully understood.

After their pregnancies, both my sisters quietly struggled. One would cry for no reason she could explain. The other stopped sleeping, stopped eating, stopped being herself, and nobody knew what to say. Our family loved them, but love without understanding is not always enough.

That curiosity stayed with me. I started reading, not as a student, but as a brother who wanted to understand. I learned that postpartum depression is not just "feeling sad." It is a clinically recognized medical condition that affects up to 1 in 5 mothers, and yet many suffer in silence because society has conditioned women to suppress their pain, smile through exhaustion, and treat motherhood as something that should come naturally.

Research consistently shows that one of the most impactful supports for postpartum mental health is having someone to talk to: someone who listens, validates, and does not judge. That insight became the foundation of Bloom Today.

## What It Does

Bloom Today is built around a personalized AI companion that a mother can call in real time. It greets her by name, remembers context from past conversations, listens with warmth, and responds with care.

But Bloom Today is not just another chatbot.

### Full Personalization

A mother can name her companion, choose its voice, customize its personality, and give it specific instructions. She shapes who she talks to, not the other way around.

### Real-Time Voice and Video Calls

Using the Gemini Live API with native audio streaming, mothers can have natural conversational calls with their companion. The companion appears as a 3D animated avatar powered by Three.js and the TalkingHead library, with lip-sync and contextual gestures like nodding during heavy moments or smiling during lighter ones.

### Therapist Integration

Because postpartum depression is a medical condition, Bloom Today lets a mother connect her therapist through a secure key. The therapist can view a dedicated dashboard with Gemini-powered conversation analysis, send notes to the mother, and provide instructions that shape how the AI companion responds.

### Trusted Person System

Many women do not tell their partners, mothers, or friends what they are really going through. With Bloom Today, a mother can connect a trusted person through a shareable key. That person gets a simple dashboard with a status label, a plain-language summary, and gentle suggestions like "Bring her favorite tea tonight" or "Ask her about the baby's feeding, she mentioned it was stressful."

### Intelligent Insights Dashboard

Every conversation is analyzed by Gemini to extract 8 signal scores: mood, energy, sleep, stress, support, self-kindness, coping, and bonding. Bloom Today also identifies themes, tracks mood direction, and generates personalized quick tips and YouTube resource recommendations without requiring forms or questionnaires.

### Bloom Score and Streak

The Bloom Score is a gamified engagement score that measures how consistently a mother is seeking support, not her mental state. It is weighted across weekly check-ins, streaks, support connections, and self-kindness, gently celebrating the act of reaching out.

## How It Works

### The Companion Pipeline

1. **Onboarding:** The mother names her companion, chooses a voice, optionally writes personality instructions, and selects a 3D avatar.
2. **Call initiation:** The frontend opens a WebSocket to the Gemini Live API with a system instruction that includes the companion name, personality, therapist guidance, and memories from past conversations.
3. **Audio streaming:** A custom recorder captures 16kHz PCM audio from the microphone and streams it as base64 chunks. Incoming audio is decoded and played through the Web Audio API.
4. **3D avatar:** A TalkingHead instance renders a Three.js ReadyPlayerMe avatar. A procedural viseme engine syncs mouth movement with AI audio, while a gesture mapper triggers contextual expressions from transcript text.
5. **Barge-in:** Server-side voice activity detection handles interruptions. When the user speaks over the AI, queued audio is flushed, avatar animation resets, and the model responds to the latest user input.
6. **Post-call analysis:** Transcripts are saved to PostgreSQL. On call end, Gemini analyzes the conversation with structured output to produce signal scores, risk assessment, therapist notes, and trusted-person guidance.

### Multi-Role System

Every user connects through a unique 8-character key generated with nanoid. Bloom Today supports three roles:

- **Mom:** Full access to the companion, dashboard, journal, and insights.
- **Therapist:** Dedicated dashboard with conversation analysis and risk signals, plus the ability to inject companion instructions and send notes.
- **Trusted person:** Simplified warm dashboard with status labels and actionable suggestions, without clinical jargon.

## Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend | React 18, Vite 7, mobile-first SPA |
| Styling | Tailwind CSS v4, Radix UI primitives |
| 3D Avatar | Three.js, TalkingHead library, viseme-based lip-sync, gesture mapping |
| Real-Time Voice/Video | Gemini Live API via `@google/genai` and a custom WebSocket client |
| Backend | Express.js v5, Node.js 20 |
| AI Agent | Google Agent Development Kit with `LlmAgent` and `InMemoryRunner` |
| Analysis Engine | Gemini 2.5 Pro with structured JSON output |
| Database | PostgreSQL on AWS Aurora |
| Auth | Google OAuth 2.0 and JWT |
| Deployment | Vercel frontend/backend projects |

## Project Structure

```text
bloom-today/
+-- backend/             # Express API, migrations, and services
+-- frontend/            # React + Vite SPA
+-- backend/vercel.json  # Backend Vercel deployment config
+-- frontend/vercel.json # Frontend Vercel deployment config
```

## Challenges

### Designing the Dashboard Through Research

I spent significant time researching what actually matters for postpartum mental health: which signals are meaningful, how to present emotional data without making it feel like a medical report, and how to keep the interface light enough that a tired, overwhelmed mother would actually want to open it.

I studied scales like the PHQ-9 and the Edinburgh Postnatal Depression Scale to understand what signals to track, then translated those ideas into warm, non-intimidating language.

Building three different dashboard views from the same conversation data required a lot of iteration on both the Gemini prompts and the frontend presentation. The mom sees encouragement, the therapist sees structured analysis, and the trusted person sees simple actionable guidance.

## Accomplishments

- **A 3D companion that feels present:** Procedural lip-sync and contextual gestures make the companion feel alive during a conversation.
- **Three dashboards from one conversation:** Bloom Today generates a warm reflection for the mom, structured analysis for the therapist, and a plain-language action guide for the trusted person.
- **The trusted person system:** This feature helps people who care understand what is going on and exactly how they can help, without guilt or awkwardness.
- **Full companion personalization:** Mothers can name, voice, and instruct their own companion while therapists can layer guidance on top.

## What I Learned

Postpartum depression is not "baby blues." It is a condition that deserves the same engineering rigor we give to any health problem. Building Bloom Today pushed me to understand the PHQ-9, the Edinburgh Postnatal Depression Scale, risk stratification, and the challenge of translating clinical concepts into language a tired, overwhelmed mother could actually find comforting.

The Gemini Live API is powerful for real-time conversational agents, but it requires careful engineering around streaming, turn management, interruptions, and the gap between "model done generating" and "audio done playing."

Structured output from Gemini is also a game-changer for building dashboards from unstructured conversations. Combining response schemas with post-processing normalization gives reliable typed data from complex emotional analysis prompts.

Most importantly, design matters as much as engineering when the user is vulnerable. Every color choice, word, and animation needs to feel warm, safe, and non-intimidating.

## What's Next

- **Persistent memory across calls:** Use vector embeddings so the companion can naturally reference things shared weeks ago.
- **Mood journaling:** Add a voice-first journal that captures daily reflections and feeds the insight engine.
- **Native mobile app:** Wrap the PWA in a React Native shell for push notifications and background audio.

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
