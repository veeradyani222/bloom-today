FROM node:20

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

ARG VITE_API_BASE_URL=https://bloom-backend-683608585705.europe-west1.run.app
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL


ARG VITE_GOOGLE_CLIENT_ID=683608585705-9322d8jjtek6dgt8pfbojgg9pdsvf7fe.apps.googleusercontent.com
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID

ARG VITE_GEMINI_API_KEY
ENV VITE_GEMINI_API_KEY=$VITE_GEMINI_API_KEY

RUN npm run build

RUN npm install -g serve

EXPOSE 8080

CMD ["serve", "-s", "dist", "-l", "8080"]
