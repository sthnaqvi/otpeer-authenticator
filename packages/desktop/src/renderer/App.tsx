import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { AccountView, SyncSummary } from './api';
import { IssuerAvatar } from './IssuerAvatar';
import { decodeQrFromVideoFrame, decodeQrFromDataUrl, decodeQrFromFile } from './qr_scan';
import markUrl from './assets/mark.png';

const api = window.otpeer;

type View = 'loading' | 'unlock' | 'main';
type Dialog = null | 'add' | 'import' | 'export' | 'sync' | 'settings' | 'set-password' | 'lock-setup';

const describeSummary = (s: SyncSummary) =>
    `${s.added} to add, ${s.updated} to update, ${s.deleted} to delete, ${s.unchanged} unchanged`;

const formatCode = (code: string) => {
    if (code.length === 6) return `${code.slice(0, 3)} ${code.slice(3)}`;
    if (code.length === 8) return `${code.slice(0, 4)} ${code.slice(4)}`;
    return code;
};

const titleOf = (a: AccountView) => a.issuer || a.name;
const subtitleOf = (a: AccountView) => (a.issuer ? a.name : '');

export function App() {
    const [view, setView] = useState<View>('loading');
    const [accounts, setAccounts] = useState<AccountView[]>([]);
    const [dialog, setDialog] = useState<Dialog>(null);
    const [menuOpen, setMenuOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [error, setError] = useState('');
    const [toast, setToast] = useState('');

    const showToast = (message: string) => {
        setToast(message);
        setTimeout(() => setToast(''), 2500);
    };

    const refresh = useCallback(async () => {
        try {
            setAccounts(await api.listAccounts());
        } catch {
            setView('unlock');
        }
    }, []);

    useEffect(() => {
        (async () => {
            const status = await api.status();
            if (!status.exists || !status.encrypted) {
                await api.unlock('');
                setView('main');
            } else {
                setView('unlock');
            }
        })();
    }, []);

    useEffect(() => {
        const unsubscribe = api.onLocked(() => {
            setMenuOpen(false);
            setDialog(null);
            setAccounts([]);
            setView('unlock');
        });
        return unsubscribe;
    }, []);

    useEffect(() => {
        if (view !== 'main') return;
        refresh();
        const timer = setInterval(refresh, 1000);
        return () => clearInterval(timer);
    }, [view, refresh]);

    const lockVault = async () => {
        setMenuOpen(false);
        const status = await api.status();
        // Lock is only a real password gate once the vault is encrypted.
        if (status.exists && !status.encrypted) {
            setDialog('lock-setup');
            return;
        }
        await api.lock();
        setAccounts([]);
        setView('unlock');
    };

    const openDialog = (next: Dialog) => {
        setMenuOpen(false);
        setDialog(next);
    };

    const is_settings = dialog === 'settings' || dialog === 'set-password';

    useEffect(() => {
        if (dialog !== 'settings') return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setDialog(null);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [dialog]);

    const filtered = accounts.filter((a) => {
        const q = search.trim().toLowerCase();
        if (!q) return true;
        return `${a.issuer || ''} ${a.name}`.toLowerCase().includes(q);
    });

    if (view === 'loading') return <div className="center dim">Loading…</div>;
    if (view === 'unlock') return <UnlockScreen onUnlocked={() => setView('main')} />;

    return (
        <div className={`app ${menuOpen ? 'drawer-open' : ''}`}>
            <div className="main-column">
                <header>
                    <button
                        className="icon-btn hamburger"
                        aria-label="Menu"
                        onClick={() => setMenuOpen((open) => !open)}
                    >
                        <span /><span /><span />
                    </button>
                    <h1>{is_settings ? 'Settings' : 'Accounts'}</h1>
                    {is_settings ? (
                        <button
                            type="button"
                            className="icon-btn header-back"
                            aria-label="Back to accounts"
                            onClick={() => setDialog(null)}
                        >
                            ✕
                        </button>
                    ) : (
                        <span className="header-spacer" />
                    )}
                </header>

                {is_settings ? (
                    <SettingsPanel onSetPassword={() => setDialog('set-password')} />
                ) : (
                    <>
                        <div className="search-wrap">
                            <span className="search-icon" aria-hidden>
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
                                </svg>
                            </span>
                            <input
                                className="search"
                                type="search"
                                placeholder="Search"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>

                        {error && <div className="error" onClick={() => setError('')}>{error}</div>}
                        {toast && <div className="toast">{toast}</div>}

                        <div className="list-pane">
                            <AccountList
                                accounts={filtered}
                                emptyAll={!accounts.length}
                                onCopied={showToast}
                                onChanged={refresh}
                                onError={setError}
                            />
                        </div>

                        {!menuOpen && (
                            <button
                                className="fab"
                                onClick={() => openDialog('add')}
                                title="Add account"
                                aria-label="Add account"
                            >
                                ＋
                            </button>
                        )}
                    </>
                )}
            </div>

            {menuOpen && (
                <HamburgerMenu
                    onClose={() => setMenuOpen(false)}
                    onSync={() => openDialog('sync')}
                    onImport={() => openDialog('import')}
                    onExport={() => openDialog('export')}
                    onSettings={() => openDialog('settings')}
                    onLock={() => { void lockVault(); }}
                    onAbout={() => {
                        setMenuOpen(false);
                        void api.showAbout();
                    }}
                />
            )}

            {dialog === 'add' && (
                <AddDialog
                    onClose={() => { setDialog(null); refresh(); }}
                    onToast={showToast}
                    onOpenImport={() => { setDialog('import'); }}
                />
            )}
            {dialog === 'import' && <ImportDialog onClose={() => { setDialog(null); refresh(); }} onToast={showToast} />}
            {dialog === 'export' && <ExportDialog onClose={() => setDialog(null)} onToast={showToast} />}
            {dialog === 'sync' && <SyncDialog onClose={() => { setDialog(null); refresh(); }} />}
            {(dialog === 'set-password' || dialog === 'lock-setup') && (
                <SetPasswordDialog
                    lockAfter={dialog === 'lock-setup'}
                    onClose={() => setDialog(dialog === 'lock-setup' ? null : 'settings')}
                    onLocked={() => {
                        setDialog(null);
                        setAccounts([]);
                        setView('unlock');
                    }}
                />
            )}
        </div>
    );
}

function BrandLockup() {
    return (
        <div className="brand-lockup">
            <img src={markUrl} alt="OTPeer Authenticator" className="mark" />
            <div className="brand-text">
                <strong>OTPeer</strong>
                <span>AUTHENTICATOR</span>
            </div>
        </div>
    );
}

function HamburgerMenu({ onClose, onSync, onImport, onExport, onSettings, onLock, onAbout }: {
    onClose: () => void;
    onSync: () => void;
    onImport: () => void;
    onExport: () => void;
    onSettings: () => void;
    onLock: () => void;
    onAbout: () => void;
}) {
    return (
        <div className="menu-overlay" onClick={onClose}>
            <nav className="drawer" onClick={(e) => e.stopPropagation()} aria-label="Main menu">
                <div className="drawer-head">
                    <BrandLockup />
                </div>
                <button type="button" className="drawer-item" onClick={onSync}>
                    <IconSync /> Sync
                </button>
                <button type="button" className="drawer-item" onClick={onImport}>
                    <IconImport /> Import
                </button>
                <button type="button" className="drawer-item" onClick={onExport}>
                    <IconExport /> Export
                </button>
                <button type="button" className="drawer-item" onClick={onSettings}>
                    <IconSettings /> Settings
                </button>
                <button type="button" className="drawer-item" onClick={onLock}>
                    <IconLock /> Lock
                </button>
                <button type="button" className="drawer-item" onClick={onAbout}>
                    <IconAbout /> About
                </button>
            </nav>
        </div>
    );
}

function UnlockScreen({ onUnlocked }: { onUnlocked: () => void }) {
    const [password, setPassword] = useState('');
    const [bad, setBad] = useState(false);
    const [show_password, setShowPassword] = useState(false);
    const [needs_password, setNeedsPassword] = useState(true);
    const [biometric, setBiometric] = useState<{ available: boolean; enabled: boolean; label: string } | null>(null);
    const [bio_error, setBioError] = useState('');
    const [bio_busy, setBioBusy] = useState(false);
    const [prefer_password, setPreferPassword] = useState(false);
    const bio_attempted = useRef(false);
    const on_unlocked_ref = useRef(onUnlocked);
    on_unlocked_ref.current = onUnlocked;

    const bio_enabled = !!biometric?.enabled;
    const show_password_path = !bio_enabled || prefer_password || !needs_password;

    useEffect(() => {
        void api.status().then((status) => setNeedsPassword(!!status.encrypted));
        void api.biometricStatus().then(setBiometric);
    }, []);

    useEffect(() => {
        if (!biometric?.enabled || bio_attempted.current) return;
        bio_attempted.current = true;
        let cancelled = false;
        (async () => {
            setBioBusy(true);
            const ok = await api.unlockWithBiometric();
            if (cancelled) {
                // Avoid a half-unlocked main-process session if the effect was torn down
                if (ok) await api.lock();
                return;
            }
            setBioBusy(false);
            if (ok) on_unlocked_ref.current();
            else setPreferPassword(true);
        })();
        return () => { cancelled = true; };
    }, [biometric?.enabled]);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setBioError('');
        if (await api.unlock(needs_password ? password : '')) on_unlocked_ref.current();
        else setBad(true);
    };

    const unlockBiometric = async () => {
        setBioError('');
        setBad(false);
        setBioBusy(true);
        const ok = await api.unlockWithBiometric();
        setBioBusy(false);
        if (ok) on_unlocked_ref.current();
        else {
            setBioError('Couldn’t verify — try again or use your password');
            setPreferPassword(true);
        }
    };

    return (
        <form className={`center column unlock${bio_enabled ? ' unlock-bio' : ''}`} onSubmit={submit}>
            <div className="unlock-brand">
                <img src={markUrl} alt="" className="unlock-mark" />
                <strong className="unlock-title">OTPeer</strong>
                <span className="unlock-subtitle">Authenticator</span>
            </div>

            {bio_enabled && (
                <div className="unlock-bio-block">
                    <button
                        type="button"
                        className={`unlock-touchid${bio_busy ? ' busy' : ''}`}
                        onClick={() => void unlockBiometric()}
                        disabled={bio_busy}
                        aria-label={`Unlock with ${biometric?.label ?? 'Touch ID'}`}
                    >
                        <IconTouchId />
                    </button>
                    <p className="unlock-bio-label">
                        {bio_busy ? `Waiting for ${biometric?.label ?? 'Touch ID'}…` : `Unlock with ${biometric?.label ?? 'Touch ID'}`}
                    </p>
                    {bio_error && <div className="error">{bio_error}</div>}
                    {!prefer_password && (
                        <button
                            type="button"
                            className="unlock-use-password"
                            onClick={() => setPreferPassword(true)}
                        >
                            Use password instead
                        </button>
                    )}
                </div>
            )}

            {bio_enabled && show_password_path && needs_password && (
                <div className="unlock-or" role="separator"><span>or</span></div>
            )}

            {show_password_path && (
                <>
                    {needs_password ? (
                        <label className={`unlock-field${bad ? ' bad' : ''}`}>
                            <span className="unlock-field-icon" aria-hidden><IconLock /></span>
                            <input
                                type={show_password ? 'text' : 'password'}
                                autoFocus={show_password_path}
                                placeholder="Enter your password"
                                value={password}
                                onChange={(e) => { setPassword(e.target.value); setBad(false); }}
                                aria-invalid={bad}
                            />
                            <button
                                type="button"
                                className="unlock-eye"
                                aria-label={show_password ? 'Hide password' : 'Show password'}
                                onClick={() => setShowPassword((v) => !v)}
                            >
                                {show_password ? <IconEyeOff /> : <IconEye />}
                            </button>
                        </label>
                    ) : (
                        <p className="dim unlock-soft-hint">Vault is not password-protected yet. Lock from the menu after setting a password.</p>
                    )}
                    {bad && <div className="error">Wrong password</div>}
                    <button type="submit" className={`unlock-submit${bio_enabled ? '' : ' primary'}`}>
                        {bio_enabled ? 'Unlock with password' : 'Unlock'}
                    </button>
                </>
            )}
        </form>
    );
}

function EmptyVaultArt() {
    return (
        <svg className="empty-art" viewBox="0 0 240 170" fill="none" aria-hidden>
            {/* cloud */}
            <path
                d="M162 46c1.2-7.5 7.5-13 15.2-13 3.4 0 6.5 1.1 9 3 2.8-5.5 8.5-9.2 15-9.2 9.3 0 16.8 7.3 16.8 16.3 0 .7 0 1.3-.1 2 6.4 1.5 11.1 7.2 11.1 13.9 0 8.1-6.6 14.6-14.8 14.6H167c-7.7 0-14-6.2-14-13.8 0-2.6.7-5 2-7.1.5-2.1.8-4.3.8-6.7Z"
                stroke="#566270" strokeWidth="1.7" opacity="0.65"
            />
            {/* plant */}
            <path d="M34 118h30l-4 30H38l-4-30Z" fill="#3a444e" />
            <rect x="32" y="110" width="34" height="10" rx="2" fill="#4b5662" />
            <path d="M49 110c-1-16 8-30 8-30s9 14 7 30" stroke="#6d7d8a" strokeWidth="2.2" strokeLinecap="round" />
            <ellipse cx="42" cy="86" rx="11" ry="7" transform="rotate(-35 42 86)" fill="#5c6d79" opacity="0.9" />
            <ellipse cx="58" cy="82" rx="12" ry="7" transform="rotate(28 58 82)" fill="#657887" opacity="0.85" />
            <ellipse cx="49" cy="74" rx="9" ry="6" fill="#6a7c88" opacity="0.75" />
            {/* safe */}
            <rect x="82" y="52" width="78" height="80" rx="10" fill="#2b323a" stroke="#667380" strokeWidth="2" />
            <rect x="94" y="64" width="54" height="42" rx="5" fill="#1a2026" stroke="#54616d" strokeWidth="1.5" />
            <circle cx="121" cy="85" r="14" stroke="#7b8b98" strokeWidth="2.2" fill="none" />
            <circle cx="121" cy="85" r="4" fill="#8a9aa7" />
            <path d="M121 85l9-6" stroke="#8a9aa7" strokeWidth="2.2" strokeLinecap="round" />
            <circle cx="100" cy="120" r="3.5" fill="#5f6d79" />
            <circle cx="142" cy="120" r="3.5" fill="#5f6d79" />
            <rect x="108" y="114" width="26" height="5" rx="1.5" fill="#4a5560" />
            {/* dashed add card */}
            <rect
                x="172" y="70" width="48" height="62" rx="9"
                stroke="#617282" strokeWidth="1.7" strokeDasharray="5 4" fill="none" opacity="0.9"
            />
            <circle cx="196" cy="101" r="12" fill="#35414c" stroke="#718292" strokeWidth="1.5" />
            <path d="M196 94.5v13M189.5 101h13" stroke="#c5d0d8" strokeWidth="2.2" strokeLinecap="round" />
            {/* ground hint */}
            <ellipse cx="120" cy="148" rx="78" ry="7" fill="#222830" opacity="0.85" />
        </svg>
    );
}

function AccountList({ accounts, emptyAll, onCopied, onChanged, onError }: {
    accounts: AccountView[];
    emptyAll: boolean;
    onCopied: (msg: string) => void;
    onChanged: () => void;
    onError: (msg: string) => void;
}) {
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);

    useEffect(() => {
        if (!openMenuId) return;
        const onPointerDown = (event: PointerEvent) => {
            const target = event.target as HTMLElement | null;
            if (target?.closest('[data-account-menu]')) return;
            setOpenMenuId(null);
        };
        document.addEventListener('pointerdown', onPointerDown, true);
        return () => document.removeEventListener('pointerdown', onPointerDown, true);
    }, [openMenuId]);

    if (emptyAll) {
        return (
            <div className="center dim empty">
                <EmptyVaultArt />
                <p className="empty-copy">No accounts yet — tap ＋ to add or open menu to import or sync.</p>
            </div>
        );
    }
    if (!accounts.length) {
        return <div className="center dim empty">No matches</div>;
    }
    return (
        <ul className="accounts">
            {accounts.map((account) => (
                <AccountRow
                    key={account.id}
                    account={account}
                    menuOpen={openMenuId === account.id}
                    onMenuOpenChange={(open) => setOpenMenuId(open ? account.id : null)}
                    onCopied={onCopied}
                    onChanged={onChanged}
                    onError={onError}
                />
            ))}
        </ul>
    );
}

