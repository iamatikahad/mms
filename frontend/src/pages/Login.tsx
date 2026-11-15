import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useApp } from '../store';
import Logo from '../components/Logo';

export default function Login() {
  const { t } = useTranslation();
  const { login, user, messName } = useApp();
  const nav = useNavigate();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [welcoming, setWelcoming] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const welcomeRef = useRef(false);

  React.useEffect(() => {
    if (user && !welcomeRef.current) nav(user.role === 'MEMBER' ? '/member' : '/admin', { replace: true });
  }, [user, nav]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    welcomeRef.current = false;
    try {
      welcomeRef.current = true; // suppress auto-nav; we navigate after the interstitial
      const u = await login(identifier, password);
      if (remember) localStorage.setItem('remembered_user', identifier);
      setWelcoming(true);
      setTimeout(() => setLeaving(true), 2900);
      setTimeout(() => {
        const role = u?.role || user?.role;
        nav(role === 'MEMBER' ? '/member' : '/admin', { replace: true });
      }, 3400);
    } catch {
      welcomeRef.current = false;
      setErr(t('invalidCredentials'));
    } finally { setBusy(false); }
  };

  return (
    <div className="lp-root">
      {/* ═══ LEFT — branded cinematic panel ═══ */}
      <div className="lp-brand">
        <div className="lp-brand-bg" />
        <div className="lp-brand-glow lp-brand-glow-1" />
        <div className="lp-brand-glow lp-brand-glow-2" />
        {/* concentric emblem rings */}
        <div className="lp-ring lp-ring-1" />
        <div className="lp-ring lp-ring-2" />
        <div className="lp-ring lp-ring-3" />
        {/* gold particles */}
        {Array.from({ length: 18 }).map((_, i) => (
          <span key={i} className="lp-particle" style={{
            left: `${(i * 53 + 9) % 100}%`,
            top: `${(i * 37 + 5) % 100}%`,
            animationDelay: `${(i % 6) * 1.1}s`,
            animationDuration: `${7 + (i % 6)}s`,
            width: `${2 + (i % 3)}px`, height: `${2 + (i % 3)}px`,
          }} />
        ))}
        {/* vertical gold hairline */}
        <div className="lp-hairline" />

        <div className="lp-brand-inner">
          <div className="lp-logo-wrap">
            <div className="lp-logo-glow">
              <Logo size={230} />
            </div>
          </div>
          <div className="lp-brand-divider" />
          <h1 className="lp-brand-name">{messName}</h1>
          <p className="lp-brand-tag">{t('messTagline')}</p>
          <div className="lp-brand-chips">
            <span className="lp-chip">{t('communityDining')}</span>
            <span className="lp-chip">{t('mealManagement')}</span>
          </div>
        </div>

        <div className="lp-brand-foot">
          <span className="lp-foot-line" />
          Developed &amp; Maintained by Atikahad
          <span className="lp-foot-line" />
        </div>
      </div>

      {/* ═══ RIGHT — form panel ═══ */}
      <div className="lp-form">
        {/* mobile brand strip */}
        <div className="lp-mobile-brand">
          <Logo size={72} />
          <div>
            <div className="lp-mobile-name">{messName}</div>
            <div className="lp-mobile-sub">{t('messTagline')}</div>
          </div>
        </div>

        <div className="lp-form-inner">
          <div className="lp-form-head">
            <h2 className="lp-form-title">{t('welcomeBack')}</h2>
            <p className="lp-form-sub">{t('signInSubtitle')}</p>
          </div>

          <form onSubmit={submit} className="lp-fields">
            <div className="lp-field">
              <label htmlFor="li-identifier">{t('emailOrPhone')}</label>
              <div className="lp-input-wrap">
                <span className="lp-input-icon">👤</span>
                <input
                  id="li-identifier"
                  value={identifier}
                  onChange={e => setIdentifier(e.target.value)}
                  required autoFocus autoComplete="username"
                  placeholder={t('emailOrPhone')}
                />
              </div>
            </div>

            <div className="lp-field">
              <label htmlFor="li-password">{t('password')}</label>
              <div className="lp-input-wrap">
                <span className="lp-input-icon">🔒</span>
                <input
                  id="li-password"
                  type={show ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required autoComplete="current-password"
                  placeholder="••••••••"
                />
                <button type="button" aria-label="toggle password" className="lp-pw-toggle"
                  onClick={() => setShow(s => !s)}>
                  {show ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            <div className="lp-row">
              <label className="lp-remember">
                <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} />
                <span className="lp-check" />
                {t('rememberMe')}
              </label>
              <span className="lp-forgot">{t('forgotPassword')}</span>
            </div>

            {err && <div className="lp-error">{err}</div>}

            <button type="submit" className="lp-btn" disabled={busy}>
              {busy ? <span className="lp-spinner" /> : (
                <>
                  <span>{t('login')}</span>
                  <span className="lp-btn-arrow">→</span>
                </>
              )}
            </button>
          </form>

          <p className="lp-form-foot">Developed &amp; Maintained by Atikahad</p>
        </div>
      </div>

      {/* ── Welcome interstitial ── */}
      {welcoming && (
        <div className={`wl-overlay ${leaving ? 'wl-leave' : ''}`}>
          <div className="wl-particles">
            {Array.from({ length: 22 }).map((_, i) => (
              <span key={i} className="wl-particle" style={{
                left: `${(i * 47 + 7) % 100}%`,
                top: `${(i * 31 + 11) % 100}%`,
                animationDelay: `${(i % 8) * 0.35}s`,
                width: `${2 + (i % 4)}px`, height: `${2 + (i % 4)}px`,
              }} />
            ))}
          </div>
          <div className="wl-ring" />
          <div className="wl-logo-wrap">
            <div className="wl-logo-glow">
              <Logo size={170} />
            </div>
            <div className="wl-sweep" />
          </div>
          <div className="wl-text">{t('welcomeToMms')}</div>
          <div className="wl-sub">{messName}</div>
          <div className="wl-bar"><span /></div>
        </div>
      )}
    </div>
  );
}
