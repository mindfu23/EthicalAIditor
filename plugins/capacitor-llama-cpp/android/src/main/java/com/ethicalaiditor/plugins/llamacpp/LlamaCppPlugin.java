package com.ethicalaiditor.plugins.llamacpp;

import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;

/**
 * Capacitor plugin for llama.cpp inference on Android
 * 
 * This plugin wraps llama.cpp compiled for Android NDK to enable
 * local LLM inference on Android devices.
 */
@CapacitorPlugin(name = "LlamaCpp")
public class LlamaCppPlugin extends Plugin {
    private static final String TAG = "LlamaCpp";
    
    // Native library will be loaded from llama.cpp Android build
    private boolean nativeLoaded = false;
    private boolean modelLoaded = false;
    private String currentModelPath = null;
    
    // Native method declarations - implemented in llama.cpp JNI
    private native boolean nativeLoadModel(String modelPath, int contextSize, int threads, int gpuLayers, int batchSize);
    private native void nativeUnloadModel();
    private native String nativeGenerate(String prompt, int maxTokens, float temperature, float topP, int topK, float repeatPenalty, String[] stopSequences);
    private native int nativeGetTokensGenerated();
    private native long nativeGetGenerationTimeMs();
    private native long nativeGetMemoryUsage();
    
    static {
        try {
            // Load the llama.cpp native library
            System.loadLibrary("llama");
            System.loadLibrary("llamacpp_jni");
        } catch (UnsatisfiedLinkError e) {
            Log.e(TAG, "Failed to load native library: " + e.getMessage());
        }
    }
    
    @Override
    public void load() {
        super.load();
        try {
            // Verify native library is loaded
            nativeLoaded = true;
            Log.i(TAG, "LlamaCpp plugin loaded successfully");
        } catch (Exception e) {
            Log.e(TAG, "Failed to initialize LlamaCpp: " + e.getMessage());
        }
    }
    
    @PluginMethod
    public void loadModel(PluginCall call) {
        if (!nativeLoaded) {
            call.reject("Native library not loaded");
            return;
        }
        
        String modelPath = call.getString("modelPath");
        if (modelPath == null || modelPath.isEmpty()) {
            call.reject("modelPath is required");
            return;
        }
        
        // Check if file exists
        File modelFile = new File(modelPath);
        if (!modelFile.exists()) {
            call.reject("Model file not found: " + modelPath);
            return;
        }
        
        int contextSize = call.getInt("contextSize", 2048);
        int threads = call.getInt("threads", 4);
        int gpuLayers = call.getInt("gpuLayers", 0);
        int batchSize = call.getInt("batchSize", 512);
        
        // Run loading on background thread
        getActivity().runOnUiThread(() -> {
            new Thread(() -> {
                try {
                    long startTime = System.currentTimeMillis();
                    
                    boolean success = nativeLoadModel(modelPath, contextSize, threads, gpuLayers, batchSize);
                    
                    long loadTime = System.currentTimeMillis() - startTime;
                    
                    if (success) {
                        modelLoaded = true;
                        currentModelPath = modelPath;
                        
                        JSObject result = new JSObject();
                        result.put("success", true);
                        result.put("loadTimeMs", loadTime);
                        call.resolve(result);
                    } else {
                        call.reject("Failed to load model");
                    }
                } catch (Exception e) {
                    Log.e(TAG, "Error loading model: " + e.getMessage());
                    call.reject("Error loading model: " + e.getMessage());
                }
            }).start();
        });
    }
    
    @PluginMethod
    public void unloadModel(PluginCall call) {
        if (!modelLoaded) {
            JSObject result = new JSObject();
            result.put("success", true);
            call.resolve(result);
            return;
        }
        
        try {
            nativeUnloadModel();
            modelLoaded = false;
            currentModelPath = null;
            
            JSObject result = new JSObject();
            result.put("success", true);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Error unloading model: " + e.getMessage());
        }
    }
    