function AccountRow({ account, menuOpen, onMenuOpenChange, onCopied, onChanged, onError }: {
    account: AccountView;
    menuOpen: boolean;
    onMenuOpenChange: (open: boolean) => void;
    onCopied: (msg: string) => void;
    onChanged: () => void;
    onError: (msg: string) => void;
}) {
    const [renaming, setRenaming] = useState(false);
    const [newName, setNewName] = useState(account.name);
    const isHotp = account.code === null;

    const copy = async () => {
        onMenuOpenChange(false);
        let code = account.code;
        if (isHotp) code = (await api.generateCode(account.id)).code;
        if (code) {
            void api.copyOtp(code);
            void api.setLastUsedAccount(account.id);
            onCopied(`Code for ${titleOf(account)} copied`);
            if (isHotp) onChanged();
        }
    };

    const remove = async () => {
        onMenuOpenChange(false);
        if (await api.confirm({
            title: 'Remove account',
            message: `Remove ${titleOf(account)} (${account.name})?`,
            detail: 'Other devices will remove it on next sync.',
            confirmLabel: 'Remove',
            type: 'warning',
        })) {
            await api.removeAccount(account.id).catch((e) => onError(e.message));
            onChanged();
        }
    };

    const rename = async (e: React.FormEvent) => {
        e.preventDefault();
        await api.renameAccount(account.id, newName).catch((e) => onError(e.message));
        setRenaming(false);
        onChanged();
    };

    const fraction = account.expiresIn !== null ? account.expiresIn / account.period : 0;

    return (
        <li className="account" onClick={copy} title="Click to copy">
            <IssuerAvatar issuer={account.issuer} name={account.name} />
            <div className="account-info">
                {renaming ? (
                    <form onSubmit={rename} onClick={(e) => e.stopPropagation()}>
                        <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} onBlur={() => setRenaming(false)} />
                    </form>
                ) : (
                    <>
                        <span className="name">{titleOf(account)}</span>
                        {subtitleOf(account) && <span className="sub">{subtitleOf(account)}</span>}
                    </>
                )}
                <span className="code">{isHotp ? <em className="dim">click to generate</em> : formatCode(account.code!)}</span>
            </div>
            <div className="account-side" data-account-menu onClick={(e) => e.stopPropagation()}>
                {!isHotp && account.expiresIn !== null && (
                    <span className={`countdown ${account.expiresIn <= 5 ? 'urgent' : account.expiresIn <= 10 ? 'warn' : ''}`}>
                        <svg viewBox="0 0 56 56" width="56" height="56">
                            <circle cx="28" cy="28" r="22" fill="none" stroke="currentColor" strokeWidth="4" opacity="0.22" />
                            <circle cx="28" cy="28" r="22" fill="none" stroke="currentColor" strokeWidth="4"
                                strokeLinecap="round"
                                strokeDasharray={`${fraction * 138.2} 138.2`} transform="rotate(-90 28 28)" />
                        </svg>
                        <span className="count-num">{account.expiresIn}</span>
                    </span>
                )}
                <button
                    className="ghost kebab"
                    onClick={() => onMenuOpenChange(!menuOpen)}
                    title="Account actions"
                    aria-label="Account actions"
                >⋮</button>
                {menuOpen && (
                    <div className="row-menu" data-account-menu>
                        <button onClick={() => { onMenuOpenChange(false); setRenaming(true); }}>Rename</button>
                        <button className="danger-text" onClick={remove}>Remove</button>
                    </div>
                )}
            </div>
        </li>
    );
}

