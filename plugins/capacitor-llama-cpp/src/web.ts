import { WebPlugin } from '@capacitor/core';

import type {
  LlamaCppPlugin,
  LoadModelOptions,
  GenerateOptions,
  GenerateResult,
  ModelInfo,
  DeviceInfo,
} from './definitions';

/**
 * Web implementation - provides a fallback/mock for development
 * Real inference only works on native iOS/Android
 */
export class LlamaCppWeb extends WebPlugin implements LlamaCppPlugin {
  private isModelLoaded = false;

  async loadModel(_options: LoadModelOptions): Promise<{ success: boolean; loadTimeMs: number }> {
    console.warn('LlamaCpp: Web platform does not support local model inference. Use cloud API instead.');
    // Simulate loading for development
    await new Promise(resolve => setTimeout(resolve, 1000));
    this.isModelLoaded = true;
    return { success: true, loadTimeMs: 1000 };
  }

  async unloadModel(): Promise<{ success: boolean }> {
    this.isModelLoaded = false;
    return { success: true };
  }

  async generate(options: GenerateOptions): Promise<GenerateResult> {
    if (!this.isModelLoaded) {
      throw new Error('No model loaded. Call loadModel() first.');
    }
    
    console.warn('LlamaCpp: Web platform cannot run local inference. Returning mock response.');
    
    // Return a mock response for web development
    const mockText = `[Web Mock] This is a simulated response to: "${options.prompt.substring(0, 50)}..."

Note: Local LLM inference is only available on iOS and Android devices. 
In the web browser, please use the Cloud API mode for real responses.`;

    return {
      text: mockText,
      tokensGenerated: 50,
      generationTimeMs: 500,
      tokensPerSecond: 100,
      stoppedBySequence: false,
    };
  }

  async getModelInfo(): Promise<ModelInfo> {
    return {
      isLoaded: this.isModelLoaded,
      modelPath: this.isModelLoaded ? 'web-mock-model' : undefined,
      contextSize: 2048,
      memoryUsage: 0,
    };
  }

  async getDeviceInfo(): Promise<DeviceInfo> {
    return {
      platform: 'web',
      totalMemory: 8 * 1024 * 1024 * 1024, // 8GB mock
      availableMemory: 4 * 1024 * 1024 * 1024, // 4GB mock
      gpuAvailable: false,
      deviceModel: 'Web Browser',
    };
  }

  async modelExists(_options: { path: string }): Promise<{ exists: boolean }> {
    // On web, models would be stored in IndexedDB or not at all
    return { exists: false };
  }

  async getRecommendedConfig(): Promise<{
    maxContextSize: number;
    recommendedThreads: number;
    gpuLayersSupported: number;
    maxModelSizeBytes: number;
  }> {
    return {
      maxContextSize: 2048,
      recommendedThreads: 4,
      gpuLayersSupported: 0,
      maxModelSizeBytes: 500 * 1024 * 1024, // 500MB limit for web
    };
  }
}
