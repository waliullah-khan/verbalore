export type Check = { ok: boolean; text: string };

export const fmt = (s: number) => {
  s = Math.max(0, Math.round(s));
  return Math.floor(s / 60) + ":" + ("0" + (s % 60)).slice(-2);
};

// rms is one reading (0 to 1) of the microphone every tenth of a second while the take ran.
export function soundCheck(rms: number[]): Check | null {
  if (rms.length < 8) return null;
  const peak = Math.max(...rms);
  const speaking = rms.filter((r) => r > 0.02).length / rms.length;
  if (peak >= 0.9) return { ok: false, text: "Sound is very loud and may distort. Move back from the microphone" };
  if (speaking < 0.2 || peak < 0.06) return { ok: false, text: "Sound is quiet. Check that the right microphone is on" };
  return { ok: true, text: "Sound level is good" };
}

// luma is the average brightness (0 to 255) of the picture, sampled about once a second.
export function lightCheck(luma: number[]): Check | null {
  if (!luma.length) return null;
  const avg = luma.reduce((a, b) => a + b, 0) / luma.length;
  if (avg < 55) return { ok: false, text: "It looks dark. Face a window or a lamp" };
  if (avg > 220) return { ok: false, text: "It looks washed out. Turn away from the bright light" };
  return { ok: true, text: "Lighting looks good" };
}

export function lengthCheck(sec: number): Check {
  if (sec < 8) return { ok: false, text: `Length is ${fmt(sec)}, very short for a take` };
  if (sec > 120) return { ok: false, text: `Length is ${fmt(sec)}, long for social video` };
  return { ok: true, text: `Length is ${fmt(sec)}, a good length for social video` };
}

// Live reading from a stream's microphone, so the level meter shows what is really being heard.
export function openMeter(stream: MediaStream) {
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx || !stream.getAudioTracks().length) return null;
  try {
    const ctx = new Ctx();
    const src = ctx.createMediaStreamSource(stream);
    const an = ctx.createAnalyser();
    an.fftSize = 1024;
    src.connect(an);
    const buf = new Uint8Array(an.fftSize);
    return {
      level() {
        an.getByteTimeDomainData(buf);
        let sum = 0;
        for (const v of buf) sum += ((v - 128) / 128) ** 2;
        return Math.sqrt(sum / buf.length);
      },
      close() {
        src.disconnect();
        ctx.close().catch(() => undefined);
      },
    };
  } catch {
    return null;
  }
}

export function sampleLuma(video: HTMLVideoElement): number | null {
  if (!video.videoWidth) return null;
  const c = document.createElement("canvas");
  c.width = 24;
  c.height = 24;
  const x = c.getContext("2d");
  if (!x) return null;
  x.drawImage(video, 0, 0, 24, 24);
  const d = x.getImageData(0, 0, 24, 24).data;
  let sum = 0;
  for (let i = 0; i < d.length; i += 4) sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  return sum / (d.length / 4);
}

export const durationOf = (file: Blob) =>
  new Promise<{ seconds: number; url: string }>((resolve) => {
    const el = document.createElement("video");
    const url = URL.createObjectURL(file);
    el.preload = "metadata";
    el.src = url;
    el.onloadedmetadata = () => resolve({ seconds: el.duration && isFinite(el.duration) ? el.duration : 0, url });
    el.onerror = () => resolve({ seconds: 0, url });
  });
