"""
EthicalAIditor LLM API - Docker/Cloud Run Version (FALLBACK)
=============================================================
This is the Docker-based deployment for Cloud Run.
For the recommended VM deployment, see: llm-api/vm-setup/app.py

Use this if you prefer:
- Serverless/scale-to-zero pricing ($0-5/month)
- Automatic scaling
- No server management

Trade-off: 30-45 second cold start (model baked into image)
"""

import os
import logging
from dotenv import load_dotenv

# Load .env file (for local development)
load_dotenv()

from flask import Flask, request, jsonify
from flask_cors import CORS
from transformers import AutoModelForCausalLM, AutoTokenizer
from huggingface_hub import login
import torch

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
# Enable CORS for all routes
CORS(app, resources={r"/*": {"origins": "*"}})

# Model configuration
MODEL_NAME = "PleIAs/Pleias-350m-Preview"
# Use baked-in model cache if available, otherwise use default HF cache
MODEL_CACHE_DIR = os.environ.get('MODEL_CACHE_DIR', None)
# Set to "true" to load model at startup in a background thread (useful with min-instances=1)
EAGER_LOAD = os.environ.get('EAGER_LOAD', 'false').lower() == 'true'

model = None
tokenizer = None
model_loading = False  # Track if model is currently loading

def get_model():
    """Lazy load the model on first request"""
    global model, tokenizer, model_loading
    if model is None:
        if model_loading:
            # Wait for background load to complete
            import time
            while model_loading and model is None:
                time.sleep(0.5)
        else:
            load_model()
    return model, tokenizer

def load_model():
    """Load the model and tokenizer"""
    global model, tokenizer
    logger.info(f"Loading model: {MODEL_NAME}")
    if MODEL_CACHE_DIR:
        logger.info(f"Using baked-in cache: {MODEL_CACHE_DIR}")
    
    try:
        # Login to HuggingFace if token is available (needed for private/gated models)
        hf_token = os.environ.get('HF_TOKEN') or os.environ.get('HUGGINGFACE_HUB_TOKEN')
        if hf_token:
            logger.info("Authenticating with HuggingFace...")
            login(token=hf_token)
        
        # Load tokenizer (from cache if baked in, otherwise downloads)
        tokenizer = AutoTokenizer.from_pretrained(
            MODEL_NAME, 
            token=hf_token,
            cache_dir=MODEL_CACHE_DIR,
            local_files_only=MODEL_CACHE_DIR is not None  # Don't download if using baked cache
        )
        
        # Load model (CPU-only for cost efficiency)
        model = AutoModelForCausalLM.from_pretrained(
            MODEL_NAME,
            torch_dtype=torch.float32,
            low_cpu_mem_usage=True,
            token=hf_token,
            cache_dir=MODEL_CACHE_DIR,
            local_files_only=MODEL_CACHE_DIR is not None
        )
        logger.info("Model loaded successfully")
    except Exception as e:
        logger.error(f"Error loading model: {str(e)}")
        model_loading = False
        raise
    finally:
        model_loading = False

def load_model_background():
    """Load model in background thread"""
    global model_loading
    model_loading = True
    try:
        load_model()
    except Exception as e:
        logger.error(f"Background model load failed: {e}")

