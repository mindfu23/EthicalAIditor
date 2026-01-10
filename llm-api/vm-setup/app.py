"""
EthicalAIditor LLM API - Simplified VM Version
This version is designed to run directly on a VM without Docker.
For Docker deployment, use the parent directory's app.py
"""
import os
from flask import Flask, request, jsonify
from flask_cors import CORS
from transformers import AutoModelForCausalLM, AutoTokenizer
import torch
from dotenv import load_dotenv

# Load environment variables
load_dotenv('/opt/llm-api/.env')

app = Flask(__name__)
CORS(app, origins=[
    "https://ethicalaiditor.netlify.app",
    "http://localhost:5173",
    "http://localhost:3000"
])

# Model configuration
MODEL_NAME = "PleIAs/Pleias-350m-Preview"
HF_TOKEN = os.environ.get("HF_TOKEN")

# Global model/tokenizer - loaded once at startup
model = None
tokenizer = None

def load_model():
    """Load model at startup - only happens once since VM runs 24/7"""
    global model, tokenizer
    print(f"Loading model {MODEL_NAME}...")
    
    tokenizer = AutoTokenizer.from_pretrained(
        MODEL_NAME,
        token=HF_TOKEN,
        trust_remote_code=True
    )
    
    model = AutoModelForCausalLM.from_pretrained(
        MODEL_NAME,
        token=HF_TOKEN,
        trust_remote_code=True,
        torch_dtype=torch.float32,  # Use float32 for CPU
        device_map="cpu"
    )
    
    print("Model loaded successfully!")

@app.route("/health", methods=["GET"])
def health():
    """Health check endpoint"""
    return jsonify({
        "status": "healthy",
        "model_loaded": model is not None,
        "deployment": "compute-engine-vm"
    })

@app.route("/chat", methods=["POST"])
def chat():
    """Chat endpoint - compatible with frontend"""
    if model is None or tokenizer is None:
        return jsonify({"error": "Model not loaded"}), 503
    
    data = request.json
    prompt = data.get("prompt", "")
    max_tokens = data.get("max_tokens", 200)
    temperature = data.get("temperature", 0.7)
    
    if not prompt:
        return jsonify({"error": "No prompt provided"}), 400
    
    try:
        # Truncate long inputs to avoid exceeding model limits
        inputs = tokenizer(
            prompt, 
            return_tensors="pt",
            truncation=True,
            max_length=400  # Leave room for generation
        )
        # Only pass input_ids and attention_mask to generate (not token_type_ids)
        input_ids = inputs["input_ids"]
        attention_mask = inputs.get("attention_mask")
        
        with torch.no_grad():
            outputs = model.generate(
                input_ids=input_ids,
                attention_mask=attention_mask,
                max_new_tokens=max_tokens,
                temperature=temperature,
                do_sample=True,
                pad_token_id=tokenizer.eos_token_id
            )
        
        generated_text = tokenizer.decode(outputs[0], skip_special_tokens=True)
        # Remove the input prompt from the response
        response_text = generated_text[len(prompt):].strip()
        
        return jsonify({
            "response": response_text,
            "model": MODEL_NAME,
            "deployment": "compute-engine-vm"
        })
    
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/generate", methods=["POST"])
def generate():
    """Alias for /chat for backwards compatibility"""
    return chat()

# Load model when the app starts
print("="*50)
print("Starting EthicalAIditor LLM API (VM Edition)")
print("="*50)
load_model()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080)