function DialogShell({
    title,
    onClose,
    onBack,
    className = '',
    children,
}: {
    title: string;
    onClose: () => void;
    onBack?: () => void;
    className?: string;
    children: React.ReactNode;
}) {
    return (
        <div className="overlay" onClick={onClose}>
            <div className={`dialog ${className}`.trim()} onClick={(e) => e.stopPropagation()}>
                <div className="dialog-head">
                    <div className="dialog-head-left">
                        {onBack && (
                            <button type="button" className="ghost dialog-back" onClick={onBack} aria-label="Back">←</button>
                        )}
                        <h2>{title}</h2>
                    </div>
                    <button type="button" className="ghost" onClick={onClose} aria-label="Close">✕</button>
                </div>
                {children}
            </div>
        </div>
    );
}

function classifyAddPayload(raw: string): 'otpauth' | 'migration' | 'unknown' {
    const lower = raw.trim().toLowerCase();
    if (lower.startsWith('otpauth-migration://')) return 'migration';
    if (lower.startsWith('otpauth://') || lower.startsWith('steam://')) return 'otpauth';
    return 'unknown';
}

function AddDialog({
    onClose,
    onToast,
    onOpenImport,
}: {
    onClose: () => void;
    onToast: (message: string) => void;
    onOpenImport: () => void;
}) {
    const [uri, setUri] = useState('');
    const [name, setName] = useState('');
    const [issuer, setIssuer] = useState('');
    const [secret, setSecret] = useState('');
    const [local_error, setLocalError] = useState('');
    const [scan_mode, setScanMode] = useState<'idle' | 'camera' | 'busy'>('idle');
    const [busy, setBusy] = useState(false);
    const [verify, setVerify] = useState<{ id: string; title: string } | null>(null);
    const [live_code, setLiveCode] = useState<{ code: string; expiresIn: number | null; period: number } | null>(null);
    const [code_copied, setCodeCopied] = useState(false);
    const file_input_ref = useRef<HTMLInputElement>(null);
    const status_ref = useRef<HTMLDivElement>(null);
    const using_uri = !!uri.trim();

    useEffect(() => {
        if (!local_error && scan_mode !== 'busy') return;
        status_ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, [local_error, scan_mode]);

    useEffect(() => {
        if (!verify) return;
        let cancelled = false;
        const tick = async () => {
            try {
                const [gen, list] = await Promise.all([
                    api.generateCode(verify.id),
                    api.listAccounts(),
                ]);
                if (cancelled) return;
                const row = list.find((a) => a.id === verify.id);
                setLiveCode({
                    code: gen.code,
                    expiresIn: gen.expiresIn,
                    period: row?.period || 30,
                });
            } catch {
                if (!cancelled) setLiveCode(null);
            }
        };
        void tick();
        const timer = setInterval(() => void tick(), 1000);
        return () => {
            cancelled = true;
            clearInterval(timer);
        };
    }, [verify]);

    const startVerify = (id: string, title: string) => {
        setVerify({ id, title });
        setBusy(false);
        setScanMode('idle');
        setLocalError('');
    };

    const addOtpauthUri = async (value: string) => {
        setBusy(true);
        setLocalError('');
        try {
            const { id } = await api.addFromUri(value.trim());
            const parsed_hint = value.trim();
            let title = 'Account';
            try {
                const list = await api.listAccounts();
                const row = list.find((a) => a.id === id);
                if (row) title = titleOf(row);
            } catch {
                title = parsed_hint.slice(0, 40);
            }
            startVerify(id, title);
        } catch (err) {
            setLocalError((err as Error).message);
            setBusy(false);
        }
    };

    const importMigrationUri = async (value: string) => {
        setBusy(true);
        setLocalError('');
        try {
            const result = await api.importData(value.trim());
            onToast(
                `Imported: ${result.added} added, ${result.skipped} already present` +
                    (result.conflicts.length ? `, ${result.conflicts.length} conflicts kept existing` : ''),
            );
            onClose();
        } catch (err) {
            setLocalError((err as Error).message);
            setBusy(false);
        }
    };

    const handleUriPayload = async (value: string) => {
        const kind = classifyAddPayload(value);
        if (kind === 'migration') {
            await importMigrationUri(value);
            return;
        }
        if (kind === 'otpauth') {
            await addOtpauthUri(value);
            return;
        }
        setLocalError(
            'That QR isn’t a setup or authenticator export code. Use Import for OTPeer / Aegis / 2FAS backups.',
        );
        setScanMode('idle');
        setBusy(false);
    };

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (using_uri) {
            await handleUriPayload(uri);
            return;
        }
        setBusy(true);
        setLocalError('');
        try {
            const { id } = await api.addAccount({ name, issuer: issuer || undefined, secret });
            startVerify(id, issuer ? `${issuer} (${name})` : name);
        } catch (err) {
            setLocalError((err as Error).message);
            setBusy(false);
        }
    };

    const applyScannedPayload = (raw: string) => {
        const text = raw.trim();
        setScanMode('idle');
        if (!text) {
            setLocalError('No QR code found — try again or paste the URI.');
            return;
        }
        const kind = classifyAddPayload(text);
        if (kind === 'unknown') {
            setLocalError(
                'That QR isn’t a setup or authenticator export code. Use Import for OTPeer / Aegis / 2FAS backups.',
            );
            return;
        }
        if (kind === 'otpauth') setUri(text);
        setLocalError('');
        void handleUriPayload(text);
    };

    const scanScreen = async () => {
        setLocalError('');
        setScanMode('busy');
        try {
            const data_url = await api.captureScreenForQr();
            if (!data_url) {
                setLocalError('Could not capture the screen. Try choosing a screenshot image instead.');
                setScanMode('idle');
                return;
            }
            const payload = await decodeQrFromDataUrl(data_url);
            if (!payload) {
                setLocalError('No account QR found on screen. Show the setup QR larger, or pick a screenshot.');
                setScanMode('idle');
                return;
            }
            applyScannedPayload(payload);
        } catch (err) {
            setLocalError((err as Error).message);
            setScanMode('idle');
        }
    };

    const onPickImage = async (file: File | undefined) => {
        if (!file) return;
        setLocalError('');
        setScanMode('busy');
        try {
            const payload = await decodeQrFromFile(file);
            if (!payload) {
                setLocalError('No QR code in that image. Try another screenshot or use the camera.');
                setScanMode('idle');
                return;
            }
            applyScannedPayload(payload);
        } catch (err) {
            setLocalError((err as Error).message);
            setScanMode('idle');
        }
    };

    const can_submit = using_uri
        ? !!uri.trim()
        : !!(name.trim() && secret.trim());

    if (verify) {
        const expires = live_code?.expiresIn;
        return (
            <DialogShell title="Verify on the website" onClose={onClose} className="dialog-add">
                <div className="column add-verify">
                    <p className="dim sync-lede">
                        Account <strong>{verify.title}</strong> is saved. Enter this code
                        (and the next one if the site asks for two) to finish setup.
                    </p>
                    <button
                        type="button"
                        className="add-verify-code"
                        disabled={!live_code?.code}
                        onClick={() => {
                            if (!live_code?.code) return;
                            void api.copyOtp(live_code.code);
                            void api.setLastUsedAccount(verify.id);
                            setCodeCopied(true);
                            setTimeout(() => setCodeCopied(false), 2000);
                        }}
                    >
                        {live_code?.code ? formatCode(live_code.code) : '······'}
                    </button>
                    <p className="dim add-verify-meta">
                        {expires != null ? `${expires}s remaining` : 'Generating…'}
                        {code_copied ? ' · Copied' : ' · Tap code to copy'}
                    </p>
                    <p className="sync-footnote">
                        <span className="sync-info" aria-hidden>i</span>
                        Keep this open until the website accepts the code(s).
                    </p>
                    <button type="button" className="primary add-submit" onClick={onClose}>
                        Done
                    </button>
                </div>
            </DialogShell>
        );
    }

    return (
        <DialogShell title="Add account" onClose={onClose} className="dialog-add">
            {scan_mode === 'camera' ? (
                <div className="column add-form">
                    <QrCameraScanner
                        hint="Point the camera at the website setup QR, or an export QR from Google / Microsoft Authenticator."
                        deniedHint="Camera access was denied. Choose a QR image or paste the URI instead."
                        onFound={applyScannedPayload}
                        onCancel={() => setScanMode('idle')}
                        onError={(message) => {
                            setLocalError(message);
                            setScanMode('idle');
                        }}
                    />
                    {local_error && (
                        <div className="error add-status-error" aria-live="assertive">{local_error}</div>
                    )}
                </div>
            ) : (
                <form className="column add-form" onSubmit={submit}>
                    <p className="dim sync-lede">
                        Scan the QR on the website (new 2FA), or an export QR from another authenticator.
                    </p>
                    <div className="sync-join-actions">
                        <button
                            type="button"
                            className="sync-choice outline-choice compact"
                            disabled={scan_mode === 'busy' || busy}
                            onClick={() => { setLocalError(''); setScanMode('camera'); }}
                        >
                            <span className="sync-choice-icon" aria-hidden><IconCamera /></span>
                            <span className="sync-choice-text">
                                <strong>Scan with camera</strong>
                                <span>Website setup or export QR</span>
                            </span>
                        </button>
                        <button
                            type="button"
                            className="sync-choice outline-choice compact"
                            disabled={scan_mode === 'busy' || busy}
                            onClick={() => file_input_ref.current?.click()}
                        >
                            <span className="sync-choice-icon" aria-hidden><IconImage /></span>
                            <span className="sync-choice-text">
                                <strong>Choose QR image</strong>
                                <span>Screenshot or photo of the QR</span>
                            </span>
                        </button>
                        <button
                            type="button"
                            className="sync-choice outline-choice compact"
                            disabled={scan_mode === 'busy' || busy}
                            onClick={() => void scanScreen()}
                        >
                            <span className="sync-choice-icon" aria-hidden><IconScreen /></span>
                            <span className="sync-choice-text">
                                <strong>Scan this screen</strong>
                                <span>QR already visible on this Mac</span>
                            </span>
                        </button>
                    </div>
                    <input
                        ref={file_input_ref}
                        type="file"
                        accept="image/*"
                        className="sync-file-input"
                        onChange={(e) => {
                            const file = e.target.files?.[0];
                            e.target.value = '';
                            void onPickImage(file);
                        }}
                    />
                    <div ref={status_ref} className="add-status" aria-live="polite">
                        {scan_mode === 'busy' && (
                            <p className="add-status-busy">Looking for a QR…</p>
                        )}
                        {local_error && (
                            <div className="error add-status-error">{local_error}</div>
                        )}
                    </div>

                    <div className="divider sync-or">or paste URI</div>
                    <label className="add-field">
                        <span>Paste otpauth / migration URI</span>
                        <textarea
                            rows={3}
                            value={uri}
                            onChange={(e) => setUri(e.target.value)}
                            placeholder="otpauth://totp/… or otpauth-migration://…"
                            disabled={busy || scan_mode === 'busy'}
                        />
                    </label>

                    <div className="divider sync-or">or enter manually</div>
                    <label className="add-field">
                        <span>Account name</span>
                        <input
                            placeholder="e.g. GitHub"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            disabled={using_uri || busy}
                        />
                    </label>
                    <label className="add-field">
                        <span>Issuer</span>
                        <input
                            placeholder="e.g. GitHub"
                            value={issuer}
                            onChange={(e) => setIssuer(e.target.value)}
                            disabled={using_uri || busy}
                        />
                    </label>
                    <label className="add-field">
                        <span>Secret (base32)</span>
                        <input
                            placeholder="e.g. JBSWY3DPEHPK3PXP"
                            value={secret}
                            onChange={(e) => setSecret(e.target.value)}
                            disabled={using_uri || busy}
                            autoCapitalize="characters"
                            spellCheck={false}
                        />
                    </label>

                    <button
                        className="primary add-submit"
                        type="submit"
                        disabled={!can_submit || busy || scan_mode === 'busy'}
                    >
                        {busy ? 'Adding…' : 'Add account'}
                    </button>
                    <button
                        type="button"
                        className="ghost sync-copy-uri add-import-link"
                        onClick={onOpenImport}
                    >
                        Import a backup instead
                    </button>
                </form>
            )}
        </DialogShell>
    );
}

