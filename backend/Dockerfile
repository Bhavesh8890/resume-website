
# Python 3.10 slim image (good balance of size/compatibility)
FROM python:3.10-slim

# Install system dependencies required for RenderCV (LaTeX)
# RenderCV needs a full TeX Live installation or at least xelatex.
# This step can be large, so we try to minimalize it or use a pre-built image if possible.
# For now, we install basic texlive.
RUN apt-get update && apt-get install -y \
    texlive-xetex \
    texlive-fonts-recommended \
    texlive-plain-generic \
    git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy requirements first for caching
COPY requirements.txt .

# Install Python dependencies
# Upgrade pip first
RUN pip install --no-cache-dir --upgrade pip
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the app
COPY . .

# Expose port
EXPOSE 8080

# Run the app
# Cloud Run expects the port to be defined by $PORT env var, defaulting to 8080
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080", "--proxy-headers"]
