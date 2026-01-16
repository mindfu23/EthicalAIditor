import React, { useRef, useEffect, useState } from 'react';
import { Send, Loader2, Zap, CheckCircle, AlertCircle, X, MessageSquare } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import {
  ServiceStatus,
  warmupService,
  subscribeToProgress,
  onChatFocus,
  getWarmupMessage
} from '../services/warmup';

export function ChatSidebar({
  messages,
  input,
  onInputChange,
  onSubmit,
  isLoading,
  chatError,
  onClearError,
  serviceStatus,
  usageStats,
  elapsedTime,
  estimatedTime,
  selectedText,
  onClearSelectedText,
  apiConfigured,
  isAuthenticated,
  onOpenAuth,
  selectedModel,
}) {
  const messagesEndRef = useRef(null);
  const [warmupProgress, setWarmupProgress] = useState(null);

  // Subscribe to warmup progress updates
  useEffect(() => {
    const unsubscribe = subscribeToProgress(setWarmupProgress);
    return unsubscribe;
  }, []);

  // Auto-scroll chat
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSubmit(e);
    }
  };

  // Handle chat input focus - trigger predictive warmup
  const handleInputFocus = () => {
    onChatFocus(selectedModel);
  };

  // Determine which provider is active based on selected model
  const isFriendliModel = selectedModel && (
    selectedModel.includes('bloomz') || selectedModel.includes('bigscience')
  );
  const activeProvider = isFriendliModel ? 'friendli' : 'cloudrun';
  const providerProgress = warmupProgress?.[activeProvider];
  const isWarming = providerProgress?.status === ServiceStatus.WARMING_UP ||
                   providerProgress?.status === ServiceStatus.CHECKING;

  return (
    <div className="w-96 bg-cream-100 flex flex-col border-l border-warm-100">
      {/* Header */}
      <div className="px-6 py-4 border-b border-warm-100 bg-cream-50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare size={18} className="text-sage" />
          <h2 className="font-medium text-ink">AI Assistant</h2>
        </div>
        {usageStats && (
          <span className="text-xs text-ink-muted">
            {usageStats.today?.remaining || 0}/{usageStats.today?.limit || 0} left
          </span>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {/* Service Status Indicator with Progress Bar */}
        {isWarming && providerProgress && (
          <div className="rounded-lg p-3 text-sm bg-amber-50 border border-amber-300 text-amber-800">
            <div className="flex items-center gap-3 mb-2">
              <Zap size={16} className="flex-shrink-0 animate-pulse" />
              <div className="flex-1">
                <p className="font-medium">
                  {isFriendliModel ? 'Friendli.ai' : 'AI Model'} Warming Up...
                </p>
                <p className="text-xs mt-0.5 opacity-80">
                  {getWarmupMessage(activeProvider)}
                </p>
              </div>
            </div>
            {/* Progress Bar */}
            <div className="w-full bg-amber-200 rounded-full h-2 overflow-hidden">
              <div
                className="bg-amber-500 h-2 rounded-full transition-all duration-1000 ease-out"
                style={{ width: `${providerProgress.progress || 0}%` }}
              />
            </div>
            <p className="text-xs mt-1.5 text-amber-600">
              {providerProgress.progress < 50
                ? 'Loading model into memory...'
                : providerProgress.progress < 80
                ? 'Almost ready...'
                : 'Finishing up...'}
            </p>
          </div>
        )}

        {/* Service Checking Indicator */}
        {serviceStatus === ServiceStatus.CHECKING && !isWarming && (
          <div className="rounded-lg p-3 text-sm flex items-center gap-3 bg-sage-light/20 border border-sage-light text-sage-darker">
            <Loader2 size={16} className="animate-spin flex-shrink-0" />
            <div>
              <p className="font-medium">Checking AI service...</p>
            </div>
          </div>
        )}

        {/* Service Error Indicator */}
        {serviceStatus === ServiceStatus.ERROR && !isWarming && (
          <div className="rounded-lg p-3 text-sm flex items-center gap-3 bg-yellow-50 border border-yellow-200 text-yellow-800">
            <AlertCircle size={16} className="flex-shrink-0" />
            <div>
              <p className="font-medium">Waking up AI service...</p>
              <p className="text-xs mt-0.5 opacity-80">
                The endpoint may be sleeping. This can take 30-60 seconds.{' '}
                <button onClick={() => warmupService(selectedModel)} className="underline font-medium">
                  Retry now
                </button>
              </p>
            </div>
          </div>
        )}

        {/* Service Ready Indicator */}
        {serviceStatus === ServiceStatus.READY && messages.length === 0 && (
          <div className="bg-sage-light/20 border border-sage-light rounded-lg p-3 text-sm text-sage-darker flex items-center gap-2">
            <CheckCircle size={16} className="flex-shrink-0" />
            <span>AI service is ready! Ask a question about your text.</span>
          </div>
        )}

        {/* Empty state */}
        {messages.length === 0 && (
          <div className="text-center text-ink-muted mt-10 space-y-3">
            <p className="font-medium">
              Paste or type your text in the editor, then ask questions here.
            </p>
            <p className="text-sm text-ink-placeholder">
              The AI can see your manuscript automatically.
            </p>
            {!apiConfigured && (
              <p className="text-destructive text-sm mt-2">
                API not configured. Please set up the Cloudflare Worker (see DEPLOYMENT.md).
              </p>
            )}
            {!isAuthenticated && apiConfigured && (
              <p className="text-sage-dark text-sm mt-2">
                <button onClick={() => onOpenAuth('signup')} className="underline">
                  Sign up
                </button>{' '}
                for more AI requests per day.
              </p>
            )}
          </div>
        )}

        {/* Chat error */}
        {chatError && (
          <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 text-sm text-destructive flex items-center justify-between">
            <span>{chatError}</span>
            <button onClick={onClearError} className="hover:opacity-70">
              <X size={14} />
            </button>
          </div>
        )}

        {/* Messages */}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-lg px-4 py-2 ${
                msg.role === 'user'
                  ? 'bg-sage text-cream-50'
                  : msg.role === 'system'
                  ? 'bg-cream-200 text-ink-muted text-xs italic'
                  : 'bg-cream-50 border border-warm-100 text-ink'
              }`}
            >
              <div className="text-sm leading-relaxed prose prose-sm max-w-none">
                <ReactMarkdown>{msg.content}</ReactMarkdown>
              </div>
            </div>
          </div>
        ))}

        {/* Loading indicator */}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-cream-50 border border-warm-100 rounded-lg p-3 text-sm text-ink-muted">
              <div className="flex items-center gap-2">
                <Loader2 size={14} className="animate-spin" />
                <span>
                  Thinking... {Math.round(elapsedTime / 1000)}s / ~
                  {Math.round(estimatedTime / 1000)}s
                </span>
              </div>
              {serviceStatus === ServiceStatus.WARMING_UP && (
                <p className="text-xs text-amber-600 mt-2">
                  AI is warming up, first response may take longer...
                </p>
              )}
              {elapsedTime > 30000 && (
                <p className="text-xs text-amber-600 mt-2">Still processing, please wait...</p>
              )}
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-warm-100 bg-cream-50">
        {/* Selected Text Indicator */}
        {selectedText && (
          <div className="mb-2 flex items-center justify-between bg-sage-light/20 border border-sage-light rounded-lg px-3 py-2 text-sm">
            <span className="text-sage-darker">
              Using selected text ({selectedText.length} chars) for context
            </span>
            <button onClick={onClearSelectedText} className="text-sage-dark hover:text-sage-darker">
              <X size={14} />
            </button>
          </div>
        )}

        <form onSubmit={onSubmit} className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={handleInputFocus}
            placeholder={selectedText ? 'Ask about selected text...' : 'Ask for feedback...'}
            className="flex-1 px-4 py-2 border border-warm-200 bg-white rounded-lg focus:outline-none focus:ring-2 focus:ring-sage-light focus:border-transparent text-ink placeholder:text-ink-placeholder"
            disabled={!apiConfigured}
          />
          <button
            type="submit"
            disabled={!input.trim() || !apiConfigured || isLoading}
            className="px-4 py-2 bg-sage text-cream-50 rounded-lg hover:bg-sage-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Send message"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}

export default ChatSidebar;
