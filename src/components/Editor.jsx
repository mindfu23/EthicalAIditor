import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, Loader2 } from 'lucide-react';
import { getUsageStats, chatWithLLM, getEstimatedResponseTime } from '../services/huggingface';
import { useAuth } from '../lib/auth';
import { ModelSelector, useSelectedModel } from './ModelSelector';
import { saveManuscript, loadManuscript, getAllManuscripts, deleteManuscript } from '../lib/storage/manuscript-store';
import { initWarmup, subscribeToStatus, ServiceStatus } from '../services/warmup';
import { parseFile, SUPPORTED_EXTENSIONS, getWordCount } from '../lib/file-parser';
import { Header } from './Header';
import { EditorToolbar } from './EditorToolbar';
import { ChatSidebar } from './ChatSidebar';

const API_BASE = import.meta.env.VITE_CLOUDFLARE_WORKER_URL || '';

export default function Editor() {
  const { user, isAuthenticated, openAuth, logout } = useAuth();
  
  const [manuscript, setManuscript] = useState('');
  const [fileName, setFileName] = useState('');
  const [manuscriptId, setManuscriptId] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [usageStats, setUsageStats] = useState(null);
  const [apiKey, setApiKey] = useState(localStorage.getItem('hf_api_key') || '');
  const [chatError, setChatError] = useState(null);
  
  // Chat state (managed locally instead of useChat to avoid errors when API not configured)
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  // Model selection
  const [selectedModel, setSelectedModel] = useSelectedModel();
  
  // Service status for warmup indicator
  const [serviceStatus, setServiceStatus] = useState(ServiceStatus.UNKNOWN);
  
  // Elapsed time tracking for loading indicator
  const [elapsedTime, setElapsedTime] = useState(0);
  const [estimatedTime, setEstimatedTime] = useState(45000);
  
  // Recent documents panel
  const [showRecentDocs, setShowRecentDocs] = useState(false);
  const [recentDocs, setRecentDocs] = useState([]);
  
  // Title editing
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editingTitleValue, setEditingTitleValue] = useState('');
  
  // File parsing status
  const [parseError, setParseError] = useState(null);
  const [isParsing, setIsParsing] = useState(false);

  // Text selection for focused AI review
  const [selectedText, setSelectedText] = useState('');

  // Chat sidebar visibility
  const [isChatOpen, setIsChatOpen] = useState(true);
  
  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);
  const titleInputRef = useRef(null);

  // Generate unique ID for messages
  const generateId = () => `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Initialize warmup on mount and subscribe to status
  useEffect(() => {
    initWarmup();
    const unsubscribe = subscribeToStatus(setServiceStatus);
    return unsubscribe;
  }, []);

  // Load recent documents on mount
  useEffect(() => {
    getAllManuscripts().then(setRecentDocs).catch(console.error);
  }, []);

  // Focus title input when editing
  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [isEditingTitle]);

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

  // Refresh recent docs list after save
  const refreshRecentDocs = useCallback(() => {
    getAllManuscripts().then(setRecentDocs).catch(console.error);
  }, []);

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    setParseError(null);
    setIsParsing(true);
    
    try {
      const { text, type } = await parseFile(file);
      const wordCount = getWordCount(text);
      
      setFileName(file.name);
      setManuscriptId(null); // New manuscript
      setManuscript(text);
      
      // Add a system message about the upload
      setMessages(prev => [...prev, { 
        id: generateId(),
        role: 'assistant', 
        content: `File "${file.name}" uploaded (${wordCount.toLocaleString()} words, ${type} format). I can now see your manuscript and help you with it. What would you like to discuss?` 
      }]);
      
      // Refresh recent docs after a moment (after auto-save triggers)
      setTimeout(refreshRecentDocs, 3000);
    } catch (error) {
      setParseError(error.message);
      console.error('File parse error:', error);
    } finally {
      setIsParsing(false);
    }
  };

  // Handle loading a recent document
  const handleLoadDocument = async (doc) => {
    setManuscript(doc.content);
    setFileName(doc.title);
    setManuscriptId(doc.id);
    setMessages(doc.messages || []);
    setShowRecentDocs(false);
  };

  // Handle deleting a document
  const handleDeleteDocument = async (docId, e) => {
    e.stopPropagation();
    if (confirm('Delete this manuscript? This cannot be undone.')) {
      await deleteManuscript(docId);
      refreshRecentDocs();
      if (manuscriptId === docId) {
        setManuscript('');
        setFileName('');
        setManuscriptId(null);
        setMessages([]);
      }
    }
  };

  // Handle downloading the manuscript
  const handleDownload = () => {
    const blob = new Blob([manuscript], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName || 'manuscript.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Handle title editing
  const startEditingTitle = () => {
    setEditingTitleValue(fileName || 'Untitled Manuscript');
    setIsEditingTitle(true);
  };

  const saveTitle = () => {
    const newTitle = editingTitleValue.trim() || 'Untitled Manuscript';
    setFileName(newTitle);
    setIsEditingTitle(false);
  };

  const cancelEditingTitle = () => {
    setIsEditingTitle(false);
  };

  // Handle text selection in the textarea
  const handleTextSelection = () => {
    const textarea = document.querySelector('textarea');
    if (textarea) {
      const selected = textarea.value.substring(
        textarea.selectionStart,
        textarea.selectionEnd
      );
      setSelectedText(selected);
    }
  };

  const handleSaveApiKey = () => {
    localStorage.setItem('hf_api_key', apiKey);
    setShowSettings(false);
  };

  // Handle sending messages
  const onSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;
    
    const apiConfigured = API_BASE || apiKey;
    if (!apiConfigured) {
      setChatError('Please configure your HuggingFace API Key in settings, or wait for the API to be set up.');
      return;
    }

    setChatError(null);
    const userMessage = { id: generateId(), role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setElapsedTime(0);
    setEstimatedTime(getEstimatedResponseTime());

    try {
      // Use selected text if available, otherwise use full manuscript
      const contextToSend = selectedText.trim() || manuscript;
      
      const response = await chatWithLLM(
        [...messages, userMessage].map(m => ({ role: m.role, content: m.content })),
        contextToSend,
        selectedModel,
        (elapsed, estimated) => {
          setElapsedTime(elapsed);
          setEstimatedTime(estimated);
        }
      );
      
      // Clear selected text after using it
      setSelectedText('');
      
      setMessages(prev => [...prev, { 
        id: generateId(), 
        role: 'assistant', 
        content: response 
      }]);
      
      // Refresh usage stats after call
      if (isAuthenticated) {
        getUsageStats().then(stats => {
          if (stats) setUsageStats(stats);
        });
      }
    } catch (error) {
      console.error('Chat error:', error);
      setChatError(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const apiConfigured = API_BASE || apiKey;

  return (
    <div className="flex flex-col h-screen bg-cream-50 overflow-hidden">
      {/* Header */}
      <Header onSettingsClick={() => setShowSettings(!showSettings)} />

      {/* Toolbar */}
      <EditorToolbar
        fileName={fileName}
        wordCount={getWordCount(manuscript)}
        isEditingTitle={isEditingTitle}
        editingTitleValue={editingTitleValue}
        onEditingTitleChange={setEditingTitleValue}
        onStartEditingTitle={startEditingTitle}
        onSaveTitle={saveTitle}
        onCancelEditingTitle={cancelEditingTitle}
        onUploadClick={() => fileInputRef.current.click()}
        onDownloadClick={handleDownload}
        onRecentDocsClick={() => setShowRecentDocs(!showRecentDocs)}
        isChatOpen={isChatOpen}
        onToggleChat={() => setIsChatOpen(!isChatOpen)}
        isParsing={isParsing}
        hasManuscript={!!manuscript}
        titleInputRef={titleInputRef}
      />

      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        className="hidden"
        accept={SUPPORTED_EXTENSIONS}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Main Content Area */}
        <div className="flex-1 flex flex-col bg-cream-50">
          {/* Parse Error Message */}
          {parseError && (
            <div className="bg-destructive/10 border-b border-destructive/30 px-6 py-2 flex items-center justify-between">
              <span className="text-sm text-destructive">{parseError}</span>
              <button onClick={() => setParseError(null)} className="text-destructive hover:opacity-70">
                <X size={14} />
              </button>
            </div>
          )}

          {/* Recent Documents Panel */}
          {showRecentDocs && (
            <div className="bg-cream-50 border-b border-warm-100 max-h-64 overflow-y-auto">
              <div className="p-4">
                <h3 className="text-xs font-medium text-ink-muted uppercase mb-3 px-2">
                  Recent Documents
                </h3>
                {recentDocs.length === 0 ? (
                  <p className="text-sm text-ink-muted px-2 py-4 text-center">
                    No saved documents yet
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {recentDocs.map((doc) => (
                      <li
                        key={doc.id}
                        onClick={() => handleLoadDocument(doc)}
                        className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer hover:bg-cream-200 ${
                          manuscriptId === doc.id
                            ? 'bg-sage-light/20 border border-sage-light'
                            : ''
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-ink truncate">
                            {doc.title || 'Untitled'}
                          </p>
                          <p className="text-xs text-ink-muted">
                            {new Date(doc.updatedAt).toLocaleDateString()} ·{' '}
                            {Math.round(doc.size / 1000)}k chars
                          </p>
                        </div>
                        <button
                          onClick={(e) => handleDeleteDocument(doc.id, e)}
                          className="ml-2 text-ink-muted hover:text-destructive p-1"
                          title="Delete"
                        >
                          <X size={14} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          {/* Manuscript Textarea */}
          <textarea
            value={manuscript}
            onChange={(e) => setManuscript(e.target.value)}
            onSelect={handleTextSelection}
            className="flex-1 p-8 resize-none focus:outline-none font-serif text-lg leading-relaxed text-ink bg-cream-50"
            placeholder="Paste your text here or upload a file (.txt, .md, .docx, .pdf)..."
          />
        </div>

        {/* Chat Sidebar */}
        {isChatOpen && (
          <ChatSidebar
            messages={messages}
            input={input}
            onInputChange={setInput}
            onSubmit={onSubmit}
            isLoading={isLoading}
            chatError={chatError}
            onClearError={() => setChatError(null)}
            serviceStatus={serviceStatus}
            usageStats={usageStats}
            elapsedTime={elapsedTime}
            estimatedTime={estimatedTime}
            selectedText={selectedText}
            onClearSelectedText={() => setSelectedText('')}
            apiConfigured={apiConfigured}
            isAuthenticated={isAuthenticated}
            onOpenAuth={openAuth}
          />
        )}
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div className="absolute inset-0 bg-ink/50 flex items-center justify-center z-50">
          <div className="bg-cream-50 rounded-lg p-6 w-[480px] max-h-[80vh] overflow-y-auto shadow-xl border border-warm-100">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-ink">Settings</h3>
              <button
                onClick={() => setShowSettings(false)}
                className="text-ink-muted hover:text-ink"
              >
                <X size={20} />
              </button>
            </div>

            {/* Model Selection */}
            <div className="mb-6">
              <ModelSelector value={selectedModel} onChange={setSelectedModel} />
            </div>

            {/* API Key (fallback) */}
            <div className="mb-6 pt-4 border-t border-warm-100">
              <label className="block text-sm font-medium text-ink mb-1">
                HuggingFace API Key (Optional)
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="w-full border border-warm-200 rounded-lg p-2 bg-white focus:outline-none focus:ring-2 focus:ring-sage-light"
                placeholder="hf_..."
              />
              <p className="text-xs text-ink-muted mt-1">
                Only needed if the server API isn't configured. Stored locally in your browser.
              </p>
            </div>

            {/* Usage Info */}
            {isAuthenticated && usageStats && (
              <div className="mb-6 p-3 bg-cream-100 rounded-lg border border-warm-100">
                <p className="text-sm font-medium text-ink mb-1">Today's Usage</p>
                <p className="text-2xl font-medium text-sage">
                  {usageStats.today?.calls || 0} / {usageStats.today?.limit || 30}
                </p>
                <p className="text-xs text-ink-muted">
                  Tier: {usageStats.tier || 'free'} · Resets daily at midnight UTC
                </p>
              </div>
            )}

            {!isAuthenticated && (
              <div className="mb-6 p-3 bg-sage-light/20 rounded-lg border border-sage-light">
                <p className="text-sm text-sage-darker">
                  <button
                    onClick={() => {
                      setShowSettings(false);
                      openAuth('signup');
                    }}
                    className="font-medium underline"
                  >
                    Sign up
                  </button>{' '}
                  to get 30 requests/day (vs 5 for anonymous users).
                </p>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowSettings(false)}
                className="px-4 py-2 text-ink-light hover:bg-cream-200 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveApiKey}
                className="px-4 py-2 bg-sage text-cream-50 rounded-lg hover:bg-sage-dark"
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
