import React, { useEffect, useState, useCallback } from 'react';
import { CheckCircle, AlertCircle, XCircle, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastProps {
  message: string;
  type?: ToastType;
  duration?: number;
  onClose?: () => void;
}

const Toast: React.FC<ToastProps> = ({ 
  message, 
  type = 'info', 
  duration = 5000,
  onClose 
}) => {
  const [isVisible, setIsVisible] = useState(true);
  const [isExiting, setIsExiting] = useState(false);

  const handleClose = useCallback(() => {
    setIsExiting(true);
    setTimeout(() => {
      setIsVisible(false);
      if (onClose) {
        onClose();
      }
    }, 300);
  }, [onClose]);

  useEffect(() => {
    const timer = setTimeout(() => {
      handleClose();
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, handleClose]); // Include handleClose - it's stable due to useCallback

  if (!isVisible) return null;

  const getIcon = () => {
    switch (type) {
      case 'success':
        return <CheckCircle className="text-green-400" size={20} />;
      case 'error':
        return <XCircle className="text-red-400" size={20} />;
      case 'warning':
        return <AlertCircle className="text-yellow-400" size={20} />;
      default:
        return <AlertCircle className="text-blue-400" size={20} />;
    }
  };

  const getStyles = () => {
    switch (type) {
      case 'success':
        return 'bg-green-900/90 border-green-600 text-green-100';
      case 'error':
        return 'bg-red-900/90 border-red-600 text-red-100';
      case 'warning':
        return 'bg-yellow-900/90 border-yellow-600 text-yellow-100';
      default:
        return 'bg-blue-900/90 border-blue-600 text-blue-100';
    }
  };

  return (
    <div
      className={`
        fixed bottom-4 right-4 z-50
        max-w-md
        transition-all duration-300 ease-out
        ${isExiting ? 'opacity-0 translate-y-2' : 'opacity-100 translate-y-0'}
      `}
      role="alert"
      aria-live="assertive"
    >
      <div className={`
        flex items-start gap-3 p-4 rounded-lg border-2 shadow-lg
        ${getStyles()}
      `}>
        <div className="flex-shrink-0 mt-0.5">
          {getIcon()}
        </div>
        <div className="flex-1 min-w-0 text-sm">
          {message}
        </div>
        <button
          onClick={handleClose}
          className="flex-shrink-0 text-current opacity-70 hover:opacity-100 transition-opacity"
          aria-label="Close notification"
        >
          <X size={18} />
        </button>
      </div>
    </div>
  );
};

// Toast container to manage multiple toasts
let toastId = 0;
const toastCallbacks: { [id: number]: (toast: ToastProps & { id: number }) => void } = {};

export const showToast = (message: string, type: ToastType = 'info', duration = 5000) => {
  const id = toastId++;
  Object.values(toastCallbacks).forEach(callback => {
    callback({ id, message, type, duration });
  });
};

export const ToastContainer: React.FC = () => {
  const [toasts, setToasts] = useState<(ToastProps & { id: number })[]>([]);

  useEffect(() => {
    const id = toastId;
    toastCallbacks[id] = (toast) => {
      setToasts(prev => [...prev, toast]);
    };

    return () => {
      delete toastCallbacks[id];
    };
  }, []);

  const removeToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map(toast => (
        <Toast
          key={toast.id}
          message={toast.message}
          type={toast.type}
          duration={toast.duration}
          onClose={() => removeToast(toast.id)}
        />
      ))}
    </div>
  );
};

export default Toast;