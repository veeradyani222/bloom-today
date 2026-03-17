import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Baby,
  Battery,
  BedDouble,
  ChevronLeft,
  ChevronRight,
  Compass,
  Flame,
  Heart,
  LayoutDashboard,
  MessageCircle,
  Moon,
  MoveDown,
  MoveUp,
  Minus,
  Phone,
  Pencil,
  Send,
  Shield,
  Smile,
  Sparkles,
  Star,
  Sun,
  Target,
  Trophy,
  User,
  Video,
  X,
  Zap,
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import thankYouIllustration from '../assets/thankuforsharing.svg';
import welcomeIllustration from '../assets/welcomelittleone.svg';
import groupStoryIllustration from '../assets/Group (7).svg';
import nameCompanionIllustration from '../assets/namecompanion.svg';
import firstCallIllustration from '../assets/first call.jpg';
import streakIllustration from '../assets/streak.jpg';
import { CenteredDashboardLoader } from '../components/dashboard/OverviewStates';
import { useDashboardData } from './useDashboardData';
import './DashboardPage.css';

const NAV_ITEMS = [
  { id: 'overview', label: 'Overview', path: '/dashboard', icon: LayoutDashboard },
  { id: 'browse', label: 'Browse', path: '/browse', icon: Compass },
  { id: 'you', label: 'You', path: '/you', icon: User },
];

const MOOD_ICONS = [
  { key: 'great', label: 'Great', Icon: Sun, color: '#ec4899' },
  { key: 'good', label: 'Good', Icon: Smile, color: '#a855f7' },
  { key: 'okay', label: 'Okay', Icon: Moon, color: '#8b5cf6' },
  { key: 'low', label: 'Low', Icon: BedDouble, color: '#f43f5e' },
  { key: 'tough', label: 'Tough', Icon: Shield, color: '#be123c' },
];

const METRIC_META = {
  mood: { label: 'Mood', color: '#ec4899', icon: Smile },
  energy: { label: 'Energy', color: '#a855f7', icon: Battery },
  sleep: { label: 'Sleep', color: '#8b5cf6', icon: Moon },
  stress: { label: 'Stress', color: '#f43f5e', icon: Zap },
};

const SCORE_RING_META = {
  moodBalance: {
    label: 'Mood',
    color: '#9d174d',
    bg: '#fce7f3',
    borderColor: '#831843',
    icon: Smile,
    seriesKey: 'mood',
    relatedKeys: ['energyLevel', 'sleepQuality', 'stressLoad'],
  },
  energyLevel: {
    label: 'Energy',
    color: '#92400e',
    bg: '#fef3c7',
    borderColor: '#78350f',
    icon: Battery,
    seriesKey: 'energy',
    relatedKeys: ['sleepQuality', 'stressLoad', 'moodBalance'],
  },
  sleepQuality: {
    label: 'Sleep',
    color: '#1d4ed8',
    bg: '#dbeafe',
    borderColor: '#1e3a8a',
    icon: Moon,
    seriesKey: 'sleep',
    relatedKeys: ['energyLevel', 'stressLoad', 'moodBalance'],
  },
  stressLoad: {
    label: 'Calm',
    color: '#166534',
    bg: '#dcfce7',
    borderColor: '#14532d',
    icon: Sun,
    seriesKey: 'stress',
    relatedKeys: ['sleepQuality', 'energyLevel', 'moodBalance'],
    invert: true,
  },
};

const BADGE_DEFS = [
  { id: 'first_call', label: 'First call', img: firstCallIllustration, need: 1, unit: 'calls' },
  { id: 'streak', label: 'Streak maintained', img: streakIllustration, need: 3, unit: 'streak' },
];

const TIPS_LIBRARY = [
  { category: 'stress', tip: 'Try one slow breathing reset today and let it be the only thing you have to do for that minute.' },
  { category: 'stress', tip: 'Reduce one input for ten minutes today: no notifications, no chores, no multitasking.' },
  { category: 'sleep', tip: 'Protect the next short rest window you can get instead of waiting for an ideal break.' },
  { category: 'sleep', tip: 'Make the next rest block easier by setting out water, a charger, and anything you need first.' },
  { category: 'energy', tip: 'Use your best energy on the one thing that would make the rest of today feel lighter.' },
  { category: 'energy', tip: 'Eat or drink something simple before reaching for another task.' },
  { category: 'mood', tip: 'Pick one small thing that usually helps you feel a bit more like yourself and do only that.' },
  { category: 'mood', tip: 'Text one person who feels safe instead of sitting with everything on your own.' },
  { category: 'general', tip: 'Let one good-enough choice count as progress today.' },
  { category: 'general', tip: 'Choose the next helpful step, not the whole plan.' },
];

const FALLBACK_MOM_TIPS = [
  { tip: 'The dishes can wait. Holding your baby is never a waste of time.', full_name: 'A fellow mom' },
  { tip: "It's okay to cry. It's okay to feel overwhelmed. It's okay to ask for help.", full_name: 'A fellow mom' },
  { tip: 'Your body just did something incredible. Be patient with it.', full_name: 'A fellow mom' },
  { tip: "Some days surviving is thriving. And that's perfectly okay.", full_name: 'A fellow mom' },
  { tip: 'Trust your instincts. You know your baby better than anyone.', full_name: 'A fellow mom' },
];

function scoreLabel(score, mode = 'positive') {
  const value = Number(score) || 0;
  const normalized = mode === 'stress' ? 100 - value : value;
  if (normalized >= 75) return 'steady';
  if (normalized >= 55) return 'warming up';
  if (normalized >= 35) return 'delicate';
  return mode === 'stress' ? 'heavy' : 'drained';
}

function getDisplayScore(rawScore, invert = false) {
  const normalized = Math.max(0, Math.min(100, Number(rawScore) || 0));
  return invert ? 100 - normalized : normalized;
}

function describeScoreLevel(score, invert = false) {
  const normalized = getDisplayScore(score, invert);
  if (normalized >= 75) return 'strong';
  if (normalized >= 55) return 'holding steady';
  if (normalized >= 35) return 'under pressure';
  return invert ? 'stretched thin' : 'running low';
}

function getMetricValue(scores, key) {
  return Math.max(0, Math.min(100, Number(scores?.[key]) || 0));
}

function getRelatedScoreInsight(primaryKey, relatedKey, scores) {
  const value = getMetricValue(scores, relatedKey);

  if (relatedKey === 'stressLoad') {
    if (value >= 70) return 'higher stress is adding noticeable pressure';
    if (value >= 55) return 'some stress is still weighing on things';
    if (value <= 35) return 'lighter stress is giving you more room to recover';
    return '';
  }

  if (relatedKey === 'sleepQuality') {
    if (value <= 35) return primaryKey === 'sleepQuality'
      ? 'recent rest looks especially depleted'
      : 'weaker sleep is dragging this score down';
    if (value <= 50) return 'sleep is only partly restoring you right now';
    if (value >= 70) return 'better sleep is helping stabilize this';
    return '';
  }

  if (relatedKey === 'energyLevel') {
    if (value <= 35) return primaryKey === 'energyLevel'
      ? 'your energy reserves look especially low'
      : 'lower energy is making this feel heavier';
    if (value <= 50) return 'energy looks a bit limited today';
    if (value >= 70) return 'solid energy is giving this some support';
    return '';
  }

  if (relatedKey === 'moodBalance') {
    if (value <= 35) return 'your mood still looks strained';
    if (value <= 50) return 'your mood has been mixed rather than settled';
    if (value >= 70) return 'a steadier mood is helping here';
  }

  return '';
}

