import { OpConsumer } from '../op';

export interface PeerStorageOptions {
  storages: Array<{
    type: string; // 'doc' | 'history' | 'blob' | 'sync' | 'awareness'
    impl: string;
    opts: any;
  }>;
}

interface PeerStorageBackendOptions extends PeerStorageOptions {
  port: MessagePort;
}

export class PeerStorageBackend extends OpConsumer {
  storages: Record<string, any> = {};
  constructor(protected readonly opts: PeerStorageBackendOptions) {
    super(opts.port);
    this.register('connect', this.connect.bind(this));
  }

  async connect() {
    await Promise.all(
      this.opts.storages.map(async impl => {
        const storage = new StorageImplementations[impl.impl](impl.opts);
        await storage.connect();
        storage.register(this.port);
        this.storages[impl.type] = storage;
      })
    );
  }

  async disconnect() {
    await Promise.all(
      Object.values(this.storages).map(async storage => {
        storage.unregister(this.port);
        await storage.disconnect();
      })
    );
    this.storages = {};
  }
}

export class PeerWorkerStorageBackend extends PeerStorageBackend {
  constructor(opts: PeerStorageBackendOptions) {
    super(opts);
    this.register('connect', this.connect.bind(this));
    this.register('disconnect', this.disconnect.bind(this));
  }

  override async connect() {
    // const worker = await getAndInitWorkerInSomewhere();
    // the worker should proxy all 'op' messages to it's true backend
    // worker.postMessage(
    //   {
    //     type: 'create-storage-worker-backend',
    //     storages: this.opts.storages,
    //     port: this.port,
    //   },
    //   [
    //     // transfer ownership of consumer port to worker,
    //     // this port is no longer usable in main thread
    //     this.port,
    //   ]
    // );
  }
}
