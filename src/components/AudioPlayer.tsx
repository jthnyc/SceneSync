import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Volume2, VolumeX, SkipBack, SkipForward } from 'lucide-react';
import { formatFileSize, formatDuration } from '../utils/formatUtils';

interface AudioPlayerProps {
  audioFile: File | string;
  fileName?: string;
  fileSize?: number;
  onClear?: () => void;
  className?: string;
}

const AudioPlayer: React.FC<AudioPlayerProps> = ({
  audioFile,
  fileName,
  fileSize,
  onClear,
  className = '',
}) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  // Create audio URL from File object
  useEffect(() => {
    if (audioFile instanceof File) {
      const url = URL.createObjectURL(audioFile);
      setAudioUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setAudioUrl(audioFile);
    }
  }, [audioFile]);

  // Update duration when metadata loads
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
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
      {/* Hidden audio element */}
      {audioUrl && <audio ref={audioRef} src={audioUrl} preload="metadata" />}

      {/* Header with file info */}
      {fileName && (
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="flex-1 min-w-0">
            <div className="text-sm text-gray-400 mb-1">Current file</div>
            
            {/* Desktop: filename and metadata on same row */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="text-white font-medium truncate">
                {fileName}
              </div>
              
              {/* File metadata */}
              <div className="flex items-center gap-3 text-sm flex-shrink-0">
                {fileSize && (
                  <span className="text-gray-400">{formatFileSize(fileSize)}</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Progress bar */}
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

      {/* Controls */}
      <div className="flex items-center justify-between gap-2">
        {/* Left: Playback controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => skip(-10)}
            className="p-2 hover:bg-gray-600/50 rounded-lg transition-colors"
            aria-label="Skip backward 10 seconds"
          >
            <SkipBack size={18} className="text-gray-300" />
          </button>

          <button
            onClick={togglePlay}
            className="p-3 bg-primary-500 hover:bg-primary-600 rounded-full transition-colors"
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? (
              <Pause size={20} className="text-white" />
            ) : (
              <Play size={20} className="text-white ml-0.5" />
            )}
          </button>

          <button
            onClick={() => skip(10)}
            className="p-2 hover:bg-gray-600/50 rounded-lg transition-colors"
            aria-label="Skip forward 10 seconds"
          >
            <SkipForward size={18} className="text-gray-300" />
          </button>
        </div>

        {/* Right: Volume control */}
        <div className="flex items-center gap-2">
          <button
            onClick={toggleMute}
            className="p-2 hover:bg-gray-600/50 rounded-lg transition-colors"
            aria-label={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted || volume === 0 ? (
              <VolumeX size={18} className="text-gray-300" />
            ) : (
              <Volume2 size={18} className="text-gray-300" />
            )}
          </button>

          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={isMuted ? 0 : volume}
            onChange={handleVolumeChange}
            className="hidden sm:block w-20 h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-primary-500"
            aria-label="Volume"
          />
        </div>
      </div>
    </div>
  );
};

export default AudioPlayer;