/**
 * Model Selector Component for EthicalAIditor
 * 
 * Allows users to choose between open-source AI models
 * available via HuggingFace Inference Providers.
 */

import React from 'react';
import { Cpu } from 'lucide-react';

const AVAILABLE_MODELS = [
  {
    id: 'meta-llama/Llama-3.3-70B-Instruct',
    name: 'Llama 3.3 70B',
    description: 'Most capable open-source model',
    badge: 'Recommended',
  },
  {
    id: 'Qwen/Qwen2.5-72B-Instruct',
    name: 'Qwen 2.5 72B',
    description: 'Excellent for structured content',
    badge: null,
  },
  {
    id: 'mistralai/Mistral-Nemo-Instruct-2407',
    name: 'Mistral Nemo',
    description: 'Fast and efficient',
    badge: 'Fast',
  },
];

const DEFAULT_MODEL = 'meta-llama/Llama-3.3-70B-Instruct';
const STORAGE_KEY = 'ethicalaiditor_model';

export function ModelSelector({ value, onChange }) {
  const currentModel = value || localStorage.getItem(STORAGE_KEY) || DEFAULT_MODEL;

  const handleChange = (modelId) => {
    localStorage.setItem(STORAGE_KEY, modelId);
    onChange?.(modelId);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
        <Cpu size={16} />
        <span>AI Model</span>
      </div>
      <p className="text-xs text-gray-500 mb-2">
        Choose the AI model for writing assistance
      </p>
      <div className="space-y-2">
        {AVAILABLE_MODELS.map((model) => (
          <label
            key={model.id}
            className={`flex items-center p-3 rounded-lg border cursor-pointer transition-colors ${
              currentModel === model.id
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
            }`}
          >
            <input
              type="radio"
              name="model"
              value={model.id}
              checked={currentModel === model.id}
              onChange={() => handleChange(model.id)}
              className="sr-only"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-900">{model.name}</span>
                {model.badge && (
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    model.badge === 'Recommended' 
                      ? 'bg-green-100 text-green-700'
                      : 'bg-blue-100 text-blue-700'
                  }`}>
                    {model.badge}
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-500">{model.description}</p>
            </div>
            <div className={`w-4 h-4 rounded-full border-2 ${
              currentModel === model.id
                ? 'border-blue-500 bg-blue-500'
                : 'border-gray-300'
            }`}>
              {currentModel === model.id && (
                <div className="w-full h-full flex items-center justify-center">
                  <div className="w-1.5 h-1.5 rounded-full bg-white" />
                </div>
              )}
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}

// Hook to get current model
export function useSelectedModel() {
  const [model, setModel] = React.useState(
    () => localStorage.getItem(STORAGE_KEY) || DEFAULT_MODEL
  );

  const updateModel = (newModel) => {
    localStorage.setItem(STORAGE_KEY, newModel);
    setModel(newModel);
  };

  return [model, updateModel];
}

export { AVAILABLE_MODELS, DEFAULT_MODEL };
