import { $, msg } from './util.js';

export function speak(text) {
  if (!('speechSynthesis' in window)) { msg("This browser can't speak replies."); return; }
  try {
    speechSynthesis.cancel();
    speechSynthesis.speak(new SpeechSynthesisUtterance(text));
  } catch { msg("Couldn't play audio."); }
}

/** Wires the floating mic button. onText receives the final transcript. */
export function initMic(onText) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const m = $('#mic');
  let rec = null;
  m.onclick = () => {
    if (!SR) { msg('This browser has no built-in voice input. Try Chrome or Safari, or use your keyboard microphone.'); return; }
    if (rec) { rec.stop(); return; }
    try {
      rec = new SR();
      rec.lang = navigator.language || 'en-US';
      rec.interimResults = true;
      rec.onstart = () => { m.textContent = '⏹'; msg('Listening… tap again to stop.'); };
      rec.onresult = (e) => {
        const r = e.results[e.results.length - 1];
        $('#in').value = r[0].transcript;
        if (r.isFinal) { msg(''); onText($('#in').value); }
      };
      rec.onerror = (e) => msg('Voice input failed: ' + e.error +
        (e.error === 'not-allowed' || e.error === 'service-not-allowed'
          ? ' (allow microphone access for this site in your browser settings)' : ''));
      rec.onend = () => { rec = null; m.textContent = '🎤'; };
      rec.start();
    } catch (x) { rec = null; msg("Voice input couldn't start: " + (x && x.message || x)); }
  };
}