function ImportDialog({ onClose, onToast }: { onClose: () => void; onToast: (m: string) => void }) {
    const [raw, setRaw] = useState('');
    const [needsPassword, setNeedsPassword] = useState(false);
    const [filePassword, setFilePassword] = useState('');
    const [localError, setLocalError] = useState('');

    const pick = async () => {
        const content = await api.pickImportFile();
        if (content) {
            setRaw(content);
            const detected = await api.detectImport(content);
            setNeedsPassword(!!detected?.encrypted);
        }
    };

    const submit = async () => {
        try {
            const result = await api.importData(raw, filePassword || undefined);
            onToast(`Imported: ${result.added} added, ${result.skipped} already present` +
                (result.conflicts.length ? `, ${result.conflicts.length} conflicts kept existing` : ''));
            onClose();
        } catch (err) {
            setLocalError((err as Error).message);
        }
    };

    return (
        <DialogShell title="Import" onClose={onClose}>
            <div className="column">
                <button onClick={pick}>Choose backup file… (OTPeer / Aegis / 2FAS / andOTP)</button>
                <div className="divider">or paste a migration / otpauth URI</div>
                <textarea rows={3} value={raw.startsWith('{') || raw.startsWith('[') ? '(file loaded)' : raw}
                    onChange={(e) => setRaw(e.target.value)} placeholder="otpauth-migration://offline?data=…" />
                {needsPassword && (
                    <input type="password" placeholder="Backup file password" value={filePassword}
                        onChange={(e) => setFilePassword(e.target.value)} />
                )}
                {localError && <div className="error">{localError}</div>}
                <button className="primary" disabled={!raw.trim()} onClick={submit}>Import</button>
            </div>
        </DialogShell>
    );
}

