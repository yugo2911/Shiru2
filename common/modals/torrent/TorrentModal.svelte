<script context='module'>
  import SoftModal from '@/components/modals/SoftModal.svelte'
  import TorrentResults from '@/modals/torrent/components/TorrentResults.svelte'
  import { fetchBestTorrent } from '@/modals/torrent/components/TorrentResults.svelte'
  import { findInCurrent, nowPlaying as currentMedia } from '@/components/MediaHandler.svelte'
  import { page, modal } from '@/modules/navigation.js'
  import { settings } from '@/modules/settings.js'
  import { add, stage } from '@/modules/torrent.js'
  import { cache, caches } from '@/modules/cache.js'
  import { getHash } from '@/modules/anime/animehash.js'

  export function playAnime (media, episode = 1, force = false) {
    episode = Number(episode)
    episode = isNaN(episode) ? 1 : episode
    if (!force && findInCurrent({ media, episode })) {
      page.navigateTo(page.PLAYER)
      return
    }
    if (settings.value.rssAutoSelect) {
      autoSelectAndPlay({ media, episode })
      return
    }
    modal.open(modal.TORRENT_MENU, { media, episode })
  }

  async function autoSelectAndPlay (search) {
    try {
      const best = await fetchBestTorrent(search)
      if (!best) {
        modal.open(modal.TORRENT_MENU, search)
        return
      }
      currentMedia.set({ ...search, accuracy: best.accuracy })
      const existingMagnets = cache.getEntry(caches.HISTORY, 'lastMagnet') || {}
      cache.setEntry(caches.HISTORY, 'lastMagnet', {
        ...existingMagnets,
        [search.media.id]: !best.parseObject?.episode_number || Array.isArray(best.parseObject.episode_number)
          ? { batch: best }
          : { ...(existingMagnets[search.media.id] || {}), [`${search.episode}`]: best }
      })
      add(best.link, { media: search.media, episode: search.episode }, best.hash)
      page.navigateTo(page.PLAYER)
    } catch {
      modal.open(modal.TORRENT_MENU, search)
    }
  }

  export async function autoStageNext(search) {
    if (!settings.value.playerAutoDownloadNext || getHash(search.media.id, { episode: search.episode, client: true, batchGuess: true }, false, true)) return
    const best = await fetchBestTorrent(search)
    if (!best) return
    const existingMagnets = cache.getEntry(caches.HISTORY, 'lastMagnet') || {}
    cache.setEntry(caches.HISTORY, 'lastMagnet', {
      ...existingMagnets,
      [search.media.id]: !best.parseObject?.episode_number || Array.isArray(best.parseObject.episode_number)
        ? { batch: best }
        : { ...(existingMagnets[search.media.id] || {}), [`${search.episode}`]: best }
    })
    stage(best.link, search, best.hash)
  }
</script>

<script>
  function close () {
    modal.close(modal.TORRENT_MENU)
  }
</script>

<SoftModal class='m-0 w-full wm-1150 h-full rounded bg-very-dark pt-0 mx-20' bind:showModal={$modal[modal.TORRENT_MENU]} {close} id={modal.TORRENT_MENU}>
  <TorrentResults search={modal.value[modal.TORRENT_MENU].data} {close} />
</SoftModal>