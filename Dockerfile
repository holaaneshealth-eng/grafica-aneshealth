# ---------- Etapa 1: build del frontend ----------
FROM node:22-bookworm-slim AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---------- Etapa 2: build del backend ----------
FROM node:22-bookworm-slim AS backend
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci
COPY backend/ ./
RUN npm run build

# ---------- Etapa 3: imagen final de produccion ----------
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Dependencias de produccion del backend (pg es JS puro: sin compilacion nativa)
COPY backend/package.json backend/package-lock.json ./backend/
RUN cd backend && npm ci --omit=dev

# Codigo compilado del backend y frontend
COPY --from=backend /app/backend/dist ./backend/dist
COPY --from=frontend /app/frontend/dist ./frontend/dist

# Directorio de datos persistente (SQLite + credenciales iniciales)
RUN mkdir -p /data && chown -R node:node /data /app
ENV DATA_DIR=/data
ENV PORT=8080
EXPOSE 8080

USER node
WORKDIR /app/backend
CMD ["node", "dist/index.js"]
