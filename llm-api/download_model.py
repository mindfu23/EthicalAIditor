"""
Pre-download model at Docker build time.
This bakes the model into the image, eliminating download time on cold starts.
"""
import os
from transformers import AutoTokenizer, AutoModelForCausalLM
from huggingface_hub import login

MODEL_NAME = "PleIAs/Pleias-350m-Preview"
MODEL_CACHE_DIR = "/app/model_cache"

def download_model():
    hf_token = os.environ.get('HF_TOKEN')
    
    if hf_token:
        print("Authenticating with HuggingFace...")
        login(token=hf_token)
    
    print(f"Downloading {MODEL_NAME} to {MODEL_CACHE_DIR}...")
    
    # Download tokenizer
    tokenizer = AutoTokenizer.from_pretrained(
        MODEL_NAME, 
        token=hf_token,
        cache_dir=MODEL_CACHE_DIR
    )
    
    # Download model
    model = AutoModelForCausalLM.from_pretrained(
        MODEL_NAME, 
        token=hf_token,
        cache_dir=MODEL_CACHE_DIR
    )
    
    print(f"Model downloaded successfully to {MODEL_CACHE_DIR}")
    print(f"Cache contents: {os.listdir(MODEL_CACHE_DIR)}")

if __name__ == "__main__":
    download_model()
