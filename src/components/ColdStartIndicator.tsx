import { useState, useEffect } from 'react';

// Toggle this to enable/disable cold start indicator
const COLD_START_ENABLED = true;

// Expected cold start duration in seconds
const EXPECTED_COLD_START_SECONDS = 60;

interface ColdStartIndicatorProps {
  isLoading: boolean;
  onComplete?: () => void;
}

export function ColdStartIndicator({ isLoading, onComplete }: ColdStartIndicatorProps) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [showIndicator, setShowIndicator] = useState(false);

  // Only show after 3 seconds of loading (to avoid showing for warm requests)
  const SHOW_THRESHOLD_SECONDS = 3;

  useEffect(() => {
    if (!COLD_START_ENABLED) return;

    let interval: NodeJS.Timeout | null = null;

    if (isLoading) {
      setElapsedSeconds(0);
      interval = setInterval(() => {
        setElapsedSeconds((prev) => {
          const next = prev + 1;
          if (next >= SHOW_THRESHOLD_SECONDS) {
            setShowIndicator(true);
          }
          return next;
        });
      }, 1000);
    } else {
      setShowIndicator(false);
      setElapsedSeconds(0);
      onComplete?.();
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isLoading, onComplete]);

  if (!COLD_START_ENABLED || !showIndicator || !isLoading) {
    return null;
  }

  const progress = Math.min((elapsedSeconds / EXPECTED_COLD_START_SECONDS) * 100, 95);
  const remainingEstimate = Math.max(EXPECTED_COLD_START_SECONDS - elapsedSeconds, 5);

  return (
    <div className="cold-start-indicator" style={{
      padding: '16px',
      margin: '12px 0',
      backgroundColor: '#fff3cd',
      border: '1px solid #ffc107',
      borderRadius: '8px',
      fontSize: '14px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
        <div className="spinner" style={{
          width: '20px',
          height: '20px',
          border: '3px solid #ffc107',
          borderTop: '3px solid transparent',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
        }} />
        <strong>🚀 Model Starting Up...</strong>
      </div>
      
      <p style={{ margin: '8px 0', color: '#856404' }}>
        The AI model is waking up from a cold start. This typically takes 30-60 seconds on first request.
      </p>
      
      <div style={{
        backgroundColor: '#e0e0e0',
        borderRadius: '4px',
        height: '8px',
        overflow: 'hidden',
        marginBottom: '8px',
      }}>
        <div style={{
          backgroundColor: '#ffc107',
          height: '100%',
          width: `${progress}%`,
          transition: 'width 1s linear',
        }} />
      </div>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#856404' }}>
        <span>Elapsed: {elapsedSeconds}s</span>
        <span>Est. remaining: ~{remainingEstimate}s</span>
      </div>

      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

export default ColdStartIndicator;
