# Use Python 3.10 slim image
FROM python:3.10-slim

# Set working directory
WORKDIR /app

# Install build dependencies (rarely changes)
RUN apt-get update && apt-get install -y build-essential && rm -rf /var/lib/apt/lists/*

# Copy requirements FIRST (cached if unchanged)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy app code LAST (changes frequently)
COPY app.py .

# Set environment variables
ENV PORT=8080
ENV PYTHONUNBUFFERED=1

# Expose port
EXPOSE 8080

# Use Gunicorn for production
CMD exec gunicorn --bind :$PORT --workers 1 --threads 2 --timeout 0 app:app
