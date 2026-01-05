import React, { useState, useRef, useEffect } from 'react';
import { Upload, Send, Settings, FileText, MessageSquare, Save } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { chatWithLLM } from '../services/huggingface';

export default function Editor({ user, onLogout }) {
  const [manuscript, setManuscript] = useState('');
  const [fileName, setFileName] = useState('');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [apiKey, setApiKey] = useState(localStorage.getItem('hf_api_key') || '');
  const [showSettings, setShowSettings] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      setFileName(file.name);
      const reader = new FileReader();
      reader.onload = (e) => {
        setManuscript(e.target.result);
        // Add a system message about the file
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
    if (!input.trim() || !apiKey) return;

    const userMessage = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      // Include context from the manuscript if available
      const contextMessage = manuscript 
        ? `Context from manuscript:\n${manuscript.substring(0, 2000)}...\n\nUser Question: ${input}`
        : input;

      const response = await chatWithLLM(
        [...messages, { role: 'user', content: contextMessage }], 
        undefined, 
        apiKey
      );
      
      setMessages(prev => [...prev, { role: 'assistant', content: response }]);
    } catch (error) {
      setMessages(prev => [...prev, { role: 'system', content: `Error: ${error.message}` }]);
    } finally {
      setIsLoading(false);
    }
  };

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
        >
          <Settings size={24} />
        </button>
        <div className="w-8 h-8 bg-gray-700 rounded-full flex items-center justify-center text-xs font-bold">
          {user.email[0].toUpperCase()}
        </div>
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
          <div className="h-14 border-b border-gray-200 flex items-center px-4 bg-white">
            <MessageSquare size={18} className="mr-2 text-blue-600" />
            <h2 className="font-semibold text-gray-700">AI Editor Chat</h2>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 && (
              <div className="text-center text-gray-500 mt-10">
                <p>Upload a manuscript and start discussing it with the AI.</p>
                {!apiKey && (
                  <p className="text-red-500 text-sm mt-2">
                    Please configure your HuggingFace API Key in settings.
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
                disabled={!apiKey}
              />
              <button 
                type="submit" 
                disabled={!input.trim() || !apiKey || isLoading}
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
          <div className="bg-white rounded-lg p-6 w-96 shadow-xl">
            <h3 className="text-lg font-bold mb-4">Settings</h3>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                HuggingFace API Key
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="w-full border border-gray-300 rounded-md p-2"
                placeholder="hf_..."
              />
              <p className="text-xs text-gray-500 mt-1">
                Stored locally in your browser.
              </p>
            </div>
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
