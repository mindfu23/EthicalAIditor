import Foundation

/**
 * LlamaContext - Swift wrapper for llama.cpp
 *
 * This class provides a Swift interface to llama.cpp for local LLM inference.
 * It uses the llama.cpp C API through a bridging header.
 */
public class LlamaContext {
    private var model: OpaquePointer?
    private var context: OpaquePointer?
    
    public let contextSize: Int
    public var memoryUsage: UInt64 {
        // Estimate based on model size and context
        return UInt64(contextSize * 4 * 1024) // Rough estimate
    }
    
    public struct GenerationResult {
        let text: String
        let tokensGenerated: Int
        let stoppedBySequence: Bool
    }
    
    public enum LlamaError: Error {
        case modelLoadFailed
        case contextCreationFailed
        case generationFailed
        case invalidInput
    }
    
    /**
     * Initialize llama context with a GGUF model
     */
    public init(
        modelPath: String,
        contextSize: Int = 2048,
        threads: Int = 4,
        gpuLayers: Int = 0,
        batchSize: Int = 512
    ) throws {
        self.contextSize = contextSize
        
        // Initialize llama backend
        llama_backend_init()
        
        // Load model with parameters
        var modelParams = llama_model_default_params()
        modelParams.n_gpu_layers = Int32(gpuLayers)
        
        guard let loadedModel = llama_load_model_from_file(modelPath, modelParams) else {
            throw LlamaError.modelLoadFailed
        }
        self.model = loadedModel
        
        // Create context
        var contextParams = llama_context_default_params()
        contextParams.n_ctx = UInt32(contextSize)
        contextParams.n_threads = UInt32(threads)
        contextParams.n_threads_batch = UInt32(threads)
        contextParams.n_batch = UInt32(batchSize)
        
        guard let ctx = llama_new_context_with_model(model, contextParams) else {
            llama_free_model(model)
            throw LlamaError.contextCreationFailed
        }
        self.context = ctx
    }
    
    deinit {
        if let ctx = context {
            llama_free(ctx)
        }
        if let mdl = model {
            llama_free_model(mdl)
        }
        llama_backend_free()
    }
    
    /**
     * Generate text from a prompt
     */
    public func generate(
        prompt: String,
        maxTokens: Int,
        temperature: Float,
        topP: Float,
        topK: Int,
        repeatPenalty: Float,
        stopSequences: [String]
    ) throws -> GenerationResult {
        guard let ctx = context, let mdl = model else {
            throw LlamaError.contextCreationFailed
        }
        
        // Tokenize prompt
        let promptCString = prompt.cString(using: .utf8)!
        let promptTokens = UnsafeMutablePointer<llama_token>.allocate(capacity: contextSize)
        defer { promptTokens.deallocate() }
        
        let nPromptTokens = llama_tokenize(
            mdl,
            promptCString,
            Int32(promptCString.count),
            promptTokens,
            Int32(contextSize),
            true, // add_bos
            false // special
        )
        
        if nPromptTokens < 0 {
            throw LlamaError.invalidInput
        }
        
        // Clear KV cache
        llama_kv_cache_clear(ctx)
        
        // Process prompt
        var batch = llama_batch_init(Int32(contextSize), 0, 1)
        defer { llama_batch_free(batch) }
        
        for i in 0..<Int(nPromptTokens) {
            llama_batch_add(&batch, promptTokens[i], Int32(i), [0], false)
        }
        batch.logits[Int(nPromptTokens - 1)] = 1 // Only compute logits for last token
        
        if llama_decode(ctx, batch) != 0 {
            throw LlamaError.generationFailed
        }
        
        // Setup sampler
        var samplerParams = llama_sampler_chain_default_params()
        let sampler = llama_sampler_chain_init(samplerParams)
        defer { llama_sampler_free(sampler) }
        
        // Add sampling stages
        llama_sampler_chain_add(sampler, llama_sampler_init_top_k(Int32(topK)))
        llama_sampler_chain_add(sampler, llama_sampler_init_top_p(topP, 1))
        llama_sampler_chain_add(sampler, llama_sampler_init_temp(temperature))
        llama_sampler_chain_add(sampler, llama_sampler_init_dist(UInt32.random(in: 0...UInt32.max)))
        
        // Generate tokens
        var generatedText = ""
        var tokensGenerated = 0
        var stoppedBySequence = false
        var currentPos = Int(nPromptTokens)
        
        for _ in 0..<maxTokens {
            let newTokenId = llama_sampler_sample(sampler, ctx, Int32(currentPos - 1))
            
            // Check for EOS
            if llama_token_is_eog(mdl, newTokenId) {
                break
            }
            
            // Convert token to text
            var buf = [CChar](repeating: 0, count: 256)
            let nChars = llama_token_to_piece(mdl, newTokenId, &buf, Int32(buf.count), 0, false)
            if nChars > 0 {
                let piece = String(cString: buf)
                generatedText += piece
                tokensGenerated += 1
                
                // Check for stop sequences
                for stopSeq in stopSequences {
                    if generatedText.hasSuffix(stopSeq) {
                        generatedText = String(generatedText.dropLast(stopSeq.count))
                        stoppedBySequence = true
                        break
                    }
                }
                
                if stoppedBySequence {
                    break
                }
            }
            
            // Prepare for next token
            llama_batch_clear(&batch)
            llama_batch_add(&batch, newTokenId, Int32(currentPos), [0], true)
            currentPos += 1
            
            if llama_decode(ctx, batch) != 0 {
                break
            }
        }
        
        return GenerationResult(
            text: generatedText,
            tokensGenerated: tokensGenerated,
            stoppedBySequence: stoppedBySequence
        )
    }
}

// MARK: - llama_batch helper
extension llama_batch {
    mutating func clear() {
        self.n_tokens = 0
    }
    
    mutating func add(_ token: llama_token, _ pos: Int32, _ seqIds: [Int32], _ logits: Bool) {
        let i = Int(self.n_tokens)
        self.token[i] = token
        self.pos[i] = pos
        self.n_seq_id[i] = Int32(seqIds.count)
        for (j, seqId) in seqIds.enumerated() {
            self.seq_id[i]![j] = seqId
        }
        self.logits[i] = logits ? 1 : 0
        self.n_tokens += 1
    }
}
