import React, { useState, useEffect } from 'react';
import { Pen, Briefcase, BookOpen, Newspaper, Mail, MessageCircle, ChevronDown, Check, Sparkles, Info } from 'lucide-react';

/**
 * Available writing modes with their LoRA adapter configurations
 */
export const WritingModes = {
  PROFESSIONAL: {
    id: 'professional',
    name: 'Professional',
    description: 'Formal business writing',
    icon: Briefcase,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    adapter: 'professional-v2',
    settings: {
      temperature: 0.5,
      formality: 'high',
      conciseness: 'high',
    },
  },
  CREATIVE: {
    id: 'creative',
    name: 'Creative',
    description: 'Fiction and creative writing',
    icon: Pen,
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
    adapter: 'creative-v1',
    settings: {
      temperature: 0.8,
      formality: 'flexible',
      creativity: 'high',
    },
  },
  ACADEMIC: {
    id: 'academic',
    name: 'Academic',
    description: 'Research and scholarly writing',
    icon: BookOpen,
    color: 'text-green-600',
    bgColor: 'bg-green-50',
    adapter: 'academic-v1',
    settings: {
      temperature: 0.4,
      formality: 'high',
      precision: 'high',
    },
  },
  JOURNALISTIC: {
    id: 'journalistic',
    name: 'Journalistic',
    description: 'News and article writing',
    icon: Newspaper,
    color: 'text-amber-600',
    bgColor: 'bg-amber-50',
    adapter: 'journalist-v1',
    settings: {
      temperature: 0.5,
      clarity: 'high',
      objectivity: 'high',
    },
  },
  CASUAL: {
    id: 'casual',
    name: 'Casual',
    description: 'Everyday conversational style',
    icon: MessageCircle,
    color: 'text-pink-600',
    bgColor: 'bg-pink-50',
    adapter: 'casual-v1',
    settings: {
      temperature: 0.7,
      formality: 'low',
      friendliness: 'high',
    },
  },
  EMAIL: {
    id: 'email',
    name: 'Email',
    description: 'Business email communication',
    icon: Mail,
    color: 'text-cyan-600',
    bgColor: 'bg-cyan-50',
    adapter: 'email-v1',
    settings: {
      temperature: 0.5,
      formality: 'medium',
      conciseness: 'high',
    },
  },
};

const MODE_LIST = Object.values(WritingModes);

/**
 * Get the current writing mode from localStorage
 */
export function getCurrentMode() {
  const modeId = localStorage.getItem('ethicalaiditor_writing_mode') || 'professional';
  return MODE_LIST.find(m => m.id === modeId) || WritingModes.PROFESSIONAL;
}

/**
 * Save the writing mode to localStorage
 */
export function setCurrentMode(modeId) {
  localStorage.setItem('ethicalaiditor_writing_mode', modeId);
}

/**
 * Get mode settings for LLM requests
 */
export function getModeSettings() {
  const mode = getCurrentMode();
  return {
    adapter: mode.adapter,
    ...mode.settings,
  };
}

/**
 * WritingModeSelector Component
 * 
 * Dropdown selector for writing modes with LoRA adapter support
 */
