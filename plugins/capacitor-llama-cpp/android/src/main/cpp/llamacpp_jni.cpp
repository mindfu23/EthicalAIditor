/**
 * JNI wrapper for llama.cpp on Android
 * 
 * This provides the native methods called from LlamaCppPlugin.java
 */

#include <jni.h>
#include <string>
#include <android/log.h>
#include <memory>

#include "llama.h"

#define TAG "LlamaCppJNI"
#define LOGD(...) __android_log_print(ANDROID_LOG_DEBUG, TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, TAG, __VA_ARGS__)

// Global state
static llama_model* g_model = nullptr;
static llama_context* g_ctx = nullptr;
static int g_tokens_generated = 0;
static long g_generation_time_ms = 0;

extern "C" {

JNIEXPORT jboolean JNICALL
Java_com_ethicalaiditor_plugins_llamacpp_LlamaCppPlugin_nativeLoadModel(
    JNIEnv* env,
    jobject /* this */,
    jstring modelPath,
    jint contextSize,
    jint threads,
    jint gpuLayers,
    jint batchSize
) {
    // Convert Java string to C string
    const char* path = env->GetStringUTFChars(modelPath, nullptr);
    if (!path) {
        LOGE("Failed to get model path string");
        return JNI_FALSE;
    }
    
    LOGD("Loading model from: %s", path);
    
    // Initialize llama backend
    llama_backend_init();
    
    // Setup model params
    llama_model_params model_params = llama_model_default_params();
    model_params.n_gpu_layers = gpuLayers;
    
    // Load model
    g_model = llama_load_model_from_file(path, model_params);
    env->ReleaseStringUTFChars(modelPath, path);
    
    if (!g_model) {
        LOGE("Failed to load model");
        return JNI_FALSE;
    }
    
    // Setup context params
    llama_context_params ctx_params = llama_context_default_params();
    ctx_params.n_ctx = contextSize;
    ctx_params.n_threads = threads;
    ctx_params.n_threads_batch = threads;
    ctx_params.n_batch = batchSize;
    
    // Create context
    g_ctx = llama_new_context_with_model(g_model, ctx_params);
    if (!g_ctx) {
        LOGE("Failed to create context");
        llama_free_model(g_model);
        g_model = nullptr;
        return JNI_FALSE;
    }
    
    LOGD("Model loaded successfully");
    return JNI_TRUE;
}

JNIEXPORT void JNICALL
Java_com_ethicalaiditor_plugins_llamacpp_LlamaCppPlugin_nativeUnloadModel(
    JNIEnv* /* env */,
    jobject /* this */
) {
    if (g_ctx) {
        llama_free(g_ctx);
        g_ctx = nullptr;
    }
    if (g_model) {
        llama_free_model(g_model);
        g_model = nullptr;
    }
    llama_backend_free();
    LOGD("Model unloaded");
}

JNIEXPORT jstring JNICALL
Java_com_ethicalaiditor_plugins_llamacpp_LlamaCppPlugin_nativeGenerate(
    JNIEnv* env,
    jobject /* this */,
    jstring prompt,
    jint maxTokens,
    jfloat temperature,
    jfloat topP,
    jint topK,
    jfloat repeatPenalty,
    jobjectArray stopSequences
) {
    if (!g_model || !g_ctx) {
        LOGE("Model not loaded");
        return env->NewStringUTF("");
    }
    
    const char* promptStr = env->GetStringUTFChars(prompt, nullptr);
    if (!promptStr) {
        return env->NewStringUTF("");
    }
    
    auto startTime = std::chrono::high_resolution_clock::now();
    
    // Tokenize prompt
    const int n_ctx = llama_n_ctx(g_ctx);
    std::vector<llama_token> tokens(n_ctx);
    int n_tokens = llama_tokenize(
        g_model, 
        promptStr, 
        strlen(promptStr),
        tokens.data(), 
        tokens.size(),
        true,  // add_bos
        false  // special
    );
    env->ReleaseStringUTFChars(prompt, promptStr);
    
    if (n_tokens < 0) {
        LOGE("Tokenization failed");
        return env->NewStringUTF("");
    }
    tokens.resize(n_tokens);
    
    LOGD("Prompt tokenized: %d tokens", n_tokens);
    
    // Clear KV cache
    llama_kv_cache_clear(g_ctx);
    
    // Create batch
    llama_batch batch = llama_batch_init(n_ctx, 0, 1);
    
    // Add prompt tokens to batch
    for (int i = 0; i < n_tokens; i++) {
        llama_batch_add(batch, tokens[i], i, {0}, false);
    }
    batch.logits[n_tokens - 1] = true;
    
    // Process prompt
    if (llama_decode(g_ctx, batch) != 0) {
        LOGE("Decode failed");
        llama_batch_free(batch);
        return env->NewStringUTF("");
    }
    
    // Setup sampler
    llama_sampler_chain_params sampler_params = llama_sampler_chain_default_params();
    llama_sampler* sampler = llama_sampler_chain_init(sampler_params);
    
    llama_sampler_chain_add(sampler, llama_sampler_init_top_k(topK));
    llama_sampler_chain_add(sampler, llama_sampler_init_top_p(topP, 1));
    llama_sampler_chain_add(sampler, llama_sampler_init_temp(temperature));
    llama_sampler_chain_add(sampler, llama_sampler_init_dist(rand()));
    
    // Generate tokens
    std::string result;
    g_tokens_generated = 0;
    int cur_pos = n_tokens;
    
    for (int i = 0; i < maxTokens; i++) {
        llama_token new_token = llama_sampler_sample(sampler, g_ctx, cur_pos - 1);
        
        // Check for end of generation
        if (llama_token_is_eog(g_model, new_token)) {
            break;
        }
        
        // Convert token to text
        char buf[256];
        int n = llama_token_to_piece(g_model, new_token, buf, sizeof(buf), 0, false);
        if (n > 0) {
            result.append(buf, n);
            g_tokens_generated++;
        }
        
        // Prepare next batch
        llama_batch_clear(batch);
        llama_batch_add(batch, new_token, cur_pos, {0}, true);
        cur_pos++;
        
        if (llama_decode(g_ctx, batch) != 0) {
            LOGE("Decode failed during generation");
            break;
        }
    }
    
    llama_sampler_free(sampler);
    llama_batch_free(batch);
    
    auto endTime = std::chrono::high_resolution_clock::now();
    g_generation_time_ms = std::chrono::duration_cast<std::chrono::milliseconds>(endTime - startTime).count();
    
    LOGD("Generated %d tokens in %ld ms", g_tokens_generated, g_generation_time_ms);
    
    return env->NewStringUTF(result.c_str());
}

JNIEXPORT jint JNICALL
Java_com_ethicalaiditor_plugins_llamacpp_LlamaCppPlugin_nativeGetTokensGenerated(
    JNIEnv* /* env */,
    jobject /* this */
) {
    return g_tokens_generated;
}

JNIEXPORT jlong JNICALL
Java_com_ethicalaiditor_plugins_llamacpp_LlamaCppPlugin_nativeGetGenerationTimeMs(
    JNIEnv* /* env */,
    jobject /* this */
) {
    return g_generation_time_ms;
}

JNIEXPORT jlong JNICALL
Java_com_ethicalaiditor_plugins_llamacpp_LlamaCppPlugin_nativeGetMemoryUsage(
    JNIEnv* /* env */,
    jobject /* this */
) {
    if (!g_ctx) return 0;
    return llama_get_state_size(g_ctx);
}

} // extern "C"

// Helper function implementations
static void llama_batch_add(llama_batch& batch, llama_token token, llama_pos pos, std::vector<llama_seq_id> seq_ids, bool logits) {
    batch.token[batch.n_tokens] = token;
    batch.pos[batch.n_tokens] = pos;
    batch.n_seq_id[batch.n_tokens] = seq_ids.size();
    for (size_t i = 0; i < seq_ids.size(); i++) {
        batch.seq_id[batch.n_tokens][i] = seq_ids[i];
    }
    batch.logits[batch.n_tokens] = logits;
    batch.n_tokens++;
}

static void llama_batch_clear(llama_batch& batch) {
    batch.n_tokens = 0;
}
