import React, { useState, useCallback } from 'react';
import { 
  Check, 
  X, 
  AlertCircle, 
  AlertTriangle, 
  Lightbulb, 
  ChevronDown, 
  ChevronUp,
  CheckCircle,
  RefreshCw
} from 'lucide-react';

/**
 * EditPreview Component
 * 
 * Displays structured edits with inline diff view and allows
 * accepting/rejecting individual changes.
 */
export function EditPreview({ 
  changes, 
  onAccept, 
  onReject, 
  onAcceptAll, 
  onRejectAll,
  isLoading = false,
  onRefresh = null,
}) {
  const [expandedEdit, setExpandedEdit] = useState(null);
  const [accepted, setAccepted] = useState(new Set());
  const [rejected, setRejected] = useState(new Set());

  const handleAccept = useCallback((editId) => {
    setAccepted(prev => new Set([...prev, editId]));
    setRejected(prev => {
      const next = new Set(prev);
      next.delete(editId);
      return next;
    });
    onAccept?.(editId);
  }, [onAccept]);

  const handleReject = useCallback((editId) => {
    setRejected(prev => new Set([...prev, editId]));
    setAccepted(prev => {
      const next = new Set(prev);
      next.delete(editId);
      return next;
    });
    onReject?.(editId);
  }, [onReject]);

  const handleAcceptAll = useCallback(() => {
    const allIds = changes.map(c => c.id);
    setAccepted(new Set(allIds));
    setRejected(new Set());
    onAcceptAll?.();
  }, [changes, onAcceptAll]);

  const handleRejectAll = useCallback(() => {
    const allIds = changes.map(c => c.id);
    setRejected(new Set(allIds));
    setAccepted(new Set());
    onRejectAll?.();
  }, [changes, onRejectAll]);

  const getSeverityIcon = (severity) => {
    switch (severity) {
      case 'error':
        return <AlertCircle className="text-red-500" size={16} />;
      case 'warning':
        return <AlertTriangle className="text-amber-500" size={16} />;
      default:
        return <Lightbulb className="text-blue-500" size={16} />;
    }
  };

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'error':
        return 'border-red-200 bg-red-50';
      case 'warning':
        return 'border-amber-200 bg-amber-50';
      default:
        return 'border-blue-200 bg-blue-50';
    }
  };

  if (!changes || changes.length === 0) {
    return (
      <div className="p-4 text-center text-gray-500">
        <CheckCircle className="mx-auto mb-2 text-green-500" size={24} />
        <p>No edits suggested. Your text looks good!</p>
      </div>
    );
  }

  const pendingCount = changes.length - accepted.size - rejected.size;

  return (
    <div className="edit-preview">
      {/* Header with stats and bulk actions */}
      <div className="flex items-center justify-between p-3 bg-gray-50 border-b">
        <div className="flex items-center gap-4 text-sm">
          <span className="font-medium">{changes.length} suggestions</span>
          {accepted.size > 0 && (
            <span className="text-green-600">{accepted.size} accepted</span>
          )}
          {rejected.size > 0 && (
            <span className="text-red-600">{rejected.size} rejected</span>
          )}
          {pendingCount > 0 && (
            <span className="text-gray-500">{pendingCount} pending</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={isLoading}
              className="px-3 py-1 text-sm bg-white border rounded hover:bg-gray-50 disabled:opacity-50 flex items-center gap-1"
            >
              <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
              Refresh
            </button>
          )}
          <button
            onClick={handleAcceptAll}
            disabled={pendingCount === 0}
            className="px-3 py-1 text-sm bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50"
          >
            Accept All
          </button>
          <button
            onClick={handleRejectAll}
            disabled={pendingCount === 0}
            className="px-3 py-1 text-sm bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50"
          >
            Reject All
          </button>
        </div>
      </div>

      {/* Edit list */}
      <div className="max-h-96 overflow-y-auto">
        {changes.map((change) => {
          const isAccepted = accepted.has(change.id);
          const isRejected = rejected.has(change.id);
          const isExpanded = expandedEdit === change.id;

          return (
            <div
              key={change.id}
              className={`border-b transition-colors ${
                isAccepted ? 'bg-green-50' : isRejected ? 'bg-red-50 opacity-50' : ''
              }`}
            >
              {/* Edit header */}
              <div
                className="flex items-center gap-3 p-3 cursor-pointer hover:bg-gray-50"
                onClick={() => setExpandedEdit(isExpanded ? null : change.id)}
              >
                {getSeverityIcon(change.severity)}
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium uppercase text-gray-500">
                      {change.category}
                    </span>
                    {isAccepted && (
                      <span className="text-xs text-green-600 font-medium">Accepted</span>
                    )}
                    {isRejected && (
                      <span className="text-xs text-red-600 font-medium">Rejected</span>
                    )}
                  </div>
                  <p className="text-sm truncate">{change.reason}</p>
                </div>

                {/* Quick preview */}
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-red-500 line-through truncate max-w-32">
                    {change.original?.substring(0, 30)}...
                  </span>
                  <span className="text-gray-400">→</span>
                  <span className="text-green-600 truncate max-w-32">
                    {change.replacement?.substring(0, 30)}...
                  </span>
                </div>

                {/* Expand/collapse */}
                {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </div>

              {/* Expanded details */}
              {isExpanded && (
                <div className={`p-4 border-t ${getSeverityColor(change.severity)}`}>
                  <div className="space-y-3">
                    {/* Original text */}
                    <div>
                      <label className="text-xs font-medium text-gray-500 uppercase">
                        Original (chars {change.start}-{change.end})
                      </label>
                      <p className="mt-1 p-2 bg-white border rounded text-sm text-red-700 line-through">
                        {change.original}
                      </p>
                    </div>

                    {/* Replacement text */}
                    <div>
                      <label className="text-xs font-medium text-gray-500 uppercase">
                        Suggestion
                      </label>
                      <p className="mt-1 p-2 bg-white border rounded text-sm text-green-700">
                        {change.replacement}
                      </p>
                    </div>

                    {/* Reason */}
                    <div>
                      <label className="text-xs font-medium text-gray-500 uppercase">
                        Reason
                      </label>
                      <p className="mt-1 text-sm text-gray-600">{change.reason}</p>
                    </div>

                    {/* Actions */}
                    {!isAccepted && !isRejected && (
                      <div className="flex gap-2 pt-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAccept(change.id);
                          }}
                          className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
                        >
                          <Check size={16} />
                          Accept
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleReject(change.id);
                          }}
                          className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
                        >
                          <X size={16} />
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * InlineEditPreview Component
 * 
 * Shows edits inline within text with highlights
 */
export function InlineEditPreview({ segments }) {
  if (!segments || segments.length === 0) {
    return <p className="text-gray-500">No text to preview</p>;
  }

  return (
    <div className="inline-edit-preview prose prose-sm max-w-none">
      {segments.map((segment, i) => {
        switch (segment.type) {
          case 'deletion':
            return (
              <span
                key={i}
                className="bg-red-100 text-red-700 line-through"
                title={segment.reason}
              >
                {segment.text}
              </span>
            );
          case 'insertion':
            return (
              <span
                key={i}
                className="bg-green-100 text-green-700"
                title={segment.reason}
              >
                {segment.text}
              </span>
            );
          default:
            return <span key={i}>{segment.text}</span>;
        }
      })}
    </div>
  );
}

export default EditPreview;
