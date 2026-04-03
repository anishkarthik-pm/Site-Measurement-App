import { showToast } from './toast.js';

const wordMap = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90,
  hundred: 100, thousand: 1000, lakh: 100000
};

function parseNumberFromText(text) {
  // Try direct number first
  const direct = parseFloat(text.replace(/[^\d.]/g, ''));
  if (!isNaN(direct) && direct > 0) return Math.round(direct);

  // Word-based parsing
  const cleaned = text.toLowerCase().trim();
  const words = cleaned.split(/[\s,]+/);
  let total = 0;
  let current = 0;

  for (const word of words) {
    if (wordMap[word] !== undefined) {
      const val = wordMap[word];
      if (val === 100) {
        current = (current || 1) * 100;
      } else if (val === 1000 || val === 100000) {
        current = (current || 1) * val;
        total += current;
        current = 0;
      } else {
        current += val;
      }
    }
  }
  total += current;
  return total > 0 ? total : null;
}

function isSpeechRecognitionSupported() {
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

export function attachVoiceMic(inputEl) {
  if (!isSpeechRecognitionSupported()) return;

  // Wrap input in relative container if not already
  const parent = inputEl.parentNode;
  const wrapper = document.createElement('div');
  wrapper.className = 'voice-input-wrapper';
  parent.insertBefore(wrapper, inputEl);
  wrapper.appendChild(inputEl);

  const micBtn = document.createElement('button');
  micBtn.type = 'button';
  micBtn.className = 'voice-mic-btn';
  micBtn.innerHTML = '🎤';
  micBtn.setAttribute('aria-label', 'Voice input');
  wrapper.appendChild(micBtn);

  let recognition = null;
  let listening = false;

  micBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (listening) {
      if (recognition) recognition.stop();
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-IN';

    recognition.onstart = () => {
      listening = true;
      micBtn.classList.add('voice-mic-listening');
    };

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      const number = parseNumberFromText(transcript);
      if (number !== null && number > 0) {
        inputEl.value = number;
        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        inputEl.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        showToast("Didn't catch that — try again", 'error');
      }
    };

    recognition.onerror = () => {
      showToast("Didn't catch that — try again", 'error');
    };

    recognition.onend = () => {
      listening = false;
      micBtn.classList.remove('voice-mic-listening');
      recognition = null;
    };

    recognition.start();
  });
}

export function attachVoiceMicToAll(containerEl) {
  if (!containerEl) return;
  const inputs = containerEl.querySelectorAll('input[data-voice="true"]');
  inputs.forEach(input => attachVoiceMic(input));
}
