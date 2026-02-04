import React from 'react';
import { AlertCircle, XCircle, RefreshCw, X } from 'lucide-react';

export type ErrorSeverity = 'error' | 'warning';
export type ErrorType = 'model' | 'audio' | 'network' | 'validation' | 'unknown';

interface ErrorDisplayProps {
  message: string;
  severity?: ErrorSeverity;
  type?: ErrorType;
  onRetry?: () => void;
  onDismiss?: () => void;
  canRetry?: boolean;
}

const ErrorDisplay: React.FC<ErrorDisplayProps> = ({
  message,
  severity = 'error',
  type = 'unknown',
  onRetry,
  onDismiss,
  canRetry = true,
}) => {
  const getIcon = () => {
    if (severity === 'warning') {
      return <AlertCircle className="text-yellow-400" size={24} />;
    }
    return <XCircle className="text-red-400" size={24} />;
  };

  const getStyles = () => {
    if (severity === 'warning') {
      return {
        container: 'bg-yellow-900/20 border-yellow-600',
        text: 'text-yellow-100',
        button: 'bg-yellow-600 hover:bg-yellow-500',
      };
    }
    return {
      container: 'bg-red-900/20 border-red-600',
      text: 'text-red-100',
      button: 'bg-red-600 hover:bg-red-500',
    };
  };

  const styles = getStyles();

  const getHelpText = () => {
    switch (type) {
      case 'model':
        return 'Try refreshing the page or clearing your browser cache.';
      case 'audio':
        return 'Make sure the file is a valid audio format (MP3, WAV, M4A).';
      case 'network':
        return 'Check your internet connection and try again.';
      case 'validation':
        return 'Please select a different file.';
      default:
        return null;
    }
  };

  const helpText = getHelpText();

  return (
    <div
      className={`
        border-2 rounded-lg p-4
        ${styles.container}
        transition-all duration-200
      `}
      role="alert"
      aria-live="assertive"
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">
          {getIcon()}
        </div>
        
        <div className="flex-1 min-w-0">
          <div className={`font-semibold ${styles.text} mb-1`}>
            {severity === 'warning' ? 'Warning' : 'Error'}
          </div>
          <div className="text-gray-300 text-sm mb-2">
            {message}
          </div>
          {helpText && (
            <div className="text-gray-400 text-xs mb-3">
              {helpText}
            </div>
          )}
          
          {(canRetry && onRetry) && (
            <button
              onClick={onRetry}
              className={`
                ${styles.button}
                text-white px-4 py-2 rounded-md text-sm font-medium
                transition-colors flex items-center gap-2
                focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900
              `}
            >
              <RefreshCw size={16} />
              Try Again
            </button>
          )}
        </div>

        {onDismiss && (
          <button
            onClick={onDismiss}
            className="
              flex-shrink-0 text-gray-400 hover:text-gray-300
              transition-colors p-1 rounded
              focus:outline-none focus:ring-2 focus:ring-gray-500
            "
            aria-label="Dismiss error"
          >
            <X size={20} />
          </button>
        )}
      </div>
    </div>
  );
};

export default ErrorDisplay;