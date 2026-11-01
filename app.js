'use strict';

const $ = (selector) => document.querySelector(selector);
const body = document.body;
const scene = $('.gift-scene');
const envelope = $('#envelope');
const flap = $('#flap');
const seal = $('#open-gift');
const home = $('#card-home');
const card = $('#postcard');
const film = $('#film');
const theater = $('#theater');
const slot = $('#screen-slot');
const overlay = $('#media-overlay');
const message = $('#media-message');
const filmPlay = $('#film-play');
const playLabel = filmPlay.querySelector('span');
const endNote = $('#ending-note');
const reducedMotion = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: true };
let state = 'closed';
let ended = false;
let envelopeDrop = 0;
let audio;
const quietPreview = new URLSearchParams(location.search).has('quiet');
const transitions = [];
function phase(name) {
 body.dataset.phase = name;
 transitions.push({ phase: name, at: Math.round(performance.now()) });
 body.dataset.transitions = JSON.stringify(transitions.slice(-24));
}
phase('closed');

function setState(next) {
 state = next;
 body.dataset.state = next;
}

async function move(element, frames, duration, easing = 'cubic-bezier(.22,.75,.25,1)', delay = 0) {
 const animation = typeof element.animate === 'function' ? element.animate(frames, { duration: reducedMotion.matches ? 1 : duration, delay: reducedMotion.matches ? 0 : delay, easing, fill: 'forwards' }) : null;
 let deadline;
 try {
  if (animation) await Promise.race([
   animation.finished,
   new Promise(resolve => { deadline = setTimeout(resolve, reducedMotion.matches ? 80 : duration + delay + 300); })
  ]);
 } catch { /* Navigation or a browser suspension may cancel an animation. */ }
 finally { clearTimeout(deadline); }
 const last = frames[frames.length - 1];
 for (const [property, value] of Object.entries(last)) {
  if (!['offset', 'easing', 'composite'].includes(property)) element.style[property] = String(value);
 }
 if (animation) animation.cancel();
}

// Quiet original paper sounds. Nothing plays before the gift is opened.
function paperSound(closing = false) {
 if (quietPreview) return;
 try {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  audio ||= new AudioContext();
  audio.resume().catch(() => {});
  const start = audio.currentTime;
  const rustle = (at, length, volume) => {
   const buffer = audio.createBuffer(1, Math.ceil(audio.sampleRate * length), audio.sampleRate);
   const samples = buffer.getChannelData(0);
   for (let i = 0; i < samples.length; i++) samples[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * i / samples.length) ** 2;
   const source = audio.createBufferSource(); source.buffer = buffer;
   const filter = audio.createBiquadFilter(); filter.type = 'bandpass'; filter.frequency.value = closing ? 1400 : 1900; filter.Q.value = .6;
   const gain = audio.createGain(); gain.gain.value = volume;
   source.connect(filter).connect(gain).connect(audio.destination);
   source.start(start + at);
  };
  rustle(.08, .17, .036); rustle(.32, .42, .023); rustle(.96, .35, .018);
  if (!closing) {
   const tone = audio.createOscillator(); const gain = audio.createGain();
   tone.type = 'sine'; tone.frequency.setValueAtTime(240, start); tone.frequency.exponentialRampToValueAtTime(100, start + .07);
   gain.gain.setValueAtTime(.028, start); gain.gain.exponentialRampToValueAtTime(.0001, start + .09);
   tone.connect(gain).connect(audio.destination); tone.start(start); tone.stop(start + .1);
  }
 } catch { /* Sound decoration must never prevent opening the gift. */ }
}

