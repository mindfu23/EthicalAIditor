import React from 'react';
import { Upload, Download, FolderOpen, MessageSquare, Edit2, Check, Loader2 } from 'lucide-react';

export function EditorToolbar({
  fileName,
  wordCount,
  isEditingTitle,
  editingTitleValue,
  onEditingTitleChange,
  onStartEditingTitle,
  onSaveTitle,
  onCancelEditingTitle,
  onUploadClick,
  onDownloadClick,
  onRecentDocsClick,
  isChatOpen,
  onToggleChat,
  isParsing,
  hasManuscript,
  titleInputRef,
}) {
  return (
    <div className="border-b border-warm-100 bg-cream-200 px-6 py-3 flex items-center gap-2">
      {/* Editable Title */}
      {isEditingTitle ? (
        <div className="flex items-center gap-2">
          <input
            ref={titleInputRef}
            type="text"
            value={editingTitleValue}
            onChange={(e) => onEditingTitleChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSaveTitle();
              if (e.key === 'Escape') onCancelEditingTitle();
            }}
            onBlur={onSaveTitle}
            className="font-medium text-ink border border-sage-light rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-sage-light focus:ring-offset-2 bg-cream-50"
          />
          <button onClick={onSaveTitle} className="text-sage-dark hover:text-sage-darker">
            <Check size={16} />
          </button>
        </div>
      ) : (
        <div
          className="flex items-center gap-2 cursor-pointer group"
          onClick={onStartEditingTitle}
        >
          <h2 className="font-medium text-ink truncate">
            {fileName || 'Untitled Manuscript'}
          </h2>
          <Edit2
            size={14}
            className="text-ink-muted opacity-0 group-hover:opacity-100 transition-opacity"
          />
        </div>
      )}

      {/* Word Count */}
      {hasManuscript && wordCount > 0 && (
        <span className="text-xs text-ink-muted ml-2">
          {wordCount.toLocaleString()} words
        </span>
      )}

      <div className="flex-1" />

      {/* Recent Documents Button */}
      <button
        onClick={onRecentDocsClick}
        className="flex items-center gap-2 px-4 py-2 text-ink-light hover:bg-cream-300 rounded-lg transition-colors"
        title="Recent Documents"
      >
        <FolderOpen className="w-4 h-4" />
        <span className="hidden sm:inline">Recent</span>
      </button>

      {/* Upload Button */}
      <button
        onClick={onUploadClick}
        className="flex items-center gap-2 px-4 py-2 text-ink-light hover:bg-cream-300 rounded-lg transition-colors"
        disabled={isParsing}
      >
        {isParsing ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Upload className="w-4 h-4" />
        )}
        <span className="hidden sm:inline">Upload</span>
      </button>

      {/* Download Button */}
      {hasManuscript && (
        <button
          onClick={onDownloadClick}
          className="flex items-center gap-2 px-4 py-2 text-ink-light hover:bg-cream-300 rounded-lg transition-colors"
          title="Download manuscript"
        >
          <Download className="w-4 h-4" />
          <span className="hidden sm:inline">Download</span>
        </button>
      )}

      {/* Toggle Chat Button */}
      <button
        onClick={onToggleChat}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
          isChatOpen
            ? 'bg-sage-light text-sage-darker hover:bg-sage'
            : 'text-ink-light hover:bg-cream-300'
        }`}
      >
        <MessageSquare className="w-4 h-4" />
        <span className="hidden sm:inline">{isChatOpen ? 'Hide' : 'Show'} AI Assistant</span>
      </button>
    </div>
  );
}

export default EditorToolbar;