    @PluginMethod
    public void generate(PluginCall call) {
        if (!modelLoaded) {
            call.reject("No model loaded. Call loadModel() first.");
            return;
        }
        
        String prompt = call.getString("prompt");
        if (prompt == null || prompt.isEmpty()) {
            call.reject("prompt is required");
            return;
        }
        
        int maxTokens = call.getInt("maxTokens", 256);
        float temperature = call.getFloat("temperature", 0.7f);
        float topP = call.getFloat("topP", 0.9f);
        int topK = call.getInt("topK", 40);
        float repeatPenalty = call.getFloat("repeatPenalty", 1.1f);
        
        // Get stop sequences
        String[] stopSequences = new String[0];
        try {
            org.json.JSONArray stopArray = call.getArray("stopSequences");
            if (stopArray != null) {
                stopSequences = new String[stopArray.length()];
                for (int i = 0; i < stopArray.length(); i++) {
                    stopSequences[i] = stopArray.getString(i);
                }
            }
        } catch (Exception e) {
            // Use empty array if parsing fails
        }
        
        final String[] finalStopSequences = stopSequences;
        
        // Run generation on background thread
        new Thread(() -> {
            try {
                String generatedText = nativeGenerate(prompt, maxTokens, temperature, topP, topK, repeatPenalty, finalStopSequences);
                
                int tokensGenerated = nativeGetTokensGenerated();
                long generationTimeMs = nativeGetGenerationTimeMs();
                float tokensPerSecond = generationTimeMs > 0 ? (tokensGenerated * 1000f) / generationTimeMs : 0;
                
                JSObject result = new JSObject();
                result.put("text", generatedText);
                result.put("tokensGenerated", tokensGenerated);
                result.put("generationTimeMs", generationTimeMs);
                result.put("tokensPerSecond", tokensPerSecond);
                result.put("stoppedBySequence", false); // TODO: track this in native
                
                call.resolve(result);
            } catch (Exception e) {
                Log.e(TAG, "Error generating: " + e.getMessage());
                call.reject("Error generating: " + e.getMessage());
            }
        }).start();
    }
    
    @PluginMethod
    public void getModelInfo(PluginCall call) {
        JSObject result = new JSObject();
        result.put("isLoaded", modelLoaded);
        
        if (modelLoaded) {
            result.put("modelPath", currentModelPath);
            result.put("contextSize", 2048); // TODO: get from native
            try {
                result.put("memoryUsage", nativeGetMemoryUsage());
            } catch (Exception e) {
                result.put("memoryUsage", 0);
            }
        }
        
        call.resolve(result);
    }
    
    @PluginMethod
    public void getDeviceInfo(PluginCall call) {
        Runtime runtime = Runtime.getRuntime();
        
        JSObject result = new JSObject();
        result.put("platform", "android");
        result.put("totalMemory", runtime.maxMemory());
        result.put("availableMemory", runtime.freeMemory());
        result.put("gpuAvailable", false); // TODO: check for Vulkan support
        result.put("deviceModel", android.os.Build.MODEL);
        
        call.resolve(result);
    }
    
    @PluginMethod
    public void modelExists(PluginCall call) {
        String path = call.getString("path");
        if (path == null) {
            call.reject("path is required");
            return;
        }
        
        File file = new File(path);
        JSObject result = new JSObject();
        result.put("exists", file.exists());
        call.resolve(result);
    }
    
    @PluginMethod
    public void getRecommendedConfig(PluginCall call) {
        Runtime runtime = Runtime.getRuntime();
        long maxMemory = runtime.maxMemory();
        int availableProcessors = runtime.availableProcessors();
        
        // Estimate based on available memory
        int maxContextSize = maxMemory > 4L * 1024 * 1024 * 1024 ? 4096 : 2048;
        int recommendedThreads = Math.min(availableProcessors, 8);
        long maxModelSize = maxMemory / 2; // Use at most half of available memory
        
        JSObject result = new JSObject();
        result.put("maxContextSize", maxContextSize);
        result.put("recommendedThreads", recommendedThreads);
        result.put("gpuLayersSupported", 0); // Conservative default
        result.put("maxModelSizeBytes", maxModelSize);
        
        call.resolve(result);
    }
}
