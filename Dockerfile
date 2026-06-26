FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat python3 make g++

FROM base AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev && npx prisma generate

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
USER root
CMD ["sh", "-c", "mkdir -p /app/data && npx prisma db push --schema=/app/prisma/schema.prisma --skip-generate && chown -R nextjs:nodejs /app/data && exec su nextjs -s /bin/sh -c 'node server.js'"]