function ExportDialog({ onClose, onToast }: { onClose: () => void; onToast: (m: string) => void }) {
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [localError, setLocalError] = useState('');

    const submit = async () => {
        if (!password || password !== confirm) return setLocalError('Passwords empty or do not match');
        try {
            const backup = await api.exportVault(password);
            const blob = new Blob([backup], { type: 'application/json' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = 'authenticator-backup.json';
            link.click();
            URL.revokeObjectURL(link.href);
            onToast('Encrypted backup downloaded');
            onClose();
        } catch (err) {
            setLocalError((err as Error).message);
        }
    };

    return (
        <DialogShell title="Export encrypted backup" onClose={onClose}>
            <div className="column">
                <p className="dim">The backup is always encrypted with a password you choose now. Restore it with Import on any device.</p>
                <input type="password" placeholder="Backup password" value={password} onChange={(e) => setPassword(e.target.value)} />
                <input type="password" placeholder="Confirm password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
                {localError && <div className="error">{localError}</div>}
                <button className="primary" onClick={submit}>Export</button>
            </div>
        </DialogShell>
    );
}

function SetPasswordDialog({
    lockAfter,
    onClose,
    onLocked,
}: {
    lockAfter: boolean;
    onClose: () => void;
    onLocked: () => void;
}) {
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [local_error, setLocalError] = useState('');
    const [busy, setBusy] = useState(false);
    const [touch_available, setTouchAvailable] = useState(false);
    const [touch_label, setTouchLabel] = useState('Touch ID');
    const [enable_touch, setEnableTouch] = useState(true);

    useEffect(() => {
        void api.biometricStatus().then((status) => {
            setTouchAvailable(status.available);
            setTouchLabel(status.label);
            // Prefer enabling when the OS can do it and it isn't on yet
            setEnableTouch(status.available && !status.enabled);
        });
    }, []);

    const submit = async () => {
        if (!password || password !== confirm) return setLocalError('Passwords empty or do not match');
        setBusy(true);
        setLocalError('');
        try {
            await api.setPassword(password);
            // Re-check at submit time — status may not have loaded when the form first opened
            const bio = await api.biometricStatus();
            const want_touch = enable_touch && bio.available;
            if (want_touch) {
                const next = await api.setBiometricUnlock(true);
                if (!next.enabled) {
                    throw new Error(`${bio.label} could not be enabled — try again from Settings`);
                }
            }
            if (lockAfter) {
                await api.lock();
                onLocked();
                return;
            }
            onClose();
        } catch (err) {
            setLocalError((err as Error).message);
            setBusy(false);
        }
    };

    return (
        <DialogShell title={lockAfter ? 'Set password to lock' : 'Vault password'} onClose={onClose}>
            <div className="column">
                <p className="dim">
                    {lockAfter
                        ? 'Your vault is stored unencrypted on disk. Choose a password to encrypt it — Lock will require this password.'
                        : 'Encrypt the vault (or change the password). You will need this password to unlock OTPeer.'}
                </p>
                <input type="password" autoFocus placeholder="Vault password" value={password}
                    onChange={(e) => { setPassword(e.target.value); setLocalError(''); }} />
                <input type="password" placeholder="Confirm password" value={confirm}
                    onChange={(e) => { setConfirm(e.target.value); setLocalError(''); }} />
                {touch_available && (
                    <label className="row">
                        <input
                            type="checkbox"
                            checked={enable_touch}
                            disabled={busy}
                            onChange={(e) => setEnableTouch(e.target.checked)}
                        />
                        Also unlock with {touch_label}
                    </label>
                )}
                {local_error && <div className="error">{local_error}</div>}
                <button className="primary" disabled={busy} onClick={() => void submit()}>
                    {lockAfter ? 'Encrypt & lock' : 'Save password'}
                </button>
            </div>
        </DialogShell>
    );
}

function formatPairingCode(code: string): string {
    const cleaned = code.replace(/\s+/g, '').toUpperCase();
    return cleaned.match(/.{1,4}/g)?.join(' ') ?? cleaned;
}

function parseSyncEndpoint(uri: string): { host: string; port: string } | null {
    const match = uri.match(/^authsync:\/\/([^/:]+):(\d+)/i);
    if (!match) return null;
    return { host: match[1], port: match[2] };
}

function SyncDialog({ onClose }: { onClose: () => void }) {
    const [mode, setMode] = useState<'menu' | 'hosting' | 'joining'>('menu');
    const [ready, setReady] = useState<{ uri: string; code: string; qrSvg: string } | null>(null);
    const [confirmSummary, setConfirmSummary] = useState<SyncSummary | null>(null);
    const [target, setTarget] = useState('');
    const [result, setResult] = useState('');
    const [local_error, setLocalError] = useState('');
    const [copied, setCopied] = useState<'uri' | 'endpoint' | null>(null);
    const [scan_mode, setScanMode] = useState<'idle' | 'camera' | 'busy'>('idle');
    const listening = useRef(false);
    const file_input_ref = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (listening.current) return;
        listening.current = true;
        api.onSyncReady(setReady);
        api.onSyncConfirm(setConfirmSummary);
    }, []);

    const finish = (outcome: { applied: boolean; summary: SyncSummary }) => {
        setConfirmSummary(null);
        setScanMode('idle');
        setResult(outcome.applied
            ? `✓ Synced: ${describeSummary(outcome.summary)}`
            : 'Sync declined — nothing was changed on either device');
    };
    const fail = (err: Error, fallback: 'menu' | 'joining' = 'menu') => {
        setConfirmSummary(null);
        setReady(null);
        setScanMode('idle');
        setLocalError(err.message);
        setMode(fallback);
    };

    const host = () => {
        setLocalError('');
        setReady(null);
        setMode('hosting');
        api.startSyncHost().then(finish).catch((err) => fail(err));
    };
    const joinWith = (value: string) => {
        const trimmed = value.trim();
        if (!trimmed) return;
        setLocalError('');
        setScanMode('idle');
        setMode('joining');
        api.joinSync(trimmed).then(finish).catch((err) => fail(err, 'joining'));
    };
    const join = () => joinWith(target);

    const applyScannedPayload = (raw: string) => {
        const text = raw.trim();
        if (!text) {
            setLocalError('No QR code found — try again or paste the sync link.');
            return;
        }
        setTarget(text);
        setScanMode('idle');
        setLocalError('');
        if (/^authsync:\/\//i.test(text) || /:\d+/.test(text)) {
            joinWith(text);
        }
    };

    const scanScreen = async () => {
        setLocalError('');
        setScanMode('busy');
        try {
            const data_url = await api.captureScreenForQr();
            if (!data_url) {
                setLocalError('Could not capture the screen. Try choosing a screenshot image instead.');
                setScanMode('idle');
                return;
            }
            const payload = await decodeQrFromDataUrl(data_url);
            if (!payload) {
                setLocalError('No sync QR found on screen. Make sure the other device’s QR is visible, or pick a screenshot.');
                setScanMode('idle');
                return;
            }
            applyScannedPayload(payload);
        } catch (err) {
            setLocalError((err as Error).message);
            setScanMode('idle');
        }
    };

    const onPickImage = async (file: File | undefined) => {
        if (!file) return;
        setLocalError('');
        setScanMode('busy');
        try {
            const payload = await decodeQrFromFile(file);
            if (!payload) {
                setLocalError('No QR code in that image. Try another screenshot or use the camera.');
                setScanMode('idle');
                return;
            }
            applyScannedPayload(payload);
        } catch (err) {
            setLocalError((err as Error).message);
            setScanMode('idle');
        }
    };

    const back = () => {
        if (mode === 'joining' && !result && !confirmSummary) {
            setScanMode('idle');
            setMode('menu');
            setLocalError('');
        }
    };

    const flashCopied = (kind: 'uri' | 'endpoint') => {
        setCopied(kind);
        setTimeout(() => setCopied(null), 2000);
    };

    const endpoint = ready ? parseSyncEndpoint(ready.uri) : null;

    return (
        <DialogShell
            title="Sync devices"
            onClose={onClose}
            onBack={mode === 'joining' && !result && !confirmSummary ? back : undefined}
            className="dialog-sync"
        >
            {result ? (
                <div className="column sync-body">
                    <p>{result}</p>
                    <button type="button" className="primary" onClick={onClose}>Done</button>
                </div>
            ) : confirmSummary ? (
                <div className="column sync-body">
                    <p>Merge result for this device:<br /><strong>{describeSummary(confirmSummary)}</strong></p>
                    <div className="row">
                        <button type="button" className="primary" onClick={() => api.respondSyncConfirm(true)}>Apply</button>
                        <button type="button" onClick={() => api.respondSyncConfirm(false)}>Decline</button>
                    </div>
                </div>
            ) : mode === 'menu' ? (
                <div className="column sync-body">
                    <p className="dim sync-lede">
                        Sync accounts between devices on the same network. Nothing leaves your LAN — no cloud, no account.
                    </p>
                    <button type="button" className="sync-choice primary-choice" onClick={host}>
                        <span className="sync-choice-icon" aria-hidden><IconExport /></span>
                        <span className="sync-choice-text">
                            <strong>Host</strong>
                            <span>Share accounts from this device</span>
                        </span>
                    </button>
                    <button
                        type="button"
                        className="sync-choice outline-choice"
                        onClick={() => { setLocalError(''); setMode('joining'); }}
                    >
                        <span className="sync-choice-icon" aria-hidden><IconImport /></span>
                        <span className="sync-choice-text">
                            <strong>Join</strong>
                            <span>Get accounts from another device</span>
                        </span>
                    </button>
                    {local_error && <div className="error">{local_error}</div>}
                    <p className="sync-footnote">
                        <span className="sync-info" aria-hidden>i</span>
                        Both devices need OTPeer Authenticator and must be on the same Wi‑Fi or hotspot.
                    </p>
                </div>
            ) : mode === 'hosting' && ready ? (
                <div className="column sync-body sync-host">
                    <div className="qr" dangerouslySetInnerHTML={{ __html: ready.qrSvg }} />
                    <p className="dim sync-host-hint">
                        Scan this QR with another OTPeer device, or enter the address and pairing code below.
                    </p>
                    {endpoint && (
                        <div className="sync-endpoint" aria-label={`Address ${endpoint.host} port ${endpoint.port}`}>
                            <span className="sync-endpoint-label">This device</span>
                            <code className="sync-endpoint-value">{endpoint.host}:{endpoint.port}</code>
                            <button
                                type="button"
                                className="ghost sync-copy-uri"
                                onClick={() => {
                                    api.copyToClipboard(`${endpoint.host}:${endpoint.port}`);
                                    flashCopied('endpoint');
                                }}
                            >
                                {copied === 'endpoint' ? 'Address copied' : 'Copy address'}
                            </button>
                        </div>
                    )}
                    <div className="divider sync-or">or enter pairing code</div>
                    <p className="sync-code" aria-label={`Pairing code ${ready.code}`}>
                        {formatPairingCode(ready.code)}
                    </p>
                    <button
                        type="button"
                        className="ghost sync-copy-uri"
                        onClick={() => {
                            api.copyToClipboard(ready.uri);
                            flashCopied('uri');
                        }}
                    >
                        {copied === 'uri' ? 'Link copied' : 'Copy sync link'}
                    </button>
                    <p className="dim sync-waiting">Waiting for the other device…</p>
                </div>
            ) : mode === 'joining' ? (
                <div className="column sync-body">
                    {scan_mode === 'camera' ? (
                        <QrCameraScanner
                            hint="Point the camera at the host device’s QR code."
                            deniedHint="Camera access was denied. Choose a QR image or paste the sync link instead."
                            onFound={applyScannedPayload}
                            onCancel={() => setScanMode('idle')}
                            onError={(message) => {
                                setLocalError(message);
                                setScanMode('idle');
                            }}
                        />
                    ) : (
                        <>
                            <p className="dim sync-lede">
                                Scan the host’s QR, pick a screenshot, or paste an <code>authsync://</code> link.
                            </p>
                            <div className="sync-join-actions">
                                <button
                                    type="button"
                                    className="sync-choice outline-choice compact"
                                    disabled={scan_mode === 'busy'}
                                    onClick={() => { setLocalError(''); setScanMode('camera'); }}
                                >
                                    <span className="sync-choice-icon" aria-hidden><IconCamera /></span>
                                    <span className="sync-choice-text">
                                        <strong>Scan with camera</strong>
                                        <span>Point at the other device’s QR</span>
                                    </span>
                                </button>
                                <button
                                    type="button"
                                    className="sync-choice outline-choice compact"
                                    disabled={scan_mode === 'busy'}
                                    onClick={() => file_input_ref.current?.click()}
                                >
                                    <span className="sync-choice-icon" aria-hidden><IconImage /></span>
                                    <span className="sync-choice-text">
                                        <strong>Choose QR image</strong>
                                        <span>Screenshot or photo of the QR</span>
                                    </span>
                                </button>
                                <button
                                    type="button"
                                    className="sync-choice outline-choice compact"
                                    disabled={scan_mode === 'busy'}
                                    onClick={() => void scanScreen()}
                                >
                                    <span className="sync-choice-icon" aria-hidden><IconScreen /></span>
                                    <span className="sync-choice-text">
                                        <strong>Scan this screen</strong>
                                        <span>Find a QR already on screen</span>
                                    </span>
                                </button>
                            </div>
                            <input
                                ref={file_input_ref}
                                type="file"
                                accept="image/*"
                                className="sync-file-input"
                                onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    e.target.value = '';
                                    void onPickImage(file);
                                }}
                            />
                            <div className="divider sync-or">or paste link</div>
                            <input
                                autoFocus
                                placeholder="authsync://192.168.…#CODE"
                                value={target}
                                onChange={(e) => setTarget(e.target.value)}
                            />
                            <button
                                type="button"
                                className="primary"
                                disabled={!target.trim() || scan_mode === 'busy'}
                                onClick={join}
                            >
                                {scan_mode === 'busy' ? 'Looking for QR…' : 'Join session'}
                            </button>
                            {local_error && <div className="error">{local_error}</div>}
                            <p className="sync-footnote">
                                <span className="sync-info" aria-hidden>i</span>
                                Both devices must be on the same network.
                            </p>
                        </>
                    )}
                </div>
            ) : (
                <div className="center dim sync-connecting">Starting host session…</div>
            )}
        </DialogShell>
    );
}

