FROM node:20-slim

# Install ffmpeg for video thumbnail generation
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .
RUN npm run build

EXPOSE 3001

CMD ["node", "dist/index.js"]