function scatter() {
 if (reducedMotion.matches || typeof seal.animate !== 'function') return;
 const bounds = seal.getBoundingClientRect();
 const layer = document.createElement('div'); layer.className = 'confetti'; layer.setAttribute('aria-hidden', 'true');
 document.body.append(layer);
 for (let i = 0; i < 24; i++) {
  const piece = document.createElement('i');
  const angle = i * 2.39996;
  const distance = 55 + (i * 37) % 145;
  const x = Math.cos(angle) * distance;
  const y = -Math.abs(Math.sin(angle) * distance) - 30;
  piece.style.left = `${bounds.left + bounds.width / 2}px`;
  piece.style.top = `${bounds.top + bounds.height / 2}px`;
  piece.style.background = ['#dcc58f', '#b5c6a2', '#cd9e83', '#f1ddb9'][i % 4];
  piece.style.width = `${2 + i % 3}px`; piece.style.height = `${4 + i % 5}px`;
  layer.append(piece);
  piece.animate([
   { transform: 'translate(0,0) rotate(0)', opacity: 0 },
   { transform: `translate(${x * .55}px,${y}px) rotate(${i * 23}deg)`, opacity: .8, offset: .35 },
   { transform: `translate(${x}px,${y + 180}px) rotate(${i * 57}deg)`, opacity: 0 }
  ], { duration: 1500 + i % 5 * 100, delay: 130 + i % 4 * 30, fill: 'both', easing: 'cubic-bezier(.15,.65,.35,1)' });
 }
 setTimeout(() => layer.remove(), 2300);
}

function showMedia(text, button = false, end = false) {
 message.textContent = text;
 overlay.hidden = false;
 overlay.classList.toggle('end-overlay', end);
 filmPlay.hidden = !button;
 playLabel.textContent = end ? 'Переглянути ще раз' : film.error ? 'Спробувати ще' : 'Дивитися мультфільм';
}

function hideMedia() {
 overlay.hidden = true;
 overlay.classList.remove('end-overlay');
}

function startFilm(reset = false) {
 if (reset || ended) film.currentTime = 0;
 ended = false; endNote.hidden = true;
 if (film.error) film.load();

 // This starts directly in the seal's trusted click. The film's first two
 // seconds of music accompany the letter's flight, preserving mobile audio.
 const promise = film.play();
 if (promise) promise.catch(() => {
  if (state !== 'closed' && state !== 'closing') showMedia('Твій мульт уже тут.', true);
 });
}

async function flyToScreen() {
 const start = card.getBoundingClientRect();
 const target = slot.getBoundingClientRect();
 document.body.append(card);
 Object.assign(card.style, {
  position: 'fixed', inset: 'auto', left: `${target.left}px`, top: `${target.top}px`,
  width: `${target.width}px`, height: `${target.height}px`, zIndex: '50',
  visibility: 'visible', transformOrigin: '0 0', transform: 'none'
 });
 await move(card, [
  { transform: `translate(${start.left - target.left}px,${start.top - target.top}px) scale(${start.width / target.width},${start.height / target.height})` },
  { transform: 'translate(0,0) scale(1,1)' }
 ], 1000, 'cubic-bezier(.18,.82,.22,1)');
 slot.append(card);
 card.style.cssText = '';
 card.classList.add('is-docked');
}

async function openGift() {
 if (state !== 'closed') return;
 setState('opening'); phase('seal'); seal.disabled = true;
 paperSound(); scatter();
 startFilm(true);
 scene.inert = true;
 theater.classList.add('is-visible');
 phase('unfold');
 await Promise.all([
  move(seal, [
   { transform: 'translate(-50%,-50%) rotate(-7deg)', opacity: 1 },
   { transform: 'translate(-44%,-85%) rotate(18deg) scale(1.12)', opacity: 0 }
  ], 340),
  move(envelope, [{ transform: 'rotate(-4deg)' }, { transform: 'rotate(0deg)' }], 800),
  move(flap, [{ transform: 'rotateX(0deg)' }, { transform: 'rotateX(-178deg)' }], 820, 'cubic-bezier(.3,.7,.2,1)', 130)
 ]);
 flap.style.zIndex = '0';
 card.style.visibility = 'visible';
 const homeBox = home.getBoundingClientRect();
 const destination = slot.getBoundingClientRect();
 // On a phone the envelope falls away as the letter is lifted. The letter
 // ends just above its destination, avoiding an up-then-down detour.
 envelopeDrop = Math.max(0, destination.top - (homeBox.top - homeBox.height * 1.16) - 40);
 phase('withdraw');
 await Promise.all([
  move(card, [{ transform: 'translateY(6%)' }, { transform: 'translateY(-116%)' }], 760, 'cubic-bezier(.23,.75,.23,1)'),
  move(envelope, [{ transform: 'translateY(0) rotate(0deg)' }, { transform: `translateY(${envelopeDrop}px) rotate(0deg)` }], 760)
 ]);
 phase('flight');
 // Both ends of this flight are the same video element, not screenshot swaps.
 await Promise.all([
  flyToScreen(),
  move(envelope, [{ opacity: 1, transform: `translateY(${envelopeDrop}px) rotate(0deg)` }, { opacity: 0, transform: `translateY(${envelopeDrop + 65}px) rotate(3deg)` }], 800)
 ]);
 setState('watching'); phase('watching');
 theater.inert = false; theater.setAttribute('aria-hidden', 'false');
 theater.classList.add('is-ready');
 film.controls = false; film.tabIndex = 0; controls.hidden = false; syncControls();
 $('#film-heading').focus({ preventScroll: true });
 if (film.error) showMedia('Відео не завантажилося. Спробуй ще раз або збережи його за посиланням нижче.', true);
 else if (film.paused && !ended) showMedia('Твій мульт уже тут.', true);
 else if (film.readyState < 3) showMedia('Відео завантажується…');
}