function QrCameraScanner({
    onFound,
    onCancel,
    onError,
    hint,
    deniedHint,
}: {
    onFound: (payload: string) => void;
    onCancel: () => void;
    onError: (message: string) => void;
    hint: string;
    deniedHint: string;
}) {
    const video_ref = useRef<HTMLVideoElement>(null);
    const scan_canvas_ref = useRef<HTMLCanvasElement | null>(null);
    const found_ref = useRef(false);
    const on_found_ref = useRef(onFound);
    const on_error_ref = useRef(onError);
    const denied_ref = useRef(deniedHint);
    on_found_ref.current = onFound;
    on_error_ref.current = onError;
    denied_ref.current = deniedHint;

    useEffect(() => {
        let stream: MediaStream | null = null;
        let raf = 0;
        let cancelled = false;
        let frames = 0;

        const stop = () => {
            cancelled = true;
            cancelAnimationFrame(raf);
            stream?.getTracks().forEach((track) => track.stop());
        };

        const tick = () => {
            if (cancelled || found_ref.current) return;
            const video = video_ref.current;
            if (video && video.readyState >= 2 && video.videoWidth > 0) {
                if (!scan_canvas_ref.current) {
                    scan_canvas_ref.current = document.createElement('canvas');
                }
                // Standard QR is dark-on-light; sample inverted every 8th frame so a
                // rare light-on-dark code still decodes without the every-frame cost.
                const inversion = ++frames % 8 === 0 ? 'onlyInvert' : 'dontInvert';
                try {
                    const payload = decodeQrFromVideoFrame(
                        video,
                        video.videoWidth,
                        video.videoHeight,
                        scan_canvas_ref.current,
                        inversion,
                    );
                    if (payload) {
                        found_ref.current = true;
                        stop();
                        on_found_ref.current(payload);
                        return;
                    }
                } catch {
                    // A transient decode/readback error must not kill the scan loop.
                }
            }
            raf = requestAnimationFrame(tick);
        };

        (async () => {
            const allowed = await api.ensureCameraAccess();
            if (!allowed) {
                on_error_ref.current(denied_ref.current);
                return;
            }
            try {
                // Ask for a crisp, higher-res stream so a sharp frame is
                // available even with a shaky handheld phone.
                const ideal_video: MediaTrackConstraints = {
                    facingMode: 'environment',
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    frameRate: { ideal: 30 },
                };
                try {
                    stream = await navigator.mediaDevices.getUserMedia({
                        audio: false,
                        video: ideal_video,
                    });
                } catch {
                    // Desktop webcams often have no rear camera — fall back.
                    stream = await navigator.mediaDevices.getUserMedia({
                        audio: false,
                        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
                    });
                }
                if (cancelled) {
                    stream.getTracks().forEach((track) => track.stop());
                    return;
                }
                // Prefer continuous autofocus when the camera supports it.
                const track = stream.getVideoTracks()[0];
                const caps = track?.getCapabilities?.() as { focusMode?: string[] } | undefined;
                if (caps?.focusMode?.includes('continuous')) {
                    await track
                        .applyConstraints({ advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet] })
                        .catch(() => {});
                }
                const video = video_ref.current;
                if (!video) return;
                video.srcObject = stream;
                await video.play();
                raf = requestAnimationFrame(tick);
            } catch (err) {
                on_error_ref.current((err as Error).message || 'Could not open the camera.');
            }
        })();

        return stop;
    }, []);

    return (
        <div className="column sync-camera">
            <p className="dim sync-lede">{hint}</p>
            <video ref={video_ref} className="sync-camera-video" playsInline muted />
            <button type="button" onClick={onCancel}>Cancel</button>
        </div>
    );
}

