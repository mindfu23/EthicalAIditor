import React, { useState, useEffect, useCallback } from 'react';
import {
  Play,
  Pause,
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  ChevronDown,
  ChevronRight,
  FileText,
  X,
} from 'lucide-react';
import {
  listJobs,
  createAuditJob,
  cancelJob,
  getJobStatus,
  AuditTypes,
  JobStatus,
} from '../services/audit';

const AUDIT_TYPE_INFO = {
  [AuditTypes.FULL_AUDIT]: {
    label: 'Full Audit',
    description: 'Complete manuscript review',
  },
  [AuditTypes.STYLE_CHECK]: {
    label: 'Style Check',
    description: 'Check against style guides',
  },
  [AuditTypes.CONSISTENCY]: {
    label: 'Consistency',
    description: 'Find inconsistencies',
  },
  [AuditTypes.GRAMMAR]: {
    label: 'Grammar',
    description: 'Grammar and spelling check',
  },
};

const STATUS_INFO = {
  [JobStatus.PENDING]: { icon: Clock, color: 'text-gray-500', label: 'Pending' },
  [JobStatus.PROCESSING]: { icon: Loader2, color: 'text-blue-500', label: 'Processing', spin: true },
  [JobStatus.COMPLETED]: { icon: CheckCircle, color: 'text-green-500', label: 'Completed' },
  [JobStatus.FAILED]: { icon: XCircle, color: 'text-red-500', label: 'Failed' },
  [JobStatus.CANCELLED]: { icon: XCircle, color: 'text-gray-400', label: 'Cancelled' },
};

/**
 * AuditJobsPanel Component
 * 
 * Panel for managing and viewing audit jobs
 */
