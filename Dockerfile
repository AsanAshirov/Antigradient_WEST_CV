FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 \
    CARPRINT_DATA=/data/store CARPRINT_MODELS=/app/models CARPRINT_COHORT=/app/data/cohort
RUN apt-get update && apt-get install -y --no-install-recommends git libgl1 libglib2.0-0 fonts-dejavu-core && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --index-url https://download.pytorch.org/whl/cpu torch torchvision \
 && pip install -r requirements.txt

COPY carprint ./carprint
COPY api ./api
COPY eval ./eval
COPY models ./models
COPY data/cohort ./data/cohort
RUN mkdir -p /data/store && python -c "from lightglue import ALIKED, LightGlue; ALIKED(); LightGlue(features='aliked')"

EXPOSE 7860
CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "7860", "--workers", "1"]
