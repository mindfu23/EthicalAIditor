/**
 * Model Selector Component for EthicalAIditor
 * 
 * Shows the current model and future options.
 * Currently only PleIAs/Pleias-350m-Preview is available.
 */

import React from 'react';
import { Cpu, Lock } from 'lucide-react';

// Current active model (self-hosted)
const CURRENT_MODEL = {
  id: 'PleIAs/Pleias-350m-Preview',
  name: 'PleIAs 350M',
  description: 'Ethical AI model trained on legally licensed materials',
  badge: 'Active',
  available: true,
};

// Future models (not yet available)
const FUTURE_MODELS = [
  {
    id: 'meta-llama/Llama-3.3-70B-Instruct',
    name: 'Llama 3.3 70B',
    description: 'Most capable open-source model',
    badge: 'Coming Soon',
    available: false,
  },
  {
    id: 'Qwen/Qwen2.5-72B-Instruct',
    name: 'Qwen 2.5 72B',
    description: 'Excellent for structured content',
    badge: 'Coming Soon',
    available: false,
  },
  {
    id: 'mistralai/Mistral-Nemo-Instruct-2407',
    name: 'Mistral Nemo',
    description: 'Fast and efficient',
    badge: 'Coming Soon',
    available: false,
  },
];

const AVAILABLE_MODELS = [CURRENT_MODEL, ...FUTURE_MODELS];
const DEFAULT_MODEL = CURRENT_MODEL.id;
const STORAGE_KEY = 'ethicalaiditor_model';

export function ModelSelector({ value, onChange }) {
  // Always use the current model since others aren't available
  const currentModel = CURRENT_MODEL.id;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
        <Cpu size={16} />
        <span>AI Model</span>
      </div>
      <p className="text-xs text-gray-500 mb-2">
        Currently using self-hosted ethical AI model
      </p>
      <div className="space-y-2">
        {/* Current Active Model */}
        <div
          className="flex items-center p-3 rounded-lg border border-blue-500 bg-blue-50"
        >
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium text-gray-900">{CURRENT_MODEL.name}</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                {CURRENT_MODEL.badge}
              </span>
            </div>
            <p className="text-sm text-gray-500">{CURRENT_MODEL.description}</p>
          </div>
          <div className="w-4 h-4 rounded-full border-2 border-blue-500 bg-blue-500">
            <div className="w-full h-full flex items-center justify-center">
              <div className="w-1.5 h-1.5 rounded-full bg-white" />
            </div>
          </div>
        </div>
        
        {/* Future Models (grayed out) */}
        <div className="mt-3 pt-3 border-t border-gray-200">
          <p className="text-xs text-gray-400 mb-2 flex items-center gap-1">
            <Lock size={12} />
            Future models (requires larger infrastructure)
          </p>
          {FUTURE_MODELS.map((model) => (
            <div
              key={model.id}
              className="flex items-center p-3 rounded-lg border border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed mb-2"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-400">{model.name}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-gray-200 text-gray-500">
                    {model.badge}
                  </span>
                </div>
                <p className="text-sm text-gray-400">{model.description}</p>
              </div>
              <div className="w-4 h-4 rounded-full border-2 border-gray-300" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Hook to get current model (always returns the active model)
export function useSelectedModel() {
  const [model, setModel] = React.useState(DEFAULT_MODEL);

  const updateModel = (newModel) => {
    // Only allow setting to available models
    const isAvailable = AVAILABLE_MODELS.find(m => m.id === newModel && m.available);
    if (isAvailable) {
      localStorage.setItem(STORAGE_KEY, newModel);
      setModel(newModel);
    }
  };

  return [model, updateModel];
}

export { AVAILABLE_MODELS, DEFAULT_MODEL };
