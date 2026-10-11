FROM node:24-bookworm-slim AS frontend
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY index.html tsconfig.json vite.config.ts ./
COPY src ./src
COPY public ./public
RUN npm run build

FROM python:3.12-slim
WORKDIR /app
COPY server/requirements.lock.txt ./server/requirements.lock.txt
RUN pip install --no-cache-dir -r server/requirements.lock.txt
COPY server/app.py ./server/app.py
COPY public/images ./public/images
COPY --from=frontend /app/dist ./dist
RUN useradd --create-home appuser
USER appuser
EXPOSE 8000
CMD ["sh", "-c", "uvicorn server.app:app --host 0.0.0.0 --port ${PORT:-8000}"]
