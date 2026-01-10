#!/bin/bash
# =============================================================================
# Deploy app files to VM
# Run this from your local machine after the VM is set up
# Usage: ./02-deploy-app.sh <VM_IP>
# =============================================================================

set -e

VM_IP=${1:-"YOUR_VM_IP"}

if [ "$VM_IP" == "YOUR_VM_IP" ]; then
    echo "Usage: ./02-deploy-app.sh <VM_IP>"
    echo "Example: ./02-deploy-app.sh 35.202.123.45"
    exit 1
fi

echo "Deploying to VM at $VM_IP..."

# Copy files to VM
echo ">>> Copying application files..."
scp app.py ${USER}@${VM_IP}:/opt/llm-api/app/
scp llm-api.service ${USER}@${VM_IP}:/opt/llm-api/

# Set up systemd service
echo ">>> Setting up systemd service..."
ssh ${USER}@${VM_IP} << 'ENDSSH'
sudo cp /opt/llm-api/llm-api.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable llm-api
ENDSSH

echo "========================================="
echo "Deployment complete!"
echo ""
echo "Next: Set HF_TOKEN on the VM:"
echo "  ssh ${USER}@${VM_IP}"
echo "  echo 'HF_TOKEN=your_huggingface_token' | sudo tee /opt/llm-api/.env"
echo "  sudo systemctl start llm-api"
echo "  sudo journalctl -u llm-api -f  # Watch logs"
echo "========================================="
