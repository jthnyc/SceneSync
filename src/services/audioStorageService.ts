/**
 * Audio Storage Service - IndexedDB
 * Stores complete track data including audio files and metadata
 */

const DB_NAME = 'SceneSyncAudioDB';
const DB_VERSION = 1;
const STORE_NAME = 'audioTracks';
const MAX_STORED_FILES = 10;

interface StoredTrack {
  id: string;
  audioBlob: Blob;
  trackData: any; // Will be AnalyzedTrack
  storedAt: number;
}

class AudioStorageService {
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(new Error('Failed to open IndexedDB'));
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const objectStore = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          objectStore.createIndex('storedAt', 'storedAt', { unique: false });
        }
      };
    });
  }

  /**
   * Store complete track (audio + metadata).
   * Resolves on transaction.oncomplete — guarantees the write is actually
   * committed to disk, not just staged. This means quota errors and other
   * commit failures are caught and surfaced to the caller instead of
   * silently disappearing after request.onsuccess fires.
   */
  async storeTrack(id: string, audioFile: File, trackData: any): Promise<void> {
    if (!this.db) await this.init();
    await this.enforceStorageLimit();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);

      const storedTrack: StoredTrack = {
        id,
        audioBlob: audioFile,
        trackData,
        storedAt: Date.now(),
      };

      const request = store.put(storedTrack);

      // request.onerror catches issues staging the write (e.g. constraint violations)
      request.onerror = () => reject(new Error('Failed to stage track write'));

      // transaction.oncomplete is the only guarantee the blob is on disk
      transaction.oncomplete = () => {
        console.log('[IDB] transaction committed, entry size approx:', storedTrack.audioBlob.size);
        resolve();
      }

      // transaction.onerror catches commit failures (quota exceeded, etc.)
      // Previously unhandled — this is why quota errors were silent
      transaction.onerror = () => {
        console.error('[IDB] transaction error: ', transaction.error);
        reject(new Error(`Failed to store track: ${transaction.error?.message ?? 'unknown error'}`));
      }
      transaction.onabort = () => {
        console.error('[IDB] transaction aborted:', transaction.error);
        reject(new Error(`Track storage aborted: ${transaction.error?.message ?? 'unknown'}`));
      }
    });
  }

  /**
   * Get audio file for playback
   */
  async getAudioFile(id: string): Promise<File | null> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(id);

      request.onsuccess = () => {
        const result = request.result as StoredTrack | undefined;
        if (result) {
          const file = new File([result.audioBlob], result.trackData.fileName, {
            type: result.audioBlob.type,
          });
          resolve(file);
        } else {
          resolve(null);
        }
      };

      request.onerror = () => reject(new Error('Failed to retrieve audio'));
      transaction.onerror = () => reject(new Error(`Transaction failed: ${transaction.error?.message ?? 'unknown'}`));
    });
  }

  /**
   * Load all track metadata (for restoring history)
   */
  async getAllTracks(): Promise<any[]> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index('storedAt');
      const request = index.openCursor(null, 'prev');

      const tracks: any[] = [];

      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          const stored = cursor.value as StoredTrack;
          tracks.push(stored.trackData);
          cursor.continue();
        } else {
          resolve(tracks);
        }
      };

      request.onerror = () => reject(new Error('Failed to load tracks'));
      transaction.onerror = () => reject(new Error(`Transaction failed: ${transaction.error?.message ?? 'unknown'}`));
    });
  }

  async deleteTrack(id: string): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      store.delete(id);

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(new Error('Failed to delete track'));
      transaction.onabort = () => reject(new Error('Delete transaction aborted'));
    });
  }

  async getStoredFileCount(): Promise<number> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.count();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error('Failed to count files'));
      transaction.onerror = () => reject(new Error(`Transaction failed: ${transaction.error?.message ?? 'unknown'}`));
    });
  }

  async getStorageSize(): Promise<number> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.openCursor();

      let totalSize = 0;

      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          const stored = cursor.value as StoredTrack;
          totalSize += stored.trackData.fileSize;
          cursor.continue();
        } else {
          resolve(totalSize);
        }
      };

      request.onerror = () => reject(new Error('Failed to calculate size'));
      transaction.onerror = () => reject(new Error(`Transaction failed: ${transaction.error?.message ?? 'unknown'}`));
    });
  }

  async clearAllTracks(): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      store.clear();

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(new Error('Failed to clear storage'));
      transaction.onabort = () => reject(new Error('Clear transaction aborted'));
    });
  }

  // Maintain own running total rather than calling navigator.storage.estimate() after each operation
  async getStorageStats(): Promise<{ count: number; size: number }> {
    const tracks = await this.getAllTracks();
    const size = tracks.reduce((sum: number, t) => sum + (t.fileSize ?? 0), 0);
    return {
      count: tracks.length,
      size,
    };
  }

  /**
   * Enforces MAX_STORED_FILES limit by deleting oldest entries first.
   * Now properly awaits cursor deletion before returning, so the limit
   * is guaranteed to be enforced before the caller writes a new track.
   */
  private async enforceStorageLimit(): Promise<void> {
    const count = await this.getStoredFileCount();
    if (count < MAX_STORED_FILES) return;

    const toDelete = count - MAX_STORED_FILES + 1;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index('storedAt');
      const request = index.openCursor(null, 'next'); // Oldest first

      let deleted = 0;

      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor && deleted < toDelete) {
          cursor.delete();
          deleted++;
          cursor.continue();
        }
        // No else needed — transaction.oncomplete handles resolution
      };

      request.onerror = () => reject(new Error('Failed to enforce storage limit'));

      // Resolve only after all deletions have committed
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(new Error('Storage limit transaction failed'));
    });
  }

  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

export const audioStorage = new AudioStorageService();