async function closeGift() {
 if (state !== 'watching') return;
 await leaveFullscreen();
 controls.hidden = true;
 setState('closing'); phase('closing'); film.pause(); film.controls = false; film.tabIndex = -1;
 theater.classList.remove('is-ready'); theater.inert = true; theater.setAttribute('aria-hidden', 'true');
 hideMedia(); endNote.hidden = true;
 paperSound(true);
 const start = card.getBoundingClientRect();
 envelope.style.opacity = '1'; envelope.style.transform = `translateY(${envelopeDrop}px) rotate(0deg)`;
 const target = home.getBoundingClientRect();
 const destination = { left: target.left, top: target.top - target.height * 1.16, width: target.width, height: target.height };
 document.body.append(card); card.classList.remove('is-docked');
 Object.assign(card.style, {
  position: 'fixed', inset: 'auto', left: `${destination.left}px`, top: `${destination.top}px`,
  width: `${destination.width}px`, height: `${destination.height}px`, zIndex: '50',
  visibility: 'visible', transformOrigin: '0 0', transform: 'none'
 });
 await move(card, [
  { transform: `translate(${start.left - destination.left}px,${start.top - destination.top}px) scale(${start.width / destination.width},${start.height / destination.height})` },
  { transform: 'translate(0,0) scale(1,1)' }
 ], 750);
 home.append(card); card.style.cssText = ''; card.style.visibility = 'visible';
 await Promise.all([
  move(card, [{ transform: 'translateY(-116%)' }, { transform: 'translateY(0)' }], 650),
  move(envelope, [{ transform: `translateY(${envelopeDrop}px) rotate(0deg)` }, { transform: 'translateY(0) rotate(0deg)' }], 650)
 ]);
 flap.style.zIndex = '4';
 await move(flap, [{ transform: 'rotateX(-178deg)' }, { transform: 'rotateX(0deg)' }], 620);
 card.style.visibility = 'hidden'; card.style.transform = '';
 await Promise.all([
  move(envelope, [{ transform: 'rotate(0deg)' }, { transform: 'rotate(-4deg)' }], 350),
  move(seal, [
   { transform: 'translate(-44%,-85%) rotate(18deg) scale(1.12)', opacity: 0 },
   { transform: 'translate(-50%,-50%) rotate(-7deg)', opacity: 1 }
  ], 400)
 ]);
 film.currentTime = 0; ended = false;
 theater.classList.remove('is-visible'); theater.setAttribute('aria-hidden', 'true');
 scene.inert = false; seal.disabled = false;
 setState('closed'); phase('closed'); seal.focus({ preventScroll: true });
}

