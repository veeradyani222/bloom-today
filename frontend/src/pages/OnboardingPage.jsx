import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { apiRequest } from '../lib/api';
import { onboardingSteps, AVATAR_IDS } from '../constants/index';
import './OnboardingPage.css';

/* ── Step-named SVG imports ── */
import illustName from '../assets/askingname.svg';
import illustAge from '../assets/askingage.svg';
import illustBaby from '../assets/welcomelittleone.svg';
import illustDoctor from '../assets/seeingdoctor.svg';
import illustTransition from '../assets/thankuforsharing.svg';
import illustCompanionName from '../assets/namecompanion.svg';
import illustCompanionInstr from '../assets/instructcompanion.svg';
import illustRegister from '../assets/settingthingsup.svg';
import illustTherapist from '../assets/connectatherapist.svg';
import illustKey from '../assets/connectionkey.svg';
import illustTrusted from '../assets/connecttrustedperson.svg';
import illustDone from '../assets/youreallset.svg';

import { ScrollPicker } from '../components/ScrollPicker';
import { CompanionCard } from '../components/CompanionCard';
import { TalkingHeadPreview } from '../components/TalkingHeadPreview';
import { Calendar } from '../components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select';
import { Button } from '../components/ui/button';
import { CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '../lib/utils';

const DEFAULT_GEMINI_VOICE = 'Aoede';


/* Map each step id → illustration */
const stepIllustrations = {
  name: illustName,
  age: illustAge,
  babyAge: illustBaby,
  seeingDoctor: illustDoctor,
  transition: illustTransition,
  companionName: illustCompanionName,
  companionInstructions: illustCompanionInstr,
  register: illustRegister,
  connectTherapist: illustTherapist,
  shareTherapistKey: illustKey,
  connectTrusted: illustTrusted,
  shareTrustedKey: illustKey,
  done: illustDone,
};

export function OnboardingPage({ token, session, setSession, saveSession }) {
  const navigate = useNavigate();

  const [stepIndex, setStepIndex] = useState(0);
  const [form, setForm] = useState({
    fullName: session?.user?.full_name || '',
    dob: new Date(new Date().setFullYear(new Date().getFullYear() - 28)),
    babyAgeWeeks: 8,
    seeingDoctor: null,
    companionAvatarId: session?.user?.companion_avatar_id || 'brunette',
    companionVoiceName: session?.user?.companion_voice_name || DEFAULT_GEMINI_VOICE,
    companionName: '',
    companionInstructions: '',
    wantsTherapist: null,
    wantsTrusted: null,
  });
  const [touched, setTouched] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [copied, setCopied] = useState(false);
  const [bodyKey, setBodyKey] = useState(0);
  const [previewNonce, setPreviewNonce] = useState(0);
  const [voiceOptions, setVoiceOptions] = useState([]);
  const [voiceOptionsLoading, setVoiceOptionsLoading] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [transitioning, setTransitioning] = useState(false);

  const step = onboardingSteps[stepIndex];
  const totalSteps = onboardingSteps.length;
  const progress = ((stepIndex + 1) / totalSteps) * 100;
  const therapistKey = session?.user?.therapist_share_key || session?.user?.share_key || '';
  const trustedKey = session?.user?.trusted_share_key || session?.user?.share_key || '';

  /* Load Gemini voices from backend */
  useEffect(() => {
    let cancelled = false;
    async function loadVoices() {
      try {
        setVoiceOptionsLoading(true);
        const data = await apiRequest('/api/gemini/voices', { token });
        if (!cancelled) {
          const voices = data.voices || [];
          setVoiceOptions(voices);

          if (!voices.length) {
            return;
          }

          setForm((prev) => {
            const selectedVoiceStillValid = voices.some((voice) => voice.id === prev.companionVoiceName);
            if (selectedVoiceStillValid) {
              return prev;
            }
            return { ...prev, companionVoiceName: voices[0].id };
          });
        }
      } catch { /* silently fail */ } finally {
        if (!cancelled) setVoiceOptionsLoading(false);
      }
    }
    loadVoices();
    return () => { cancelled = true; };
  }, [token]);



  function setValue(key, value) {
    setError('');
    setForm((prev) => ({ ...prev, [key]: value }));
    setTouched((prev) => ({ ...prev, [key]: true }));
  }

  function selectAvatar(avatarId) {
    setError('');
    setForm((prev) => ({ ...prev, companionAvatarId: avatarId }));
    setTouched((prev) => ({ ...prev, companionAvatarId: true }));
  }

  function selectVoice(voiceName, { preview = true } = {}) {
    setError('');
    setForm((prev) => ({ ...prev, companionVoiceName: voiceName }));
    setTouched((prev) => ({ ...prev, companionVoiceName: true }));
    if (preview) {
      setPreviewNonce((value) => value + 1);
    }
  }

  function isStepValid(currentStep) {
    if (['transition', 'shareKey', 'done', 'register'].includes(currentStep.type)) return true;
    const value = form[currentStep.key];
    if (currentStep.type === 'textarea' && currentStep.key === 'companionInstructions') return true; // Optional step
    if (currentStep.type === 'text' || currentStep.type === 'textarea') return typeof value === 'string' && value.trim().length >= 2;
    if (currentStep.type === 'date') return value instanceof Date && !isNaN(value);
    if (currentStep.type === 'number') return Number.isFinite(value) && value >= currentStep.min && value <= currentStep.max;
    if (currentStep.type === 'single') return value !== '' && value !== null && value !== undefined;
    if (currentStep.type === 'avatarPick') return Boolean(form.companionAvatarId);
    if (currentStep.type === 'voicePick') return Boolean(form.companionVoiceName);
    return false;
  }

  function getNextStepIndex(currentIndex) {
    let next = currentIndex + 1;
    if (next >= totalSteps) return currentIndex;
    const nextStep = onboardingSteps[next];
    if (nextStep.id === 'shareTherapistKey' && form.wantsTherapist !== true) next++;
    if (next < totalSteps && onboardingSteps[next].id === 'shareTrustedKey' && form.wantsTrusted !== true) next++;
    return Math.min(next, totalSteps - 1);
  }

  function getPrevStepIndex(currentIndex) {
    let prev = currentIndex - 1;
    if (prev < 0) return 0;
    const prevStep = onboardingSteps[prev];
    if (prevStep.id === 'shareTherapistKey' && form.wantsTherapist !== true) prev--;
    if (prev >= 0 && onboardingSteps[prev].id === 'shareTrustedKey' && form.wantsTrusted !== true) prev--;
    return Math.max(prev, 0);
  }

  const doRegister = useCallback(async () => {
    if (registered || saving) return;
    setSaving(true);
    setError('');
    try {
        const ageDifMs = Date.now() - form.dob.getTime();
        const ageDate = new Date(ageDifMs);
        const calculatedAge = Math.abs(ageDate.getUTCFullYear() - 1970);

        const data = await apiRequest('/api/me/onboarding', {
          method: 'PUT',
          token,
          body: {
            fullName: form.fullName.trim(),
            age: calculatedAge,
            babyAgeWeeks: Number(form.babyAgeWeeks),
          seeingDoctor: Boolean(form.seeingDoctor),
          companionAvatarId: form.companionAvatarId,
          companionVoiceName: form.companionVoiceName,
          companionName: form.companionName.trim(),
          companionInstructions: form.companionInstructions.trim(),
          assessment: {
            babyAgeWeeks: Number(form.babyAgeWeeks),
            priorProfessionalHelp: Boolean(form.seeingDoctor),
          },
        },
      });
      const updated = { ...session, user: data.user };
      setSession(updated);
      saveSession(updated);
      setRegistered(true);
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSaving(false);
    }
  }, [form, token, session, setSession, saveSession, registered, saving]);

  useEffect(() => {
    if (step.type === 'register' && !registered && !saving) doRegister();
  }, [step, registered, saving, doRegister]);

  /* ── Guard: already onboarded → go to dashboard (must be after all hooks) ── */
  if (session?.user?.onboarding_completed) {
    return <Navigate to="/dashboard" replace />;
  }

  function goNext() {
    setError('');
    setCopied(false);
    if (!isStepValid(step)) { setError('Please complete this step to continue.'); return; }
    if (step.type === 'register' && !registered) return;
    if (step.type === 'done') { navigate('/dashboard'); return; }
    if (step.type === 'transition') {
      setTransitioning(true);
      setTimeout(() => {
        const next = getNextStepIndex(stepIndex);
        setStepIndex(next);
        setBodyKey((k) => k + 1);
        setTransitioning(false);
      }, 600);
      return;
    }
    const next = getNextStepIndex(stepIndex);
    setStepIndex(next);
    setBodyKey((k) => k + 1);
  }

  function goBack() {
    setCopied(false);
    setError('');
    if (registered && stepIndex > onboardingSteps.findIndex((s) => s.id === 'register')) return;
    const prev = getPrevStepIndex(stepIndex);
    setStepIndex(prev);
    setBodyKey((k) => k + 1);
  }

  async function copyKey(keyText) {
    try {
      await navigator.clipboard.writeText(keyText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const el = document.createElement('textarea');
      el.value = keyText;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  const isCentered = ['transition', 'register', 'done'].includes(step.type);
  const canGoBack = stepIndex > 0 && !(registered && stepIndex >= onboardingSteps.findIndex((s) => s.id === 'register'));
  const illustration = stepIllustrations[step.id];

  /* ── Input renderers ── */
  function renderAnswer() {
    if (step.type === 'text') {
      return (
        <input
          className="onb-text-input"
          value={form[step.key]}
          onChange={(e) => setValue(step.key, e.target.value)}
          placeholder={step.placeholder}
          autoFocus
        />
      );
    }

    if (step.type === 'textarea') {
      return (
        <textarea
          className="onb-text-input"
          value={form[step.key]}
          onChange={(e) => setValue(step.key, e.target.value)}
          placeholder={step.placeholder}
          rows={4}
          autoFocus
        />
      );
    }

    if (step.type === 'number') {
      return (
        <div className="w-full flex flex-col items-center">
          <ScrollPicker
            min={step.min}
            max={step.max}
            value={form[step.key]}
            onChange={(val) => setValue(step.key, val)}
          />
          {step.key === 'babyAgeWeeks' && touched[step.key] && form[step.key] !== undefined && (
            <div className="onb-yay-box mt-3 flex items-center justify-center gap-2">
              <span>Woah! {form[step.key]} weeks of joy!</span>
            </div>
          )}
        </div>
      );
    }

    if (step.type === 'date') {
      const ageText = form[step.key] ? (() => {
        const ageDifMs = Date.now() - form[step.key].getTime();
        const ageDate = new Date(ageDifMs);
        return Math.abs(ageDate.getUTCFullYear() - 1970);
      })() : null;

      return (
        <div className="w-full flex flex-col items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant={"outline"}
                className={cn(
                  "w-full max-w-[280px] justify-start text-left font-normal py-6 px-4 text-lg border-2 border-slate-200 text-slate-800 rounded-xl",
                  !form[step.key] && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-3 h-6 w-6 opacity-60 text-pink-600" />
                {form[step.key] ? (
                  format(form[step.key], "PPP")
                ) : (
                  <span>Pick a date</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 rounded-xl border-slate-200 shadow-xl max-w-[90vw] overflow-x-auto" align="center">
              <Calendar
                mode="single"
                selected={form[step.key]}
                onSelect={(date) => { if (date) setValue(step.key, date) }}
                disabled={(date) => date > new Date() || date < new Date("1900-01-01")}
                initialFocus
                defaultMonth={form[step.key]}
                fixedWeeks
              />
            </PopoverContent>
          </Popover>
          {ageText !== null && touched[step.key] && (
            <div className="onb-yay-box mt-3 flex items-center justify-center gap-2">
              <span>Yay! You're {ageText} years young!</span>
            </div>
          )}
        </div>
      );
    }

    if (step.type === 'single') {
      return (
        <div className="onb-options">
          {step.options.map((option) => {
            const isSelected = form[step.key] === option.value;
            return (
              <button
                type="button"
                key={String(option.value)}
                className={`onb-option ${isSelected ? 'selected' : ''}`}
                onClick={() => setValue(step.key, option.value)}
              >
                <span className="onb-option-dot" />
                {option.label}
              </button>
            );
          })}
        </div>
      );
    }

    if (step.type === 'avatarPick') {
      return (
        <div className="companion-grid">
          {AVATAR_IDS.map((id) => (
            <CompanionCard
              key={id}
              avatarId={id}
              selected={form.companionAvatarId === id}
              onSelect={(avatarId) => selectAvatar(avatarId)}
            />
          ))}
        </div>
      );
    }

    if (step.type === 'voicePick') {
      return (
        <div className="voice-pick-step">
          <div className="voice-pick-preview">
            <TalkingHeadPreview
              token={token}
              selectedAvatarId={form.companionAvatarId}
              selectedVoiceName={form.companionVoiceName}
              previewText="Hey, how are you? I'm gonna be there for you in this journey."
              previewNonce={previewNonce}
              onBusyChange={setVoiceBusy}
            />
          </div>
          <div className="voice-pick-controls">
            <label className="voice-pick-label">Voice</label>
            <Select
              value={form.companionVoiceName}
              onValueChange={(val) => selectVoice(val, { preview: false })}
              disabled={voiceOptionsLoading}
            >
              <SelectTrigger className="voice-pick-trigger">
                <SelectValue placeholder={voiceOptionsLoading ? 'Loading voices…' : 'Choose a voice'} />
              </SelectTrigger>
              <SelectContent>
                {voiceOptions.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.label} — {v.blurb}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <button
              type="button"
              className={`voice-pick-play-btn ${voiceBusy ? 'voice-pick-play-btn--busy' : ''}`}
              onClick={() => setPreviewNonce((n) => n + 1)}
              disabled={!form.companionVoiceName || voiceBusy}
            >
              {voiceBusy ? (
                <span className="voice-pick-spinner" />
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18"><polygon points="5 3 19 12 5 21 5 3" /></svg>
              )}
              {voiceBusy ? 'Generating…' : 'Play preview'}
            </button>
          </div>
        </div>
      );
    }

    if (step.type === 'shareKey') {
      const displayKey = step.connectionType === 'therapist' ? therapistKey : trustedKey;
      return (
        <div className="onb-key-card">
          <span className="onb-key-value">
            {displayKey}
          </span>
          <p className="onb-key-hint">
            {step.connectionType === 'therapist'
              ? 'Your therapist can enter this code on CalmNest to connect with you.'
              : 'Your trusted person can enter this code to join your support circle.'}
          </p>
          <button
            type="button"
            className="onb-copy-btn"
            onClick={() => copyKey(displayKey)}
          >
            {copied ? '✓ Copied!' : 'Copy code'}
          </button>
        </div>
      );
    }

    return null;
  }

  /* ── Centered screens (transition / register / done) ── */
  function renderCenteredBody() {
    if (step.type === 'transition') {
      return (
        <div className="onb-transition">
          {illustration && (
            <div className="onb-illust-centered">
              <div className="onb-illust-blob" />
              <img src={illustration} alt="" className="onb-illust-img" />
            </div>
          )}
          <h2>{step.title}</h2>
          <p>{step.subtitle}</p>
        </div>
      );
    }

    if (step.type === 'register') {
      if (!registered) {
        return (
          <div className="onb-loading">
            {illustration && (
              <div className="onb-illust-centered">
                <div className="onb-illust-blob" />
                <img src={illustration} alt="" className="onb-illust-img" />
              </div>
            )}
            <div className="onb-spinner" />
            <h2>{step.title}</h2>
            <p>{step.subtitle}</p>
            {error && <p className="onb-error">{error}</p>}
          </div>
        );
      }
      return (
        <div className="onb-loading">
          {illustration && (
            <div className="onb-illust-centered">
              <div className="onb-illust-blob" />
              <img src={illustration} alt="" className="onb-illust-img" />
            </div>
          )}
          <div className="onb-success-icon">✓</div>
          <h2>Your companion is ready!</h2>
          <p>{form.companionName} is here for you whenever you need a check-in.</p>
        </div>
      );
    }

    if (step.type === 'done') {
      return (
        <div className="onb-done">
          {illustration && (
            <div className="onb-illust-centered">
              <div className="onb-illust-blob" />
              <img src={illustration} alt="" className="onb-illust-img" />
            </div>
          )}
          <h2>{step.title}</h2>
          <p>{step.subtitle}</p>
        </div>
      );
    }

    return null;
  }

  function getButtonLabel() {
    if (step.type === 'done') return 'Go to your dashboard →';
    if (step.type === 'register' && !registered) return 'Please wait…';
    if (step.type === 'register' && registered) return 'Continue';
    if (step.type === 'transition') return transitioning ? "Let's go..." : "Let's do this!";
    if (step.type === 'shareKey') return 'Continue';
    return 'Continue';
  }

  return (
    <main className="onb">
      <div className="onb-card">
        {/* Progress bar */}
        <div className="onb-progress-bar">
          <div className="onb-progress-fill" style={{ width: `${progress}%` }} />
        </div>

        {/* Header */}
        <div className="onb-header">
          <button
            type="button"
            className="onb-back"
            onClick={goBack}
            disabled={!canGoBack}
            aria-label="Go back"
          >
            ‹
          </button>
          <span className="onb-step-label">
            {stepIndex + 1} / {totalSteps}
          </span>
        </div>

        {/* Body */}
        <div
          className={`onb-body ${isCentered ? 'onb-body--centered' : ''}`}
          key={bodyKey}
        >
          {isCentered ? (
            renderCenteredBody()
          ) : (
            <>
              {/* Illustration area */}
              {illustration && (
                <div className="onb-illust-side">
                  <div className="onb-illust-blob" />
                  <img src={illustration} alt="" className="onb-illust-img" />
                </div>
              )}

              <div className="onb-content">
                <div className="onb-question">
                  <h2>{step.title}</h2>
                  {step.subtitle && <p>{step.subtitle}</p>}
                </div>
                <div className="onb-answer">
                  {renderAnswer()}
                  {error && <p className="onb-error">{error}</p>}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer CTA */}
        <div className="onb-footer">
          <button
            type="button"
            className={`onb-continue ${step.type === 'done' ? 'green' : ''}`}
            onClick={goNext}
            disabled={step.type === 'register' && !registered}
          >
            {getButtonLabel()}
          </button>
        </div>
      </div>
    </main>
  );
}
