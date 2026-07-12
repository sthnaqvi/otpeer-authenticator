import net from 'net';
import os from 'os';
import { CryptoProvider } from '../adapters/crypto-provider';
import { NodeCryptoProvider } from './node-crypto-provider';
import { OtpAccount } from '../importers/google-auth';
import { generatePairingCode, formatSyncUri, deriveSessionKey, SyncTarget } from '../sync/pairing';
import { encodeFrame, FrameReader, SyncMessage, SYNC_PROTOCOL } from '../sync/frames';
import { syncMerge, SyncMergeSummary } from '../sync/merge';

/**
 * SYNC/1 session over a direct TCP connection (see
 * docs/plan/stage-c-sync-protocol.md). Hardening rules implemented here:
 * the host listener lives only for one session, accepts exactly one
 * connection, and dies after the merge; a failed GCM tag aborts instantly;
 * neither side writes anything until BOTH confirmed the merge summary.
 *
 * Message order (guest drives, host mirrors):
 *   guest HELLO → host HELLO → guest ACCOUNTS → host ACCOUNTS
 *   → both compute identical merges and ask their users →
 *   guest CONFIRM → host CONFIRM → (both yes?) each writes locally → BYE
 */

export interface SyncCallbacks {
    /** Host only: pairing info ready to show (URI, code, port). */
    onReady?: (info: { uri: string; code: string; host: string; port: number }) => void;
    /** Ask the local user to approve the merge. Return false to abort. */
    confirm: (summary: SyncMergeSummary) => Promise<boolean>;
}

export interface SyncOutcome {
    applied: boolean;
    summary: SyncMergeSummary;
    accounts: OtpAccount[];
}

const SESSION_TIMEOUT_MS = 5 * 60 * 1000;

/** First non-internal IPv4 address, for the pairing URI. */
export function primaryLanAddress(): string {
    for (const addresses of Object.values(os.networkInterfaces())) {
        for (const address of addresses ?? []) {
            if (!address.internal && address.family === 'IPv4') return address.address;
        }
    }
    return '127.0.0.1';
}

interface Peer {
    send(message: SyncMessage): void;
    next(): Promise<SyncMessage>;
    destroy(): void;
}

function makePeer(socket: net.Socket, crypto: CryptoProvider, key: Uint8Array, onFatal: (err: Error) => void): Peer {
    const reader = new FrameReader(crypto, key);
    const queue: SyncMessage[] = [];
    const waiters: Array<(m: SyncMessage) => void> = [];

    socket.on('data', (chunk) => {
        try {
            for (const message of reader.feed(chunk)) {
                const waiter = waiters.shift();
                if (waiter) waiter(message);
                else queue.push(message);
            }
        } catch (error) {
            onFatal(error as Error);
        }
    });
    socket.on('error', (error) => onFatal(error));
    // A peer that vanishes mid-session (e.g. it aborted on a bad pairing
    // code) must fail this side too, not leave it waiting forever. Settling
    // is idempotent, so the close after a *successful* session is harmless.
    socket.on('close', () => onFatal(new Error('Peer disconnected — sync aborted')));

    return {
        send: (message) => socket.write(encodeFrame(crypto, key, message)),
        next: () =>
            new Promise((resolve) => {
                if (queue.length) resolve(queue.shift() as SyncMessage);
                else waiters.push(resolve);
            }),
        destroy: () => socket.destroy(),
    };
}