seal.addEventListener('click', () => openGift().catch((error) => {
 console.error('Gift opening failed', error); phase('opening-error');
 // Keep the actual gift accessible even if an animation API fails.
 slot.append(card); card.style.cssText = ''; card.classList.add('is-docked');
 theater.classList.add('is-visible', 'is-ready'); theater.inert = false;
 theater.setAttribute('aria-hidden', 'false'); setState('watching');
 film.controls = false; film.tabIndex = 0; controls.hidden = false; syncControls(); showMedia('Твій мульт уже тут.', film.paused);
}));
$('#close-gift').addEventListener('click', () => closeGift().catch((error) => { console.error('Gift closing failed', error); phase('closing-error'); }));
$('#replay').addEventListener('click', () => startFilm(true));
filmPlay.addEventListener('click', () => startFilm(ended));
film.addEventListener('playing', hideMedia);
film.addEventListener('waiting', () => {
 if (state === 'watching') showMedia('Відео завантажується…');
});
film.addEventListener('canplay', () => {
 if (!film.paused) hideMedia();
});
film.addEventListener('error', () => {
 if (state !== 'closed') showMedia('Відео не завантажилося. Спробуй ще раз або збережи його за посиланням нижче.', true);
});
film.addEventListener('ended', () => {
 ended = true; endNote.hidden = false;
 showMedia('', true, true);
});


// Visible controls do not depend on a browser's auto-hiding native toolbar.
const controls = $('#player-controls');
const playButton = $('#toggle-play');
const soundButton = $('#toggle-sound');
const fullscreenButton = $('#toggle-fullscreen');
const captionsButton = $('#toggle-captions');
const seek = $('#seek');
const volume = $('#volume');
film.muted = quietPreview;
film.volume = quietPreview ? 0 : .9;
film.controls = false;
let windowFill = false;
let nativeVideoFullscreen = false;
let fullscreenAttempt = 0;

