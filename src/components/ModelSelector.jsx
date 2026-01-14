/**
 * Model Selector Component for EthicalAIditor
 *
 * Shows available ethical AI models from different providers:
 * - PleIAs (hosted on Google Cloud Run)
 * - BLOOM/BLOOMZ (via Friendli.ai - server-side or client-side)
 */

import React, { useState, useEffect } from 'react';
import { Cpu, Lock, Sparkles, Loader2, Server } from 'lucide-react';
import { isFriendliConfigured, warmupFriendliEndpoint, checkServerFriendli, isFriendliAvailable } from '../services/friendli.js';

// PleIAs model (Google Cloud Run)
const PLEIAS_MODEL = {
  id: 'PleIAs/Pleias-350m-Preview',
  name: 'PleIAs 350M',
  description: 'Ethical AI trained on Common Corpus',
  badge: 'Google Cloud',
  available: true,
  provider: 'cloud-run',
};

// BLOOM models (via Friendli.ai)
const BLOOM_MODELS = [
  {
    id: 'bigscience/bloomz-560m',
    name: 'BLOOMZ 560M',
    description: 'Fast, multilingual ethical model (BigScience)',
    badge: 'Friendli.ai',
    available: true,
    provider: 'friendli',
  },
  {
    id: 'bigscience/bloomz-1b7',
    name: 'BLOOMZ 1.7B',
    description: 'More capable multilingual model (BigScience)',
    badge: 'Friendli.ai',
    available: true,
    provider: 'friendli',
  },
];

// Future models (not yet available)
const FUTURE_MODELS = [
  {
    id: 'meta-llama/Llama-3.3-70B-Instruct',
    name: 'Llama 3.3 70B',
    description: 'Most capable open-source model',
    badge: 'Coming Soon',
    available: false,
    provider: 'future',
  },
];

const AVAILABLE_MODELS = [PLEIAS_MODEL, ...BLOOM_MODELS, ...FUTURE_MODELS];
const DEFAULT_MODEL = PLEIAS_MODEL.id;
const STORAGE_KEY = 'ethicalaiditor_model';

