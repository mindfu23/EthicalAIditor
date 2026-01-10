# Use Python 3.10 slim image
FROM python:3.10-slim

# Set working directory
WORKDIR /app

# Install build dependencies (needed for some pip packages)
RUN apt-get update && apt-get install -y build-essential && rm -rf /var/lib/apt/lists/*

# Copy requirements FIRST (cached if unchanged)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download the model at build time (saves 30-40s on cold start)
# Pass HF_TOKEN as build arg: --build-arg HF_TOKEN=hf_xxx
COPY download_model.py .
ARG HF_TOKEN
ENV HF_TOKEN=${HF_TOKEN}
RUN python download_model.py

# Copy app code
COPY app.py .

# Set environment variables
ENV PORT=8080
ENV PYTHONUNBUFFERED=1
# Tell app.py where to find the baked-in model
ENV MODEL_CACHE_DIR=/app/model_cache

# Expose port
EXPOSE 8080

# Use Gunicorn for production
# --timeout 0 allows long model loading if needed
CMD exec gunicorn --bind :$PORT --workers 1 --threads 2 --timeout 0 app:app