async function runSession(
    peer: Peer,
    role: 'host' | 'guest',
    localAccounts: OtpAccount[],
    callbacks: SyncCallbacks
): Promise<SyncOutcome> {
    const hello: SyncMessage = { kind: 'HELLO', proto: SYNC_PROTOCOL, role };

    let remoteAccounts: OtpAccount[];
    if (role === 'guest') {
        peer.send(hello);
        const theirHello = await peer.next();
        if (theirHello.kind !== 'HELLO' || theirHello.proto !== SYNC_PROTOCOL) {
            throw new Error(`Peer speaks ${theirHello.proto ?? 'an unknown protocol'} — expected ${SYNC_PROTOCOL}`);
        }
        peer.send({ kind: 'ACCOUNTS', accounts: localAccounts });
        const theirs = await peer.next();
        if (theirs.kind !== 'ACCOUNTS') throw new Error(`Unexpected ${theirs.kind} — sync aborted`);
        remoteAccounts = theirs.accounts as OtpAccount[];
    } else {
        const theirHello = await peer.next();
        if (theirHello.kind !== 'HELLO' || theirHello.proto !== SYNC_PROTOCOL) {
            throw new Error(`Peer speaks ${theirHello.proto ?? 'an unknown protocol'} — expected ${SYNC_PROTOCOL}`);
        }
        peer.send(hello);
        const theirs = await peer.next();
        if (theirs.kind !== 'ACCOUNTS') throw new Error(`Unexpected ${theirs.kind} — sync aborted`);
        remoteAccounts = theirs.accounts as OtpAccount[];
        peer.send({ kind: 'ACCOUNTS', accounts: localAccounts });
    }

    const { accounts, summary } = syncMerge(localAccounts, remoteAccounts);
    const localOk = await callbacks.confirm(summary);

    let remoteOk: boolean;
    if (role === 'guest') {
        peer.send({ kind: 'CONFIRM', ok: localOk });
        remoteOk = (await peer.next()).ok === true;
    } else {
        remoteOk = (await peer.next()).ok === true;
        peer.send({ kind: 'CONFIRM', ok: localOk });
    }

    const applied = localOk && remoteOk;
    if (role === 'guest') peer.send({ kind: 'BYE' });
    return { applied, summary, accounts };
}

/** Host a one-shot sync session. Resolves when the session completes. */
export function hostSync(
    localAccounts: OtpAccount[],
    callbacks: SyncCallbacks,
    options: { crypto?: CryptoProvider; port?: number; host?: string } = {}
): Promise<SyncOutcome> {
    const crypto = options.crypto ?? new NodeCryptoProvider();
    const code = generatePairingCode(crypto);
    const key = deriveSessionKey(crypto, code);

    return new Promise((resolve, reject) => {
        let settled = false;
        const settle = (fn: () => void) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            server.close();
            fn();
        };
        const timer = setTimeout(() => settle(() => reject(new Error('Sync timed out — no device paired'))), SESSION_TIMEOUT_MS);

        const server = net.createServer((socket) => {
            server.close(); // exactly one connection — stop listening immediately
            const peer = makePeer(socket, crypto, key, (error) => settle(() => { peer.destroy(); reject(error); }));
            runSession(peer, 'host', localAccounts, callbacks)
                .then((outcome) => settle(() => { socket.end(); resolve(outcome); }))
                .catch((error) => settle(() => { peer.destroy(); reject(error); }));
        });

        server.on('error', (error) => settle(() => reject(error)));
        server.listen(options.port ?? 0, () => {
            const address = server.address() as net.AddressInfo;
            const host = options.host ?? primaryLanAddress();
            callbacks.onReady?.({ uri: formatSyncUri(host, address.port, code), code, host, port: address.port });
        });
    });
}

/** Join a hosted sync session. */
export function joinSync(
    target: Required<SyncTarget>,
    localAccounts: OtpAccount[],
    callbacks: SyncCallbacks,
    options: { crypto?: CryptoProvider } = {}
): Promise<SyncOutcome> {
    const crypto = options.crypto ?? new NodeCryptoProvider();
    const key = deriveSessionKey(crypto, target.code);

    return new Promise((resolve, reject) => {
        let settled = false;
        const settle = (fn: () => void) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            fn();
        };
        const socket = net.connect({ host: target.host, port: target.port });
        const timer = setTimeout(() => settle(() => { socket.destroy(); reject(new Error('Sync timed out')); }), SESSION_TIMEOUT_MS);

        socket.on('connect', () => {
            const peer = makePeer(socket, crypto, key, (error) => settle(() => { peer.destroy(); reject(error); }));
            runSession(peer, 'guest', localAccounts, callbacks)
                .then((outcome) => settle(() => { socket.end(); resolve(outcome); }))
                .catch((error) => settle(() => { peer.destroy(); reject(error); }));
        });
        socket.on('error', (error) => settle(() => reject(error)));
    });
}