function SettingsToggle({
    checked,
    disabled,
    onChange,
    label,
}: {
    checked: boolean;
    disabled?: boolean;
    onChange: (next: boolean) => void;
    label: string;
}) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            aria-label={label}
            disabled={disabled}
            className={`settings-switch ${checked ? 'on' : ''}`}
            onClick={() => onChange(!checked)}
        >
            <span className="settings-switch-knob" />
        </button>
    );
}

function SettingsPanel({ onSetPassword }: { onSetPassword: () => void }) {
    const [settings, setSettings] = useState<{ autoUpdate: boolean; autoLockMinutes: number; biometricUnlock: boolean } | null>(null);
    const [version, setVersion] = useState('');
    const [update_msg, setUpdateMsg] = useState('');
    const [update_available, setUpdateAvailable] = useState(false);
    const [encrypted, setEncrypted] = useState(false);
    const [biometric, setBiometric] = useState<{ available: boolean; enabled: boolean; label: string } | null>(null);
    const [vault_msg, setVaultMsg] = useState('');
    const [busy, setBusy] = useState(false);

    const refreshVaultState = async () => {
        const [status, bio] = await Promise.all([api.status(), api.biometricStatus()]);
        setEncrypted(status.encrypted);
        setBiometric(bio);
    };

    useEffect(() => {
        api.getSettings().then(setSettings);
        api.appVersion().then(setVersion);
        void refreshVaultState();
    }, []);

    if (!settings) {
        return <div className="center dim settings-loading">Loading…</div>;
    }

    const patch = async (p: Record<string, unknown>) => setSettings(await api.setSettings(p));

    const clearPassword = async () => {
        const ok = await api.confirm({
            title: 'Remove vault password',
            message: 'Remove the vault password?',
            detail: 'The vault file will be stored unencrypted on disk. Touch ID unlock will be turned off.',
            confirmLabel: 'Remove',
            type: 'warning',
        });
        if (!ok) return;
        setBusy(true);
        setVaultMsg('');
        try {
            await api.setPassword('');
            await refreshVaultState();
            setVaultMsg('Vault password removed');
        } catch (err) {
            setVaultMsg((err as Error).message);
        } finally {
            setBusy(false);
        }
    };

    const toggleBiometric = async (enabled: boolean) => {
        setBusy(true);
        setVaultMsg('');
        try {
            const next = await api.setBiometricUnlock(enabled);
            setBiometric(next);
            setSettings(await api.getSettings());
        } catch (err) {
            setVaultMsg((err as Error).message);
        } finally {
            setBusy(false);
        }
    };

    const is_mac = api.platform === 'darwin';

    const checkUpdates = async () => {
        setUpdateMsg('');
        setUpdateAvailable(false);
        const result = await api.checkForUpdates();
        if (result.status !== 'ok') {
            setUpdateMsg(`Unavailable (${result.message ?? result.status})`);
            return;
        }
        const current = result.currentVersion ?? version;
        const latest = result.latestVersion ?? current;
        if (result.updateAvailable && latest !== current) {
            setUpdateMsg(is_mac
                ? `Update available: v${current} → v${latest}`
                : `Update available: v${current} → v${latest} (downloading automatically)`);
            setUpdateAvailable(true);
        } else {
            setUpdateMsg(`You’re on the latest version (v${current})`);
        }
    };

    const downloadUpdate = async () => {
        await api.openUpdatePage(version);
    };

    return (
        <div className="settings-pane">
            <div className="settings-list">
                <div className="settings-row">
                    <span className="settings-label">Check for updates</span>
                    <SettingsToggle
                        label="Check for updates"
                        checked={settings.autoUpdate}
                        onChange={(next) => void patch({ autoUpdate: next })}
                    />
                </div>

                <div className="settings-row">
                    <span className="settings-label">Auto-lock after</span>
                    <select
                        className="settings-select"
                        value={settings.autoLockMinutes}
                        onChange={(e) => void patch({ autoLockMinutes: Number(e.target.value) })}
                    >
                        <option value={5}>5 min</option>
                        <option value={15}>15 min</option>
                        <option value={60}>1 hour</option>
                        <option value={0}>never</option>
                    </select>
                </div>

                <div className="settings-row">
                    <div className="settings-stack">
                        <span className="settings-label">Check for updates now</span>
                        {update_msg && <span className="settings-meta">{update_msg}</span>}
                    </div>
                    <div className="settings-actions">
                        {update_available && is_mac && (
                            <button type="button" className="settings-action" onClick={() => void downloadUpdate()}>
                                Download update
                            </button>
                        )}
                        <button type="button" className="settings-action" onClick={() => void checkUpdates()}>
                            Check now
                        </button>
                    </div>
                </div>

                <div className="settings-row">
                    <div className="settings-stack">
                        <span className="settings-label">Vault password</span>
                        <span className="settings-meta">
                            {encrypted ? 'Vault encrypted on disk' : 'Vault unencrypted — Lock won’t require a password'}
                        </span>
                    </div>
                    <button
                        type="button"
                        className="settings-action"
                        disabled={busy}
                        onClick={onSetPassword}
                    >
                        {encrypted ? 'Change' : 'Set'}
                    </button>
                </div>

                {encrypted && (
                    <div className="settings-row">
                        <span className="settings-label">Remove vault password</span>
                        <button
                            type="button"
                            className="settings-action settings-action-danger"
                            disabled={busy}
                            onClick={() => void clearPassword()}
                        >
                            Remove
                        </button>
                    </div>
                )}

                {biometric?.available && (
                    <div className="settings-row">
                        <div className="settings-stack">
                            <span className="settings-label">Unlock with {biometric.label}</span>
                            <span className="settings-meta">
                                {!encrypted && !biometric.enabled
                                    ? 'Set a vault password first'
                                    : 'Password sealed in OS secure storage'}
                            </span>
                        </div>
                        <SettingsToggle
                            label={`Unlock with ${biometric.label}`}
                            checked={biometric.enabled}
                            disabled={busy || (!encrypted && !biometric.enabled)}
                            onChange={(next) => void toggleBiometric(next)}
                        />
                    </div>
                )}

                {vault_msg && (
                    <p className="settings-footnote">{vault_msg}</p>
                )}

                <button type="button" className="settings-row settings-about" onClick={() => void api.showAbout()}>
                    <div className="settings-stack">
                        <span className="settings-label">About OTPeer Authenticator</span>
                        <span className="settings-meta">v{version || '…'}</span>
                        <span className="settings-accent">MIT</span>
                    </div>
                    <span className="settings-chevron" aria-hidden>›</span>
                </button>
            </div>

            <p className="settings-footnote">
                Update checks contact GitHub Releases — the only automatic network use.
                Sync is always user-started. No telemetry.
            </p>
        </div>
    );
}