function getTrendInsight(daySeries, scoreKey, invert = false) {
  const seriesKey = SCORE_RING_META[scoreKey]?.seriesKey;
  const points = daySeries?.today?.points || [];

  if (!seriesKey || points.length < 2) return '';

  const latestRaw = Number(points[points.length - 1]?.[seriesKey]);
  const previous = points
    .slice(0, -1)
    .map((point) => Number(point?.[seriesKey]))
    .filter((value) => Number.isFinite(value));

  if (!Number.isFinite(latestRaw) || !previous.length) return '';

  const previousAverage = previous.reduce((sum, value) => sum + value, 0) / previous.length;
  const latest = invert ? 10 - latestRaw : latestRaw;
  const baseline = invert ? 10 - previousAverage : previousAverage;
  const delta = latest - baseline;

  if (delta >= 0.7) return `Compared with your earlier check-ins today, this has moved up by about ${delta.toFixed(1)} points.`;
  if (delta <= -0.7) return `Compared with your earlier check-ins today, this has slipped by about ${Math.abs(delta).toFixed(1)} points.`;
  return 'Compared with your earlier check-ins today, this is staying fairly steady.';
}

function buildScoreReason(key, scores, daySeries) {
  const meta = SCORE_RING_META[key];

  if (!meta) return 'Keep checking in to build more context for this score.';

  const rawScore = getMetricValue(scores, key);
  const displayScore = getDisplayScore(rawScore, meta.invert);
  const outOfTen = Math.round(displayScore / 10);
  const level = describeScoreLevel(rawScore, meta.invert);

  const lead = meta.invert
    ? `Your calm is ${outOfTen}/10 because it is calculated from your stress load. A stress score of ${Math.round(rawScore / 10)}/10 leaves calm at ${outOfTen}/10, which reads as ${level}.`
    : `Your ${meta.label.toLowerCase()} is ${outOfTen}/10 right now, which reads as ${level}.`;

  const relatedInsights = meta.relatedKeys
    .map((relatedKey) => getRelatedScoreInsight(key, relatedKey, scores))
    .filter(Boolean)
    .slice(0, 2);

  const context = relatedInsights.length
    ? `${relatedInsights[0].charAt(0).toUpperCase()}${relatedInsights[0].slice(1)}${relatedInsights[1] ? `, and ${relatedInsights[1]}.` : '.'}`
    : '';

  const trend = getTrendInsight(daySeries, key, meta.invert);

  return [lead, context, trend].filter(Boolean).join(' ');
}

export function toMomVoice(text, firstName) {
  if (!text) return '';
  return text
    .replaceAll(`${firstName} had`, 'You had')
    .replaceAll(`${firstName} is`, 'You are')
    .replaceAll(`${firstName} shared`, 'You shared')
    .replaceAll(`${firstName}`, 'You')
    .replaceAll("She's", "You're")
    .replaceAll("she's", "you're")
    .replaceAll('She is', 'You are')
    .replaceAll('she is', 'you are')
    .replaceAll("her baby's", "your baby's")
    .replaceAll('her baby', 'your baby')
    .replaceAll('her body', 'your body')
    .replaceAll('her recovery', 'your recovery');
}

