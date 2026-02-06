import { DataConnection } from 'peerjs';

const CHUNK_SIZE = 16 * 1024; // 16KB chunks

interface FileMetadata {
  type: 'metadata';
  fileName: string;
  fileType: string;
  fileSize: number;
  totalChunks: number;
}

interface FileChunk {
  type: 'chunk';
  index: number;
  data: ArrayBuffer;
}

interface FileComplete {
  type: 'complete';
}

type FileMessage = FileMetadata | FileChunk | FileComplete;

export class FileSender {
  private connection: DataConnection;
  private file: File;
  public onProgress: ((progress: number) => void) | null = null;

  constructor(connection: DataConnection, file: File) {
    this.connection = connection;
    this.file = file;
  }

  async send(): Promise<void> {
    const totalChunks = Math.ceil(this.file.size / CHUNK_SIZE);

    // Send metadata first
    const metadata: FileMetadata = {
      type: 'metadata',
      fileName: this.file.name,
      fileType: this.file.type,
      fileSize: this.file.size,
      totalChunks
    };
    this.connection.send(metadata);

    // Send chunks
    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, this.file.size);
      const chunk = this.file.slice(start, end);
      const arrayBuffer = await chunk.arrayBuffer();

      const chunkMessage: FileChunk = {
        type: 'chunk',
        index: i,
        data: arrayBuffer
      };

      this.connection.send(chunkMessage);

      const progress = Math.round(((i + 1) / totalChunks) * 100);
      if (this.onProgress) {
        this.onProgress(progress);
      }

      // Small delay to prevent overwhelming the connection
      if (i % 10 === 0) {
        await new Promise(resolve => setTimeout(resolve, 1));
      }
    }

    // Send complete signal
    const complete: FileComplete = { type: 'complete' };
    this.connection.send(complete);
  }
}

export class FileReceiver {
  private connection: DataConnection;
  private chunks: ArrayBuffer[] = [];
  private metadata: FileMetadata | null = null;
  private receivedChunks = 0;

  public onStart: (() => void) | null = null;
  public onProgress: ((progress: number) => void) | null = null;
  public onComplete: ((blob: Blob, fileName: string, fileType: string) => void) | null = null;
  public onError: ((error: Error) => void) | null = null;

  constructor(connection: DataConnection) {
    this.connection = connection;
    this.setupListener();
  }

  private setupListener() {
    this.connection.on('data', (data: unknown) => {
      try {
        const message = data as FileMessage;

        if (message.type === 'metadata') {
          this.metadata = message;
          this.chunks = new Array(message.totalChunks);
          this.receivedChunks = 0;
          if (this.onStart) {
            this.onStart();
          }
        } else if (message.type === 'chunk' && this.metadata) {
          this.chunks[message.index] = message.data;
          this.receivedChunks++;

          const progress = Math.round((this.receivedChunks / this.metadata.totalChunks) * 100);
          if (this.onProgress) {
            this.onProgress(progress);
          }
        } else if (message.type === 'complete' && this.metadata) {
          const blob = new Blob(this.chunks, { type: this.metadata.fileType });
          if (this.onComplete) {
            this.onComplete(blob, this.metadata.fileName, this.metadata.fileType);
          }

          // Reset state
          this.chunks = [];
          this.metadata = null;
          this.receivedChunks = 0;
        }
      } catch (err) {
        if (this.onError) {
          this.onError(err instanceof Error ? err : new Error('Unknown error'));
        }
      }
    });
  }
}
