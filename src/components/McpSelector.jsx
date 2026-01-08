/**
 * MCP Selector Component for EthicalAIditor
 * 
 * Allows users to choose between MCP (Model Context Protocol) backends:
 * - HuggingFace MCP: Direct model access & discovery
 * - Context7 MCP: RAG-enhanced responses with corpus search
 */

import React from 'react';
import { Layers } from 'lucide-react';

const AVAILABLE_MCPS = [
  {
    id: 'huggingface',
    name: 'HuggingFace MCP',
    description: 'Direct model access & discovery',
    badge: 'Default',
  },
  {
    id: 'context7',
    name: 'Context7 MCP',
    description: 'RAG-enhanced responses with corpus search',
    badge: 'Advanced',
  },
];

const DEFAULT_MCP = 'huggingface';
const STORAGE_KEY = 'ethicalaiditor_mcp';

export function McpSelector({ value, onChange }) {
  const currentMcp = value || localStorage.getItem(STORAGE_KEY) || DEFAULT_MCP;

  const handleChange = (mcpId) => {
    localStorage.setItem(STORAGE_KEY, mcpId);
    onChange?.(mcpId);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
        <Layers size={16} />
        <span>MCP Backend</span>
      </div>
      <p className="text-xs text-gray-500 mb-2">
        HuggingFace MCP: Direct model access & discovery; Context7 MCP: RAG-enhanced responses with corpus search
      </p>
      <div className="space-y-2">
        {AVAILABLE_MCPS.map((mcp) => (
          <label
            key={mcp.id}
            className={`flex items-center p-3 rounded-lg border cursor-pointer transition-colors ${
              currentMcp === mcp.id
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
            }`}
          >
            <input
              type="radio"
              name="mcp"
              value={mcp.id}
              checked={currentMcp === mcp.id}
              onChange={() => handleChange(mcp.id)}
              className="sr-only"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-900">{mcp.name}</span>
                {mcp.badge && (
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    mcp.badge === 'Default' 
                      ? 'bg-green-100 text-green-700'
                      : 'bg-purple-100 text-purple-700'
                  }`}>
                    {mcp.badge}
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-500">{mcp.description}</p>
            </div>
            <div className={`w-4 h-4 rounded-full border-2 ${
              currentMcp === mcp.id
                ? 'border-blue-500 bg-blue-500'
                : 'border-gray-300'
            }`}>
              {currentMcp === mcp.id && (
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

// Hook to get current MCP
export function useSelectedMcp() {
  const [mcp, setMcp] = React.useState(
    () => localStorage.getItem(STORAGE_KEY) || DEFAULT_MCP
  );

  const updateMcp = (newMcp) => {
    localStorage.setItem(STORAGE_KEY, newMcp);
    setMcp(newMcp);
  };

  return [mcp, updateMcp];
}

export { AVAILABLE_MCPS, DEFAULT_MCP };
