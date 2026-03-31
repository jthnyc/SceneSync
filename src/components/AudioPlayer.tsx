import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Volume2, VolumeX, SkipBack, SkipForward } from 'lucide-react';
import { formatFileSize, formatDuration } from '../utils/formatUtils';
import type { TrackDisplay } from '../utils/parseTrackDisplay';
import toast from 'react-hot-toast';

interface AudioPlayerProps {
  audioFile: File | string;
  metadata?: TrackDisplay;
  activeType?: 'reference' | 'match';
  fileName?: string;
  fileSize?: number;
  onClear?: () => void;
  className?: string;
  hasReference?: boolean;
  onShowReference?: () => void;
  isPreview?: boolean;
}

const AudioPlayer: React.FC<AudioPlayerProps> = ({
  audioFile,
  metadata,
  activeType,
  fileName,
  fileSize,
  onClear,
  className = '',
  hasReference,
  onShowReference,
  isPreview,
}) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const displayTitle = metadata?.title || fileName || 'Audio track';
  const displaySubtitle = metadata?.subtitle;
  const displaySource = metadata?.source;

  useEffect(() => {
    if (audioFile instanceof File) {
      // Check if the file type is supported
      const supportedTypes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/aac'];
      if (!supportedTypes.includes(audioFile.type)) {
        console.warn('Unsupported file type:', audioFile.type);
      }
      const url = URL.createObjectURL(audioFile);
      setAudioUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      // For URL strings, let the audio element handle it
      setAudioUrl(audioFile);
    }
  }, [audioFile]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    // Reset play state when track changes — the new source hasn't
    // started playing yet, so the button should show "play."
    setIsPlaying(false);
    setCurrentTime(0);

    const handleLoadedMetadata = () => setDuration(audio.duration);
    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };
    const handleError = (e: ErrorEvent) => {
      console.error('Audio loading error:', e);
      toast.error('Could not load audio file. The format may not be supported.');
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
    };
  }, [audioUrl]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;
    const time = parseFloat(e.target.value);
    audio.currentTime = time;
    setCurrentTime(time);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;
    const vol = parseFloat(e.target.value);
    audio.volume = vol;
    setVolume(vol);
    setIsMuted(vol === 0);
  };

  const toggleMute = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isMuted) {
      audio.volume = volume;
      setIsMuted(false);
    } else {
      audio.volume = 0;
      setIsMuted(true);
    }
  };

  const skip = (seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.max(0, Math.min(duration, audio.currentTime + seconds));
  };

  return (
    <div className={`bg-gray-700/30 rounded-lg p-4 ${className}`}>
      {audioUrl && <audio ref={audioRef} src={audioUrl} preload="metadata" />}

      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex-1 min-w-0">
          {activeType === 'reference' && (
            <div className="text-xs text-primary-400 font-medium mb-1 flex items-center gap-1">
              REFERENCE TRACK
            </div>
          )}
          {activeType === 'match' && displaySource && (
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-1">
              <div className="text-xs text-blue-400 font-medium flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-blue-400 rounded-full"></span>
                MATCH · {displaySource}
              </div>
              {hasReference && onShowReference && (
                <button
                  onClick={onShowReference}
                  className="text-xs bg-gray-700 hover:bg-gray-600 px-2 py-0.5 rounded transition-colors w-fit"
                >
                  ← Back to Reference
                </button>
              )}
            </div>
          )}
          {!activeType && fileName && (
            <div className="text-sm text-gray-400 mb-1">Current file</div>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-white font-medium truncate">{displayTitle}</span>
              {isPreview && <span className="text-gray-500 font-normal text-xs flex-shrink-0">· Preview</span>}
            </div>
            {fileSize && (
              <div className="flex items-center gap-3 text-sm flex-shrink-0">
                <span className="text-gray-400">{formatFileSize(fileSize)}</span>
              </div>
            )}
          </div>

          {displaySubtitle && (
            <div className="text-xs text-gray-400 mt-1 truncate">{displaySubtitle}</div>
          )}
        </div>

        {onClear && (
          <button
            onClick={onClear}
            className="text-xs text-gray-400 hover:text-gray-200 hover:bg-gray-600/50 px-2 py-1 rounded transition-colors flex-shrink-0 mt-0.5"
            aria-label="Clear analysis and start over"
          >
            Clear Analysis
          </button>
        )}
      </div>

      <div className="mb-3">
        <input
          type="range"
          min="0"
          max={duration || 0}
          value={currentTime}
          onChange={handleSeek}
          className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-primary-500"
          aria-label="Seek audio position"
        />
        <div className="flex justify-between text-xs text-gray-400 mt-1">
          <span>{formatDuration(currentTime)}</span>
          <span>{formatDuration(duration)}</span>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => skip(-10)}
            className="p-3 hover:bg-gray-600/50 rounded-lg transition-colors"
            aria-label="Skip backward 10 seconds"
          >
            <SkipBack size={18} className="text-gray-300" />
          </button>

          <button
            onClick={togglePlay}
            className="p-3 bg-primary-500 hover:bg-primary-600 rounded-full transition-colors"
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <Pause size={20} className="text-white" /> : <Play size={20} className="text-white ml-0.5" />}
          </button>

          <button
            onClick={() => skip(10)}
            className="p-3 hover:bg-gray-600/50 rounded-lg transition-colors"
            aria-label="Skip forward 10 seconds"
          >
            <SkipForward size={18} className="text-gray-300" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={toggleMute}
            className="p-3 hover:bg-gray-600/50 rounded-lg transition-colors"
            aria-label={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted || volume === 0 ? <VolumeX size={18} className="text-gray-300" /> : <Volume2 size={18} className="text-gray-300" />}
          </button>

          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={isMuted ? 0 : volume}
            onChange={handleVolumeChange}
            className="w-16 h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-primary-500"
            aria-label="Volume"
          />
        </div>
      </div>
    </div>
  );
};

export default AudioPlayer;