export function WritingModeSelector({ onChange, showInfo = false }) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentMode, setMode] = useState(getCurrentMode());

  useEffect(() => {
    // Update state if localStorage changes
    const handleStorage = () => setMode(getCurrentMode());
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const handleSelect = (mode) => {
    setCurrentMode(mode.id);
    setMode(mode);
    setIsOpen(false);
    onChange?.(mode);
  };

  const Icon = currentMode.icon;

  return (
    <div className="relative">
      {/* Trigger button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${currentMode.bgColor} border-gray-200 hover:border-gray-300 transition-colors`}
      >
        <Icon size={16} className={currentMode.color} />
        <span className="text-sm font-medium">{currentMode.name}</span>
        <ChevronDown size={14} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 z-10" 
            onClick={() => setIsOpen(false)} 
          />

          {/* Menu */}
          <div className="absolute right-0 mt-2 w-72 bg-white rounded-lg shadow-lg border z-20 overflow-hidden">
            <div className="p-2">
              <div className="text-xs font-medium text-gray-500 uppercase px-2 pb-2 border-b">
                Writing Mode
              </div>

              <div className="py-2 space-y-1">
                {MODE_LIST.map((mode) => {
                  const ModeIcon = mode.icon;
                  const isSelected = mode.id === currentMode.id;

                  return (
                    <button
                      key={mode.id}
                      onClick={() => handleSelect(mode)}
                      className={`w-full flex items-start gap-3 p-2 rounded-lg transition-colors ${
                        isSelected ? mode.bgColor : 'hover:bg-gray-50'
                      }`}
                    >
                      <div className={`mt-0.5 p-1.5 rounded ${mode.bgColor}`}>
                        <ModeIcon size={16} className={mode.color} />
                      </div>
                      <div className="flex-1 text-left">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{mode.name}</span>
                          {isSelected && <Check size={14} className="text-green-500" />}
                        </div>
                        <p className="text-xs text-gray-500">{mode.description}</p>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Info section */}
              {showInfo && (
                <div className="px-2 pt-2 mt-2 border-t">
                  <div className="flex items-start gap-2 text-xs text-gray-500">
                    <Info size={14} className="mt-0.5 flex-shrink-0" />
                    <p>
                      Writing modes adjust the AI's tone and style to match your content type.
                      The AI will use specialized settings for better results.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * WritingModeBadge Component
 * 
 * Compact badge showing current mode
 */
export function WritingModeBadge({ onClick }) {
  const mode = getCurrentMode();
  const Icon = mode.icon;

  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs ${mode.bgColor}`}
      title={`Mode: ${mode.name}`}
    >
      <Icon size={12} className={mode.color} />
      <span className={mode.color}>{mode.name}</span>
    </button>
  );
}

/**
 * WritingModePanel Component
 * 
 * Full panel with mode details and customization
 */
export function WritingModePanel({ isOpen, onClose }) {
  const [currentMode, setMode] = useState(getCurrentMode());
  const [customSettings, setCustomSettings] = useState({});

  useEffect(() => {
    setMode(getCurrentMode());
  }, [isOpen]);

  const handleModeSelect = (mode) => {
    setCurrentMode(mode.id);
    setMode(mode);
    setCustomSettings({});
  };

  const Icon = currentMode.icon;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b bg-gradient-to-r from-sage/10 to-transparent">
          <div className="flex items-center gap-2">
            <Sparkles className="text-sage" size={20} />
            <h2 className="font-semibold">Writing Mode</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            ✕
          </button>
        </div>

        {/* Current mode display */}
        <div className={`p-4 ${currentMode.bgColor}`}>
          <div className="flex items-start gap-3">
            <div className="p-2 bg-white rounded-lg shadow-sm">
              <Icon size={24} className={currentMode.color} />
            </div>
            <div>
              <h3 className="font-semibold">{currentMode.name} Mode</h3>
              <p className="text-sm text-gray-600">{currentMode.description}</p>
              <div className="flex flex-wrap gap-2 mt-2">
                {Object.entries(currentMode.settings).map(([key, value]) => (
                  <span
                    key={key}
                    className="px-2 py-0.5 bg-white rounded text-xs text-gray-600"
                  >
                    {key}: {value}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Mode selection */}
        <div className="p-4">
          <h4 className="text-sm font-medium text-gray-500 mb-3">Select Mode</h4>
          <div className="grid grid-cols-3 gap-2">
            {MODE_LIST.map((mode) => {
              const ModeIcon = mode.icon;
              const isSelected = mode.id === currentMode.id;

              return (
                <button
                  key={mode.id}
                  onClick={() => handleModeSelect(mode)}
                  className={`flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-all ${
                    isSelected
                      ? `${mode.bgColor} border-current ${mode.color}`
                      : 'border-transparent hover:bg-gray-50'
                  }`}
                >
                  <ModeIcon size={20} className={isSelected ? mode.color : 'text-gray-400'} />
                  <span className={`text-xs font-medium ${isSelected ? mode.color : 'text-gray-600'}`}>
                    {mode.name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* LoRA info */}
        <div className="px-4 pb-4">
          <div className="p-3 bg-gray-50 rounded-lg text-sm text-gray-600">
            <div className="flex items-center gap-2 font-medium text-gray-700 mb-1">
              <Sparkles size={14} />
              LoRA Adapter: {currentMode.adapter}
            </div>
            <p className="text-xs">
              This mode uses a specialized adapter trained for {currentMode.name.toLowerCase()} writing.
              The AI will adjust its suggestions to match this style.
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 p-4 border-t bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
          >
            Cancel
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm bg-sage text-white rounded-lg hover:bg-sage-dark"
          >
            Apply Mode
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * useWritingMode Hook
 * 
 * React hook for accessing and updating the writing mode
 */
export function useWritingMode() {
  const [mode, setMode] = useState(getCurrentMode());

  const updateMode = (modeId) => {
    setCurrentMode(modeId);
    const newMode = MODE_LIST.find(m => m.id === modeId) || WritingModes.PROFESSIONAL;
    setMode(newMode);
    return newMode;
  };

  return {
    mode,
    setMode: updateMode,
    settings: getModeSettings(),
    modes: MODE_LIST,
  };
}

export default {
  WritingModes,
  getCurrentMode,
  setCurrentMode,
  getModeSettings,
  WritingModeSelector,
  WritingModeBadge,
  WritingModePanel,
  useWritingMode,
};
