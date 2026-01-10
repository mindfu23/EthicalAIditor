import Foundation
import Capacitor

/**
 * Capacitor plugin for llama.cpp inference on iOS
 *
 * This plugin wraps llama.cpp compiled for iOS to enable
 * local LLM inference on iOS devices using Metal for GPU acceleration.
 */
@objc(LlamaCppPlugin)
public class LlamaCppPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "LlamaCppPlugin"
    public let jsName = "LlamaCpp"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "loadModel", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "unloadModel", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "generate", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getModelInfo", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getDeviceInfo", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "modelExists", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getRecommendedConfig", returnType: CAPPluginReturnPromise)
    ]
    
    private var llamaContext: LlamaContext?
    private var isModelLoaded = false
    private var currentModelPath: String?
    
    // MARK: - Plugin Methods
    
    @objc func loadModel(_ call: CAPPluginCall) {
        guard let modelPath = call.getString("modelPath") else {
            call.reject("modelPath is required")
            return
        }
        
        // Check if file exists
        let fileManager = FileManager.default
        guard fileManager.fileExists(atPath: modelPath) else {
            call.reject("Model file not found: \(modelPath)")
            return
        }
        
        let contextSize = call.getInt("contextSize") ?? 2048
        let threads = call.getInt("threads") ?? 4
        let gpuLayers = call.getInt("gpuLayers") ?? 0
        let batchSize = call.getInt("batchSize") ?? 512
        
        // Load on background queue
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self = self else { return }
            
            let startTime = CFAbsoluteTimeGetCurrent()
            
            do {
                // Initialize llama context with model
                self.llamaContext = try LlamaContext(
                    modelPath: modelPath,
                    contextSize: contextSize,
                    threads: threads,
                    gpuLayers: gpuLayers,
                    batchSize: batchSize
                )
                
                let loadTime = (CFAbsoluteTimeGetCurrent() - startTime) * 1000
                
                self.isModelLoaded = true
                self.currentModelPath = modelPath
                
                DispatchQueue.main.async {
                    call.resolve([
                        "success": true,
                        "loadTimeMs": Int(loadTime)
                    ])
                }
            } catch {
                DispatchQueue.main.async {
                    call.reject("Failed to load model: \(error.localizedDescription)")
                }
            }
        }
    }
    
    @objc func unloadModel(_ call: CAPPluginCall) {
        llamaContext = nil
        isModelLoaded = false
        currentModelPath = nil
        
        call.resolve(["success": true])
    }
    
    @objc func generate(_ call: CAPPluginCall) {
        guard isModelLoaded, let context = llamaContext else {
            call.reject("No model loaded. Call loadModel() first.")
            return
        }
        
        guard let prompt = call.getString("prompt") else {
            call.reject("prompt is required")
            return
        }
        
        let maxTokens = call.getInt("maxTokens") ?? 256
        let temperature = call.getFloat("temperature") ?? 0.7
        let topP = call.getFloat("topP") ?? 0.9
        let topK = call.getInt("topK") ?? 40
        let repeatPenalty = call.getFloat("repeatPenalty") ?? 1.1
        let stopSequences = call.getArray("stopSequences", String.self) ?? []
        
        // Generate on background queue
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self = self else { return }
            
            let startTime = CFAbsoluteTimeGetCurrent()
            
            do {
                let result = try context.generate(
                    prompt: prompt,
                    maxTokens: maxTokens,
                    temperature: temperature,
                    topP: topP,
                    topK: topK,
                    repeatPenalty: repeatPenalty,
                    stopSequences: stopSequences
                )
                
                let generationTime = (CFAbsoluteTimeGetCurrent() - startTime) * 1000
                let tokensPerSecond = generationTime > 0 ? Double(result.tokensGenerated) * 1000.0 / generationTime : 0
                
                DispatchQueue.main.async {
                    call.resolve([
                        "text": result.text,
                        "tokensGenerated": result.tokensGenerated,
                        "generationTimeMs": Int(generationTime),
                        "tokensPerSecond": tokensPerSecond,
                        "stoppedBySequence": result.stoppedBySequence
                    ])
                }
            } catch {
                DispatchQueue.main.async {
                    call.reject("Generation failed: \(error.localizedDescription)")
                }
            }
        }
    }
    
    @objc func getModelInfo(_ call: CAPPluginCall) {
        var result: [String: Any] = ["isLoaded": isModelLoaded]
        
        if isModelLoaded {
            result["modelPath"] = currentModelPath
            result["contextSize"] = llamaContext?.contextSize ?? 2048
            result["memoryUsage"] = llamaContext?.memoryUsage ?? 0
        }
        
        call.resolve(result)
    }
    
    @objc func getDeviceInfo(_ call: CAPPluginCall) {
        let processInfo = ProcessInfo.processInfo
        let device = UIDevice.current
        
        call.resolve([
            "platform": "ios",
            "totalMemory": processInfo.physicalMemory,
            "availableMemory": getAvailableMemory(),
            "gpuAvailable": true, // Metal is available on all modern iOS devices
            "deviceModel": device.model
        ])
    }
    
    @objc func modelExists(_ call: CAPPluginCall) {
        guard let path = call.getString("path") else {
            call.reject("path is required")
            return
        }
        
        let exists = FileManager.default.fileExists(atPath: path)
        call.resolve(["exists": exists])
    }
    
    @objc func getRecommendedConfig(_ call: CAPPluginCall) {
        let totalMemory = ProcessInfo.processInfo.physicalMemory
        let availableMemory = getAvailableMemory()
        
        // Estimate based on device memory
        let maxContextSize = totalMemory > 4 * 1024 * 1024 * 1024 ? 4096 : 2048
        let recommendedThreads = min(ProcessInfo.processInfo.processorCount, 8)
        let maxModelSize = availableMemory / 2 // Use at most half of available memory
        
        // Metal GPU layers - conservative estimate based on device
        let gpuLayersSupported = totalMemory > 6 * 1024 * 1024 * 1024 ? 32 : 16
        
        call.resolve([
            "maxContextSize": maxContextSize,
            "recommendedThreads": recommendedThreads,
            "gpuLayersSupported": gpuLayersSupported,
            "maxModelSizeBytes": maxModelSize
        ])
    }
    
    // MARK: - Helper Methods
    
    private func getAvailableMemory() -> UInt64 {
        var info = mach_task_basic_info()
        var count = mach_msg_type_number_t(MemoryLayout<mach_task_basic_info>.size) / 4
        
        let result = withUnsafeMutablePointer(to: &info) {
            $0.withMemoryRebound(to: integer_t.self, capacity: 1) {
                task_info(mach_task_self_, task_flavor_t(MACH_TASK_BASIC_INFO), $0, &count)
            }
        }
        
        if result == KERN_SUCCESS {
            let usedMemory = info.resident_size
            let totalMemory = ProcessInfo.processInfo.physicalMemory
            return totalMemory - usedMemory
        }
        
        return ProcessInfo.processInfo.physicalMemory / 2 // Fallback estimate
    }
}
