/**
 * Rule-based gesture mapper for TalkingHead avatar.
 * Collects gestures while AI speaks, fires them after the turn ends.
 * Mood changes apply immediately (don't interrupt lip sync).
 */

/* ── Logging ── */
const L = '%c[GestureMapper]';
const S = {
  info: 'color: #a78bfa; font-weight: bold',
  fire: 'color: #34d399; font-weight: bold',
  skip: 'color: #fbbf24; font-weight: bold',
  err:  'color: #f87171; font-weight: bold',
};
function log() {}

/* ── Cooldowns ── */
const COOLDOWNS = { nod: 1500, shake: 2500, gesture: 3000, mood: 4000, emoji: 2000 };

/* ── Rule-based gesture mapping (no API call, instant) ── */
function mapSentence(text) {
  const t = text.toLowerCase();
  // Order matters: more specific matches first
  if (/\b(hi|hello|hey|greetings|welcome)\b/.test(t))    return ['gesture:handup', 'mood:happy'];
  if (/\b(haha|lol|funny|hilarious|joking)\b/.test(t))   return ['emoji:🤣', 'mood:happy'];
  if (/\b(love|adore|sweet|darling)\b/.test(t))           return ['emoji:🥰', 'mood:happy'];
  if (/\b(sorry|unfortunate|sad|tough|rough)\b/.test(t))  return ['emoji:🥺', 'mood:sad'];
  if (/\b(cry|crying|tears|heartbreak)\b/.test(t))        return ['emoji:😭', 'mood:sad'];
  if (/\b(disappoint|failed|worse)\b/.test(t))            return ['emoji:😞', 'mood:sad'];
  if (/\b(worried|anxious|nervous|scary)\b/.test(t))      return ['emoji:😳', 'mood:sad'];
  if (/\b(great|awesome|amazing|wonderful|fantastic|incredible|brilliant)\b/.test(t)) return ['emoji:😄', 'mood:happy'];
  if (/\b(cool|nice|good|well done|proud|lovely|beautiful)\b/.test(t)) return ['emoji:😊', 'mood:happy'];
  if (/\b(hug|comfort|care|support)\b/.test(t))           return ['emoji:🥰', 'mood:happy'];
  if (/\b(think|hmm|consider|wonder)\b/.test(t))          return ['emoji:😏', 'mood:neutral'];
  if (/\b(sure|yes|yeah|absolutely|right|agree)\b/.test(t)) return ['nod', 'emoji:😉'];
  if (/\b(no|nope|never|disagree|don't)\b/.test(t))       return ['shake', 'emoji:😶'];
  if (/\b(wow|whoa|surprised|unbelievable)\b/.test(t))    return ['emoji:😳', 'mood:happy'];
  if (/\b(tired|exhausted|sleepy|rest)\b/.test(t))        return ['emoji:😔', 'mood:sad'];
  if (/\b(laugh|giggle|chuckle|smile)\b/.test(t))         return ['emoji:😁', 'mood:happy'];
  if (/\b(kiss|mwah|smooch)\b/.test(t))                   return ['emoji:😘'];
  if (/\b(wink|nudge|hint)\b/.test(t))                    return ['emoji:😉'];
  if (/\b(silly|goofy|crazy|wild)\b/.test(t))             return ['emoji:🤪', 'mood:happy'];
  if (/\b(sarcas|ironic|really)\b/.test(t))               return ['emoji:🙃'];
  if (/\b(okay|alright|fine|sure)\b/.test(t))             return ['nod', 'emoji:🙂'];
  if (/\b(remind|remember|also|important)\b/.test(t))     return ['gesture:thumbup', 'emoji:😊'];
  if (/\b(thank|thanks|grateful|appreciate)\b/.test(t))   return ['gesture:namaste', 'emoji:😇'];
  if (/\b(encourage|motivat|strong|brave)\b/.test(t))     return ['gesture:thumbup', 'emoji:😁'];
  if (/\?/.test(t)) return ['emoji:😏'];
  if (/!/.test(t))  return ['emoji:😄', 'mood:happy'];
  return ['nod']; // default
}

/**
 * @param {React.RefObject} headRef
 */
export function createGestureMapper(headRef) {
  const lastFire = {};

  log('info', '✅ Gesture mapper ON (rule-based, deferred)');

  function canFire(t) {
    const now = Date.now(), cd = COOLDOWNS[t] || 3000;
    if (lastFire[t] && now - lastFire[t] < cd) return false;
    lastFire[t] = now;
    return true;
  }

  /** Execute a single action on the avatar. Does NOT clear visemes. */
  function exec(action) {
    const h = headRef.current;
    if (!h) return;
    try {
      if (action === 'nod') {
        if (!canFire('nod')) return;
        const t = h.animEmojis?.['yes'];
        if (t && h.animFactory) { h.animQueue?.push(h.animFactory(t, false)); log('fire', '✅ NOD'); }
      } else if (action === 'shake') {
        if (!canFire('shake')) return;
        const t = h.animEmojis?.['no'];
        if (t && h.animFactory) { h.animQueue?.push(h.animFactory(t, false)); log('fire', '✅ SHAKE'); }
      } else if (action.startsWith('gesture:')) {
        if (!canFire('gesture')) return;
        const n = action.split(':')[1];
        h.playGesture?.(n, 2, false);
        log('fire', `✅ GESTURE "${n}"`);
      } else if (action.startsWith('mood:')) {
        if (!canFire('mood')) return;
        h.setMood?.(action.split(':')[1]);
        log('fire', `✅ MOOD "${action.split(':')[1]}"`);
      } else if (action.startsWith('emoji:')) {
        if (!canFire('emoji')) return;
        const e = action.split(':')[1];
        let t = h.animEmojis?.[e];
        if (t?.link) t = h.animEmojis?.[t.link];
        if (t && h.animFactory) { h.animQueue?.push(h.animFactory(t, false)); log('fire', `✅ EMOJI "${e}"`); }
      }
    } catch (e) { log('err', `❌ ${action}: ${e.message}`); }
  }

  /* ── Pending gestures: collected while speaking, fired on turn end ── */
  let pendingActions = []; // actions to fire after speaking

  /** Immediately apply mood, defer everything else */
  function scheduleActions(actions) {
    for (const a of actions) {
      if (a.startsWith('mood:')) {
        exec(a); // mood is safe during speech — just changes expression baseline
      } else {
        pendingActions.push(a);
      }
    }
  }

  /** Called when AI turn is complete — fire all deferred gestures */
  function flushAfterSpeaking() {
    if (pendingActions.length === 0) return;
    // Pick the best 1-2 actions from the last sentences (avoid spamming)
    // Take the last set of pending actions (most recent context)
    const toFire = pendingActions.slice(-2);
    log('fire', `🎭 Turn done → firing [${toFire}] (from ${pendingActions.length} pending)`);
    toFire.forEach(exec);
    pendingActions = [];
  }

  /* ── Buffering: collect tokens into sentences ── */
  let buf = '';
  let timer = null;
  const SENT_RE = /[.!?]\s*$/;
  const DEBOUNCE = 1200;

  function processText(text) {
    if (!text || !headRef.current) return;
    buf += text;

    if (SENT_RE.test(text)) {
      if (timer) clearTimeout(timer);
      const sentence = buf.trim();
      buf = '';
      if (sentence.length >= 3) {
        const actions = mapSentence(sentence);
        log('info', `📝 "${sentence.slice(0, 60)}" → [${actions}]`);
        scheduleActions(actions);
      }
    } else {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (buf.trim().length >= 3) {
          const actions = mapSentence(buf.trim());
          log('info', `📝 "${buf.trim().slice(0, 60)}" → [${actions}]`);
          scheduleActions(actions);
        }
        buf = '';
      }, DEBOUNCE);
    }
  }

  function reset() {
    buf = '';
    pendingActions = [];
    if (timer) { clearTimeout(timer); timer = null; }
    for (const k in lastFire) delete lastFire[k];
  }

  return { processText, flushAfterSpeaking, reset };
}
