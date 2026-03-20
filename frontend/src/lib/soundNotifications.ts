type NotificationSound =
  | "es_new_offer"
  | "as_offer_accepted"
  | "as_offer_reassigned"
  | "as_all_rejected"
  | "as_completed";

let audioContext: AudioContext | null = null;
let notificationVolume = 0.8;

export const setNotificationVolume = (value: number) => {
  notificationVolume = Math.max(0, Math.min(1, value * 1.15));
};

const getAudioContext = (): AudioContext | null => {
  if (typeof window === "undefined") {
    return null;
  }

  const AudioContextCtor = window.AudioContext || (window as typeof window & {
    webkitAudioContext?: typeof AudioContext;
  }).webkitAudioContext;

  if (!AudioContextCtor) {
    return null;
  }

  if (!audioContext) {
    audioContext = new AudioContextCtor();
  }

  return audioContext;
};

const scheduleTone = (
  context: AudioContext,
  startTime: number,
  frequency: number,
  durationMs: number,
  volume: number
) => {
  const oscillator = context.createOscillator();
  const gainNode = context.createGain();
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(frequency, startTime);

  gainNode.gain.setValueAtTime(0.0001, startTime);
  gainNode.gain.exponentialRampToValueAtTime(volume, startTime + 0.015);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + durationMs / 1000);

  oscillator.connect(gainNode);
  gainNode.connect(context.destination);
  oscillator.start(startTime);
  oscillator.stop(startTime + durationMs / 1000);
};

const playRepeatingPattern = (
  context: AudioContext,
  frequencies: number[],
  totalDurationMs: number,
  stepMs: number,
  noteDurationMs: number,
  volume: number
) => {
  const now = context.currentTime;
  const steps = Math.floor(totalDurationMs / stepMs);

  for (let i = 0; i < steps; i += 1) {
    const frequency = frequencies[i % frequencies.length];
    const startTime = now + (i * stepMs) / 1000;
    scheduleTone(context, startTime, frequency, noteDurationMs, volume * notificationVolume);
  }
};

export const playNotificationSound = async (sound: NotificationSound) => {
  const context = getAudioContext();
  if (!context) {
    return;
  }

  if (context.state === "suspended") {
    await context.resume();
  }

  switch (sound) {
    case "es_new_offer":
      // 5+ second alert tuned to be more noticeable for ES operators.
      playRepeatingPattern(context, [740, 620, 740, 880], 5400, 600, 260, 0.26);
      break;
    case "as_offer_accepted":
      playRepeatingPattern(context, [660, 880], 900, 300, 160, 0.13);
      break;
    case "as_offer_reassigned":
      playRepeatingPattern(context, [520, 660], 800, 300, 150, 0.12);
      break;
    case "as_all_rejected":
      playRepeatingPattern(context, [320, 280, 240], 1200, 350, 220, 0.14);
      break;
    case "as_completed":
      playRepeatingPattern(context, [700, 900], 800, 250, 150, 0.12);
      break;
    default:
      break;
  }
};
