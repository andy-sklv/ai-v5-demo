# ---------- BUILD ----------
    FROM node:20-alpine AS builder
    WORKDIR /app
    
    ENV NODE_ENV=production
    ENV NPM_CONFIG_FUND=false
    ENV NPM_CONFIG_AUDIT=false
    ENV NPM_CONFIG_PROGRESS=false
    ENV npm_config_cache=/tmp/.npm
    
    COPY package*.json ./
    RUN npm install --omit=dev --legacy-peer-deps && rm -rf /tmp/.npm
    
    COPY . .
    RUN npm run build
    RUN test -f .next/BUILD_ID || (echo "No .next/BUILD_ID"; ls -la .next; exit 1)
    
    # ---------- RUNTIME ----------
    FROM node:20-alpine AS runner
    WORKDIR /app
    ENV NODE_ENV=production
    ENV PORT=3000
    
    COPY --from=builder /app/.next ./.next
    COPY --from=builder /app/node_modules ./node_modules
    COPY --from=builder /app/package.json ./package.json
    COPY --from=builder /app/public ./public
    
    EXPOSE 3000
    CMD ["npx", "next", "start", "-p", "3000", "--hostname", "0.0.0.0"]    