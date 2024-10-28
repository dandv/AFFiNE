import { ConnectOp, DisconnectOp, OpProducer } from '../op';
import {
  PeerStorageBackend,
  type PeerStorageOptions,
  PeerWorkerStorageBackend,
} from './backend';

class PeerStorageClient extends OpProducer {
  constructor(
    port: MessagePort,
    private readonly backend: PeerStorageBackend
  ) {
    super(port);
  }

  async connect() {
    await this.send(new ConnectOp());
  }

  async disconnect() {
    await this.send(new DisconnectOp());
  }
}

export function createPeerStorageClient(opts: PeerStorageOptions) {
  const channel = new MessageChannel();
  const producerPort = channel.port1;
  const consumerPort = channel.port2;

  const backend = new PeerStorageBackend({
    port: consumerPort,
    storages: opts.storages,
  });

  const client = new PeerStorageClient(producerPort, backend);

  return client;
}

export function createPeerWorkerStorageClient(opts: PeerStorageOptions) {
  const channel = new MessageChannel();
  const producerPort = channel.port1;
  const consumerPort = channel.port2;

  const backend = new PeerWorkerStorageBackend({
    port: consumerPort,
    storages: opts.storages,
  });

  const client = new PeerStorageClient(producerPort, backend);
  return client;
}
