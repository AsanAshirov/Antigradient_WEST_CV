# CarPrint: one image serves the API and the built site. Target: Hugging Face Space (Docker SDK) on an NVIDIA T4,
# also runs on any CUDA host or CPU-only (slower). Build: docker build -t carprint . ; run: docker run --gpus all -p 7860:7860 carprint

# ---------- 1. site ----------
FROM node:22-alpine AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/ ./
RUN npm run build

# ---------- 2. runtime ----------
# torch 2.8 is required: rfdetr 1.11.2 pulls transformers 5.x, which does not import on torch 2.5
FROM pytorch/pytorch:2.8.0-cuda12.8-cudnn9-runtime
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 \
    CARPRINT_DATA=/data/store CARPRINT_MODELS=/app/models CARPRINT_COHORT=/app/data/cohort \
    CARPRINT_WEB_DIST=/app/web/dist HOME=/home/user
RUN apt-get update && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 fonts-dejavu-core git \
 && rm -rf /var/lib/apt/lists/* \
 && useradd -m -u 1000 user && mkdir -p /app /data/store && chown -R user /app /data

WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt \
 && pip install --force-reinstall --no-deps opencv-python-headless

# Bake the weights into the image as the runtime user, so the first request of the jury downloads nothing.
USER user
RUN python -c "from lightglue import ALIKED, LightGlue; ALIKED(); LightGlue(features='aliked')" \
 && python -c "import rfdetr; rfdetr.RFDETRSegNano()"

COPY --chown=user carprint ./carprint
COPY --chown=user api ./api
COPY --chown=user eval ./eval
COPY --chown=user data/cohort ./data/cohort
COPY --chown=user models ./models
COPY --chown=user --from=web /web/dist ./web/dist

EXPOSE 7860
HEALTHCHECK --interval=30s --timeout=5s --start-period=120s CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:7860/api/v1/health', timeout=4)"
CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "7860", "--workers", "1", "--timeout-keep-alive", "75"]