function formatDateTime(value) {
  if (!value) return 'No calls yet';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

export function computeBloomScore(scores, activity = {}, daySeries) {
  const supportConnection = Number(scores?.supportConnection) || 0;
  const selfKindness = Number(scores?.selfKindness) || 0;
  const weekCalls = Number(activity?.weekCalls) || 0;
  const monthCalls = Number(activity?.monthCalls) || 0;
  const streak = computeStreak(daySeries);

  const showingUpScore = Math.min(100, Math.round(
    (Math.min(weekCalls, 5) / 5) * 65
    + (Math.min(monthCalls, 12) / 12) * 20
    + (Math.min(streak, 5) / 5) * 15
  ));

  const total = (showingUpScore * 0.55) + (supportConnection * 0.3) + (selfKindness * 0.15);
  return Math.round(Math.max(0, Math.min(100, total)));
}

export function computeBloomScoreReason(scores, activity = {}, daySeries) {
  const weekCalls = Number(activity?.weekCalls) || 0;
  const supportConnection = Math.round(Number(scores?.supportConnection) || 0);
  const selfKindness = Math.round(Number(scores?.selfKindness) || 0);
  const streak = computeStreak(daySeries);

  const showingUpSummary = weekCalls > 0
    ? `You've shown up for ${weekCalls} check-in${weekCalls === 1 ? '' : 's'} this week${streak > 0 ? ` and built a ${streak}-day streak` : ''}.`
    : 'Bloom starts building this score once you begin showing up for check-ins.';

  const supportSummary = supportConnection > 0
    ? `Your support score is ${supportConnection}, which reflects how much you're reaching out and letting support in.`
    : 'Asking for help more often will lift this score.';

  const selfKindnessSummary = selfKindness > 0
    ? 'Self-kindness adds a smaller boost, so this still rewards how gently you are treating yourself.'
    : 'Being gentler with yourself can add a small lift too.';

  return `${showingUpSummary} ${supportSummary} ${selfKindnessSummary} It does not drop just because stress is high.`;
}

export function computeStreak(daySeries) {
  const points = daySeries?.month?.points || [];
  let streak = 0;
  for (let index = points.length - 1; index >= 0; index -= 1) {
    if (points[index].callCount > 0) streak += 1;
    else break;
  }
  return streak;
}

export function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function getRelevantTips(scores) {
  const tips = [];
  if (scores) {
    if ((scores.stressLoad || 0) > 60) tips.push(...TIPS_LIBRARY.filter((tip) => tip.category === 'stress'));
    if ((scores.sleepQuality || 0) < 50) tips.push(...TIPS_LIBRARY.filter((tip) => tip.category === 'sleep'));
    if ((scores.energyLevel || 0) < 50) tips.push(...TIPS_LIBRARY.filter((tip) => tip.category === 'energy'));
    if ((scores.moodBalance || 0) < 50) tips.push(...TIPS_LIBRARY.filter((tip) => tip.category === 'mood'));
  }
  if (tips.length < 3) tips.push(...TIPS_LIBRARY.filter((tip) => tip.category === 'general'));
  return tips.slice(0, 6);
}

function moodHeatColor(value) {
  if (!value || value === 0) return '#f9fafb';
  if (value >= 7) return '#ec4899';
  if (value >= 5) return '#f9a8d4';
  if (value >= 3) return '#ddd6fe';
  return '#fda4af';
}

function PopupOverlay({ children, onClose }) {
  return (
    <div className="dash-popup-overlay" onClick={onClose}>
      <div className="dash-popup-card" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="dash-popup-close" onClick={onClose}><X size={20} /></button>
        {children}
      </div>
    </div>
  );
}

function MoodCheckInPopup({ onClose, onSelect }) {
  const [selected, setSelected] = useState(null);

  const handlePick = (mood) => {
    setSelected(mood);
    onSelect(mood);
  };

  return (
    <PopupOverlay onClose={onClose}>
      {!selected ? (
        <>
          <Smile size={36} className="dash-popup-hero-icon" />
          <h2>How are you feeling today?</h2>
          <p>A quick check-in to start your day.</p>
          <div className="dash-mood-picker">
            {MOOD_ICONS.map(({ key, label, Icon, color }) => (
              <button key={key} type="button" className="dash-mood-option" onClick={() => handlePick(key)}>
                <div className="dash-mood-icon-wrap" style={{ backgroundColor: `${color}18`, color }}><Icon size={26} /></div>
                <span>{label}</span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="dash-popup-thanks">
          <Heart size={40} className="dash-popup-heart" />
          <h2>Thanks for sharing</h2>
          <p>Select Done when you're ready.</p>
          <button type="button" className="dash-popup-done-btn" onClick={onClose}>Done</button>
        </div>
      )}
    </PopupOverlay>
  );
}

function BloomScorePopup({ score, reason, onClose }) {
  return (
    <PopupOverlay onClose={onClose}>
      <Sparkles size={36} className="dash-popup-hero-icon" />
      <h2>Your Bloom Score</h2>
      <div className="dash-bloom-score-big"><strong>{score}</strong></div>
      <p>This score reflects how consistently you show up, ask for help, and lean into support.</p>
      {reason && (
        <div style={{ marginTop: '16px', background: 'var(--pink-light)', padding: '12px', borderRadius: '12px', textAlign: 'left' }}>
          <strong style={{ display: 'block', fontSize: '0.85rem', color: 'var(--pink)', marginBottom: '4px' }}>What this score means</strong>
          <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--ink)' }}>{reason}</p>
        </div>
      )}
    </PopupOverlay>
  );
}

function StreakPopup({ streak, onClose }) {
  return (
    <PopupOverlay onClose={onClose}>
      <Flame size={40} className="dash-popup-hero-icon dash-popup-flame" />
      <h2>{streak}-day streak!</h2>
      <p>You've checked in {streak} days in a row.</p>
      <div className="dash-streak-dots">
        {Array.from({ length: Math.min(streak, 14) }).map((_, index) => <div key={index} className="dash-streak-dot filled" />)}
        {streak < 14 && Array.from({ length: 14 - streak }).map((_, index) => <div key={`empty-${index}`} className="dash-streak-dot" />)}
      </div>
    </PopupOverlay>
  );
}

function EncouragementPopup({ message, nextStep, onClose }) {
  return (
    <PopupOverlay onClose={onClose}>
      <Star size={36} className="dash-popup-hero-icon" />
      <h2>A note from Bloom</h2>
      <p className="dash-popup-encourage-text">{message}</p>
      {nextStep ? (
        <div className="dash-popup-next-step">
          <strong>Your next tiny step</strong>
          <p>{nextStep}</p>
        </div>
      ) : null}
    </PopupOverlay>
  );
}

export function Navbar({ companionName = 'your companion', role = 'mom' }) {
  const navigate = useNavigate();
  const location = useLocation();
  const navItems = role === 'mom'
    ? NAV_ITEMS
    : NAV_ITEMS.filter((item) => item.id === 'overview' || item.id === 'you');

  return (
    <>
      <header className="dash-topbar-shell">
        <div className="dash-topbar">
          <div className="dash-logo-group" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <button type="button" className="dash-logo" onClick={() => navigate('/dashboard')}>
              <span className="dash-logo-bloom">Bloom</span>
              {role === 'mom' ? (
                <span className="dash-logo-sub">for {companionName}</span>
              ) : null}
            </button>
            {role === 'therapist' || role === 'trusted' ? (
              <button 
                type="button" 
                className="dash-add-client-btn" 
                onClick={() => navigate('/my-clients')}
                style={{
                  background: 'var(--card)', color: 'var(--ink)', border: '1px solid var(--stroke)',
                  padding: '4px 12px', borderRadius: '99px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer'
                }}
              >
                {role === 'therapist' ? '+ Add patient' : '+ Add person'}
              </button>
            ) : null}
          </div>
          <div className="dash-desktop-actions">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);
              return (
                <button key={item.id} type="button" className={`dash-pill ${active ? 'active' : ''}`} onClick={() => navigate(item.path)}>
                  <Icon size={15} />
                  {item.label}
                </button>
              );
            })}
            {(role === 'therapist' || role === 'trusted') ? (
              <button type="button" className={`dash-pill ${location.pathname === '/my-clients' ? 'active' : ''}`} onClick={() => navigate('/my-clients')}>
                <User size={15} />
                {role === 'therapist' ? 'My Patients' : 'My People'}
              </button>
            ) : null}
            {role === 'mom' ? <button type="button" className="dash-call-btn" onClick={() => navigate('/call')}><Phone size={16} /> Call</button> : null}
            {role === 'mom' ? <button type="button" className="dash-call-btn" onClick={() => navigate('/video-call', { state: { autostartVideo: true } })}><Video size={16} /> Video</button> : null}
          </div>
          <div className="dash-mobile-actions">
            {role === 'mom' ? <button type="button" className="dash-call-icon-btn" onClick={() => navigate('/call')}><Phone size={18} /></button> : null}
            {role === 'mom' ? <button type="button" className="dash-call-icon-btn" onClick={() => navigate('/video-call', { state: { autostartVideo: true } })}><Video size={18} /></button> : null}
          </div>
        </div>
      </header>
      <nav className="dash-navbar-bottom">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);
          return (
            <button key={item.id} type="button" className={`dash-nav-btn ${active ? 'active' : ''}`} onClick={() => navigate(item.path)}>
              <Icon size={22} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
}

