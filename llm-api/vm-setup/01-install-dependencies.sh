#!/bin/bash
# =============================================================================
# EthicalAIditor LLM API - VM Setup Script
# Run this after SSH'ing into a fresh Ubuntu VM
# =============================================================================

set -e  # Exit on error

echo "========================================="
echo "EthicalAIditor LLM API - VM Setup"
echo "========================================="

# Update system
echo ">>> Updating system packages..."
sudo apt-get update
sudo apt-get upgrade -y

# Install Python and dependencies
echo ">>> Installing Python and pip..."
sudo apt-get install -y python3 python3-pip python3-venv git

# Create app directory
echo ">>> Creating app directory..."
sudo mkdir -p /opt/llm-api
sudo chown $USER:$USER /opt/llm-api
cd /opt/llm-api

# Create virtual environment
echo ">>> Creating Python virtual environment..."
python3 -m venv venv
source venv/bin/activate

# Install Python packages
echo ">>> Installing Python dependencies..."
pip install --upgrade pip
pip install flask flask-cors gunicorn transformers torch python-dotenv huggingface_hub

# Create app directory structure
mkdir -p /opt/llm-api/app

echo "========================================="
echo "Base setup complete!"
echo ""
echo "Next steps:"
echo "1. Copy app.py to /opt/llm-api/app/"
echo "2. Set HF_TOKEN: echo 'HF_TOKEN=your_token' | sudo tee /opt/llm-api/.env"
echo "3. Run: sudo cp /opt/llm-api/llm-api.service /etc/systemd/system/"
echo "4. Run: sudo systemctl daemon-reload"
echo "5. Run: sudo systemctl enable llm-api"
echo "6. Run: sudo systemctl start llm-api"
echo "========================================="