function clock(seconds) {
 const value = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
 return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
}
function isFullscreen() {
 return windowFill || nativeVideoFullscreen || !!(document.fullscreenElement || document.webkitFullscreenElement);
}
function syncControls() {
 const playing = !film.paused && !film.ended;
 playButton.setAttribute('aria-label', playing ? 'Пауза' : 'Відтворити');
 playButton.classList.toggle('is-playing', playing);
 const silent = film.muted || film.volume === 0;
 soundButton.setAttribute('aria-label', silent ? 'Увімкнути звук' : 'Вимкнути звук');
 soundButton.classList.toggle('is-muted', silent);
 volume.value = film.muted ? '0' : String(film.volume);
 const duration = Number.isFinite(film.duration) ? film.duration : 0;
 seek.disabled = duration === 0;
 seek.max = String(duration || 100);
 seek.value = String(film.currentTime || 0);
 seek.setAttribute('aria-valuetext', `${clock(film.currentTime)} із ${clock(duration)}`);
 $('#video-time').textContent = `${clock(film.currentTime)} / ${clock(duration || 108.267)}`;
 const full = isFullscreen();
 fullscreenButton.setAttribute('aria-label', full ? 'Вийти з повного екрана' : 'На весь екран');
 fullscreenButton.classList.toggle('is-fullscreen', full);
 const captions = film.textTracks.length && film.textTracks[0].mode === 'showing';
 captionsButton.setAttribute('aria-pressed', String(!!captions));
 captionsButton.setAttribute('aria-label', captions ? 'Вимкнути українські субтитри' : 'Увімкнути українські субтитри');
}
function togglePlay() {
 if (film.paused || film.ended) startFilm(film.ended);
 else { film.pause(); hideMedia(); }
}
function toggleSound() {
 if (film.muted || film.volume === 0) {
  // Quiet review must remain silent, even when its sound button is exercised.
  if (!quietPreview && film.volume === 0) film.volume = .9;
  film.muted = false;
 } else film.muted = true;
 syncControls();
}
async function leaveFullscreen() {
 fullscreenAttempt = 0;
 if (windowFill) {
  windowFill = false; card.classList.remove('is-expanded'); body.classList.remove('expanded-player');
 }
 if (nativeVideoFullscreen && film.webkitExitFullscreen) film.webkitExitFullscreen();
 else if (document.fullscreenElement && document.exitFullscreen) await document.exitFullscreen().catch(() => {});
 else if (document.webkitFullscreenElement && document.webkitExitFullscreen) document.webkitExitFullscreen();
 syncControls();
}
async function toggleFullscreen() {
 if (isFullscreen()) { await leaveFullscreen(); return; }
 fullscreenAttempt = performance.now();
 // Fullscreen APIs differ: iPhone provides a native video-only player.
 try {
  if (card.requestFullscreen && document.fullscreenEnabled) {
   let timeout;
   try {
    await Promise.race([
     card.requestFullscreen(),
     new Promise(resolve => { timeout = setTimeout(resolve, 900); })
    ]);
   } finally { clearTimeout(timeout); }
   if (document.fullscreenElement) { syncControls(); return; }
   // Some in-app browsers advertise fullscreen but never enter it.
   if (state === 'watching') { windowFill = true; card.classList.add('is-expanded'); body.classList.add('expanded-player'); syncControls(); }
   return;
  }
  if (card.webkitRequestFullscreen && document.webkitFullscreenEnabled) {
   card.webkitRequestFullscreen(); return;
  }
  if (film.webkitEnterFullscreen) {
   film.webkitEnterFullscreen(); return;
  }
 } catch { /* Embedded browsers may deny fullscreen. Fill the window instead. */ }
 windowFill = true; card.classList.add('is-expanded'); body.classList.add('expanded-player'); syncControls();
}
playButton.addEventListener('click', togglePlay);
soundButton.addEventListener('click', toggleSound);
volume.addEventListener('input', () => {
 film.volume = quietPreview ? 0 : Number(volume.value); film.muted = film.volume === 0; syncControls();
});
seek.addEventListener('input', () => {
 if (!Number.isFinite(film.duration)) return;
 film.currentTime = Number(seek.value);
 if (film.currentTime < film.duration) { ended = false; endNote.hidden = true; hideMedia(); }
 syncControls();
});
fullscreenButton.addEventListener('click', () => toggleFullscreen().catch(() => {}));
captionsButton.addEventListener('click', () => {
 if (!film.textTracks.length) return;
 film.textTracks[0].mode = film.textTracks[0].mode === 'showing' ? 'disabled' : 'showing';
 syncControls();
});
for (const event of ['play', 'pause', 'ended', 'timeupdate', 'durationchange', 'loadedmetadata', 'volumechange', 'seeked']) film.addEventListener(event, syncControls);
for (const event of ['fullscreenchange', 'webkitfullscreenchange']) document.addEventListener(event, () => {
 // A host app can cancel fullscreen immediately after granting the request.
 // Preserve the user's intent with window-fill; explicit exits clear the attempt.
 if (!(document.fullscreenElement || document.webkitFullscreenElement) && !nativeVideoFullscreen && !windowFill && fullscreenAttempt && performance.now() - fullscreenAttempt < 1200 && state === 'watching') {
  windowFill = true; card.classList.add('is-expanded'); body.classList.add('expanded-player');
 }
 syncControls();
});
film.addEventListener('webkitbeginfullscreen', () => { nativeVideoFullscreen = true; syncControls(); });
film.addEventListener('webkitendfullscreen', () => { nativeVideoFullscreen = false; syncControls(); });
film.addEventListener('click', () => { if (state === 'watching') togglePlay(); });
film.addEventListener('dblclick', () => { if (state === 'watching') toggleFullscreen(); });
document.addEventListener('keydown', (event) => {
 if (state !== 'watching' || event.ctrlKey || event.metaKey || event.altKey) return;
 if (event.key === 'Escape') fullscreenAttempt = 0;
 if (event.key === 'Escape' && windowFill) { event.preventDefault(); leaveFullscreen(); return; }
 if (event.target.closest('button, a, input, textarea, select')) return;
 const key = event.key.toLowerCase();
 if (key === ' ' || key === 'k') { event.preventDefault(); togglePlay(); }
 else if (key === 'f') { event.preventDefault(); toggleFullscreen(); }
 else if (key === 'm') { event.preventDefault(); toggleSound(); }
 else if (Number.isFinite(film.duration) && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
  event.preventDefault();
  film.currentTime = event.key === 'Home' ? 0 : event.key === 'End' ? film.duration : Math.max(0, Math.min(film.duration, film.currentTime + (event.key === 'ArrowLeft' ? -5 : 5)));
 }
});
syncControls();