export function BadgeShelf({ totalCalls, streak }) {
  return (
    <section className="sec-badges">
      <div className="sec-badges-row">
        {BADGE_DEFS.map((badge) => {
          const unlocked = badge.unit === 'streak' ? streak >= badge.need : totalCalls >= badge.need;
          return (
            <div key={badge.id} className={`sec-badge ${unlocked ? 'unlocked' : 'locked'}`}>
              <img src={badge.img} alt={badge.label} className="sec-badge-img" />
              <span>{badge.label}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function AnimatedCounter({ end, duration = 1500 }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let startTime;
    let animationFrame;

    const animate = (timestamp) => {
      if (!startTime) startTime = timestamp;
      const progress = timestamp - startTime;
      const fraction = Math.min(progress / duration, 1);
      const easing = fraction === 1 ? 1 : 1 - Math.pow(2, -10 * fraction);
      setCount(Math.round(easing * end));

      if (progress < duration) {
        animationFrame = requestAnimationFrame(animate);
      } else {
        setCount(end);
      }
    };
    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [end, duration]);

  return <strong>{count}</strong>;
}

export function ScoreRow({ bloomScore, streak, onBloom, onStreak }) {
  const [showLabel, setShowLabel] = useState(false);
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (bloomScore / 100) * circumference;

  useEffect(() => {
    const timer = setTimeout(() => setShowLabel(true), 2100);
    return () => clearTimeout(timer);
  }, [bloomScore]);

  return (
    <section className="overview-score-row">
      <button type="button" className="overview-bloom-card" onClick={onBloom}>
        <div className="overview-bloom-head">
          <span className="overview-bloom-kicker"><Sparkles size={14} /> Bloom Score</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div className="overview-bloom-meter">
            <svg width="124" height="124" viewBox="0 0 124 124" className="overview-bloom-ring">
              <circle cx="62" cy="62" r={radius} className="overview-bloom-track" />
              <circle
                cx="62"
                cy="62"
                r={radius}
                className="overview-bloom-progress"
                strokeDasharray={circumference}
                strokeDashoffset={offset}
              />
            </svg>
            <div className="overview-bloom-value">
              <AnimatedCounter end={bloomScore} duration={2200} />
            </div>
          </div>
          <div style={{ textAlign: 'left', flex: 1, opacity: showLabel ? 1 : 0, transition: 'opacity 0.5s ease', transform: showLabel ? 'translateY(0)' : 'translateY(10px)' }}>
             <strong style={{ fontFamily: 'var(--font-h)', fontSize: '1.4rem', color: 'var(--ink)', display: 'block', marginBottom: '4px' }}>Your Bloom score</strong>
             <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--muted)', lineHeight: 1.5 }}>Tap to see what it means and why it landed here.</p>
          </div>
        </div>
      </button>

      <button type="button" className="overview-streak-card" onClick={onStreak}>
        <div className="overview-streak-fire">{streak > 0 ? '🔥' : '✨'}</div>
        <strong><AnimatedCounter end={streak} duration={1400} /></strong>
        <span>Day streak</span>
      </button>
    </section>
  );
}

export function MomTipCard({ tips }) {
  const navigate = useNavigate();
  const submittedTips = (tips || []).map((tip) => ({
    ...tip,
    author: tip.full_name?.trim() || 'A fellow mom',
  }));

  return (
    <section className="sec-momtip">
      <div className="sec-momtip-head">
        <MessageCircle size={18} />
        <div>
          <h3>Notes from other moms</h3>
          <p>Read one thoughtful note at a time from moms who already shared something real.</p>
        </div>
      </div>

      {submittedTips.length ? (
        <div className="sec-momtip-scroll" role="region" aria-label="Submitted notes from other moms">
          {submittedTips.map((tip, index) => (
            <article key={`${tip.author}-${index}`} className="sec-momtip-note">
              <p>"{tip.tip}"</p>
              <small>{tip.author}</small>
            </article>
          ))}
        </div>
      ) : null}
      {!submittedTips.length ? (
        <div className="sec-momtip-empty">
          <p>No mom-submitted notes have come in yet. Be the first to leave something kind for a new mom.</p>
        </div>
      ) : null}
      <button type="button" className="sec-momtip-cta" onClick={() => navigate('/browse/community')}>
        <Pencil size={16} />
        Write something for another new mom
      </button>
    </section>
  );
}

function MoodRing({ value = 0, label, color, bg, borderColor, icon: Icon, onClick }) {
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const percentage = Math.max(0, Math.min(100, value));
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <button type="button" className="sec-ring-item" style={{ backgroundColor: bg, borderColor }} onClick={onClick}>
      <svg width="100" height="100" viewBox="0 0 108 108">
        <circle cx="54" cy="54" r={radius} fill="none" stroke="rgba(17,24,39,0.14)" strokeWidth="7" />
        <circle
          cx="54"
          cy="54"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="7"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 54 54)"
          className="ring-anim"
        />
      </svg>
      <div className="sec-ring-center"><Icon size={18} style={{ color }} /><strong>{Math.round(percentage / 10)}</strong></div>
      <span className="sec-ring-label" style={{ color }}>{label}</span>
    </button>
  );
}

function ScoreContextPopup({ label, score, color, icon: Icon, reason, onClose }) {
  return (
    <PopupOverlay onClose={onClose}>
      <Icon size={36} style={{ color, marginBottom: '12px' }} />
      <h2>{label} Score</h2>
      <div className="dash-bloom-score-big"><strong style={{ color }}>{Math.round(score / 10)}</strong><span>/10</span></div>
      {reason ? (
        <div style={{ marginTop: '16px', background: `${color}15`, padding: '16px', borderRadius: '14px', textAlign: 'left' }}>
          <strong style={{ display: 'block', fontSize: '0.85rem', color, marginBottom: '6px' }}>Context from your check-ins</strong>
          <p style={{ margin: 0, fontSize: '0.95rem', color: 'var(--ink)', lineHeight: 1.5 }}>{reason}</p>
        </div>
      ) : (
        <p style={{ color: 'var(--muted)' }}>Keep checking in to build more context for this score.</p>
      )}
    </PopupOverlay>
  );
}

export function MoodRingsRow({ scores, reflections, daySeries }) {
  const [selected, setSelected] = useState(null);

  const getReason = (key) => {
    const reflectionText = typeof reflections?.[key] === 'string' ? reflections[key].trim() : '';
    return reflectionText || buildScoreReason(key, scores, daySeries);
  };

  return (
    <section className="sec-card" style={{ marginBottom: '16px', padding: '24px' }}>
      <div style={{ marginBottom: '16px' }}>
        <h3 style={{ margin: '0 0 4px', fontSize: '1.1rem', fontFamily: 'var(--font-h)' }}>See your scores</h3>
        <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--muted)' }}>Tap any score to see why it is at this level.</p>
      </div>
      <div className="sec-rings">
        <MoodRing value={scores?.moodBalance} label="Mood" color={SCORE_RING_META.moodBalance.color} bg={SCORE_RING_META.moodBalance.bg} borderColor={SCORE_RING_META.moodBalance.borderColor} icon={Smile} onClick={() => setSelected({ label: 'Mood', key: 'moodBalance', color: SCORE_RING_META.moodBalance.color, icon: Smile })} />
        <MoodRing value={scores?.energyLevel} label="Energy" color={SCORE_RING_META.energyLevel.color} bg={SCORE_RING_META.energyLevel.bg} borderColor={SCORE_RING_META.energyLevel.borderColor} icon={Battery} onClick={() => setSelected({ label: 'Energy', key: 'energyLevel', color: SCORE_RING_META.energyLevel.color, icon: Battery })} />
        <MoodRing value={scores?.sleepQuality} label="Sleep" color={SCORE_RING_META.sleepQuality.color} bg={SCORE_RING_META.sleepQuality.bg} borderColor={SCORE_RING_META.sleepQuality.borderColor} icon={Moon} onClick={() => setSelected({ label: 'Sleep', key: 'sleepQuality', color: SCORE_RING_META.sleepQuality.color, icon: Moon })} />
        <MoodRing value={100 - (scores?.stressLoad || 0)} label="Calm" color={SCORE_RING_META.stressLoad.color} bg={SCORE_RING_META.stressLoad.bg} borderColor={SCORE_RING_META.stressLoad.borderColor} icon={Sun} onClick={() => setSelected({ label: 'Calm', key: 'stressLoad', color: SCORE_RING_META.stressLoad.color, icon: Sun, invert: true })} />
      </div>

      {selected && (
        <ScoreContextPopup
          label={selected.label}
          score={selected.invert ? 100 - (scores?.[selected.key] || 0) : (scores?.[selected.key] || 0)}
          color={selected.color}
          icon={selected.icon}
          reason={getReason(selected.key)}
          onClose={() => setSelected(null)}
        />
      )}
    </section>
  );
}

export function JournalPromptCard({ token }) {
  const [expanded, setExpanded] = useState(false);
  const [entry, setEntry] = useState('');
  const [sent, setSent] = useState(false);

  const handleSubmit = async () => {
    if (!entry.trim()) return;
    try {
      await apiRequest('/api/mom-tips', { token, method: 'POST', body: { tip: entry.trim() } });
      setSent(true);
    } catch {
      setSent(true);
    }
  };

  return (
    <section className="sec-journal">
      <div className="sec-journal-header"><Pencil size={18} /><h3>Share with other moms</h3></div>
      <p className="sec-journal-prompt">What's one thing you'd tell another new mom?</p>
      {sent ? (
        <div className="sec-journal-sent"><Heart size={18} /> <span>Shared. Another mom will see this.</span></div>
      ) : !expanded ? (
        <button type="button" className="sec-journal-expand" onClick={() => setExpanded(true)}>
          <Pencil size={16} /> Write a thought...
        </button>
      ) : (
        <div className="sec-journal-input-wrap">
          <textarea className="sec-journal-input" placeholder="Your words could make someone's day..." value={entry} onChange={(event) => setEntry(event.target.value)} rows={3} />
          <button type="button" className="sec-journal-send" onClick={handleSubmit} disabled={!entry.trim()}>
            <Send size={16} /> Share
          </button>
        </div>
      )}
    </section>
  );
}

export function MoodCalendar({ monthPoints }) {
  const currentMonth = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(new Date());
  const days = [];
  for (let index = 29; index >= 0; index -= 1) {
    const date = new Date(Date.now() - index * 86400000);
    const key = date.toISOString().slice(0, 10).slice(5);
    const point = monthPoints?.find((item) => item.label === key);
    days.push({ key, mood: point?.mood || 0, date: date.getDate() });
  }

  return (
    <section className="sec-calendar">
      <div className="sec-calendar-head">
        <h3><Target size={18} /> 30-Day Mood Map</h3>
        <p>Each cell is colored by your average mood.</p>
      </div>
      <p className="sec-calendar-month">{currentMonth}</p>
      <div className="sec-calendar-grid">
        {days.map((day) => (
          <div key={day.key} className="sec-calendar-cell" style={{ backgroundColor: moodHeatColor(day.mood) }} title={`${day.key}: ${day.mood}/10`}>
            <span>{day.date}</span>
          </div>
        ))}
      </div>
      <div className="sec-calendar-legend">
        <span><div style={{ backgroundColor: '#f9fafb' }} /> No data</span>
        <span><div style={{ backgroundColor: '#fda4af' }} /> Tough</span>
        <span><div style={{ backgroundColor: '#ddd6fe' }} /> Okay</span>
        <span><div style={{ backgroundColor: '#f9a8d4' }} /> Good</span>
        <span><div style={{ backgroundColor: '#ec4899' }} /> Great</span>
      </div>
    </section>
  );
}

export function ConversationTimeline({ week, firstName, audience = 'mom' }) {
  const items = [];
  (week?.positiveMoments || []).forEach((moment) => items.push({ type: 'positive', text: moment, Icon: Sun }));
  (week?.wins || []).forEach((moment) => items.push({ type: 'win', text: moment, Icon: Trophy }));
  (week?.stressors || []).forEach((moment) => items.push({ type: 'hard', text: moment, Icon: Shield }));
  if (!items.length) return null;
  const isSupportView = audience === 'therapist' || audience === 'trusted';

  return (
    <section className="sec-timeline">
      <div className="sec-timeline-head">
        <img src={groupStoryIllustration} alt="" className="sec-timeline-art" />
        <div>
          <h3>{isSupportView ? `${firstName || 'Patient'}'s week story` : 'Your week\'s story'}</h3>
          <p>{isSupportView ? 'Key moments from recent support conversations.' : 'Key moments from your conversations.'}</p>
        </div>
      </div>
      <div className="sec-timeline-list">
        {items.slice(0, 6).map((item, index) => (
          <div key={index} className={`sec-timeline-item sec-timeline-${item.type}`}>
            <div className="sec-timeline-dot"><item.Icon size={14} /></div>
            <p>{isSupportView ? item.text : toMomVoice(item.text, firstName)}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function MetricTabs({ selectedMetric, onSelect, compact = false }) {
  return (
    <div className={`dash-metric-tabs ${compact ? 'compact' : ''}`}>
      {Object.entries(METRIC_META).map(([key, meta]) => {
        return (
          <button key={key} type="button" className={`dash-metric-tab ${selectedMetric === key ? 'active' : ''}`} onClick={() => onSelect(key)}>
            <span>{meta.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function TodayChart({ series, selectedMetric, onSelect, compactTabs = false, audience = 'mom', personName = '' }) {
  const meta = METRIC_META[selectedMetric];
  const points = series?.today?.points || [];
  const isSupportView = audience === 'therapist' || audience === 'trusted';
  const subject = isSupportView ? `${personName || 'Patient'}'s` : 'Your';
  const subjectLower = isSupportView ? `${personName || 'patient'}'s` : 'your';

  return (
    <article className="sec-chart-card">
      <h3>{isSupportView ? 'Today\'s trend' : 'Today\'s journey'}</h3>
      <p>{points.length > 1 ? `Every conversation becomes a point in ${subjectLower} timeline.` : `A gentle snapshot of ${subjectLower} day so far.`}</p>
      <MetricTabs selectedMetric={selectedMetric} onSelect={onSelect} compact={compactTabs} />
      {points.length <= 1 ? (
        <div className="sec-single-score">
          <div className="sec-single-bubble" style={{ backgroundColor: `${meta.color}15` }}>
            <strong style={{ color: meta.color }}>{points[0]?.[selectedMetric] || series?.today?.averageMood || 0}</strong>
            <span>/10</span>
          </div>
          <div>
            <h4>{subject} {meta.label.toLowerCase()} looks {points[0] ? scoreLabel((points[0][selectedMetric] || 0) * 10, selectedMetric === 'stress' ? 'stress' : 'positive') : 'quiet'}.</h4>
            <p>{points[0] ? `From ${subjectLower} ${points[0].time} check-in.` : `One more check-in will start drawing ${subjectLower} day.`}</p>
          </div>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={points} margin={{ top: 12, right: 6, bottom: 0, left: -22 }}>
            <defs>
              <linearGradient id={`fill-${selectedMetric}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={meta.color} stopOpacity={0.18} />
                <stop offset="95%" stopColor={meta.color} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(0,0,0,0.05)" vertical={false} />
            <XAxis dataKey="time" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#999' }} />
            <YAxis domain={[0, 10]} tickCount={6} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#999' }} />
            <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #eee' }} formatter={(value) => [`${value}/10`, meta.label]} />
            <Area type="monotone" dataKey={selectedMetric} stroke={meta.color} strokeWidth={2.5} fill={`url(#fill-${selectedMetric})`} />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </article>
  );
}

export function MonthChart({ series, selectedMetric, onSelect, compactTabs = false, audience = 'mom', personName = '' }) {
  const meta = METRIC_META[selectedMetric];
  const points = series?.month?.points || [];
  const isSupportView = audience === 'therapist' || audience === 'trusted';
  const subjectLower = isSupportView ? `${personName || 'patient'}'s` : 'your';

  return (
    <article className="sec-chart-card">
      <h3>Monthly pulse</h3>
      <p>Daily averages across {subjectLower} month.</p>
      <MetricTabs selectedMetric={selectedMetric} onSelect={onSelect} compact={compactTabs} />
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={points} margin={{ top: 12, right: 8, bottom: 0, left: -22 }}>
          <CartesianGrid stroke="rgba(0,0,0,0.05)" vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#999' }} />
          <YAxis domain={[0, 10]} tickCount={6} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#999' }} />
          <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #eee' }} formatter={(value) => [`${value}/10`, meta.label]} labelFormatter={(value) => `Date ${value}`} />
          <Line type="monotone" dataKey={selectedMetric} stroke={meta.color} strokeWidth={2.5} dot={{ r: 3, fill: meta.color, strokeWidth: 0 }} activeDot={{ r: 5, fill: meta.color }} />
        </LineChart>
      </ResponsiveContainer>
    </article>
  );
}

export function WeeklyComparison({ week, month, audience = 'mom', personName = '' }) {
  const currentWeek = week?.averages || {};
  const baseline = month?.averages || {};
  const isSupportView = audience === 'therapist' || audience === 'trusted';
  const subjectLower = isSupportView ? `${personName || 'patient'}'s` : 'your';
  const metrics = [
    { label: 'Mood', key: 'moodBalance', icon: Smile },
    { label: 'Energy', key: 'energyLevel', icon: Battery },
    { label: 'Sleep', key: 'sleepQuality', icon: Moon },
    { label: 'Stress', key: 'stressLoad', icon: Zap, invert: true },
  ];

  return (
    <section className="sec-comparison">
      <h3><Target size={18} /> Weekly progress</h3>
      <p>How this week compares to {subjectLower} overall trends.</p>
      <div className="sec-comparison-grid">
        {metrics.map((metric) => {
          const currentValue = Number(currentWeek[metric.key]) || 0;
          const previousValue = Number(baseline[metric.key]) || 0;
          const diff = metric.invert ? previousValue - currentValue : currentValue - previousValue;
          const Direction = diff > 3 ? MoveUp : diff < -3 ? MoveDown : Minus;
          const state = diff > 3 ? 'up' : diff < -3 ? 'down' : 'same';
          return (
            <div key={metric.key} className={`sec-comparison-item sec-cmp-${state}`}>
              <metric.icon size={18} />
              <span>{metric.label}</span>
              <Direction size={16} />
            </div>
          );
        })}
      </div>
    </section>
  );
}

function AutoRotatingWins({ items, emptyText, firstName }) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    setIndex(0);
  }, [items?.length]);

  useEffect(() => {
    if (!items?.length || items.length < 2) return undefined;
    const timer = window.setInterval(() => {
      setIndex((prevIndex) => (prevIndex + 1) % items.length);
    }, 3200);
    return () => window.clearInterval(timer);
  }, [items]);

  if (!items?.length) return <p className="sec-carousel-empty">{emptyText}</p>;

  return (
    <div className="sec-carousel">
      <p key={index} className="sec-carousel-text sec-carousel-text-anim">{toMomVoice(items[index], firstName)}</p>
    </div>
  );
}

export function WinsSection({ week, firstName }) {
  return (
    <section className="sec-wins">
      <h3><Star size={16} /> Wins and bright spots</h3>
      <AutoRotatingWins items={(week?.positiveMoments || []).concat(week?.wins || [])} emptyText="Joyful moments will appear after your check-ins." firstName={firstName} />
    </section>
  );
}

export function QuickTips({ scores, tips, summary }) {
  const fallbackTips = getRelevantTips(scores).map((item) => item.tip);
  const visibleTips = (tips?.length ? tips : fallbackTips).filter(Boolean);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [summary, visibleTips.length]);

  if (!visibleTips.length) return null;
  const tip = visibleTips[index];

  return (
    <section className="sec-tips">
      <div className="sec-tips-head">
        <div>
          <h3>Quick tips for you</h3>
          <p>{summary || 'Built from the patterns in your recent check-ins.'}</p>
        </div>
      </div>
      <div className="sec-tips-card">
        <button
          type="button"
          className="sec-tips-nav-btn"
          onClick={() => setIndex((prevIndex) => (prevIndex - 1 + visibleTips.length) % visibleTips.length)}
          aria-label="Previous tip"
        >
          <ChevronLeft size={18} />
        </button>
        <p>{tip}</p>
        <button
          type="button"
          className="sec-tips-nav-btn"
          onClick={() => setIndex((prevIndex) => (prevIndex + 1) % visibleTips.length)}
          aria-label="Next tip"
        >
          <ChevronRight size={18} />
        </button>
      </div>
    </section>
  );
}

export function EncouragementCard({ data, firstName, onClick }) {
  return (
    <section className="sec-encourage" onClick={onClick}>
      <div className="sec-encourage-content">
        <Star size={20} />
        <h3>A note from Bloom</h3>
        <p>{toMomVoice(data?.narratives?.week?.summary || data?.current?.momReflection?.encouragement, firstName)}</p>
        <span className="sec-encourage-tap">Tap to read full note</span>
      </div>
      <img src={nameCompanionIllustration} alt="" className="sec-encourage-art" />
    </section>
  );
}

export function TherapistDashboard({ data, token, daySeries, firstName, activity }) {
  const narratives = data?.narratives;
  const week = data?.week;
  const month = data?.month;
  const patientName = firstName || 'Patient';
  const [selectedMetric, setSelectedMetric] = useState('mood');
  const [message, setMessage] = useState('');
  const [instruction, setInstruction] = useState('');
  const [savingMessage, setSavingMessage] = useState(false);
  const [savingInstruction, setSavingInstruction] = useState(false);
  const [messageStatus, setMessageStatus] = useState('');
  const [instructionStatus, setInstructionStatus] = useState('');
  const [existingNote, setExistingNote] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function loadNote() {
      try {
        const dataResp = await apiRequest('/api/support/therapist-note', { token });
        if (!cancelled && dataResp.note) {
          setExistingNote(dataResp.note);
        }
      } catch {
        // Optional content only.
      }
    }
    if (token) loadNote();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function submitPatientNote() {
    if (!message.trim()) {
      setMessageStatus(`Add a note for ${patientName} before sending.`);
      return;
    }
    setSavingMessage(true);
    setMessageStatus('');
    try {
      const result = await apiRequest('/api/support/therapist-note', {
        method: 'POST',
        token,
        body: {
          message: message.trim(),
        },
      });
      setExistingNote(result.note || null);
      setMessage('');
      setMessageStatus(`Note sent to ${patientName}.`);
    } catch (error) {
      setMessageStatus(error.message || 'Could not send note right now.');
    } finally {
      setSavingMessage(false);
    }
  }

  async function submitCompanionInstruction() {
    if (!instruction.trim()) {
      setInstructionStatus('Add an instruction for the companion before sending.');
      return;
    }

    setSavingInstruction(true);
    setInstructionStatus('');
    try {
      const result = await apiRequest('/api/support/therapist-note', {
        method: 'POST',
        token,
        body: {
          companionInstruction: instruction.trim(),
        },
      });
      setExistingNote(result.note || null);
      setInstruction('');
      setInstructionStatus('Companion instruction sent.');
    } catch (error) {
      setInstructionStatus(error.message || 'Could not send instruction right now.');
    } finally {
      setSavingInstruction(false);
    }
  }

  return (
    <>
      <section className="sec-role-header"><Shield size={24} /><div><h2>Therapist support view</h2><p>Clinical trends and guidance for {patientName}.</p></div></section>
      <article className="sec-card"><h3>Recent pattern summary</h3><p>{narratives?.clinicalSummary || week?.latest?.therapistView?.clinicalSummary || 'Summaries appear after conversations.'}</p></article>
      {(narratives?.topConcerns?.length || week?.riskFlags?.length) ? (
        <article className="sec-card"><h3>Focus areas</h3><ul>{(narratives?.topConcerns || week?.riskFlags || []).map((item) => <li key={item}>{item}</li>)}</ul></article>
      ) : null}
      {(narratives?.recommendedActions?.length || week?.recommendedActions?.length) ? (
        <article className="sec-card"><h3>Suggested actions</h3><ul>{(narratives?.recommendedActions || week?.recommendedActions || []).map((item) => <li key={item}>{item}</li>)}</ul></article>
      ) : null}
      <StatsStrip insights={{ activity }} audience="therapist" personName={patientName} />
      <TodayChart series={daySeries} selectedMetric={selectedMetric} onSelect={setSelectedMetric} audience="therapist" personName={patientName} />
      <MonthChart series={daySeries} selectedMetric={selectedMetric} onSelect={setSelectedMetric} audience="therapist" personName={patientName} />
      <WeeklyComparison week={week} month={month} audience="therapist" personName={patientName} />
      <SignalTiles week={week} audience="therapist" personName={patientName} />
      <ConversationTimeline week={week} firstName={patientName} audience="therapist" />
      <article className="sec-card sec-therapist-compose">
        <h3>Send support guidance</h3>
        <p>Send patient notes and AI companion instructions separately.</p>
        <label htmlFor="therapist-message">Message for {patientName}</label>
        <textarea
          id="therapist-message"
          rows={4}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder={`Example: ${patientName}, you are doing better than you think. Keep resting in small blocks and ask for one concrete help today.`}
        />
        <div className="sec-therapist-compose-row">
          <button type="button" onClick={submitPatientNote} disabled={savingMessage}>
            {savingMessage ? 'Sending note...' : `Send note to ${patientName}`}
          </button>
          {messageStatus ? <span>{messageStatus}</span> : null}
        </div>
        <label htmlFor="therapist-instruction">Instruction for companion supporting {patientName}</label>
        <textarea
          id="therapist-instruction"
          rows={4}
          value={instruction}
          onChange={(event) => setInstruction(event.target.value)}
          placeholder="Example: Keep check-ins brief, prioritize sleep recovery prompts, and avoid information overload."
        />
        <div className="sec-therapist-compose-row">
          <button type="button" onClick={submitCompanionInstruction} disabled={savingInstruction}>
            {savingInstruction ? 'Sending instruction...' : 'Send AI instruction'}
          </button>
          {instructionStatus ? <span>{instructionStatus}</span> : null}
        </div>
        {existingNote?.message_text || existingNote?.companion_instruction ? (
          <div className="sec-therapist-last-note">
            <strong>Latest sent guidance</strong>
            {existingNote?.message_text ? <p><strong>Note:</strong> {existingNote.message_text}</p> : null}
            {existingNote?.companion_instruction ? <p><strong>AI instruction:</strong> {existingNote.companion_instruction}</p> : null}
          </div>
        ) : null}
      </article>
    </>
  );
}

export function TrustedDashboard({ data, token, daySeries, firstName, activity }) {
  const narratives = data?.narratives;
  const week = data?.week;
  const month = data?.month;
  const patientName = firstName || 'Patient';
  const [selectedMetric, setSelectedMetric] = useState('mood');
  
  const [message, setMessage] = useState('');
  const [savingMsg, setSavingMsg] = useState(false);
  const [msgStatus, setMsgStatus] = useState('');
  const [existingNote, setExistingNote] = useState(null);

  const [recs, setRecs] = useState([]);
  const [loadingRecs, setLoadingRecs] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadTrustedData() {
      if (!token) return;
      try {
        const noteResp = await apiRequest('/api/support/trusted-note', { token });
        if (!cancelled && noteResp.note) {
          setExistingNote(noteResp.note);
        }
      } catch (err) {}

      setLoadingRecs(true);
      try {
        const recResp = await apiRequest('/api/support/trusted-recommendations', { token });
        if (!cancelled && recResp.recommendations) {
          setRecs(recResp.recommendations);
        }
      } catch (err) {}
      if (!cancelled) setLoadingRecs(false);
    }
    loadTrustedData();
    return () => { cancelled = true; };
  }, [token]);

  async function submitTrustedNote() {
    if (!message.trim()) {
      setMsgStatus('Add a message before sending.');
      return;
    }
    setSavingMsg(true);
    setMsgStatus('');
    try {
      const result = await apiRequest('/api/support/trusted-note', {
        method: 'POST',
        token,
        body: { message: message.trim() },
      });
      setExistingNote(result.note || null);
      setMessage('');
      setMsgStatus('Message sent!');
    } catch (error) {
      setMsgStatus(error.message || 'Could not send message.');
    } finally {
      setSavingMsg(false);
    }
  }

  return (
    <>
      <section className="sec-role-header">
        <Heart size={24} />
        <div>
          <h2>Trusted supporter view</h2>
          <p>Guidance on how to be there for {patientName}.</p>
        </div>
      </section>

      <article className="sec-card">
        <h3>How she is doing</h3>
        <p>{narratives?.summary || week?.latest?.trustedPersonView?.summary || 'Summaries will appear after her conversations.'}</p>
      </article>

      {loadingRecs ? (
        <article className="sec-card"><p>Loading recommendations...</p></article>
      ) : recs.length > 0 ? (
        <article className="sec-card">
          <h3>Ways you can help today</h3>
          <ul style={{ paddingLeft: '1.25rem', margin: '0.5rem 0' }}>
            {recs.map((item, idx) => <li key={idx} style={{ marginBottom: '0.5rem' }}>{item}</li>)}
          </ul>
        </article>
      ) : null}

      <StatsStrip insights={{ activity }} audience="trusted" personName={patientName} />
      <TodayChart series={daySeries} selectedMetric={selectedMetric} onSelect={setSelectedMetric} audience="trusted" personName={patientName} />
      <MonthChart series={daySeries} selectedMetric={selectedMetric} onSelect={setSelectedMetric} audience="trusted" personName={patientName} />
      <WeeklyComparison week={week} month={month} audience="trusted" personName={patientName} />
      <SignalTiles week={week} audience="trusted" personName={patientName} />
      <ConversationTimeline week={week} firstName={patientName} audience="trusted" />

      <article className="sec-card sec-therapist-compose">
        <h3>Send a short note</h3>
        <p>Your message will appear on {patientName}'s dashboard to let her know you're thinking of her.</p>
        <label htmlFor="trusted-message">Message for {patientName}</label>
        <textarea
          id="trusted-message"
          rows={3}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="e.g. Thinking of you today! Let me know if I can drop off dinner."
        />
        <div className="sec-therapist-compose-row">
          <button type="button" onClick={submitTrustedNote} disabled={savingMsg}>
            {savingMsg ? 'Sending...' : 'Send note'}
          </button>
          {msgStatus ? <span>{msgStatus}</span> : null}
        </div>
        {existingNote?.message_text ? (
          <div className="sec-therapist-last-note">
            <strong>Latest sent message</strong>
            <p>{existingNote.message_text}</p>
          </div>
        ) : null}
      </article>
    </>
  );
}

export function SignalTiles({ week, audience = 'mom', personName = '' }) {
  const current = week?.latest?.signalScores || {};
  const isSupportView = audience === 'therapist' || audience === 'trusted';
  const tiles = [
    { title: 'Rest and recharge', key: 'sleepQuality', icon: BedDouble, color: '#8b5cf6' },
    { title: 'Self-love', key: 'selfKindness', icon: Heart, color: '#ec4899' },
    { title: 'Support circle', key: 'supportConnection', icon: User, color: '#ec4899' },
    { title: 'Bonding', key: 'bondingConnection', icon: Baby, color: '#f43f5e' },
  ];

  return (
    <section className="sec-tiles">
      <div className="sec-tiles-head"><h3><Target size={18} /> Focus areas</h3><p>{isSupportView ? `${personName || 'Her'} wellbeing across different areas recently.` : 'Your wellbeing across different areas recently.'}</p></div>
      <div className="sec-tiles-grid">
        {tiles.map((tile) => {
          const value = Number(current[tile.key]) || 50;
          return (
            <div key={tile.key} className="sec-tile-item" style={{ backgroundColor: `${tile.color}15` }}>
              <tile.icon size={20} style={{ color: tile.color }} />
              <strong>{value}%</strong>
              <span>{tile.title}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function StatsStrip({ insights, audience = 'mom', personName = '' }) {
  const activity = insights?.activity || {};
  const isSupportView = audience === 'therapist' || audience === 'trusted';
  const subjectLower = isSupportView ? `${personName || 'patient'}'s` : 'your';
  const stats = [
    {
      label: 'Today',
      value: activity.todayCalls || activity.callsToday || 0,
      detail: 'calls so far',
      tone: 'peach',
    },
    {
      label: 'This week',
      value: activity.weekCalls || activity.callsThisWeek || 0,
      detail: 'calls joined',
      tone: 'sage',
    },
    {
      label: 'This month',
      value: activity.monthCalls || activity.callsThisMonth || 0,
      detail: 'moments shared',
      tone: 'mist',
    },
    {
      label: 'Last check-in',
      value: formatDateTime(activity.lastCallAt),
      detail: activity.lastCallAt ? 'most recent conversation' : 'start with your first sync',
      tone: 'sand',
      compact: true,
    },
  ];

  return (
    <section className="sec-stats-panel">
      <div className="sec-stats-header">
        <h3>{isSupportView ? `${personName || 'Patient'} check-in snapshot` : 'Your check-in snapshot'}</h3>
        <p>A quick read on how often {subjectLower} calls have happened lately.</p>
      </div>
      <div className="sec-stats-strip">
        {stats.map((stat) => (
          <article
            key={stat.label}
            className={`sec-stat sec-stat-${stat.tone} ${stat.compact ? 'is-compact' : ''}`}
          >
            <span>{stat.label}</span>
            <strong>{stat.value}</strong>
            <em>{stat.detail}</em>
          </article>
        ))}
      </div>
    </section>
  );
}

export function MilestoneTracker({ totalCalls }) {
  const milestones = [1, 5, 10, 25, 50];
  const nextIndex = milestones.findIndex((milestone) => milestone > totalCalls);
  const nextTarget = nextIndex === -1 ? milestones[milestones.length - 1] : milestones[nextIndex];
  const progress = Math.min(100, Math.round((totalCalls / nextTarget) * 100));

  return (
    <section className="sec-milestone">
      <div className="sec-milestone-head">
        <h3><Target size={16} /> Journey milestones</h3>
        <span>{totalCalls} / {nextTarget} calls</span>
      </div>
      <div className="sec-milestone-bar-wrap">
        <div className="sec-milestone-bar-fill" style={{ width: `${progress}%` }} />
        {milestones.map((milestone) => {
          if (milestone > nextTarget) return null;
          const position = (milestone / nextTarget) * 100;
          return (
            <div key={milestone} className={`sec-milestone-marker ${totalCalls >= milestone ? 'reached' : ''}`} style={{ left: `${position}%` }}>
              <span className="sec-milestone-num">{milestone}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function OverviewQuickActions() {
  const navigate = useNavigate();
  const [showCallMenu, setShowCallMenu] = useState(false);

  return (
    <>
      <section className="sec-actions">
        <div className="sec-actions-head">
          <h3>Jump back in</h3>
          <p>Open the part of Bloom you need right now.</p>
        </div>
        <div className="sec-actions-grid">
          <button type="button" className="sec-action-card" onClick={() => setShowCallMenu(true)}>
            <div className="sec-action-icon"><Phone size={18} /></div>
            <strong>Talk now</strong>
            <span>Start a call</span>
          </button>
          <button type="button" className="sec-action-card" onClick={() => navigate('/browse/trends')}>
            <div className="sec-action-icon"><Target size={18} /></div>
            <strong>Browse</strong>
            <span>Open charts and maps</span>
          </button>
        </div>
      </section>

      {showCallMenu && (
        <PopupOverlay onClose={() => setShowCallMenu(false)}>
          <Phone size={36} className="dash-popup-hero-icon" />
          <h2>Start a call</h2>
          <p>How would you like to connect right now?</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '20px' }}>
            <button
              type="button"
              onClick={() => navigate('/call')}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
                padding: '16px', borderRadius: '16px', background: 'var(--pink)', color: '#fff',
                border: 'none', fontWeight: 600, fontSize: '1.05rem', cursor: 'pointer'
              }}
            >
              <Phone size={20} /> Voice Call
            </button>
            <button
              type="button"
              onClick={() => navigate('/video-call', { state: { autostartVideo: true } })}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
                padding: '16px', borderRadius: '16px', background: 'var(--card)', color: 'var(--ink)',
                border: '2px solid var(--stroke)', fontWeight: 600, fontSize: '1.05rem', cursor: 'pointer'
              }}
            >
              <Video size={20} /> Video Call
            </button>
          </div>
        </PopupOverlay>
      )}
    </>
  );
}

function MomOverview({ data, firstName, daySeries, insights, momTips }) {
  const [selectedMetric, setSelectedMetric] = useState('mood');
  const [showBloom, setShowBloom] = useState(false);
  const [showStreak, setShowStreak] = useState(false);
  const [showEncourage, setShowEncourage] = useState(false);

  const week = data?.week;
  const current = data?.current;
  const bloomScore = computeBloomScore(week?.averages || current?.signalScores, insights?.activity, daySeries);
  const bloomReason = computeBloomScoreReason(week?.averages || current?.signalScores, insights?.activity, daySeries);
  const streak = computeStreak(daySeries);

  if (!current) {
    return (
      <section className="dash-empty-state">
        <img src={welcomeIllustration} alt="" className="dash-empty-illustration" />
        <h2>No reflections yet</h2>
        <p>Finish your first voice or video call and Bloom will start painting the shape of your day.</p>
      </section>
    );
  }

  return (
    <>
      {showBloom ? <BloomScorePopup score={bloomScore} reason={bloomReason} onClose={() => setShowBloom(false)} /> : null}
      {showStreak ? <StreakPopup streak={streak} onClose={() => setShowStreak(false)} /> : null}
      {showEncourage ? (
        <EncouragementPopup
          message={toMomVoice(data?.narratives?.week?.summary || current.momReflection?.encouragement, firstName)}
          nextStep={toMomVoice(data?.narratives?.week?.nextStep || current.momReflection?.nextStep, firstName)}
          onClose={() => setShowEncourage(false)}
        />
      ) : null}

      <section className="sec-hero">
        <div className="sec-hero-text">
          <h1>Hi {firstName}, here's how today feels.</h1>
          <p>{toMomVoice(data?.narratives?.day?.summary || current.conversationSummary, firstName)}</p>
        </div>
        <div className="sec-hero-art"><img src={thankYouIllustration} alt="" /></div>
      </section>

      <ScoreRow bloomScore={bloomScore} streak={streak} onBloom={() => setShowBloom(true)} onStreak={() => setShowStreak(true)} />
      <OverviewQuickActions />
      <MoodRingsRow scores={current.signalScores} reflections={current.signalReflections || current.momReflection} daySeries={daySeries} />
      <TodayChart series={daySeries} selectedMetric={selectedMetric} onSelect={setSelectedMetric} />
      <QuickTips scores={current.signalScores} />
      <StatsStrip insights={insights} />
      <MomTipCard tips={momTips} />
      <EncouragementCard data={data} firstName={firstName} onClick={() => setShowEncourage(true)} />
    </>
  );
}

export function DashboardPage({ token, session }) {
  const userName = session?.user?.full_name || 'there';
  const firstName = userName.split(' ')[0];
  const roleFromSession = session?.user?.auth_role || 'mom';
  const companionName = roleFromSession === 'mom'
    ? (session?.user?.companion_name || session?.user?.companionName || 'Sage')
    : firstName;
  const [showMoodPopup, setShowMoodPopup] = useState(false);
  const { insights, daySeries, momTips, loading, error } = useDashboardData(token, roleFromSession);
  const role = insights?.role || roleFromSession;

  useEffect(() => {
    if (role === 'mom' && !loading && !error && insights?.hasData) {
      const key = `bloom_mood_${todayKey()}`;
      if (!localStorage.getItem(key)) setShowMoodPopup(true);
    } else if (role !== 'mom') {
      setShowMoodPopup(false);
    }
  }, [role, loading, error, insights]);

  return (
    <div className="dash">
      <Navbar companionName={companionName} role={role} />
      {role === 'mom' && showMoodPopup ? <MoodCheckInPopup onClose={() => setShowMoodPopup(false)} onSelect={(mood) => localStorage.setItem(`bloom_mood_${todayKey()}`, mood)} /> : null}
      <main className="dash-main">
        {loading ? (
          <CenteredDashboardLoader />
        ) : null}
        {!loading && error ? <section className="dash-empty-state"><Shield size={28} /><h2>We couldn't load the dashboard yet</h2><p>{error}</p></section> : null}
        {!loading && !error && role === 'mom' ? <MomOverview data={insights?.mom} firstName={firstName} daySeries={daySeries} insights={insights} momTips={momTips} /> : null}
        {!loading && !error && role === 'therapist' ? <TherapistDashboard data={insights?.therapist} token={token} daySeries={daySeries} firstName={firstName} activity={insights?.activity} /> : null}
        {!loading && !error && role === 'trusted' ? <TrustedDashboard data={insights?.trusted} /> : null}
      </main>
    </div>
  );
}
