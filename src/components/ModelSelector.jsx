/**
 * Model Selector Component for EthicalAIditor
 *
 * Shows available ethical AI models hosted on HuggingFace Inference API (Pro plan).
 * All models are accessed through the same provider — no separate availability checks needed.
 */

import React from 'react';
import { Cpu } from 'lucide-react';

// Models available on HuggingFace Inference API
const HF_MODELS = [
  {
    id: 'PleIAs/Pleias-1.2b-Preview',
    name: 'Pleias 1.2B',
    description: 'Ethical AI — more nuanced writing suggestions',
    badge: 'HuggingFace',
    available: true,
  },
  {
    id: 'PleIAs/Pleias-350m-Preview',
    name: 'Pleias 350M',
    description: 'Ethical AI — faster responses',
    badge: 'HuggingFace',
    available: true,
  },
  {
    id: 'bigscience/bloomz-1b7',
    name: 'BLOOMZ 1.7B',
    description: 'Ethical multilingual model (BigScience)',
    badge: 'HuggingFace',
    available: true,
  },
];

const AVAILABLE_MODELS = HF_MODELS;
const DEFAULT_MODEL = 'PleIAs/Pleias-1.2b-Preview';
const STORAGE_KEY = 'ethicalaiditor_model';

export function ModelSelector({ value, onChange }) {
  const selectedModel = value || DEFAULT_MODEL;

  const handleSelect = (modelId) => {
    const model = AVAILABLE_MODELS.find(m => m.id === modelId);
    if (!model?.available) return;

    localStorage.setItem(STORAGE_KEY, modelId);
    if (onChange) onChange(modelId);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
        <Cpu size={16} />
        <span>AI Model</span>
      </div>
      <p className="text-xs text-gray-500 mb-2">
        Ethically sourced models via HuggingFace
      </p>
      <div className="space-y-2">
        {AVAILABLE_MODELS.map((model) => (
          <ModelOption
            key={model.id}
            model={model}
            isSelected={selectedModel === model.id}
            onSelect={handleSelect}
          />
        ))}
      </div>
    </div>
  );
}

function ModelOption({ model, isSelected, onSelect }) {
  const baseClasses = "flex items-center p-3 rounded-lg border mb-2 transition-colors";
  const stateClasses = isSelected
    ? "border-blue-500 bg-blue-50 cursor-pointer"
    : "border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50/50 cursor-pointer";

  return (
    <div
      className={`${baseClasses} ${stateClasses}`}
      onClick={() => onSelect(model.id)}
    >
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-900">
            {model.name}
          </span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
            {model.badge}
          </span>
        </div>
        <p className="text-sm text-gray-500">
          {model.description}
        </p>
      </div>
      <div className={`w-4 h-4 rounded-full border-2 ${
        isSelected
          ? 'border-blue-500 bg-blue-500'
          : 'border-gray-300'
      }`}>
        {isSelected && (
          <div className="w-full h-full flex items-center justify-center">
            <div className="w-1.5 h-1.5 rounded-full bg-white" />
          </div>
        )}
      </div>
    </div>
  );
}

// Hook to get current model
export function useSelectedModel() {
  const [model, setModel] = React.useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    const isValid = AVAILABLE_MODELS.find(m => m.id === stored && m.available);
    return isValid ? stored : DEFAULT_MODEL;
  });

  const updateModel = (newModel) => {
    const isAvailable = AVAILABLE_MODELS.find(m => m.id === newModel && m.available);
    if (isAvailable) {
      localStorage.setItem(STORAGE_KEY, newModel);
      setModel(newModel);
    }
  };

  return [model, updateModel];
}

export { AVAILABLE_MODELS, DEFAULT_MODEL };