export function ModelSelector({ value, onChange }) {
  const selectedModel = value || DEFAULT_MODEL;
  const [friendliAvailable, setFriendliAvailable] = useState(isFriendliConfigured()); // Start with sync check
  const [serverSideFriendli, setServerSideFriendli] = useState(false);
  const [checkingFriendli, setCheckingFriendli] = useState(true);
  const [warmupStatus, setWarmupStatus] = useState(null); // null, 'warming', 'ready', 'error'

  // Check Friendli availability on mount (async server check)
  useEffect(() => {
    async function checkAvailability() {
      setCheckingFriendli(true);
      try {
        // Check if server-side Friendli is configured
        const serverStatus = await checkServerFriendli();
        setServerSideFriendli(serverStatus.configured);
        
        // Check overall availability (server or client)
        const available = await isFriendliAvailable();
        setFriendliAvailable(available);
      } catch (error) {
        console.warn('[ModelSelector] Error checking Friendli:', error);
      } finally {
        setCheckingFriendli(false);
      }
    }
    checkAvailability();
  }, []);

  const handleSelect = async (modelId) => {
    const model = AVAILABLE_MODELS.find(m => m.id === modelId);
    if (!model?.available) return;

    // Check if Friendli is available for BLOOM models
    if (model.provider === 'friendli' && !friendliAvailable) {
      alert('Friendli.ai is not currently available. Please try again later or configure your API key in settings.');
      return;
    }

    localStorage.setItem(STORAGE_KEY, modelId);
    if (onChange) onChange(modelId);

    // Warm up Friendli endpoint when selecting a BLOOM model
    if (model.provider === 'friendli') {
      setWarmupStatus('warming');
      const result = await warmupFriendliEndpoint();
      if (result.success) {
        setWarmupStatus('ready');
        setTimeout(() => setWarmupStatus(null), 3000);
      } else if (result.status === 'waking') {
        setWarmupStatus('waking');
        // Try again after 30 seconds
        setTimeout(async () => {
          const retry = await warmupFriendliEndpoint();
          setWarmupStatus(retry.success ? 'ready' : 'error');
          setTimeout(() => setWarmupStatus(null), 3000);
        }, 30000);
      } else {
        setWarmupStatus('error');
        setTimeout(() => setWarmupStatus(null), 5000);
      }
    }
  };

  const getBadgeStyle = (model) => {
    if (!model.available) return 'bg-gray-200 text-gray-500';
    if (model.provider === 'friendli') return 'bg-purple-100 text-purple-700';
    return 'bg-green-100 text-green-700';
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
        <Cpu size={16} />
        <span>AI Model</span>
      </div>
      <p className="text-xs text-gray-500 mb-2">
        Choose from ethically sourced AI models
      </p>
      <div className="space-y-2">
        {/* PleIAs Model */}
        <ModelOption
          model={PLEIAS_MODEL}
          isSelected={selectedModel === PLEIAS_MODEL.id}
          onSelect={handleSelect}
          badgeStyle={getBadgeStyle(PLEIAS_MODEL)}
        />

        {/* BLOOM Models via Friendli.ai */}
        <div className="mt-3 pt-3 border-t border-gray-200">
          <p className="text-xs text-gray-600 mb-2 flex items-center gap-1">
            <Sparkles size={12} />
            BLOOM models via Friendli.ai
            {checkingFriendli ? (
              <Loader2 size={10} className="animate-spin ml-1" />
            ) : serverSideFriendli ? (
              <span className="text-green-600 ml-1 flex items-center gap-1">
                <Server size={10} />
                (server)
              </span>
            ) : !friendliAvailable && (
              <span className="text-orange-500 ml-1">(API key required)</span>
            )}
          </p>
          
          {/* Warmup status indicator */}
          {warmupStatus && (
            <div className={`text-xs mb-2 p-2 rounded flex items-center gap-2 ${
              warmupStatus === 'warming' || warmupStatus === 'waking' 
                ? 'bg-yellow-50 text-yellow-700' 
                : warmupStatus === 'ready' 
                  ? 'bg-green-50 text-green-700'
                  : 'bg-red-50 text-red-700'
            }`}>
              {(warmupStatus === 'warming' || warmupStatus === 'waking') && (
                <Loader2 size={12} className="animate-spin" />
              )}
              {warmupStatus === 'warming' && 'Warming up endpoint...'}
              {warmupStatus === 'waking' && 'Endpoint is waking up (~30s)...'}
              {warmupStatus === 'ready' && '✓ Endpoint is ready'}
              {warmupStatus === 'error' && 'Endpoint unavailable'}
            </div>
          )}
          
          {BLOOM_MODELS.map((model) => (
            <ModelOption
              key={model.id}
              model={model}
              isSelected={selectedModel === model.id}
              onSelect={handleSelect}
              badgeStyle={getBadgeStyle(model)}
              disabled={checkingFriendli || !friendliAvailable}
            />
          ))}
        </div>

        {/* Future Models (grayed out) */}
        {FUTURE_MODELS.length > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-200">
            <p className="text-xs text-gray-400 mb-2 flex items-center gap-1">
              <Lock size={12} />
              Coming soon
            </p>
            {FUTURE_MODELS.map((model) => (
              <ModelOption
                key={model.id}
                model={model}
                isSelected={false}
                onSelect={() => {}}
                badgeStyle={getBadgeStyle(model)}
                disabled={true}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ModelOption({ model, isSelected, onSelect, badgeStyle, disabled = false }) {
  const baseClasses = "flex items-center p-3 rounded-lg border mb-2 transition-colors";
  const stateClasses = disabled
    ? "border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed"
    : isSelected
      ? "border-blue-500 bg-blue-50 cursor-pointer"
      : "border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50/50 cursor-pointer";

  return (
    <div
      className={`${baseClasses} ${stateClasses}`}
      onClick={() => !disabled && onSelect(model.id)}
    >
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className={`font-medium ${disabled ? 'text-gray-400' : 'text-gray-900'}`}>
            {model.name}
          </span>
          <span className={`text-xs px-2 py-0.5 rounded-full ${badgeStyle}`}>
            {model.badge}
          </span>
        </div>
        <p className={`text-sm ${disabled ? 'text-gray-400' : 'text-gray-500'}`}>
          {model.description}
        </p>
      </div>
      <div className={`w-4 h-4 rounded-full border-2 ${
        isSelected
          ? 'border-blue-500 bg-blue-500'
          : disabled
            ? 'border-gray-300'
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
    // Only allow setting to available models
    const isAvailable = AVAILABLE_MODELS.find(m => m.id === newModel && m.available);
    if (isAvailable) {
      localStorage.setItem(STORAGE_KEY, newModel);
      setModel(newModel);
    }
  };

  return [model, updateModel];
}

export { AVAILABLE_MODELS, DEFAULT_MODEL, BLOOM_MODELS };
