import React, { useEffect, useState } from 'react';
import { fallbackLetter, letterBg, resolveIssuerDomain } from './issuer_icons';

export function IssuerAvatar({ issuer, name }: { issuer?: string; name: string }) {
    const domain = resolveIssuerDomain(issuer, name);
    const [src, setSrc] = useState<string | null>(null);
    const [failed, setFailed] = useState(false);
    const letter = fallbackLetter(issuer, name);
    const seed = issuer || name;

    useEffect(() => {
        let cancelled = false;
        setSrc(null);
        setFailed(false);
        if (!domain) {
            setFailed(true);
            return;
        }
        window.otpeer.resolveIssuerIcon(domain).then((url) => {
            if (cancelled) return;
            if (url) setSrc(url);
            else setFailed(true);
        }).catch(() => {
            if (!cancelled) setFailed(true);
        });
        return () => { cancelled = true; };
    }, [domain]);

    if (!src || failed) {
        return (
            <span className="issuer-avatar letter" style={{ background: letterBg(seed) }} aria-hidden>
                {letter}
            </span>
        );
    }

    return (
        <span className="issuer-avatar image" aria-hidden>
            <img src={src} alt="" onError={() => setFailed(true)} />
        </span>
    );
}
