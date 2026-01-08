import React, { useState, useRef, useEffect } from 'react';
import { Upload, Send, Settings, FileText, MessageSquare, Save, User, LogOut, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { chatWithLLM, getUsageStats } from '../services/huggingface';
import { useAuth } from '../lib/auth';
import { ModelSelector, useSelectedModel } from './ModelSelector';
import { McpSelector, useSelectedMcp } from './McpSelector';
import { saveManuscript, loadManuscript, getAllManuscripts } from '../lib/storage/manuscript-store';

export default function Editor() {
  const { user, isAuthenticated, openAuth, logout } = useAuth();
  
  const [manuscript, setManuscript] = useState('');
  const [fileName, setFileName] = useState('');
  const [manuscriptId, setManuscriptId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [usageStats, setUsageStats] = useState(null);
  const [apiKey, setApiKey] = useState(localStorage.getItem('hf_api_key') || '');
  
  // Model and MCP selection
  const [selectedModel, setSelectedModel] = useSelectedModel();
  const [selectedMcp, setSelectedMcp] = useSelectedMcp();
  
  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);

  // Auto-scroll chat
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Load usage stats when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      getUsageStats().then(stats => {
        if (stats) setUsageStats(stats);
      });
    }
  }, [isAuthenticated]);

  // Auto-save manuscript to IndexedDB
  useEffect(() => {
    if (manuscript && fileName) {
      const id = manuscriptId || `manuscript-${Date.now()}`;
      if (!manuscriptId) setManuscriptId(id);
      
      const timer = setTimeout(() => {
        saveManuscript({
          id,
          title: fileName,
          content: manuscript,
          messages,
        }).catch(console.error);
      }, 2000); // Debounce 2 seconds
      
      return () => clearTimeout(timer);
    }
  }, [manuscript, fileName, messages, manuscriptId]);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      setFileName(file.name);
      setManuscriptId(null); // New manuscript
      const reader = new FileReader();
      reader.onload = (e) => {
        setManuscript(e.target.result);
        setMessages(prev => [...prev, { 
          role: 'system', 
          content: `File "${file.name}" uploaded. You can now ask questions about it.` 
        }]);
      };
      reader.readAsText(file);
    }
  };

  const handleSaveApiKey = () => {
    localStorage.setItem('hf_api_key', apiKey);
    setShowSettings(false);
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;

    // Check if API is configured
    const apiConfigured = import.meta.env.VITE_CLOUDFLARE_WORKER_URL || apiKey;
    if (!apiConfigured) {
      setMessages(prev => [...prev, { 
        role: 'system', 
        content: 'Please configure your HuggingFace API Key in settings, or wait for the API to be set up.' 
      }]);
      return;
    }

    const userMessage = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await chatWithLLM(
        [...messages, userMessage],
        manuscript, // Pass manuscript as context
        selectedModel
      );
      
      setMessages(prev => [...prev, { role: 'assistant', content: response }]);
      
      // Refresh usage stats after call
      if (isAuthenticated) {
        getUsageStats().then(stats => {
          if (stats) setUsageStats(stats);
        });
      }
    } catch (error) {
      setMessages(prev => [...prev, { role: 'system', content: `Error: ${error.message}` }]);
    } finally {
      setIsLoading(false);
    }
  };

  const apiConfigured = import.meta.env.VITE_CLOUDFLARE_WORKER_URL || apiKey;

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden">
      {/* Sidebar / Navigation */}
      <div className="w-16 bg-gray-900 flex flex-col items-center py-4 space-y-4 text-white">
        <div className="p-2 bg-blue-600 rounded-lg">
          <FileText size={24} />
        </div>
        <div className="flex-1" />
        <button 
          onClick={() => setShowSettings(!showSettings)}
          className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
          title="Settings"
        >
          <Settings size={24} />
        </button>
        {isAuthenticated ? (
          <div className="relative group">
            <div 
              className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-xs font-bold cursor-pointer"
              title={user?.email || 'Account'}
            >
              {user?.displayName?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || 'U'}
            </div>
            <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block">
              <button
                onClick={logout}
                className="bg-gray-800 text-white text-xs px-2 py-1 rounded whitespace-nowrap flex items-center gap-1"
              >
                <LogOut size={12} /> Sign Out
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => openAuth('login')}
            className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
            title="Sign In"
          >
            <User size={24} />
          </button>
        )}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Manuscript Editor */}
        <div className="flex-1 flex flex-col border-r border-gray-200 bg-white">
          <div className="h-14 border-b border-gray-200 flex items-center justify-between px-4 bg-gray-50">
            <h2 className="font-semibold text-gray-700 truncate">
              {fileName || 'Untitled Manuscript'}
            </h2>
            <div className="flex items-center space-x-2">
              <button 
                onClick={() => fileInputRef.current.click()}
                className="flex items-center px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-200 rounded-md transition-colors"
              >
                <Upload size={16} className="mr-2" />
                Upload
              </button>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileUpload} 
                className="hidden" 
                accept=".txt,.md"
              />
            </div>
          </div>
          <textarea
            value={manuscript}
            onChange={(e) => setManuscript(e.target.value)}
            className="flex-1 p-8 resize-none focus:outline-none font-serif text-lg leading-relaxed text-gray-800"
            placeholder="Paste your text here or upload a file..."
          />
        </div>

        {/* Chat Interface */}
        <div className="w-96 flex flex-col bg-gray-50">
          <div className="h-14 border-b border-gray-200 flex items-center justify-between px-4 bg-white">
            <div className="flex items-center">
              <MessageSquare size={18} className="mr-2 text-blue-600" />
              <h2 className="font-semibold text-gray-700">AI Editor Chat</h2>
            </div>
            {usageStats && (
              <span className="text-xs text-gray-500">
                {usageStats.today?.remaining || 0}/{usageStats.today?.limit || 0} left
              </span>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 && (
              <div className="text-center text-gray-500 mt-10">
                <p>Upload a manuscript and start discussing it with the AI.</p>
                {!apiConfigured && (
                  <p className="text-red-500 text-sm mt-2">
                    Please configure your HuggingFace API Key in settings.
                  </p>
                )}
                {!isAuthenticated && apiConfigured && (
                  <p className="text-blue-500 text-sm mt-2">
                    <button onClick={() => openAuth('signup')} className="underline">
                      Sign up
                    </button>
                    {' '}for more AI requests per day.
                  </p>
                )}
              </div>
            )}
            {messages.map((msg, idx) => (
              <div 
                key={idx} 
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div 
                  className={`max-w-[85%] rounded-lg p-3 text-sm ${
                    msg.role === 'user' 
                      ? 'bg-blue-600 text-white' 
                      : msg.role === 'system'
                      ? 'bg-gray-200 text-gray-600 text-xs italic'
                      : 'bg-white border border-gray-200 text-gray-800'
                  }`}
                >
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-white border border-gray-200 rounded-lg p-3 text-sm text-gray-500">
                  Thinking...
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="p-4 border-t border-gray-200 bg-white">
            <form onSubmit={handleSendMessage} className="flex items-center space-x-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about your text..."
                className="flex-1 border border-gray-300 rounded-full px-4 py-2 text-sm focus:outline-none focus:border-blue-500"
                disabled={!apiConfigured}
              />
              <button 
                type="submit" 
                disabled={!input.trim() || !apiConfigured || isLoading}
                className="p-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send size={18} />
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-[480px] max-h-[80vh] overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">Settings</h3>
              <button
                onClick={() => setShowSettings(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={20} />
              </button>
            </div>
            
            {/* Model Selection */}
            <div className="mb-6">
              <ModelSelector value={selectedModel} onChange={setSelectedModel} />
            </div>
            
            {/* MCP Selection */}
            <div className="mb-6">
              <McpSelector value={selectedMcp} onChange={setSelectedMcp} />
            </div>
            
            {/* API Key (fallback) */}
            <div className="mb-6 pt-4 border-t border-gray-200">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                HuggingFace API Key (Optional)
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="w-full border border-gray-300 rounded-md p-2"
                placeholder="hf_..."
              />
              <p className="text-xs text-gray-500 mt-1">
                Only needed if the server API isn't configured. Stored locally in your browser.
              </p>
            </div>
            
            {/* Usage Info */}
            {isAuthenticated && usageStats && (
              <div className="mb-6 p-3 bg-gray-50 rounded-lg">
                <p className="text-sm font-medium text-gray-700 mb-1">Today's Usage</p>
                <p className="text-2xl font-bold text-blue-600">
                  {usageStats.today?.calls || 0} / {usageStats.today?.limit || 30}
                </p>
                <p className="text-xs text-gray-500">
                  Tier: {usageStats.tier || 'free'} • Resets daily at midnight UTC
                </p>
              </div>
            )}
            
            {!isAuthenticated && (
              <div className="mb-6 p-3 bg-blue-50 rounded-lg">
                <p className="text-sm text-blue-800">
                  <button onClick={() => { setShowSettings(false); openAuth('signup'); }} className="font-semibold underline">
                    Sign up
                  </button>
                  {' '}to get 30 requests/day (vs 5 for anonymous users).
                </p>
              </div>
            )}

            <div className="flex justify-end space-x-2">
              <button 
                onClick={() => setShowSettings(false)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-md"
              >
                Cancel
              </button>
              <button 
                onClick={handleSaveApiKey}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
