const HF_API_URL = "https://api-inference.huggingface.co/models/";
const DEFAULT_MODEL = "mistralai/Mistral-7B-Instruct-v0.2"; // Good default open model

export const chatWithLLM = async (messages, model = DEFAULT_MODEL, apiKey) => {
  if (!apiKey) {
    throw new Error("API Key is required");
  }

  // Format messages for the model if needed, or just pass them if the model supports the messages API
  // Most HF Inference API models expect a single string input or a specific format.
  // For simplicity with Instruct models, we'll format it as a prompt.
  
  // Simple prompt construction for chat
  const prompt = messages.map(m => `${m.role === 'user' ? '[INST]' : ''} ${m.content} ${m.role === 'user' ? '[/INST]' : ''}`).join('\n');

  try {
    const response = await fetch(`${HF_API_URL}${model}`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inputs: prompt,
        parameters: {
          max_new_tokens: 500,
          temperature: 0.7,
          return_full_text: false,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to fetch from HuggingFace");
    }

    const result = await response.json();
    // HF Inference API usually returns an array with generated_text
    return result[0]?.generated_text || "";
  } catch (error) {
    console.error("Error calling HuggingFace API:", error);
    throw error;
  }
};
