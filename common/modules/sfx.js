import { settings } from '@/modules/settings.js'

const SFX_VOLUME_DEFAULT = 0.5
const cache = new Map()

function resolveVolume() {
  const raw = Number(settings.value.sfxVolume)
  return Number.isFinite(raw) ? Math.min(Math.max(raw, 0), 1) : SFX_VOLUME_DEFAULT
}

function applyVolume() {
  const vol = resolveVolume()
  for (const audio of cache.values()) audio.volume = vol
}

settings.subscribe(applyVolume)

export function makeSfx(src) {
  let audio = cache.get(src)
  if (!audio) {
    audio = new Audio(src)
    audio.volume = resolveVolume()
    cache.set(src, audio)
  }
  return audio
}

export function playSfx(audio) {
  audio.currentTime = 0
  audio.play().catch(() => {})
}