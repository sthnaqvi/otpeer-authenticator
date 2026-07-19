import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    captureScreenUserMessage,
    toUserMessage,
} from './user_errors.ts';

describe('toUserMessage', () => {
    it('maps IPC-wrapped Failed to get sources to Screen Recording copy', () => {
        const raw =
            "Error invoking remote method 'sync:captureScreen': Failed to get sources.";
        const msg = toUserMessage(raw);
        assert.match(msg, /Screen Recording permission/i);
        assert.doesNotMatch(msg, /Error invoking remote method/i);
    });

    it('maps NotAllowedError for camera context', () => {
        const err = new Error('Permission denied');
        err.name = 'NotAllowedError';
        const msg = toUserMessage(err, 'camera');
        assert.match(msg, /Camera access was denied/i);
    });

    it('maps Vault is locked', () => {
        const msg = toUserMessage(new Error('Vault is locked'));
        assert.match(msg, /Vault is locked/i);
        assert.match(msg, /Unlock/i);
    });

    it('passes through unknown messages as a debug/reporting gate', () => {
        const raw = 'WeirdSyncFailure xyz-42';
        assert.equal(toUserMessage(raw, 'sync'), raw);
    });

    it('strips IPC prefix even when message is otherwise unknown', () => {
        const raw = "Error invoking remote method 'vault:foo': OddFailure 99";
        assert.equal(toUserMessage(raw), 'OddFailure 99');
    });

    it('uses context empty fallback only when message is missing', () => {
        assert.equal(toUserMessage('', 'sync'), 'Something went wrong during sync.');
        assert.equal(toUserMessage(new Error(''), 'camera'), 'Could not open the camera.');
    });
});

describe('captureScreenUserMessage', () => {
    it('explains Screen Recording for permission failures', () => {
        assert.match(captureScreenUserMessage('permission'), /Screen Recording/i);
    });

    it('suggests screenshot for empty or unavailable captures', () => {
        assert.match(captureScreenUserMessage('empty'), /screenshot/i);
        assert.match(captureScreenUserMessage('unavailable'), /screenshot/i);
    });
});
