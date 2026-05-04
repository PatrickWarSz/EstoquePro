let ctx: AudioContext | null = null

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (ctx) return ctx
  const Ctor =
    (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
      .AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  ctx = new Ctor()
  return ctx
}

/** Short confirmation beep. Pass variant to differentiate scan vs error. */
export function beep(variant: 'scan' | 'success' | 'error' = 'scan') {
  const ac = getCtx()
  if (!ac) return
  try {
    if (ac.state === 'suspended') ac.resume()
    const osc = ac.createOscillator()
    const gain = ac.createGain()
    const now = ac.currentTime
    const freq = variant === 'error' ? 240 : variant === 'success' ? 1320 : 880
    const dur = variant === 'error' ? 0.22 : 0.12
    osc.type = 'sine'
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur)
    osc.connect(gain).connect(ac.destination)
    osc.start(now)
    osc.stop(now + dur + 0.02)
  } catch {
    /* silent */
  }
}