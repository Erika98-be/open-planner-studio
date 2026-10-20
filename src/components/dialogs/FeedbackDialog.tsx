/**
 * FeedbackDialog — feedback-knop → Open Feedback Studio (OpenAEC).
 *
 * Patroon: vergelijkbaar met UpdateDialog.tsx / SettingsDialog.tsx.
 * - Overlay + paneel, sluiten via setUI en Escape-handler. Bewust GEEN backdrop-close:
 *   de dialoog bevat een tekstveld, en een klik naast het paneel mag getypte tekst niet weggooien.
 * - Alle tekst via t('feedback.xxx') (common-namespace).
 * - @tauri-apps/* UITSLUITEND dynamisch geïmporteerd binnen isTauri()-branches (in de service).
 * - Screenshot via modern-screenshot domToPng; dialoog uitgefilterd.
 * - Annotatie: gedelegeerd aan <ScreenshotAnnotator/> (thumbnail + grote editor).
 * - Hoofdweg: `submitFeedback()` post naar de API; daarna het bedankscherm.
 * - Terugval bij een netwerk- of serverfout: de knop "Open op GitHub" volgt de oude weg
 *   (PAD A: URL meteen open; PAD B: screenshot op klembord + plak-instructie).
 */

import { useState, useCallback, useRef } from 'react';
import { useAppStore } from '@/state/appStore';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import {
  submitFeedback,
  prepareGitHubFallback,
  openFeedbackUrl,
  feedbackUserText,
  isValidFeedbackEmail,
  FeedbackSubmitError,
  FEEDBACK_MESSAGE_MIN,
  type FeedbackErrorKind,
  type FeedbackType,
  type SendResult,
  type SubmitFeedbackResult,
} from '@/services/feedback/feedbackService';
import { saveFeedbackEmail } from '@/utils/settingsStore';
import { useDialogKeys } from '@/hooks/useDialogKeys';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { ScreenshotAnnotator } from './ScreenshotAnnotator';
import './FeedbackDialog.css';

/** Max lengtes van de velden: samen met de metaregel blijft `message` onder de servergrens (5000). */
const TITLE_MAX = 200;
const DESCRIPTION_MAX = 4600;

const ERROR_KEYS = {
  validation: 'feedback.errorValidation',
  rateLimited: 'feedback.errorRateLimited',
  duplicate: 'feedback.errorDuplicate',
  failed: 'feedback.errorFailed',
} as const satisfies Record<FeedbackErrorKind, string>;

// ─── Component ────────────────────────────────────────────────────────────────