export function AuditJobsPanel({ 
  isOpen, 
  onClose, 
  manuscriptId,
  manuscriptContent,
  onApplyResults,
}) {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expandedJob, setExpandedJob] = useState(null);
  const [selectedType, setSelectedType] = useState(AuditTypes.FULL_AUDIT);
  const [creatingJob, setCreatingJob] = useState(false);

  // Load jobs
  const loadJobs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listJobs();
      setJobs(result.jobs || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Poll for job updates
  useEffect(() => {
    if (!isOpen) return;
    
    loadJobs();
    
    // Poll every 5 seconds for active jobs
    const interval = setInterval(() => {
      const hasActiveJobs = jobs.some(
        j => j.status === JobStatus.PENDING || j.status === JobStatus.PROCESSING
      );
      if (hasActiveJobs) {
        loadJobs();
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [isOpen, loadJobs, jobs]);

  // Start new audit
  const handleStartAudit = async () => {
    if (!manuscriptId) {
      setError('No manuscript loaded');
      return;
    }

    setCreatingJob(true);
    setError(null);
    try {
      await createAuditJob(manuscriptId, selectedType, manuscriptContent);
      await loadJobs();
    } catch (e) {
      setError(e.message);
    } finally {
      setCreatingJob(false);
    }
  };

  // Cancel job
  const handleCancelJob = async (jobId) => {
    try {
      await cancelJob(jobId);
      await loadJobs();
    } catch (e) {
      setError(e.message);
    }
  };

  // Get job details
  const handleExpandJob = async (jobId) => {
    if (expandedJob === jobId) {
      setExpandedJob(null);
      return;
    }
    
    setExpandedJob(jobId);
    // Refresh job details
    try {
      const job = await getJobStatus(jobId);
      setJobs(prev => prev.map(j => j.id === jobId ? job : j));
    } catch (e) {
      console.error('Failed to get job details:', e);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">Audit Jobs</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        {/* New audit section */}
        <div className="p-4 bg-gray-50 border-b">
          <h3 className="text-sm font-medium mb-3">Start New Audit</h3>
          <div className="flex gap-3">
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="flex-1 px-3 py-2 border rounded"
            >
              {Object.entries(AUDIT_TYPE_INFO).map(([type, info]) => (
                <option key={type} value={type}>
                  {info.label} - {info.description}
                </option>
              ))}
            </select>
            <button
              onClick={handleStartAudit}
              disabled={creatingJob || !manuscriptId}
              className="px-4 py-2 bg-sage text-white rounded hover:bg-sage-dark disabled:opacity-50 flex items-center gap-2"
            >
              {creatingJob ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Play size={16} />
              )}
              Start Audit
            </button>
          </div>
          {!manuscriptId && (
            <p className="text-xs text-amber-600 mt-2">
              Load a manuscript first to start an audit
            </p>
          )}
        </div>

        {/* Error message */}
        {error && (
          <div className="mx-4 mt-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
            {error}
          </div>
        )}

        {/* Jobs list */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading && jobs.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="animate-spin text-gray-400" size={24} />
            </div>
          ) : jobs.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <FileText size={32} className="mx-auto mb-2 opacity-50" />
              <p>No audit jobs yet</p>
              <p className="text-sm">Start an audit to analyze your manuscript</p>
            </div>
          ) : (
            <div className="space-y-3">
              {jobs.map((job) => (
                <JobCard
                  key={job.id}
                  job={job}
                  isExpanded={expandedJob === job.id}
                  onToggle={() => handleExpandJob(job.id)}
                  onCancel={() => handleCancelJob(job.id)}
                  onApplyResults={onApplyResults}
                />
              ))}
            </div>
          )}
        </div>

        {/* Refresh button */}
        <div className="p-3 border-t">
          <button
            onClick={loadJobs}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 text-sm text-gray-600 hover:text-gray-800"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Individual job card
 */
function JobCard({ job, isExpanded, onToggle, onCancel, onApplyResults }) {
  const statusInfo = STATUS_INFO[job.status] || STATUS_INFO[JobStatus.PENDING];
  const StatusIcon = statusInfo.icon;
  const typeInfo = AUDIT_TYPE_INFO[job.job_type] || { label: job.job_type };

  const canCancel = job.status === JobStatus.PENDING || job.status === JobStatus.PROCESSING;
  const hasResults = job.status === JobStatus.COMPLETED && job.results;

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Job header */}
      <div
        className="flex items-center gap-3 p-3 cursor-pointer hover:bg-gray-50"
        onClick={onToggle}
      >
        <StatusIcon 
          size={18} 
          className={`${statusInfo.color} ${statusInfo.spin ? 'animate-spin' : ''}`} 
        />
        
        <div className="flex-1">
          <div className="font-medium text-sm">{typeInfo.label}</div>
          <div className="text-xs text-gray-500">
            {new Date(job.created_at).toLocaleString()}
          </div>
        </div>

        {/* Progress */}
        {job.status === JobStatus.PROCESSING && (
          <div className="text-sm text-gray-500">
            {job.progress || 0}%
          </div>
        )}

        {/* Cancel button */}
        {canCancel && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onCancel();
            }}
            className="p-1 text-gray-400 hover:text-red-500"
          >
            <Pause size={16} />
          </button>
        )}

        {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
      </div>

      {/* Progress bar */}
      {job.status === JobStatus.PROCESSING && (
        <div className="h-1 bg-gray-100">
          <div
            className="h-full bg-blue-500 transition-all duration-500"
            style={{ width: `${job.progress || 0}%` }}
          />
        </div>
      )}

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t bg-gray-50 p-4">
          <div className="grid grid-cols-2 gap-4 text-sm mb-4">
            <div>
              <div className="text-xs text-gray-500 uppercase">Status</div>
              <div className={statusInfo.color}>{statusInfo.label}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 uppercase">Progress</div>
              <div>
                {job.processed_chunks || 0} / {job.total_chunks || 0} chunks
              </div>
            </div>
            {job.completed_at && (
              <div>
                <div className="text-xs text-gray-500 uppercase">Completed</div>
                <div>{new Date(job.completed_at).toLocaleString()}</div>
              </div>
            )}
            {job.error_message && (
              <div className="col-span-2">
                <div className="text-xs text-gray-500 uppercase">Error</div>
                <div className="text-red-600">{job.error_message}</div>
              </div>
            )}
          </div>

          {/* Results */}
          {hasResults && (
            <div className="border-t pt-4">
              <h4 className="font-medium text-sm mb-2">Results</h4>
              {Array.isArray(job.results) ? (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {job.results.map((finding, i) => (
                    <div
                      key={i}
                      className="text-sm p-2 bg-white rounded border"
                    >
                      <div className="font-medium">{finding.type || 'Finding'}</div>
                      <div className="text-gray-600">{finding.message}</div>
                      {finding.position && (
                        <div className="text-xs text-gray-400">
                          Position: {finding.position.start}-{finding.position.end}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <pre className="text-xs bg-white p-2 rounded border overflow-auto max-h-48">
                  {JSON.stringify(job.results, null, 2)}
                </pre>
              )}
              
              {onApplyResults && (
                <button
                  onClick={() => onApplyResults(job.results)}
                  className="mt-3 px-4 py-2 bg-sage text-white rounded text-sm hover:bg-sage-dark"
                >
                  Apply Suggestions
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default AuditJobsPanel;
