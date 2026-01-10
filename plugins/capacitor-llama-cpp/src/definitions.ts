export interface LoadModelOptions {
  /**
   * Path to the GGUF model file
   */
  modelPath: string;
  
  /**
   * Context size in tokens (default: 2048)
   */
  contextSize?: number;
  
  /**
   * Number of CPU threads to use (default: 4)
   */
  threads?: number;
  
  /**
   * Number of layers to offload to GPU (default: 0 for CPU-only)
   * Note: GPU support depends on device capabilities
   */
  gpuLayers?: number;
  
  /**
   * Batch size for prompt processing (default: 512)
   */
  batchSize?: number;
}

export interface GenerateOptions {
  /**
   * The input prompt
   */
  prompt: string;
  
  /**
   * Maximum number of tokens to generate (default: 256)
   */
  maxTokens?: number;
  
  /**
   * Temperature for sampling (0.0 to 2.0, default: 0.7)
   */
  temperature?: number;
  
  /**
   * Top-p (nucleus) sampling (0.0 to 1.0, default: 0.9)
   */
  topP?: number;
  
  /**
   * Top-k sampling (default: 40)
   */
  topK?: number;
  
  /**
   * Repetition penalty (default: 1.1)
   */
  repeatPenalty?: number;
  
  /**
   * Stop sequences - generation stops when any of these are produced
   */
  stopSequences?: string[];
}

export interface GenerateResult {
  /**
   * The generated text
   */
  text: string;
  
  /**
   * Number of tokens generated
   */
  tokensGenerated: number;
  
  /**
   * Generation time in milliseconds
   */
  generationTimeMs: number;
  
  /**
   * Tokens per second
   */
  tokensPerSecond: number;
  
  /**
   * Whether generation was stopped due to stop sequence
   */
  stoppedBySequence: boolean;
}

export interface ModelInfo {
  /**
   * Whether a model is currently loaded
   */
  isLoaded: boolean;
  
  /**
   * Path to the loaded model (if any)
   */
  modelPath?: string;
  
  /**
   * Model context size
   */
  contextSize?: number;
  
  /**
   * Memory usage in bytes
   */
  memoryUsage?: number;
}

export interface DeviceInfo {
  /**
   * Device platform (ios or android)
   */
  platform: string;
  
  /**
   * Total device memory in bytes
   */
  totalMemory: number;
  
  /**
   * Available memory in bytes
   */
  availableMemory: number;
  
  /**
   * Whether Metal (iOS) or Vulkan (Android) GPU is available
   */
  gpuAvailable: boolean;
  
  /**
   * Device model name
   */
  deviceModel: string;
}

export interface LlamaCppPlugin {
  /**
   * Load a GGUF model for inference
   * 
   * @param options Model loading options
   * @returns Promise resolving when model is loaded
   */
  loadModel(options: LoadModelOptions): Promise<{ success: boolean; loadTimeMs: number }>;
  
  /**
   * Unload the current model to free memory
   */
  unloadModel(): Promise<{ success: boolean }>;
  
  /**
   * Generate text from a prompt
   * 
   * @param options Generation options
   * @returns Generated text and statistics
   */
  generate(options: GenerateOptions): Promise<GenerateResult>;
  
  /**
   * Get information about the currently loaded model
   */
  getModelInfo(): Promise<ModelInfo>;
  
  /**
   * Get device information for capability checking
   */
  getDeviceInfo(): Promise<DeviceInfo>;
  
  /**
   * Check if a model file exists at the given path
   */
  modelExists(options: { path: string }): Promise<{ exists: boolean }>;
  
  /**
   * Get the recommended model configuration based on device capabilities
   */
  getRecommendedConfig(): Promise<{
    maxContextSize: number;
    recommendedThreads: number;
    gpuLayersSupported: number;
    maxModelSizeBytes: number;
  }>;
}
