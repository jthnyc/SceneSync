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
   * Store complete track (audio + metadata)
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
      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error('Failed to store track'));
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
    });
  }

  async deleteTrack(id: string): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error('Failed to delete track'));
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
    });
  }

  async clearAllTracks(): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error('Failed to clear storage'));
    });
  }

  private async enforceStorageLimit(): Promise<void> {
    const count = await this.getStoredFileCount();
    
    if (count >= MAX_STORED_FILES) {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index('storedAt');
      const request = index.openCursor(null, 'next'); // Oldest first

      let deleted = 0;
      const toDelete = count - MAX_STORED_FILES + 1;

      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor && deleted < toDelete) {
          cursor.delete();
          deleted++;
          cursor.continue();
        }
      };
    }
  }

  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

export const audioStorage = new AudioStorageService();