function IconSync() {
    return (
        <svg className="mi" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12a9 9 0 0 0-15-6.7M3 12a9 9 0 0 0 15 6.7" />
            <path d="M3 4v5h5M21 20v-5h-5" />
        </svg>
    );
}
function IconImport() {
    return (
        <svg className="mi" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
            <path d="M12 3v12" />
            <path d="m8 11 4 4 4-4" />
        </svg>
    );
}
function IconExport() {
    return (
        <svg className="mi" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
            <path d="M12 15V3" />
            <path d="m8 7 4-4 4 4" />
        </svg>
    );
}
function IconCamera() {
    return (
        <svg className="mi" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
            <circle cx="12" cy="13" r="4" />
        </svg>
    );
}
function IconImage() {
    return (
        <svg className="mi" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="9" cy="9" r="2" />
            <path d="m21 15-5-5L5 21" />
        </svg>
    );
}
function IconScreen() {
    return (
        <svg className="mi" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <path d="M8 21h8M12 17v4" />
        </svg>
    );
}
function IconSettings() {
    return (
        <svg className="mi" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
    );
}
function IconTouchId() {
    return (
        <svg className="unlock-touchid-icon" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
                d="M12 3.5c-2.4 0-4.5 1.6-5.2 3.8M12 3.5c2.4 0 4.5 1.6 5.2 3.8M7.5 9.2c-.4 1-.6 2-.6 3.1 0 2.8 1.3 5.2 3.3 6.7M16.5 9.2c.4 1 .6 2 .6 3.1 0 1.4-.3 2.7-.9 3.9"
                stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"
            />
            <path
                d="M9.2 8.2c.7-.9 1.7-1.5 2.8-1.5s2.1.6 2.8 1.5M9.6 18.2c.7.5 1.5.8 2.4.8 1.6 0 3-.8 3.9-2"
                stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"
            />
            <path
                d="M12 9.2v4.2c0 .7-.3 1.3-.8 1.7"
                stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"
            />
        </svg>
    );
}
function IconLock() {
    return (
        <svg className="mi" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="5" y="11" width="14" height="10" rx="2" />
            <path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </svg>
    );
}
function IconEye() {
    return (
        <svg className="mi" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
            <circle cx="12" cy="12" r="3" />
        </svg>
    );
}
function IconEyeOff() {
    return (
        <svg className="mi" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 3l18 18" />
            <path d="M10.6 10.6a3 3 0 0 0 4.2 4.2" />
            <path d="M9.9 5.1A10.8 10.8 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-4.2 5.1" />
            <path d="M6.1 6.1C3.7 7.8 2 12 2 12s3.5 7 10 7c1.2 0 2.3-.2 3.3-.5" />
        </svg>
    );
}
function IconAbout() {
    return (
        <svg className="mi" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 10v6M12 7h.01" />
        </svg>
    );
}