export function FeedbackDialog() {
  const { t } = useTranslation('common');
  const setUI = useAppStore(s => s.setUI);
  const storedEmail = useAppStore(s => s.ui.feedbackEmail);

  // Form-state
  const [feedbackType, setFeedbackType] = useState<FeedbackType>('bug');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [email, setEmail] = useState(storedEmail);
  const [attachScreenshot, setAttachScreenshot] = useState(false);

  // Screenshot-state
  const [screenshotDataUrl, setScreenshotDataUrl] = useState<string | null>(null);
  // Door ScreenshotAnnotator geleverde geflattende PNG (screenshot + annotaties).
  // Null zolang er nog niet geannoteerd is → val terug op de rauwe screenshot.
  const [annotatedDataUrl, setAnnotatedDataUrl] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);

  // Verstuur-state
  const [sending, setSending] = useState(false);
  const [submitError, setSubmitError] = useState<FeedbackErrorKind | null>(null);
  const [sent, setSent] = useState<SubmitFeedbackResult | null>(null);
  // Terugval PAD B: plak-instructie voor GitHub.
  const [fallback, setFallback] = useState<SendResult | null>(null);

  const close = useCallback(() => setUI({ showFeedbackDialog: false }), [setUI]);

  // Focus-trap (a11y): eigen overlay (geen shared Dialog), role/aria-modal staan al op het paneel.
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef);

  // Escape sluit de dialoog (niet tijdens versturen: dan is de handler `undefined` en doet de
  // hook niets). De overlay zelf blijft custom CSS-chrome — geen `Dialog`-migratie hier.
  useDialogKeys({ onCancel: sending ? undefined : close });

  // ── Validatie vooraf ───────────────────────────────────────────────────────
  const trimmedEmail = email.trim();
  const emailOk = trimmedEmail === '' || isValidFeedbackEmail(trimmedEmail);
  const titleOk = title.trim().length > 0;
  const lengthOk = feedbackUserText(title, description).length >= FEEDBACK_MESSAGE_MIN;
  const formHint: string | null = !titleOk
    ? t('feedback.titleRequired')
    : !lengthOk
      ? t('feedback.tooShort')
      : !emailOk
        ? t('feedback.emailInvalid')
        : null;
  const canSubmit = !sending && !capturing && formHint === null;

  // ── Screenshot maken ───────────────────────────────────────────────────────
  const captureScreenshot = useCallback(async () => {
    setCapturing(true);
    setCaptureError(null);
    try {
      const { domToPng } = await import('modern-screenshot');
      const dataUrl = await domToPng(document.getElementById('root') ?? document.body, {
        // Filter de dialoog zelf weg zodat de achterliggende app-scherm verschijnt.
        filter: (node) =>
          !(node instanceof HTMLElement && node.closest?.('.feedback-dialog-overlay') !== null),
      });
      setScreenshotDataUrl(dataUrl);
      setAnnotatedDataUrl(null);
    } catch (err) {
      console.warn('Screenshot mislukt:', err);
      setCaptureError(t('feedback.captureFailed'));
      setAttachScreenshot(false);
      setScreenshotDataUrl(null);
      setAnnotatedDataUrl(null);
    } finally {
      setCapturing(false);
    }
  }, [t]);

  const handleAttachToggle = useCallback((checked: boolean) => {
    setAttachScreenshot(checked);
    if (checked && !screenshotDataUrl) {
      void captureScreenshot();
    }
    if (!checked) {
      setScreenshotDataUrl(null);
      setAnnotatedDataUrl(null);
      setCaptureError(null);
    }
  }, [screenshotDataUrl, captureScreenshot]);

  // De geflattende PNG uit de annotator (screenshot + annotaties); is er nog niet geannoteerd,
  // dan de rauwe screenshot.
  const flatScreenshot = (): string | null =>
    attachScreenshot ? (annotatedDataUrl ?? screenshotDataUrl) : null;

  // ── Versturen (hoofdweg) ─────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSending(true);
    setSubmitError(null);
    try {
      const res = await submitFeedback({
        type: feedbackType,
        title: title.trim(),
        description: description.trim(),
        screenshotDataUrl: flatScreenshot(),
        email: trimmedEmail,
      });
      if (trimmedEmail !== storedEmail) {
        setUI({ feedbackEmail: trimmedEmail });
        void saveFeedbackEmail(trimmedEmail);
      }
      setSent(res);
    } catch (err) {
      console.warn('Feedback versturen mislukt:', err);
      setSubmitError(err instanceof FeedbackSubmitError ? err.kind : 'failed');
    } finally {
      setSending(false);
    }
  };

  // ── Terugval: de oude GitHub-weg ─────────────────────────────────────────
  const handleGitHubFallback = async () => {
    setSending(true);
    try {
      const flat = flatScreenshot();
      const res = await prepareGitHubFallback({
        type: feedbackType,
        title: title.trim(),
        description: description.trim(),
        screenshotDataUrl: flat,
      });
      // PAD B (mét screenshot): toon de plak-instructie; GitHub opent PAS nadat de gebruiker daar
      // op "OK" klikt (zo staat de screenshot al op het klembord vóór de issue-pagina opent).
      // PAD A (zónder screenshot): geen plakstap → open GitHub meteen en sluit.
      if (flat) {
        setFallback(res);
      } else {
        await openFeedbackUrl(res.githubUrl);
        close();
      }
    } catch (err) {
      console.error('GitHub-terugval mislukt:', err);
    } finally {
      setSending(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="feedback-dialog-overlay">
      <div
        ref={dialogRef}
        className="feedback-dialog"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t('feedback.title')}
      >
        {/* Header */}
        <div className="feedback-dialog-header">
          <span className="feedback-dialog-title">{t('feedback.title')}</span>
          <button
            className="modal-close-btn"
            onClick={close}
            disabled={sending}
            title={t('feedback.cancel')}
            aria-label={t('feedback.cancel')}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="feedback-dialog-body">
          {sent ? (
            /* ── Bedankscherm (hoofdweg geslaagd) ── */
            <div className="feedback-confirm" data-feedback-sent>
              <p className="feedback-confirm-title" role="status">{t('feedback.sentTitle')}</p>
              {sent.screenshotDropped && (
                <p className="feedback-confirm-fallback">{t('feedback.sentScreenshotDropped')}</p>
              )}
            </div>
          ) : fallback ? (
            /* ── Terugval PAD B: plak-instructie voor GitHub ── */
            <div className="feedback-confirm">
              <p className="feedback-confirm-title">{t('feedback.instructionTitle')}</p>
              <ol className="feedback-confirm-steps">
                <li>{t('feedback.instructionStep1')}</li>
                <li>{t('feedback.instructionStep2')}</li>
                <li>{t('feedback.instructionStep3')}</li>
                <li>{t('feedback.instructionStep4')}</li>
              </ol>
              {fallback.savedPath && (
                <p className="feedback-confirm-fallback">
                  {t('feedback.instructionFallback', { path: fallback.savedPath })}
                </p>
              )}
            </div>
          ) : (
            /* ── Formulier ── */
            <>
              {/* Type-schakelaar */}
              <div className="feedback-type-row">
                <button
                  className={`feedback-type-btn${feedbackType === 'bug' ? ' active' : ''}`}
                  onClick={() => setFeedbackType('bug')}
                  disabled={sending}
                >
                  {t('feedback.typeBug')}
                </button>
                <button
                  className={`feedback-type-btn${feedbackType === 'feature' ? ' active' : ''}`}
                  onClick={() => setFeedbackType('feature')}
                  disabled={sending}
                >
                  {t('feedback.typeFeature')}
                </button>
              </div>

              {/* Titel */}
              <div className="feedback-field">
                <label className="feedback-label" htmlFor="feedback-title">{t('feedback.fieldTitle')}</label>
                <input
                  id="feedback-title"
                  className="feedback-input"
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder={t('feedback.fieldTitle')}
                  maxLength={TITLE_MAX}
                  readOnly={sending}
                  autoFocus
                />
              </div>

              {/* Omschrijving */}
              <div className="feedback-field">
                <label className="feedback-label" htmlFor="feedback-description">{t('feedback.fieldDescription')}</label>
                <textarea
                  id="feedback-description"
                  className="feedback-textarea"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder={t('feedback.fieldDescription')}
                  maxLength={DESCRIPTION_MAX}
                  readOnly={sending}
                  rows={4}
                />
              </div>

              {/* E-mailadres (optioneel) */}
              <div className="feedback-field">
                <label className="feedback-label" htmlFor="feedback-email">{t('feedback.fieldEmail')}</label>
                <input
                  id="feedback-email"
                  className="feedback-input"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  maxLength={254}
                  readOnly={sending}
                  aria-invalid={!emailOk}
                />
              </div>

              {/* Screenshot-schakelaar */}
              <div className="feedback-screenshot-toggle">
                <label className="feedback-toggle-label">
                  <input
                    type="checkbox"
                    checked={attachScreenshot}
                    onChange={e => handleAttachToggle(e.target.checked)}
                    disabled={sending}
                  />
                  <span>{t('feedback.attachScreenshot')}</span>
                </label>
              </div>

              {/* Capture-melding */}
              {capturing && (
                <p className="feedback-capturing">{t('feedback.capturing')}</p>
              )}
              {captureError && (
                <p className="feedback-error">{captureError}</p>
              )}

              {/* Screenshot-thumbnail + annotatie-editor */}
              {attachScreenshot && screenshotDataUrl && !capturing && (
                <ScreenshotAnnotator
                  screenshotDataUrl={screenshotDataUrl}
                  onChange={setAnnotatedDataUrl}
                />
              )}

              {/* Fout bij versturen (vertaald; de ingevulde tekst blijft staan) */}
              {submitError && (
                <p className="feedback-error" role="alert" data-feedback-error={submitError}>
                  {t(ERROR_KEYS[submitError])}
                </p>
              )}

              {/* Waarom de knop grijs is */}
              {formHint && (title.length > 0 || description.length > 0 || !emailOk) && (
                <p className="feedback-hint" data-feedback-hint>{formHint}</p>
              )}

              <p className="feedback-privacy">{t('feedback.privacy')}</p>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="feedback-dialog-footer">
          {sent ? (
            <>
              {sent.githubIssueUrl && (
                <button
                  className="btn btn--sm btn--secondary"
                  onClick={() => { if (sent.githubIssueUrl) void openFeedbackUrl(sent.githubIssueUrl); }}
                >
                  {t('feedback.viewOnGithub')}
                </button>
              )}
              <button className="btn btn--sm btn--primary" onClick={close} autoFocus>
                {t('feedback.close')}
              </button>
            </>
          ) : fallback ? (
            <button
              className="btn btn--sm btn--primary"
              onClick={() => { void openFeedbackUrl(fallback.githubUrl); close(); }}
            >
              {t('feedback.openGithub')}
            </button>
          ) : (
            <>
              <button
                className="btn btn--sm btn--secondary"
                onClick={close}
                disabled={sending}
              >
                {t('feedback.cancel')}
              </button>
              {submitError === 'failed' && (
                <button
                  className="btn btn--sm btn--secondary"
                  onClick={() => void handleGitHubFallback()}
                  disabled={sending}
                >
                  {t('feedback.fallbackGithub')}
                </button>
              )}
              <button
                className="btn btn--sm btn--primary"
                onClick={() => void handleSubmit()}
                disabled={!canSubmit}
              >
                {sending ? t('feedback.sending') : t('feedback.submit')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
