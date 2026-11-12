# Build from the repository root: docker build -f apps/studio/Dockerfile -t formlens-studio:local .
FROM node:26-slim AS deps
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/studio/package.json apps/studio/
COPY packages/api-client/package.json packages/api-client/
RUN npm ci

FROM deps AS build
COPY apps/studio apps/studio
COPY packages/api-client packages/api-client
# The server environment is read when the container starts, not when the image is built.
ENV NEXT_TELEMETRY_DISABLED=1 SKIP_ENV_VALIDATION=true
RUN npm run build -w @form-lens/studio

FROM node:26-slim AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
WORKDIR /app
# `standalone` holds server.js and the traced node_modules, laid out as in the repository.
COPY --from=build /repo/apps/studio/.next/standalone ./
COPY --from=build /repo/apps/studio/.next/static ./apps/studio/.next/static
COPY --from=build /repo/apps/studio/public ./apps/studio/public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]
CMD ["node", "apps/studio/server.js"]