# Load model at startup in background thread if EAGER_LOAD is enabled
if EAGER_LOAD:
    import threading
    logger.info("EAGER_LOAD enabled - starting background model load...")
    threading.Thread(target=load_model_background, daemon=True).start()

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint - returns healthy even if model not loaded yet"""
    return jsonify({
        'status': 'healthy',
        'model': MODEL_NAME,
        'model_loaded': model is not None
    })

@app.route('/debug/env', methods=['GET'])
def debug_env():
    """Debug endpoint to check if HF token is configured (shows only first/last 4 chars)"""
    hf_token = os.environ.get('HF_TOKEN') or os.environ.get('HUGGINGFACE_HUB_TOKEN')
    if hf_token:
        masked = f"{hf_token[:4]}...{hf_token[-4:]}"
    else:
        masked = "NOT SET"
    return jsonify({
        'hf_token_configured': hf_token is not None,
        'hf_token_masked': masked,
        'port': os.environ.get('PORT', 'not set')
    })

@app.route('/generate', methods=['POST'])
def generate_text():
    """Generate text from a prompt"""
    try:
        # Lazy load model on first request
        current_model, current_tokenizer = get_model()
        
        # Get request data
        data = request.get_json()
        if not data or 'prompt' not in data:
            return jsonify({
                'error': 'Missing required field: prompt'
            }), 400

        prompt = data['prompt']
        max_length = data.get('max_length', 100)
        temperature = data.get('temperature', 0.7)

        # Validate parameters
        if max_length > 500:
            return jsonify({
                'error': 'max_length cannot exceed 500 tokens'
            }), 400

        logger.info(f"Generating text for prompt: {prompt[:50]}...")

        # Tokenize input
        inputs = current_tokenizer(prompt, return_tensors="pt")

        # Generate
        with torch.no_grad():
            outputs = current_model.generate(
                inputs.input_ids,
                max_length=max_length,
                temperature=temperature,
                do_sample=True,
                pad_token_id=current_tokenizer.eos_token_id
            )

        # Decode output
        generated_text = current_tokenizer.decode(outputs[0], skip_special_tokens=True)

        # Return response
        return jsonify({
            'prompt': prompt,
            'generated_text': generated_text,
            'model': MODEL_NAME
        })

    except Exception as e:
        logger.error(f"Error generating text: {str(e)}")
        return jsonify({
            'error': 'Internal server error',
            'details': str(e)
        }), 500

@app.route('/chat', methods=['POST', 'OPTIONS'])
def chat():
    """Chat endpoint - converts messages to prompt and generates response"""
    if request.method == 'OPTIONS':
        return '', 204
    
    try:
        current_model, current_tokenizer = get_model()
        
        data = request.get_json()
        messages = data.get('messages', [])
        manuscript_context = data.get('manuscriptContext', '')
        
        # Build system prompt
        system_prompt = 'You are an ethical AI writing assistant trained on legally licensed materials.'
        if manuscript_context:
            system_prompt += f'\n\nManuscript context:\n{manuscript_context[:2000]}'
        
        # Convert messages to prompt format
        message_prompt = '\n'.join([
            f"{'[INST]' if m.get('role') == 'user' else ''} {m.get('content', '')} {'[/INST]' if m.get('role') == 'user' else ''}"
            for m in messages
        ])
        
        full_prompt = f"{system_prompt}\n\n{message_prompt}"
        
        logger.info(f"Chat request, prompt length: {len(full_prompt)}")
        
        # Tokenize input
        inputs = current_tokenizer(full_prompt, return_tensors="pt")
        
        # Generate
        with torch.no_grad():
            outputs = current_model.generate(
                inputs.input_ids,
                max_length=500,
                temperature=0.7,
                do_sample=True,
                pad_token_id=current_tokenizer.eos_token_id
            )
        
        # Decode output
        generated_text = current_tokenizer.decode(outputs[0], skip_special_tokens=True)
        
        # Remove the prompt from the response if included
        if generated_text.startswith(full_prompt):
            generated_text = generated_text[len(full_prompt):].strip()
        
        return jsonify({
            'text': generated_text,
            'model': MODEL_NAME
        })
    
    except Exception as e:
        logger.error(f"Error in chat: {str(e)}")
        return jsonify({
            'error': 'Internal server error',
            'details': str(e)
        }), 500

@app.route('/', methods=['GET'])
def root():
    """Root endpoint with API information"""
    return jsonify({
        'name': 'PleIAs API',
        'model': MODEL_NAME,
        'endpoints': {
            'health': '/health',
            'debug': '/debug/env',
            'generate': '/generate (POST)',
            'chat': '/chat (POST)'
        }
    })

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    app.run(host='0.0.0.0', port=port, debug=False)
