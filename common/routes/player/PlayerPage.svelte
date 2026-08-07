<script>
  import { settings } from '@/modules/settings.js'
  import { cache, caches } from '@/modules/cache.js'
  import { page, modal, playPage } from '@/modules/navigation.js'
  import { getAnimeProgress, setAnimeProgress } from '@/modules/anime/animeprogress.js'
  import { playAnime, autoStageNext } from '@/modals/torrent/TorrentModal.svelte'
  import { anilistClient } from '@/modules/anilist.js'
  import { episodesList } from '@/modules/episodes.js'
  import AnimeResolver from '@/modules/anime/animeresolver.js'
  import { durationMap, getMediaMaxEp } from '@/modules/anime/anime.js'
  import { createEventDispatcher } from 'svelte'
  import { fade } from 'svelte/transition'
  import Subtitles from '@/modules/subtitles.js'
  import { toTS, fastPrettyBytes, matchPhrase, videoRx, isValidNumber, debounce } from '@/modules/util.js'
  import { toast } from 'svelte-sonner'
  import { getChaptersAniSkip } from '@/modules/anime/anime.js'
  import { mediaCache } from '@/modules/cache.js'
  import Seekbar from '@/routes/player/components/Seekbar.svelte'
  import { click } from '@/modules/click.js'
  import VideoDeband from 'video-deband'
  import Helper from '@/modules/helper.js'

  import { w2gEmitter, state } from '@/routes/w2g/WatchTogetherPage.svelte'
  import ManagerModal from '@/modals/manager/ManagerModal.svelte'
  import Keybinds, { loadWithDefaults, condition } from 'svelte-keybinds'
  import { SUPPORTS } from '@/modules/support.js'
  import 'rvfc-polyfill'
  import { IPC, ELECTRON, ANDROID } from '@/modules/bridge.js'
  import WPC from '@/modules/wpc.js'
  import { X, Minus, ArrowDown, ArrowUp, Captions, CircleHelp, Contrast, FastForward, Keyboard, EllipsisVertical, SquareArrowOutUpRight, List, Eye, EyeOff, FilePlus2, ListMusic, ListVideo, Maximize, Minimize, Pause, PictureInPicture, PictureInPicture2, Play, Proportions, RefreshCcw, Rewind, RotateCcw, RotateCw, ScreenShare, SkipBack, SkipForward, Users, Volume1, Volume2, VolumeX, SlidersVertical, SquarePen, Milestone, ClockArrowDown, ClockArrowUp,FolderOpen, Download } from 'lucide-svelte'
  import { jimakuClient } from '@/modules/jimaku.js'
  import SoftModal from '@/components/modals/SoftModal.svelte'
  import EpisodePanel from '@/components/EpisodePanel.svelte'
  import Debug from 'debug'
  const debug = Debug('ui:player')

  const emit = createEventDispatcher()

  w2gEmitter.on('playerupdate', detail => {
    currentTime = detail.time
    paused = detail.paused
  })
  w2gEmitter.on('setindex', detail => {
    playFile(detail)
  })

  export function playFile (file) {
    if (isValidNumber(file)) handleCurrent(videos?.[file])
    else handleCurrent(file)
  }

  function updatew2g () {
    saveAnimeProgress()
    w2gEmitter.emit('player', { time: Math.floor(currentTime), paused })
  }

  export let miniplayer = false
  $: viewAnime = $modal[modal.ANIME_DETAILS]
  $condition = () => SUPPORTS.keybinds && $page === page.PLAYER && ((!miniplayer && (!$modal || !modal.length) && !document.querySelector('.modal.show')) || viewAnime)

  export let files = []
  export let playableFiles = []
  export let updateCurrent
  export let paused = true
  export let miniplayerShelved = false
  $: updateFiles(files)
  let src = null
  let video = null
  let container = null
  let current = null
  let subs = null
  let duration = 0.1
  let muted = false
  let wasPaused = null
  let videos = []
  let immersed = false
  let buffering = false
  let immerseTimeout = null
  let bufferTimeout = null
  let subHeaders = null
  let jimakuShow = false
  let jimakuFiles = []
  let pip = false
  // const presentationRequest = null
  // const presentationConnection = null
  // const canCast = false
  let isFullscreen = false
  let ended = false
  let gain = 0
  let volume = Number(cache.getEntry(caches.GENERAL, 'volume')) || 1
  let volumeBoosted = false
  let volumeLimit = 1
  let volumeText = ''
  let volumeVisible = false
  let volumeTimeout
  let subText = ''
  let subVisible = false
  let subTimeout
  let wheelAccumulator = 0
  let boostScrollCount = 0
  let boostResetTimer = null
  let audioCtx = null
  let source = null
  let gainNode = null
  let playbackRate = 1
  let showEpisodes = false
  let externalPlayerReady = false
  $: cache.setEntry(caches.GENERAL, 'volume', String(volume || 0))
  $: launchedExternal = false
  $: externalPlayback = ($settings.enableExternal || launchedExternal) && (SUPPORTS.isAndroid || $settings.playerPath)
  $: safeduration = externalPlayback ? ((current?.media?.media?.duration || (current?.media?.media?.format && durationMap[current?.media?.media?.format]) || 24) * 60) : (isFinite(duration) ? duration : currentTime)
  $: {
    if (hidden) setDiscordRPC(media, video?.currentTime)
    else setDiscordRPC(media, (paused && ($page !== page.PLAYER)))
  }

  window.addEventListener('fileEdit', () => {
    if (current) {
      debug('Detected a user update to the parsed file(s), now updating the media...')
      const index = videos.indexOf(current)
      updateCurrent({ detail: current })
      current = videos[index]
    }
  })

  function setupAudio() {
    if (!audioCtx) {
      audioCtx = new AudioContext()
      source = audioCtx.createMediaElementSource(video)
      gainNode = audioCtx.createGain()
      source.connect(gainNode)
      gainNode.connect(audioCtx.destination)
    }
  }

  function checkAudio () {
    volumeBoosted = cache.getEntry(caches.HISTORY, 'lastBoosted')?.[`${media?.media?.id || media?.title || media?.parseObject?.title || media?.parseObject?.file_name}`]?.boosted || false
    if (volumeBoosted) {
      setupAudio()
      gain = cache.getEntry(caches.HISTORY, 'lastBoosted')?.[`${media?.media?.id || media?.title || media?.parseObject?.title || media?.parseObject?.file_name}`]?.gain || 0
      gainNode.gain.value = gain
    } else {
      if (gainNode?.gain) gainNode.gain.value = volume
      gain = 0
      boostScrollCount = 0
      clearTimeout(boostResetTimer)
    }
    if ('audioTracks' in HTMLVideoElement.prototype) {
      if (!video.audioTracks.length) {
        toast.error('Audio Codec Unsupported', {
          description: "This torrent's audio codec is not supported, try a different release by disabling Autoplay Torrents in RSS settings."
        })
      } else if (video.audioTracks.length > 1) {
        const preferredTrack = [...video.audioTracks].find(({ language }) => language === $settings.audioLanguage)
        if (preferredTrack) return selectAudio(preferredTrack.id)

        const japaneseTrack = [...video.audioTracks].find(({ language }) => language === 'jpn')
        if (japaneseTrack) return selectAudio(japaneseTrack.id)
      }
    }
  }

  const updateSubs = debounce(() => {
    if (!subs?.renderer) return
    subs.renderer.resize()
    if (paused) {
      seek(-0.001)
      requestAnimationFrame(() => {
        if (video.currentTime !== 0) seek(0.001)
      })
    }
  }, 200) // stupid fix (resize) because video metadata doesn't update for multiple frames
  function checkSubtitle() {
    const lastSubtitle = cache.getEntry(caches.HISTORY, 'lastSubtitle')?.[`${media?.media?.id || media?.title || media?.parseObject?.title || media?.parseObject?.file_name}`]
    if (subHeaders?.length && lastSubtitle) {
      if (lastSubtitle === 'OFF') {
        subs.selectCaptions(-1)
        updateSubs()
      } else {
        for (const track of subHeaders) {
          const trackName = (track?.language || (!Object.values(subs?.headers).some(header => header?.language === 'eng' || header?.language === 'en') ? 'eng' : track?.type)) + (track?.name ? ' - ' + track?.name : '')
          if (matchPhrase(lastSubtitle, trackName, trackName?.length > 10 ? 3 : 2, true) && track?.number) {
            subs.selectCaptions(track.number)
            updateSubs()
            break
          }
        }
      }
    }
  }

  async function exploreJimaku () {
    if (!media?.media?.id) {
      toast.error('No Media ID', { description: 'Unable to find media ID for Jimaku search' })
      return
    }
    if (!settings.value.jimakuKey) {
      toast.error('No API Key', { description: 'Please configure your Jimaku API key in Settings' })
      return
    }
    jimakuShow = true
    try {
      const search = await jimakuClient.search({ anilist_id: media.media.id })
      const entry = search?.[0]
      if (!entry) {
        jimakuFiles = []
        return
      }
      const files = await jimakuClient.getFiles(entry.id, { episode: media.episode })
      jimakuFiles = files || []
    } catch (err) {
      toast.error('Jimaku Error', { description: err.message })
      jimakuFiles = []
    }
  }
  async function downloadJimakuFile (file) {
    try {
      const response = await fetch(file.url)
      const blob = await response.blob()
      const subtitleFile = new File([blob], file.name, { type: 'application/x-subrip' })
      const dataTransfer = new DataTransfer()
      dataTransfer.items.add(subtitleFile)
      window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dataTransfer }))
      toast.success('Subtitles Loaded', { description: file.name })
      closeJimaku()
    } catch (err) {
      toast.error('Download Error', { description: err.message })
    }
  }
  function closeJimaku () {
    jimakuShow = false
    jimakuFiles = []
  }

  // if ('PresentationRequest' in window) {
  //   const handleAvailability = aval => {
  //     canCast = !!aval
  //   }
  //   presentationRequest = new PresentationRequest(['build/cast.html'])
  //   presentationRequest.addEventListener('connectionavailable', e => initCast(e))
  //   navigator.presentation.defaultRequest = presentationRequest
  //   presentationRequest.getAvailability().then(aval => {
  //     aval.onchange = e => handleAvailability(e.target.value)
  //     handleAvailability(aval.value)
  //   })
  // }

  // document.fullscreenElement isn't reactive
  let orientationLockable = true // might as well stop trying to lock the orientation when the device doesn't support it.
  document.addEventListener('fullscreenchange', () => {
    isFullscreen = !!document.fullscreenElement
    if (document.fullscreenElement && orientationLockable) {
      if (SUPPORTS.isAndroid) window.AndroidFullScreen?.immersiveMode()
      screen.orientation.lock('landscape').then(success => debug(success), failure => { if (!failure?.toString()?.includes('NotSupportedError')) { debug(failure) } else { orientationLockable = false } })
    } else if (orientationLockable) {
      if (SUPPORTS.isAndroid) {
        window.AndroidFullScreen?.showSystemUI()
        window.Capacitor.Plugins.StatusBar.setOverlaysWebView({overlay: true})
        window.Capacitor.Plugins.StatusBar.hide()
      }
      screen.orientation.unlock()
    }
  })

  function handleHeaders () {
    subHeaders = subs?.headers
  }

  function updateFiles (files) {
    if (files?.length) {
      videos = files.filter(file => videoRx.test(file.name))
      if (videos?.length) {
        if (subs) {
          subs.files = files || []
        }
      }
    } else {
      src = ''
      buffering = true
      current = null
      currentTime = 0
      targetTime = 0
      if (subs) {
        subs.destroy()
        subs = null
      }
    }
  }

  let loadInterval

  function clearLoadInterval () {
    clearInterval(loadInterval)
  }
  /**
   * @type {VideoDeband}
   */
  let deband

  function loadDeband (load, video) {
    if (!video) return
    if (load && !deband) {
      deband = new VideoDeband(video)
      deband.canvas.classList.add('deband-canvas')
      video.before(deband.canvas)
    } else if (!load && deband) {
      deband.destroy()
      deband.canvas.remove()
      deband = null
    }
  }
  $: loadDeband($settings.playerDeband, video)

  let externalReadyListener
  async function handleCurrent (file) {
    paused = true
    canPlay = false
    video?.pause?.()
    externalPlayerReady = false
    showBuffering()
    if (file) {
      if (thumbnailData.video?.src) URL.revokeObjectURL(video?.src)
      Object.assign(thumbnailData, {
        thumbnails: [],
        interval: undefined,
        video: undefined
      })
      currentTime = 0
      targetTime = 0
      chapters = []
      embeddedChapters = []
      currentSkippable = null
      completed = false
      subDelay = 0
      subDelayText = ''
      if (subs) {
        subs.destroy()
        subs = null
      }
      current = file
      setCurrent(file)
    }
  }

  async function setCurrent(file, launchExternal = false) {
    if (!externalPlayback) {
      src = file.url
      subs = new Subtitles(video, files, current, handleHeaders)
      video.load()
      await loadAnimeProgress()
    } else externalPlaying = false
    emit('current', current) // #handleCurrent in MediaHandler
    if (externalPlayback) {
      WPC.clear('externalReady', externalReadyListener)
      externalReadyListener = () => {
        hideBuffering()
        externalPlayerReady = true
        setTimeout(() => {
          if (externalPlayerReady && !externalPlaying) autoPlay()
        }, 1_500)
      }
      WPC.listen('externalReady', externalReadyListener)
    }
    paused = true
    currentTime = 0
    targetTime = 0
    launchedExternal = launchExternal
    WPC.send('current', { current: file, external: settings.value.enableExternal || launchExternal })
  }

  export let media

  $: checkAvail(media, current)
  let hasNext = false
  let hasLast = false
  function hasNextEpisode() {
    return media?.media && (media?.media?.nextAiringEpisode?.episode - 1 || (media?.media?.episodes || getMediaMaxEp(media?.media)) > media?.episode)
  }
  function checkAvail (media, current) {
    if ((((media?.media?.nextAiringEpisode?.episode - 1 || getMediaMaxEp(media?.media)) - (media?.zeroEpisode ? 1 : 0)) > media?.episode) || ((media?.media && !media.media.nextAiringEpisode?.episode && !media.media.airingSchedule?.nodes?.[0]?.episode && !media.media.episodes))) hasNext = true
    else hasNext = videos.indexOf(current) !== videos.length - 1
    if (media?.media && (media?.episode > 1 || (media?.zeroEpisode && media?.episode === 1))) hasLast = true
    else hasLast = videos.indexOf(current) > 0
  }

  async function loadAnimeProgress () {
    let animeProgress
    if (!current?.media?.media?.id || !isValidNumber(current?.media?.episode) || current?.media?.failed || !media?.media?.id || !isValidNumber(media?.episode)) animeProgress = await getAnimeProgress({ name: current?.media?.parseObject?.anime_title ? (current?.media?.parseObject?.anime_title + ((media?.season || current?.media?.parseObject?.anime_season ? ` S${media?.season || current?.media?.parseObject?.anime_season}` : '') + ((media?.episode || current?.media?.parseObject?.episode_number ? ` E${media?.episode || current?.media?.parseObject?.episode_number}` : '')))) : current?.name })
    else animeProgress = await getAnimeProgress({ name: current?.media?.parseObject?.anime_title ? (current?.media?.parseObject?.anime_title + ((media?.season || current?.media?.parseObject?.anime_season ? ` S${media?.season || current?.media?.parseObject?.anime_season}` : '') + ((media?.episode || current?.media?.parseObject?.episode_number ? ` E${media?.episode || current?.media?.parseObject?.episode_number}` : '')))) : current?.name, mediaId: current.media.media.id, episode: current.media.episode })
    if (!animeProgress) return

    const currentTime = Math.max(animeProgress.currentTime - 5, 0) // Load 5 seconds before
    seek(currentTime - video.currentTime)
  }

  function saveAnimeProgress (error = false) {
    if (!error && (buffering || video.readyState < 4)) return
    if (error) {
      currentTime = 0
      targetTime = 0
      video.currentTime = targetTime
    }
    if (!current?.media?.media?.id || !isValidNumber(current?.media?.episode) || current?.media?.failed || !media?.media?.id || !isValidNumber(media?.episode)) setAnimeProgress({ name: current?.media?.parseObject?.anime_title ? (current?.media?.parseObject?.anime_title + ((media?.season || current?.media?.parseObject?.anime_season ? ` S${media?.season || current?.media?.parseObject?.anime_season}` : '') + ((media?.episode || current?.media?.parseObject?.episode_number ? ` E${media?.episode || current?.media?.parseObject?.episode_number}` : '')))) : current?.name, currentTime: video.currentTime, safeduration })
    else setAnimeProgress({ mediaId: current.media.media.id, episode: current.media.episode, currentTime: video.currentTime, safeduration })
  }
  setInterval(() => {
    if (!paused) saveAnimeProgress()
  }, 10_000)

  function cycleSubtitles () {
    if (current && subs?.headers) {
      const tracks = subs.headers.filter(header => header)
      const index = tracks.indexOf(subs.headers[subs.current]) + 1
      const selectedIndex = index >= tracks.length ? -1 : subs.headers.indexOf(tracks[index])
      subs.selectCaptions(selectedIndex)
      updateSubs()
      const selectedTrack = selectedIndex === -1 ? 'Subtitles Off' : tracks[index]?.name || tracks[index]?.language || 'Subtitle'
      subText = selectedTrack
      subVisible = true
      clearTimeout(subTimeout)
      subTimeout = setTimeout(() => subVisible = false, 1500)
    }
  }

  let subDelay = 0
  let subDelayText = ''
  let subDelayVisible = false
  let subDelayTimeout
  $: updateDelay(subDelay)
  function updateDelay(delay) {
    if (subs?.renderer) {
      subs.renderer.timeOffset = Number(delay)
      updateSubs()
    }
  }
  function setSubDelay(delay) {
    subDelay = delay
    subDelayText = subDelay > 0 ? `+${subDelay}s` : `${subDelay}s`;
    subDelayVisible = true;
    clearTimeout(subDelayTimeout);
    subDelayTimeout = setTimeout(() => subDelayVisible = false, 600)
  }

  let currentTime = 0
  $: progress = currentTime / safeduration * 100
  $: targetTime = (!paused && currentTime) || targetTime
  function handleMouseDown ({ detail }) {
    if (wasPaused == null) {
      wasPaused = paused
      paused = true
    }
    targetTime = detail / 100 * safeduration
  }
  function handleMouseUp () {
    paused = wasPaused
    wasPaused = null
    currentTime = targetTime
  }
  $: pagePause($page, $playPage, $modal)
  let pagePaused = 0
  function pagePause(_page, _playPage, _modal) {
    if (externalPlayback) return
    if (buffer === 0 && pagePaused) {
      pagePaused = 1
      return
    }
    const updateRequest = _modal[modal.UPDATE_PROMPT]
    const playerPage = _page === page.PLAYER || (!_playPage && updateRequest)
    const playPage = _playPage || updateRequest
    const viewDetails = Object.keys(_modal).length === 1 && _modal[modal.ANIME_DETAILS]
    const overlayCount = Object.keys(_modal).length
    if (!video?.ended) {
      if ((!playerPage || viewDetails || updateRequest) && !paused && playPage && !pip) {
        pagePaused = 2
        playPause()
      } else if (playerPage && paused && pagePaused === 2 && !overlayCount && playPage && !pip) {
        pagePaused = 1
        playPause()
      } else if (overlayCount && ((!viewDetails && !updateRequest && !playerPage) || overlayCount > 1) && !paused && !playPage && !pip) {
        pagePaused = 2
        playPause()
      } else if ((!overlayCount || viewDetails || updateRequest) && paused && pagePaused === 2 && !playPage && !pip) {
        pagePaused = 1
        playPause()
      } else if ((!playerPage || overlayCount) && paused && pagePaused && pagePaused !== 2) {
        pagePaused = 3
      }
    }
    if (!pagePaused) pagePaused = 1
  }
  async function promptFiller () {
    emit('duration', { current, duration })
    const fillerEpisode = await episodesList.getSingleEpisode(media?.media?.idMal, media?.episode)
    filler = fillerEpisode?.filler && 'Filler'
    recap = fillerEpisode?.recap && 'Recap'
    resolvePrompt = current?.failed || current?.media?.failed || current?.parseObject?.failed
    skipPrompt = filler || recap
  }
  async function autoPlay () {
    await promptFiller()
    if ((($page === page.PLAYER && modal.length === 0) || pip) && !resolvePrompt && !skipPrompt) {
      if (externalPlayback) playPause()
      else if (!hidden) {
        video.play()
        resetImmerse()
        updateSubs()
      }
    } else if (!externalPlayback) video.pause()
  }

  let watchedListener
  let androidListener
  let externalPlaying = false
  function playPause () {
    if (hidden) return
    if (externalPlayback) {
      const duration = current.media?.media?.duration || durationMap[current.media?.media?.format]
      if (duration) {
        WPC.clear('externalWatched', watchedListener)
        watchedListener = (detail) => {
          checkCompletionByTime(detail, duration * 60)
          currentTime = detail
          targetTime = detail
          launchedExternal = false
        }
        WPC.listen('externalWatched', watchedListener)
      }
      externalPlaying = true
      if (SUPPORTS.isAndroid) {
        WPC.clear('androidExternal', androidListener)
        androidListener = (url) => {
          const startTime = Date.now()
          const externalWatched = () => {
            const watchTime = (Date.now() - startTime) / 1_000
            checkCompletionByTime(watchTime, duration * 60)
            currentTime = watchTime
            targetTime = watchTime
            launchedExternal = false
          }
          ANDROID.launchExternal?.(url)?.then?.(() => externalWatched())
        }
        WPC.listen('androidExternal', androidListener)
      }
      WPC.send('externalPlay', { current })
    } else paused = !paused
    resetImmerse()
    updateSubs()
  }
  let hidden = false
  let visibilityPaused = true
  const handleVisibility = visible => {
    if ($settings.playerPause && !pip) {
      hidden = !visible
      if (!video?.ended) {
        if (hidden) {
          visibilityPaused = paused
          paused = true
        } else if (!visibilityPaused) paused = false
      }
    }
  }
  ELECTRON.isMinimized().then(isMinimized => {
    handleVisibility(!isMinimized)
    ELECTRON.onMinimize(handleVisibility)
  })
  function tryPlayNext () {
    currentSkippable = null
    if ($settings.playerAutoplay && !state.value) playNext()
  }
  function playNext () {
    if (hasNext) {
      const index = videos.indexOf(current)
      if (index + 1 < videos.length) {
        const target = (index + 1) % videos.length
        handleCurrent(videos[target])
        w2gEmitter.emit('index', { index: target })
      } else if (media?.media?.nextAiringEpisode?.episode - 1 || ((media?.media?.episodes || getMediaMaxEp(media?.media)) > media?.episode)) {
        playAnime(media.media, media.episode + 1)
      }
    }
  }
  function playLast () {
    if (hasLast) {
      const index = videos.indexOf(current)
      if (index > 0) {
        handleCurrent(videos[index - 1])
        w2gEmitter.emit('index', { index: index - 1 })
      } else if (media?.episode > 1 || (media?.zeroEpisode && media?.episode === 1)) {
        playAnime(media.media, media.episode - 1)
      }
    }
  }
  function setGain(event) {
    let value = parseFloat(event.target.value)
    if (value <= 1) {
      gainNode.gain.value = 1
      volume = value
    } else {
      volume = 1
      gainNode.gain.value = value
    }
    gain = value
    cache.setEntry(caches.HISTORY, 'lastBoosted', { ...(cache.getEntry(caches.HISTORY, 'lastBoosted') || {}), [media?.media?.id || media?.title || media?.parseObject?.title || media?.parseObject?.file_name]: { boosted: volumeBoosted, gain } })
  }
  function toggleGain () {
    setupAudio()
    if (volumeBoosted) {
      volume = gain <= 1 ? gain : 1
      gain = 1
      if (audioCtx) gainNode.gain.value = 1
    } else {
      setGain({ target: { value: volume } })
      boostScrollCount = 0
      clearTimeout(boostResetTimer)
    }
    volumeBoosted = !volumeBoosted
    cache.setEntry(caches.HISTORY, 'lastBoosted', { ...(cache.getEntry(caches.HISTORY, 'lastBoosted') || {}), [media?.media?.id || media?.title || media?.parseObject?.title || media?.parseObject?.file_name]: { boosted: volumeBoosted, gain } })
    return true
  }
  function toggleMute () {
    muted = !muted
  }
  function handleWheel(event) {
    if (viewAnime) return
    if (event.target.closest?.('.episodes-panel')) return
    event.preventDefault()
    // make trackpad type device scroll more gradual
    wheelAccumulator += event.deltaY
    if (Math.abs(wheelAccumulator) < 100) return

    const direction = wheelAccumulator < 0 ? 'up' : 'down'
    const delta = direction === 'up' ? 0.05 : -0.05
    wheelAccumulator = 0

    const combined = (volumeBoosted && gain > 1) ? gain : volume
    let next = Math.max(0, Math.min(3, combined + delta))
    // If crossing 100% on the way up, snap to exactly 100% and stop
    if (direction === 'up' && combined < 1 && next > 1) next = 1
    // limit guard at 100%
    if (!volumeBoosted && combined >= 1 && next > 1 && direction === 'up' && boostScrollCount < 5) {
      boostScrollCount++
      const superscripts = ['⁵','⁴','³','²','¹']
      volumeText = `${(combined * 100).toFixed(0)}%${superscripts[boostScrollCount - 1]}`
      showVolumeTemporarily(false)
      // Reset boostScrollCount after 2s of inactivity
      clearTimeout(boostResetTimer)
      boostResetTimer = setTimeout(() => { boostScrollCount = 0 }, 2_000)
      boostResetTimer.unref?.()
      return
    }
    // Reset guard if we go back down
    if (next <= 1) {
      boostScrollCount = 0
      clearTimeout(boostResetTimer)
    }
    // --- STATE APPLICATION ---
    if (next <= 1) {
      volume = next
      gain = 1
      volumeBoosted = false
      muted = volume === 0
    } else {
      setupAudio()
      volume = 1
      gain = next
      volumeBoosted = true
    }

    if (audioCtx) gainNode.gain.value = volumeBoosted ? gain : volume
    showVolumeTemporarily()
  }
  function showVolumeTemporarily(updateText = true) {
    if (updateText) volumeText = volume === 0 || muted ? 'Muted' : `${((gain > 1 ? gain : volume) * 100).toFixed(0)}%`
    volumeVisible = true
    clearTimeout(volumeTimeout)
    volumeTimeout = setTimeout(() => volumeVisible = false, 600)
    volumeTimeout.unref?.()
  }
  function toggleFullscreen () {
    if (!externalPlayback) document.fullscreenElement ? document.exitFullscreen() : document.querySelector('.page-wrapper').requestFullscreen()
  }
  function skip () {
    const current = findChapter(currentTime)
    if (current) {
      if (!isChapterSkippable(current) && ((current.end - current.start) / 1_000) > 100) {
        currentTime = currentTime + 85
      } else {
        const endtime = current.end / 1_000
        if ((safeduration - endtime | 0) === 0 && hasNext && settings.value.playerAutoplay) return playNext()
        currentTime = endtime
        currentSkippable = null
      }
    } else if (currentTime < 10) {
      currentTime = 90
    } else if (safeduration - currentTime < 90) {
      currentTime = safeduration
    } else {
      currentTime = currentTime + 85
    }
    targetTime = currentTime
    video.currentTime = targetTime
  }
  function seek (time) {
    if (externalPlayback) return
    currentTime = currentTime + time
    targetTime = currentTime
    video.currentTime = targetTime
  }
  function forward () {
    seek(settings.value.playerSeek)
  }
  function rewind () {
    seek(-settings.value.playerSeek)
  }
  function selectAudio (id) {
    if (id != null) {
      for (const track of video.audioTracks) {
        track.enabled = track.id === id
      }
      seek(-0.2) // stupid fix because video freezes up when changing tracks
    }
  }
  function selectVideo (id) {
    if (id != null) {
      for (const track of video.videoTracks) {
        track.selected = track.id === id
      }
      updateSubs()
    }
  }
  // function toggleCast () {
  //   if (video.readyState) {
  //     if (presentationConnection) {
  //       presentationConnection?.terminate()
  //     } else {
  //       presentationRequest.start()
  //     }
  //   }
  // }
  async function screenshot () {
    if ('clipboard' in navigator && video.readyState) {
      const canvas = document.createElement('canvas')
      const context = canvas.getContext('2d')
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      context.drawImage(video, 0, 0)
      if (subs?.renderer) {
        subs.renderer.resize(video.videoWidth, video.videoHeight)
        await new Promise(resolve => setTimeout(resolve, 500)) // this is hacky, but TLDR wait for canvas to update and re-render, in practice this will take at MOST 100ms, but just to be safe
        context.drawImage(subs.renderer._canvas, 0, 0, canvas.width, canvas.height)
        subs.renderer.resize(0, 0, 0, 0) // undo resize
      }
      const blob = await new Promise(resolve => canvas.toBlob(resolve))
      await navigator.clipboard.write([
        new ClipboardItem({
          [blob.type]: blob
        })
      ])
      canvas.remove()
      toast.success('Screenshot', {
        description: 'Saved screenshot to clipboard.'
      })
    }
  }
  function updatePiPState (paused) {
    const element = /** @type {HTMLVideoElement | undefined} */ (document.pictureInPictureElement)
    if (!element || element.id) return
    if (paused) element.pause()
    else element.play()
  }
  $: updatePiPState(paused)
  function togglePopout () {
    if (video.readyState) {
      if (!subs?.renderer) {
        if (video !== document.pictureInPictureElement) {
          video.requestPictureInPicture()
          resetImmerse()
          pip = true
        } else {
          document.exitPictureInPicture()
          pip = false
        }
      } else {
        if (document.pictureInPictureElement && !document.pictureInPictureElement.id) {
          // only exit if pip is the custom one, else overwrite existing pip with custom
          document.exitPictureInPicture()
          pip = false
        } else {
          const canvasVideo = document.createElement('video')
          const { stream, destroy } = getBurnIn()
          const cleanup = () => {
            pip = false
            destroy()
            canvasVideo.remove()
          }
          pip = true
          resetImmerse()
          canvasVideo.srcObject = stream
          canvasVideo.onloadedmetadata = () => {
            canvasVideo.play()
            if (pip) {
              if (paused) canvasVideo.pause()
              canvasVideo.requestPictureInPicture().then(pipwindow => {
                pipwindow.onresize = () => {
                  const { width, height } = pipwindow
                  if (isNaN(width) || isNaN(height)) return
                  if (!isFinite(width) || !isFinite(height)) return
                  subs.renderer.resize(width, height)
                }
              }).catch(e => {
                cleanup()
                debug('Failed To Burn In Subtitles ' + e)
              })
            } else {
              cleanup()
            }
          }
          canvasVideo.onleavepictureinpicture = cleanup
        }
      }
    }
  }
  let fitWidth = cache.getEntry(caches.GENERAL, 'fitWidth') === 'true'
  let showKeybinds = false
  let showTorrentStats = false
  let contextMenu = false
  let contextMenuX = 0
  let contextMenuY = 0
  function handleContextMenu(e) {
    contextMenu = true
    const w = 260
    const h = 380
    contextMenuX = Math.min(e.clientX, window.innerWidth - w)
    contextMenuY = Math.min(e.clientY, window.innerHeight - h)
  }

  $: animeAccent = media?.media?.coverImage?.color || '#888888'

  loadWithDefaults({
    KeyX: {
      fn: () => !viewAnime && screenshot(),
      id: 'screenshot_monitor',
      icon: ScreenShare,
      type: 'icon',
      desc: 'Save Screenshot to Clipboard'
    },
    KeyI: {
      fn: () => !viewAnime && toggleStats(),
      icon: List,
      id: 'list',
      type: 'icon',
      desc: 'Toggle Stats'
    },
    KeyO: {
      fn: () => { if (media?.media) modal.toggle(modal.ANIME_DETAILS, media.media) },
      icon: Eye,
      id: 'eye',
      type: 'icon',
      desc: 'Toggle Now Playing'
    },
    KeyH: {
      fn: () => {
        if (!viewAnime) {
          resolvePrompt = false
          modal.toggle(modal.FILE_MANAGER)
        }
      },
      icon: SquarePen,
      id: 'squarepen',
      type: 'icon',
      desc: 'Toggle File Manager'
    },
    Backquote: {
      fn: () => !viewAnime && (showKeybinds = !showKeybinds),
      id: 'help_outline',
      icon: CircleHelp,
      type: 'icon',
      desc: 'Toggle Keybinds'
    },
    Space: {
      fn: () => !viewAnime && playPause(),
      id: 'play_arrow',
      play: Play,
      type: 'icon',
      desc: 'Play/Pause'
    },
    KeyN: {
      fn: () => !viewAnime && playNext(),
      id: 'skip_next',
      icon: SkipForward,
      type: 'icon',
      desc: 'Next Episode'
    },
    KeyB: {
      fn: () => !viewAnime && playLast(),
      id: 'skip_previous',
      icon: SkipBack,
      type: 'icon',
      desc: 'Previous Episode'
    },
    KeyA: {
      fn: () => !viewAnime && ($settings.playerDeband = !$settings.playerDeband),
      id: 'deblur',
      icon: Contrast,
      type: 'icon',
      desc: 'Toggle Video Debanding'
    },
    KeyM: {
      fn: () => !viewAnime && (muted = !muted) && showVolumeTemporarily(),
      id: 'volume_off',
      icon: VolumeX,
      type: 'icon',
      desc: 'Toggle Mute'
    },
    KeyP: {
      fn: () => !viewAnime && togglePopout(),
      id: 'picture_in_picture',
      icon: PictureInPicture2,
      type: 'icon',
      desc: 'Toggle Picture in Picture'
    },
    KeyF: {
      fn: () => !viewAnime && toggleFullscreen(),
      id: 'fullscreen',
      icon: Maximize,
      type: 'icon',
      desc: 'Toggle Fullscreen'
    },
    KeyS: {
      fn: () => !viewAnime && skip(),
      id: '+90',
      desc: 'Skip Intro/90s'
    },
    KeyW: {
      fn: () => !viewAnime && (fitWidth = !fitWidth, cache.setEntry(caches.GENERAL, 'fitWidth', String(fitWidth))),
      id: 'fit_width',
      icon: Proportions,
      type: 'icon',
      desc: 'Toggle Video Cover'
    },
    // KeyD: {
    //   fn: () => !viewAnime && toggleCast(),
    //   id: 'cast',
    //   icon: Cast,
    //   type: 'icon',
    //   desc: 'Toggle Cast [broken]'
    // },
    KeyC: {
      fn: () => !viewAnime && cycleSubtitles(),
      id: 'subtitles',
      icon: Captions,
      type: 'icon',
      desc: 'Cycle Subtitles'
    },
    KeyV: {
      fn: () => !viewAnime && toggleGain() && showVolumeTemporarily(),
      id: 'toggle_gain',
      icon: SlidersVertical,
      type: 'icon',
      desc: 'Toggle Volume Limit Increase'
    },
    ArrowLeft: {
      fn: e => {
        if (viewAnime) return
        e.stopImmediatePropagation()
        e.preventDefault()
        rewind()
      },
      id: 'fast_rewind',
      icon: Rewind,
      type: 'icon',
      desc: 'Rewind'
    },
    ArrowRight: {
      fn: e => {
        if (viewAnime) return
        e.stopImmediatePropagation()
        e.preventDefault()
        forward()
      },
      id: 'fast_forward',
      icon: FastForward,
      type: 'icon',
      desc: 'Seek'
    },
    ArrowUp: {
      fn: e => {
        if (viewAnime) return
        e.stopImmediatePropagation()
        e.preventDefault()
        if (volumeBoosted) setGain({ target: { value: Math.min(3, gain + 0.05) } })
        else volume = Math.min(1, volume + 0.05)
        muted = volume === 0
        showVolumeTemporarily()
      },
      id: 'volume_up',
      icon: Volume2,
      type: 'icon',
      desc: 'Volume Up'
    },
    ArrowDown: {
      fn: e => {
        if (viewAnime) return
        e.stopImmediatePropagation()
        e.preventDefault()
        if (volumeBoosted) setGain({ target: { value: Math.max(0, gain - 0.05) } })
        else volume = Math.max(0, volume - 0.05)
        muted = volume === 0
        showVolumeTemporarily()
      },
      id: 'volume_down',
      icon: Volume1,
      type: 'icon',
      desc: 'Volume Down'
    },
    BracketLeft: {
      fn: () => !viewAnime && !externalPlayback && (playbackRate = video.defaultPlaybackRate -= 0.1),
      id: 'history',
      icon: RotateCcw,
      type: 'icon',
      desc: 'Decrease Playback Rate'
    },
    BracketRight: {
      fn: () => !viewAnime && !externalPlayback && (playbackRate = video.defaultPlaybackRate += 0.1),
      id: 'update',
      icon: RotateCw,
      type: 'icon',
      desc: 'Increase Playback Rate'
    },
    Backslash: {
      fn: () => !viewAnime && !externalPlayback && (playbackRate = video.defaultPlaybackRate = 1),
      icon: RefreshCcw,
      id: 'schedule',
      type: 'icon',
      desc: 'Reset Playback Rate'
    },
    Comma: {
      fn: (e) => !viewAnime && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA' && setSubDelay(Number((Number(subDelay) + (e.shiftKey ? -1.0 : -0.1)).toFixed(1))),
      id: 'sub_delay_decrease',
      icon: ClockArrowDown,
      type: 'icon',
      desc: 'Subtitle Delay -0.1s / -1.0s'
    },
    Period: {
      fn: (e) => !viewAnime && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA' && setSubDelay(Number((Number(subDelay) + (e.shiftKey ? 1.0 : 0.1)).toFixed(1))),
      id: 'sub_delay_increase',
      icon: ClockArrowUp,
      type: 'icon',
      desc: 'Subtitle Delay +0.1s / +1.0s'
    }
  })

  function getBurnIn (noSubs) {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    let loop = null
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    if (!noSubs) subs.renderer.resize(video.videoWidth, video.videoHeight)
    const renderFrame = () => {
      context.drawImage(deband ? deband.canvas : video, 0, 0)
      if (!noSubs && canvas.width && canvas.height) context.drawImage(subs.renderer?._canvas, 0, 0, canvas.width, canvas.height)
      loop = video.requestVideoFrameCallback(renderFrame)
    }
    renderFrame()
    const destroy = () => {
      if (!noSubs) subs.renderer.resize()
      video.cancelVideoFrameCallback(loop)
      canvas.remove()
    }
    container.append(canvas)
    return { stream: canvas.captureStream(), destroy }
  }

  // function initCast (event) {
  //   // these quality settings are likely to make cast overheat, oh noes!
  //   let peer = new Peer({
  //     polite: true,
  //     quality: {
  //       audio: {
  //         stereo: 1,
  //         'sprop-stereo': 1,
  //         maxaveragebitrate: 510000,
  //         maxplaybackrate: 510000,
  //         cbr: 0,
  //         useinbandfec: 1,
  //         usedtx: 1,
  //         maxptime: 20,
  //         minptime: 10
  //       },
  //       video: {
  //         bitrate: 2000000,
  //         codecs: ['VP9', 'VP8', 'H264']
  //       }
  //     }
  //   })

  //   presentationConnection = event.connection
  //   presentationConnection.addEventListener('terminate', () => {
  //     presentationConnection = null
  //     peer = null
  //   })

  //   peer.signalingPort.onmessage = ({ data }) => {
  //     presentationConnection.send(data)
  //   }

  //   presentationConnection.addEventListener('message', ({ data }) => {
  //     peer.signalingPort.postMessage(data)
  //   })

  //   peer.dc.onopen = () => {
  //     if (peer && presentationConnection) {
  //       const tracks = []
  //       const videostream = video.captureStream()
  //       if (true) {
  //         // TODO: check if cast supports codecs
  //         const { stream, destroy } = getBurnIn(!subs?.renderer)
  //         tracks.push(stream.getVideoTracks()[0], videostream.getAudioTracks()[0])
  //         presentationConnection.addEventListener('terminate', destroy)
  //       } else {
  //         tracks.push(videostream.getVideoTracks()[0], videostream.getAudioTracks()[0])
  //       }
  //       for (const track of tracks) {
  //         peer.pc.addTrack(track, videostream)
  //       }
  //       paused = false // video pauses for some reason
  //     }
  //   }
  // }

  function immersePlayer () {
    if ((safeduration - currentTime) !== 0) {
      immersed = true
      immerseTimeout = undefined
    }
  }

  let immerseToken = 0
  function resetImmerse() {
    clearTimeout(immerseTimeout)
    const token = ++immerseToken
    const wasImmersed = immersed
    setTimeout(() => {
      if (token !== immerseToken || wasImmersed !== immersed) return
      immersed = false
      if (!paused || miniplayer) {
        immerseTimeout = setTimeout(() => {
          if (token === immerseToken) immersePlayer()
        }, (paused ? 5 : 1.5) * 1_000)
      }
    })
  }

  function toggleImmerse () {
    if (immersed) resetImmerse()
    else {
      clearTimeout(immerseTimeout)
      immersed = !immersed
    }
  }

  let canPlay = !!src
  function hideBuffering () {
    canPlay = !!src
    if (bufferTimeout) {
      clearTimeout(bufferTimeout)
      bufferTimeout = null
      buffering = false
    }
  }

  function showBuffering () {
    bufferTimeout = setTimeout(() => {
      buffering = true
      resetImmerse()
    }, 150)
  }
  $: navigator.mediaSession?.setPositionState({
    duration: Math.max(0, safeduration || 0),
    playbackRate: 1,
    position: Math.max(0, Math.min(safeduration || 0, currentTime || 0))
  })

  if ('mediaSession' in navigator) {
    navigator.mediaSession.setActionHandler('play', playPause)
    navigator.mediaSession.setActionHandler('pause', playPause)
    navigator.mediaSession.setActionHandler('nexttrack', playNext)
    navigator.mediaSession.setActionHandler('previoustrack', playLast)
    navigator.mediaSession.setActionHandler('seekforward', forward)
    navigator.mediaSession.setActionHandler('seekbackward', rewind)
  }
  let filler = null
  let recap = null
  let skipPrompt = false
  function skipResponse (skip) {
    skipPrompt = false
    if (skip) playNext()
    else {
      video.play()
      updateSubs()
    }
  }
  let resolvePrompt = false
  function resolveResponse (resolve) {
    resolvePrompt = false
    if (resolve) modal.open(modal.FILE_MANAGER)
    else {
      video.play()
      updateSubs()
    }
  }
  let stats = null
  let requestCallback = null
  function toggleStats () {
    if (requestCallback) {
      stats = null
      video.cancelVideoFrameCallback(requestCallback)
      requestCallback = null
    } else {
      requestCallback = video.requestVideoFrameCallback((a, b) => {
        stats = {}
        handleStats(a, b, b)
      })
      if (paused) {
        seek(-0.001) // stupid hack because the initial request doesn't trigger canvas to re-render, stats won't appear unless the current time changes.
        requestAnimationFrame(() => {
          if (video.currentTime !== 0) seek(0.001)
        })
      }
    }
  }
  async function handleStats (now, metadata, lastmeta) {
    if (stats) {
      const msbf = (metadata.mediaTime - lastmeta.mediaTime) / (metadata.presentedFrames - lastmeta.presentedFrames)
      const fps = (1 / msbf).toFixed(3)
      stats = {
        fps,
        presented: metadata.presentedFrames,
        dropped: video.getVideoPlaybackQuality()?.droppedVideoFrames,
        processing: metadata.processingDuration + ' ms',
        viewport: video.clientWidth + 'x' + video.clientHeight,
        resolution: videoWidth + 'x' + videoHeight,
        buffer: getBufferHealth(metadata.mediaTime) + ' s',
        speed: video.playbackRate || 1
      }
      setTimeout(() => video.requestVideoFrameCallback((n, m) => handleStats(n, m, metadata)), 200)
    }
  }
  function getBufferHealth (time) {
    for (let index = video.buffered.length; index--;) {
      if (time < video.buffered.end(index) && time >= video.buffered.start(index)) {
        return (video.buffered.end(index) - time) | 0
      }
    }
    return 0
  }
  let buffer = 0
  WPC.listen('progress', (detail) => {
    buffer = detail * 100
  })

  let chapters = []
  let embeddedChapters = []
  WPC.listen('chapters', (detail) => {
    if (detail.length) {
      chapters = detail
      embeddedChapters = detail
    }
  })
  async function findChapters () {
    if ((!chapters.length || settings.value.playerChapterSkip.match(/aniskip/i)) && current?.media?.media) {
      const _chapters = await getChaptersAniSkip(current, safeduration)
      if (_chapters?.length) chapters = _chapters
    }
  }

  let currentSkippable = null
  $: currentSkippable && $settings.playerAutoSkip && skip()
  function checkSkippableChapters () {
    const current = findChapter(currentTime)
    if (current) {
      currentSkippable = isChapterSkippable(current)
    }
  }
  const MAX_TOTAL_SKIP_TIME = 180
  const skippableChaptersRx = [
    ['Intro', /^intro$/mi],
    ['Opening', /^op$|opening$|title$|^ncop/mi],
    ['Outro', /^outro$/mi],
    ['Ending', /^ed$|ending$|^nced/mi],
    ['Credits', /credits/i],
    ['Preview', /^preview$|previews$|pv$|next$/mi],
    ['Recap', /recap/mi]
  ]
  function isChapterSkippable(chapter) {
    if (((chapter.end - chapter.start) / 1_000) > MAX_TOTAL_SKIP_TIME) return null // Anything longer than 180s (3m) is likely invalid, skipping this chapter would be a mistake!
    for (const [name, regex] of skippableChaptersRx) {
      if (/** @type {RegExp} */ chapter.text && (regex).test(chapter.text.trim())) {
        return name
      }
    }
    return null
  }
  function findChapter (time) {
    if (!chapters.length) return null
    for (const chapter of chapters) {
      if (time < (chapter.end / 1_000) && time >= (chapter.start / 1_000)) return chapter
    }
  }
  function mergeMicroSkippable(_chapters) {
    const isSkippable = (chapter) => chapter.text && skippableChaptersRx.some(([_, rx]) => rx.test(chapter.text.trim()))
    const isShort = (chapter) => ((chapter.end - chapter.start) / 1_000) < 10 // anything shorter than 10 seconds is just fluff... probably a mistake.
    const underMaxSkip = (chapter) => (chapter.end - chapter.start) / 1_000 <= MAX_TOTAL_SKIP_TIME
    for (let i = 0; i < _chapters.length - 1; i++) {
      const cur = _chapters[i]
      const next = _chapters[i + 1]
      if (isSkippable(cur) && isSkippable(next) && underMaxSkip(cur) && underMaxSkip(next)) {
        if (isShort(cur) && !isShort(next)) {
          next.start = cur.start
          _chapters.splice(i, 1)
          i--
        } else if (!isShort(cur) && isShort(next)) {
          cur.end = next.end
          _chapters.splice(i + 1, 1)
          i--
        } else if (isShort(cur) && isShort(next)) {
          cur.end = next.end
          _chapters.splice(i + 1, 1)
          i--
        }
      }
    }
    return _chapters
  }

  // remaps chapters to what the seekbar uses and adds potentially missing chapters
  function sanitiseChapters (_chapters, safeduration) {
    if (!_chapters?.length) return []
    const first = _chapters[0]
    for (const chapter of _chapters) { // Fix negative values
      if (typeof chapter.start === 'number' && chapter.start < 0) chapter.start = -chapter.start // Fixes negative start values, likely was a mistake and is actually correct if positive.
      if (typeof chapter.end === 'number' && chapter.end < 0) chapter.end = -chapter.end // Fixes negative end values, likely was a mistake and is actually correct if positive.
    }
    if (first.start !== 0 && _chapters.some(ch => ch?.start === 0)) { // Fix incorrect order of chapters (when start === 0 is somewhere else)
      _chapters.sort((a, b) => (a?.start ?? 0) - (b?.start ?? 0))
    }
    const boundaryMatches = _chapters.map((ch, i) => ({ ch, i })).filter(({ ch }) => ch.start === first.end)
    if (boundaryMatches.length > 0) { // Fix overlapping chapters where valid chapter end time matches a valid chapter start time.
      boundaryMatches.sort((a, b) => (a.ch.end - a.ch.start) - (b.ch.end - b.ch.start))
      const boundaryIndex = boundaryMatches[0].i
      if (boundaryIndex > 1) _chapters.splice(1, boundaryIndex - 1)
    }
    _chapters = _chapters.map((chapter, index, arr) => {
      if (chapter.start === chapter.end) { // Fix chapters with incorrect start/end times which causes an invisible seekbar, this happens when the start and end time are identical
        const nextChapter = arr[index + 1] // We now assume each chapter is a bookmark and use the next chapters start time and the current chapters end time.
        return { ...chapter, end: nextChapter ? nextChapter.start : safeduration * 1_000 } // Use next chapter's start or ensure the entire safe duration of seekbar is visible.
      }
      return chapter
    })
    _chapters[_chapters.length - 1].end = safeduration * 1_000 // fix the final chapter so its duration actually reaches the end of the video...
    _chapters[0].start = 0

    mergeMicroSkippable(_chapters)
    if (JSON.stringify(chapters) !== JSON.stringify(_chapters)) chapters = _chapters

    const sanitised = []
    let chapterCounter = 1
    for (let { start, end, text } of _chapters) {
      if (start > safeduration * 1_000) continue
      if (end > safeduration * 1_000) end = safeduration * 1_000
      if (text && /^[\d:.\s]+$/.test(text)) { // Replace numerical/timestamp-like chapter names
        text = `Chapter ${chapterCounter}`
        chapterCounter++
      }
      sanitised.push({ size: (end / 10 / safeduration) - (start / 10 / safeduration), text })
    }
    return sanitised
  }

  const thumbCanvas = document.createElement('canvas')
  thumbCanvas.width = 200
  const thumbnailData = {
    thumbnails: [],
    canvas: thumbCanvas,
    context: thumbCanvas.getContext('2d'),
    interval: null,
    video: null
  }

  function getThumbnail (percent) {
    return thumbnailData.thumbnails[Math.floor(percent / 100 * safeduration / thumbnailData.interval)] || ' '
  }
  function createThumbnail (vid = video) {
    if (vid?.readyState >= 2) {
      const index = Math.floor(vid.currentTime / thumbnailData.interval)
      if (!thumbnailData.thumbnails[index]) {
        thumbnailData.context.fillRect(0, 0, 200, thumbnailData.canvas.height)
        thumbnailData.context.drawImage(vid, 0, 0, 200, thumbnailData.canvas.height)
        thumbnailData.thumbnails[index] = thumbnailData.canvas.toDataURL('image/jpeg')
      }
    }
  }
  let videoWidth, videoHeight
  function initThumbnails () {
    const height = 200 / (videoWidth / videoHeight)
    if (!isNaN(height)) {
      thumbnailData.interval = safeduration / 300 < 5 ? 5 : safeduration / 300
      thumbnailData.canvas.height = height
      generateThumbnails()
    }
  }
  let thumbnailProcess = null
  async function generateThumbnails() {
    debug('Starting thumbnail generation...')
    if (thumbnailProcess && thumbnailProcess.running) {
      debug('Detected a currently running thumbnail generation process, interrupting...')
      thumbnailProcess.videoDraw.remove()
      thumbnailProcess.running = false
      await new Promise(resolve => setTimeout(resolve, 5 * 1_000))
    }
    const t0 = performance.now()
    thumbnailProcess = { videoDraw: document.createElement('video'), running: true}
    const videoDraw = thumbnailProcess.videoDraw
    videoDraw.src = current.url
    videoDraw.preload = 'auto'
    videoDraw.volume = 0
    videoDraw.playbackRate = 0
    videoDraw.onloadeddata = () => {
      let index = 0
      let lastIndex = 0
      function captureThumbnail() {
        if (!thumbnailProcess.running) {
          debug('Thumbnail generation process was interrupted due to a change in the video url, exiting...')
          return
        }
        let dynamicDuration = (buffer / 100) * videoDraw.duration
        if (!isFinite(dynamicDuration)) {
          debug('Video is still loading... waiting to generate thumbnails...')
          setTimeout(() => captureThumbnail(), 1_000)
          return
        }
        while (thumbnailData.thumbnails[index]) index++
        const currentTime = index * thumbnailData.interval
        if (currentTime >= dynamicDuration && currentTime < videoDraw.duration) {
          if (lastIndex !== index) {
            lastIndex = index
            debug(`Reached currently downloaded video duration, current seek time is: ${currentTime}s (${index} of ${buffer}%), waiting for buffer update...`)
          }
          setTimeout(() => {
            if (currentTime < (buffer / 100) * videoDraw.duration) {
              lastIndex = 0
              debug('Detected a buffer change, continuing thumbnail generation...')
            }
            captureThumbnail()
          }, 1_000)
          return
        }

        if (currentTime >= videoDraw.duration) {
          debug('Thumbnail generation has successfully completed, took:', (toTS((performance.now() - t0) / 1_000)))
          videoDraw.remove()
          return
        } else if (isFinite(currentTime) && currentTime >= 0 && currentTime <= dynamicDuration) {
          videoDraw.currentTime = currentTime
        } else {
          debug('Something went wrong calculating the current time for the thumbnails video, calculated:', currentTime, dynamicDuration, buffer)
          return
        }

        videoDraw.onseeked = () => {
          if (!thumbnailProcess.running) {
            debug('Thumbnail generation process was interrupted due to a change in the video url, exiting...')
            return
          }
          thumbnailData.context.fillRect(0, 0, 200, thumbnailData.canvas.height)
          thumbnailData.context.drawImage(videoDraw, 0, 0, 200, thumbnailData.canvas.height)
          thumbnailData.thumbnails[index] = thumbnailData.canvas.toDataURL('image/jpeg')
          captureThumbnail()
        }
      }
      captureThumbnail()
    }
    videoDraw.onerror = (e) => {
      debug('Error loading video for thumbnail generation:', e)
      videoDraw.remove()
    }
  }

  // const isWindows = navigator.appVersion.includes('Windows')
  // let innerWidth, innerHeight
  const menubarOffset = 0
  // $: calcMenubarOffset(innerWidth, innerHeight, videoWidth, videoHeight)
  // function calcMenubarOffset (innerWidth, innerHeight, videoWidth, videoHeight) {
  //   // outerheight resize and innerheight resize is mutual, additionally update on metadata and app state change
  //   if (videoWidth && videoHeight) {
  //     // so windows is very dumb, and calculates windowed mode as if it was window XP, with the old bars, but not when maximised
  //     const isMaximised = screen.availWidth === window.outerWidth && screen.availHeight === window.outerHeight
  //     const menubar = Math.max(0, isWindows && !isMaximised ? window.outerHeight - innerHeight - 8 : window.outerHeight - innerHeight)
  //     // element ratio calc
  //     const videoRatio = videoWidth / videoHeight
  //     const { offsetWidth, offsetHeight } = video
  //     const elementRatio = offsetWidth / offsetHeight
  //     // video is shorter than element && has space for menubar offset
  //     if (!document.fullscreenElement && menubar && elementRatio <= videoRatio && offsetHeight - offsetWidth / videoRatio > menubar) {
  //       menubarOffset = (menubar / 2) * -1
  //     } else {
  //       menubarOffset = 0
  //     }
  //   }
  // }

  function openContextMenuFromButton(e) {
    const rect = e.currentTarget.getBoundingClientRect()
    contextMenu = true
    const w = 260
    const h = 380
    contextMenuX = Math.min(rect.left, window.innerWidth - w)
    contextMenuY = Math.min(rect.bottom, window.innerHeight - h)
  }
  function toggleDropdown ({ target }) {
    target.classList.toggle('active')
    target.closest('.dropdown').classList.toggle('show')
  }

  let completed = false
  function checkCompletion () {
    if (!completed && $settings.playerAutocomplete) {
      checkCompletionByTime(currentTime, safeduration)
    }
  }

  function checkCompletionByTime (currentTime, safeduration) {
    let threshold = $settings.playerAutocompleteThreshold / 100
    if (externalPlayerReady && threshold > 0.7) threshold = 0.7 // accommodates skipping op/ed in external player.
    if (safeduration && currentTime && (video?.readyState || externalPlayerReady) && (currentTime >= safeduration * threshold) && (media?.media?.episodes || (media?.media?.nextAiringEpisode?.episode >= (media.episodeRange?.last || media.episode)))) {
      debug(`Marking current episode as completed as it has met the ${$settings.playerAutocompleteThreshold}% threshold.`)
      completed = true
      externalPlayerReady = false
      const _media = media.episodeRange ? structuredClone(media) : media
      if (media.episodeRange) _media.episode = media.episodeRange.last
      Helper.updateEntry(_media)
      if ($settings.playerAutoDownloadNext && !externalPlayback && hasNextEpisode()) autoStageNext({ media: media.media, episode: media.episode + 1 })
      if (externalPlayback) tryPlayNext()
    }
  }
  const torrent = {}
  WPC.listen('stats', updateStats)
  function updateStats (detail) {
    torrent.peers = detail.numPeers || 0
    torrent.up = detail.uploadSpeed || 0
    torrent.down = detail.downloadSpeed || 0
  }
  function checkError ({ target }) {
    // video playback failed - show a message saying why
    switch (target.error?.code) {
      case target.error.MEDIA_ERR_ABORTED:
        debug('You aborted the video playback.')
        break
      case target.error.MEDIA_ERR_NETWORK:
        debug('A network error caused the video download to fail part-way.', target.error)
        saveAnimeProgress(true)
        toast.error('Video Network Error', {
          description: 'A network error caused the video download to fail part-way. Dismiss this toast to reload the video.',
          duration: Infinity,
          onDismiss: () => target.load()
        })
        break
      case target.error.MEDIA_ERR_DECODE:
        debug('The video playback was aborted due to a corruption problem or because the video used features your browser did not support.', target.error)
        saveAnimeProgress(true)
        toast.error('Video Decode Error', {
          description: 'The video playback was aborted due to a corruption problem. Dismiss this toast to reload the video.',
          duration: Infinity,
          onDismiss: () => target.load()
        })
        break
      case target.error.MEDIA_ERR_SRC_NOT_SUPPORTED:
        if (target.error.message !== 'MEDIA_ELEMENT_ERROR: Empty src attribute') {
          debug('The video could not be loaded, either because the server or network failed or because the format is not supported.', target.error)
          saveAnimeProgress(true)
          toast.error('Video Codec Unsupported', {
            description: 'The video could not be loaded, either because the server or network failed or because the format is not supported. Try a different release by disabling Autoplay Torrents in RSS settings.',
            duration: 30_000
          })
        }
        break
      default:
        debug('An unknown video playback error occurred.')
        break
    }
  }

  function handleSeekbarKey (e) {
    if (e.key === 'ArrowLeft') {
      e.stopPropagation()
      e.stopImmediatePropagation()
      e.preventDefault()
      rewind()
    } else if (e.key === 'ArrowRight') {
      e.stopPropagation()
      e.stopImmediatePropagation()
      e.preventDefault()
      forward()
    } else if (e.key === 'ArrowDown') {
      e.stopPropagation()
      e.stopImmediatePropagation()
      e.preventDefault()
      document.querySelector('[data-name=\'toggleFullscreen\']')?.focus()
    }
  }

  let fileInput
  function handleFile(event) {
    const file = event.target.files[0]
    if (!file) return
    const dataTransfer = new DataTransfer()
    dataTransfer.items.add(file)
    window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dataTransfer }))
  }

  function setDiscordRPC (np = media, browsing) {
    if ((!np || Object.keys(np).length === 0) && !browsing) return
    if (hidden) {
      IPC.emit('discord-clear')
      return
    }
    let activity
    if (!browsing) {
      const w2g = state.value?.code
      const details = np.title || undefined
      const timeLeft = safeduration - targetTime
      const timestamps = !paused ? {
        start: Date.now() - (targetTime > 0 ? targetTime * 1_000 : 0),
        end: Date.now() + timeLeft * 1_000
      } : undefined
       activity = {
        details,
        state: (details && (np.media?.format === 'MOVIE' && (np.media?.episodes ?? 0) <= 1 ? 'The Movie' : (np.episode ? 'Episode: ' + np.episode + (np.media?.episodes ? ' of ' + np.media.episodes : '') : 'Streaming the Universe'))),
        timestamps,
        party: {
          size: (np.episode && np.media?.episodes && [np.episode, np.media.episodes]) || undefined
        },
        assets: {
          large_text: np.title,
          large_image: np.thumbnail,
          small_image: !paused ? 'playing' : 'paused',
          small_text: !paused ? 'Playing' : 'Paused'
        },
        instance: true,
        type: 3
      }
      // cannot have buttons and secrets at once
      if (w2g) {
        activity.secrets = {
          join: w2g,
          match: w2g + 'm'
        }
        activity.party.id = w2g + 'p'
      } else {
        activity.buttons = [
          {
            label: 'Watch on Shiru',
            url: `shiru://anime/${np.media?.id}`
          },
          {
            label: 'Download Shiru',
            url: 'https://github.com/RockinChaos/Shiru/releases/latest'
          }
        ]
      }
    } else {
      activity = {
        timestamps: { start: Date.now() },
        details: 'Streaming anime instantly',
        state: 'Exploring the anime library...',
        assets: {
          large_image: 'icon',
          large_text: 'https://github.com/RockinChaos/Shiru',
          small_image: 'searching',
          small_text: 'Browsing anime on Shiru',
        },
        buttons: [
          {
            label: 'Download Shiru',
            url: 'https://github.com/RockinChaos/Shiru/releases/latest'
          }
        ],
        instance: true,
        type: 3
      }
    }
    IPC.emit('discord', { activity })
  }
</script>

<div
  class='player w-full h-full d-flex flex-column overflow-hidden position-relative'
  class:ratio-16-9={!canPlay || !src || externalPlayback}
  class:pointer={miniplayer}
  class:rounded-top-10={miniplayer}
  class:miniplayer
  class:pip
  class:immersed={immersed}
  class:buffering={($page === page.PLAYER || miniplayer) && buffering}
  class:fitWidth
  bind:this={container}
  role='none'
  on:mousemove={resetImmerse}
  on:touchmove={resetImmerse}
  on:keypress={resetImmerse}
  on:keydown={resetImmerse}
  on:mouseleave={immersePlayer}
  on:wheel={handleWheel}
  on:contextmenu|preventDefault={handleContextMenu}
  style:--player-accent={animeAccent}>
  {#if showKeybinds && !miniplayer}
    <div class='position-absolute bg-tp w-full h-full z-10 font-size-12 p-20 d-flex align-items-center justify-content-center' on:pointerup|self={() => (showKeybinds = false)} tabindex='-1' role='button'>
      <Keybinds let:prop={item} autosave={true} clickable={true}>
        {#if item?.type}
          <div class='bind icon' title={item?.desc} style='pointer-events: all !important;'>
            {#if item?.icon}
              <svelte:component this={item.icon} size='2rem' />
            {/if}
          </div>
        {:else}
          <div class='bind font-weight-normal' title={item?.desc} style='pointer-events: all !important;'>{item?.id || ''}</div>
        {/if}
      </Keybinds>
    </div>
  {/if}
  <video
    crossorigin='anonymous'
    class='position-absolute h-full w-full'
    style={`margin-top: ${menubarOffset}px`}
    preload='auto'
    {src}
    bind:videoHeight
    bind:videoWidth
    bind:this={video}
    bind:volume
    bind:duration
    bind:currentTime
    bind:paused
    bind:ended
    bind:muted
    bind:playbackRate
    on:error={checkError}
    on:pause={updatew2g}
    on:play={updatew2g}
    on:seeked={updatew2g}
    on:timeupdate={() => createThumbnail()}
    on:timeupdate={checkCompletion}
    on:timeupdate={checkSkippableChapters}
    on:waiting={showBuffering}
    on:loadeddata={hideBuffering}
    on:pause={() => { immersed = false }}
    on:canplay={hideBuffering}
    on:playing={hideBuffering}
    on:loadedmetadata={hideBuffering}
    on:ended={tryPlayNext}
    on:loadedmetadata={initThumbnails}
    on:loadedmetadata={findChapters}
    on:loadedmetadata={autoPlay}
    on:loadedmetadata={checkAudio}
    on:loadedmetadata={checkSubtitle}
    on:loadedmetadata={clearLoadInterval}
    on:loadedmetadata={loadAnimeProgress}
    on:leavepictureinpicture={() => { pip = false }}
  ><track kind='captions' src='' srclang='en' label='English'/></video>
  {#if stats && !miniplayer}
    <div class='position-absolute top-0 bg-tp p-10 ml-20 mt-100 text-monospace rounded z-50'>
      <button class='close btn btn-square mt-5' type='button' use:click={toggleStats}>
        <X size='1.4rem' strokeWidth='3'/>
      </button>
      <div>FPS: {stats.fps}</div>
      <div>Presented frames: {stats.presented}</div>
      <div>Dropped frames: {stats.dropped}</div>
      <div>Frame time: {stats.processing}</div>
      <div>Viewport: {stats.viewport}</div>
      <div>Resolution: {stats.resolution}</div>
      <div>Buffer health: {stats.buffer}</div>
      <div>Playback speed: x{stats.speed?.toFixed(1)}</div>
      <div>Name: {current.name || ''}</div>
      {#if playableFiles?.length > 1}
        <div class='mt-10'>All files in this batch:</div>
        <div class='overflow-auto ml-10 mt-5' style='max-height: 200px;'>
          {#each playableFiles as file}
            <div class='ctrl rounded-10 pl-5 pr-5 pbf' title={file.name} use:click={() => playFile(file)}>
              {file.name || 'UNK'}
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
  <ManagerModal playing={current} files={playableFiles} {playFile} />
<div class='top z-40 d-title' style='position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none;'>
  
  <div class:hidden={!showTorrentStats} style='display: flex; justify-content: center; align-items: center; padding-top: 20px; pointer-events: auto; gap: 20px;'>
    <div class='d-flex align-items-center'>
      <Users class='pt-5 block-scale-30' strokeWidth={3} />
      <span class='stats font-scale-24 ml-10'>{torrent.peers || 0}</span>
    </div>
    <div class='d-flex align-items-center'>
      <ArrowDown class='block-scale-30' />
      <span class='stats font-scale-24 ml-10'>{fastPrettyBytes(torrent.down)}/s</span>
    </div>
    <div class='d-flex align-items-center'>
      <ArrowUp class='block-scale-30' />
      <span class='stats font-scale-24 ml-10'>{fastPrettyBytes(torrent.up)}/s</span>
    </div>
  </div>
  {#if paused}
    <div class='now-playing' transition:fade={{ duration: 200 }}>
      <div class='now-playing-inner'>
        <div class='np-eyebrow'>You're Watching</div>
        <div class='np-title'>
          {#if media?.title}
            {media?.title}
          {:else if media?.media?.title}
            {anilistClient.title(media?.media)}
          {:else if current}
            {AnimeResolver.cleanFileName(current.name)}
          {/if}
        </div>
        <div class='np-episode'>
          {#if (media?.episode === 0 || media?.episode) && media?.media?.episodes !== 1 && media?.media?.format !== 'MOVIE' && (!media?.episodeTitle || !new RegExp(`(?<![\\d.])${media.episode}(?![\\d.])`).test(media.episodeTitle))}
            Episode {media.episodeRange ? `${media.episodeRange.first} ~ ${media.episodeRange.last}` : media.episode}
          {:else if current && (videos?.length > 1)}
            Episode {videos.indexOf(current) + 1}
          {/if}
          {#if (media?.episode === 0 || media?.episode) && media?.media?.format !== 'MOVIE' && (media?.episodeTitle && !new RegExp(`(?<![\\d.])${media.episode}(?![\\d.])`).test(media.episodeTitle) && media?.media?.episodes !== 1)}{' - '}{/if}
          {#if media?.episodeTitle}{media.episodeTitle}{/if}
        </div>
      </div>
    </div>
  {/if}

  {#if resolvePrompt || skipPrompt}
    <div style='position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); pointer-events: auto;'>
      <div class='text-monospace rounded skipPrompt d-flex flex-column align-items-center text-center bg-dark-light p-20 z-50' class:w-500={SUPPORTS.isAndroid}>
        {#if resolvePrompt}
          <div class='skipFont'>Failed to <b>identify</b> the media, fix it?</div>
          <div class='d-flex justify-content-center mt-20'>
            <button class='btn btn-primary mx-2 mr-20' use:click={() => resolveResponse(true)}>Yes</button>
            <button class='btn btn-secondary mx-2 ml-20' use:click={() => resolveResponse(false)}>No</button>
          </div>
        {:else}
          <div class='skipFont'>This is a <b>{filler || recap}</b>, skip?</div>
          <div class='d-flex justify-content-center mt-20'>
            <button class='btn btn-primary mx-2 mr-20' use:click={() => skipResponse(true)}>Yes</button>
            <button class='btn btn-secondary mx-2 ml-20' use:click={() => skipResponse(false)}>No</button>
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>
  <div class='middle d-flex align-items-center justify-content-center flex-grow-1 position-relative'>
    <div aria-hidden='true' class='w-full h-full position-absolute toggle-fullscreen' on:dblclick={toggleFullscreen} on:click|self={() => { if ($page === page.PLAYER && modal.length === 0) { playPause(); } else if (!miniplayerShelved) { page.navigateTo(page.PLAYER) } }} />
    <div aria-hidden='true' class='w-full h-full position-absolute toggle-immerse d-none' on:dblclick={toggleFullscreen} on:click|self={toggleImmerse} />
    <div class='w-full h-full position-absolute mobile-focus-target d-none' use:click={() => { page.navigateTo(page.PLAYER) }} />
    <span aria-hidden='true' class='icon ctrl align-items-center justify-content-end w-150 mw-full mr-auto' class:hidden={externalPlayback} class:mb-50={!miniplayer} on:click={rewind}><Rewind size='3rem' /></span>

    {#if !miniplayer || !miniplayerShelved}
      <div class='d-flex align-items-center position-relative' class:mb-50={!miniplayer} style='width: 100%;' title='Play/Pause'>
        {#if hasLast}
          <span class='icon ctrl position-absolute rounded-10 text-white' style={externalPlayback ? `left: 5%` : `left: 15%`} title='Last' data-name='playPause' use:click={playLast}>
            <SkipBack size='3rem' />
          </span>
        {/if}
          <span class='icon ctrl position-absolute rounded-10 text-white' data-name='playPause' style='left: 50%; margin-left: -3rem;' use:click={playPause}>
            {#if ended}
              <RotateCw size='3rem' />
            {:else}
              {#if paused}
                <Play size='3rem' />
              {:else}
                <Pause size='3rem' />
              {/if}
            {/if}
          </span>
        {#if hasNext}
          <span class='icon ctrl position-absolute rounded-10 text-white' style={externalPlayback ? `right: 5%` : `right: 15%`} title='Next' data-name='playPause' use:click={playNext}>
            <SkipForward size='3rem' />
          </span>
        {/if}
      </div>
      <span aria-hidden='true' class='icon ctrl align-items-center w-150 mw-full ml-auto' class:hidden={externalPlayback} class:mb-50={!miniplayer} on:click={forward}><FastForward size='3rem' /></span>
      <div class='position-absolute bufferingDisplay' class:bufferingPos={SUPPORTS.isAndroid && !miniplayer}/>
      {#if currentSkippable}
        <button class='skip position-absolute bottom-0 right-0 mr-20 mb-5 z-30 d-flex align-items-center justify-content-center' use:click={skip}>
          <FastForward size='1.8rem' /><span class='ml-5'>Skip {currentSkippable}</span>
        </button>
      {/if}
    {/if}
    <span class='ui-volume position-absolute z-10 pointer-events-none opacity-90 opacity-ts-3 d-flex align-items-center justify-content-center' class:transparent={!volumeVisible}>
      <svg class='volume-ring' viewBox='0 0 100 100'>
        <circle class='ring-bg' cx='50' cy='50' r='42' />
        <circle class='ring-fill' cx='50' cy='50' r='42'
          style='stroke-dashoffset: {264 - (264 * (volumeBoosted ? Math.min(gain, 3) / 3 : volume))}' />
      </svg>
      <span class='volume-icon-inner'>
        {#if muted || volume === 0}
          <VolumeX size='2.8rem' />
        {:else if volumeBoosted}
          <Volume2 size='2.8rem' />
        {:else if volume < 0.5}
          <Volume1 size='2.8rem' />
        {:else}
          <Volume2 size='2.8rem' />
        {/if}
      </span>
    </span>
    <span class='position-absolute z-10 font-weight-bold font-scale-40 text-white pointer-events-none icon-shadow opacity-90 opacity-ts-3' style='left: 0; bottom: 6rem;' class:transparent={!subVisible}>{subText}</span>
    {#if subDelayText}
      <span class='position-absolute z-10 font-weight-bold font-scale-50 text-white pointer-events-none icon-shadow opacity-90 opacity-ts-3' class:transparent={!subDelayVisible}>{subDelayText}</span>
    {/if}
  </div>
  <div class='bottom d-flex z-40 flex-column px-20'>
    <div class='w-full d-flex align-items-center h-20 mb-5 seekbar' tabindex='-1' role='button' on:keydown={handleSeekbarKey}>
      <Seekbar
        accentColor='{completed || (media?.media && ((($mediaCache[media.media.id] || media.media)?.mediaListEntry?.progress - (media?.zeroEpisode ? 1 : 0)) >= (media.episodeRange ? media.episodeRange.last : media.episode))) ? `var(--completed-color-dim)` : animeAccent}'
        class='font-size-20'
        length={safeduration}
        {buffer}
        bind:progress={progress}
        on:seeking={handleMouseDown}
        on:seeked={handleMouseUp}
        chapters={sanitiseChapters(chapters, safeduration)}
        {getThumbnail}
      />
    </div>
    <div class='d-flex'>
      <span class='icon ctrl m-5 text-white' title='Play/Pause [Space]' data-name='playPause' use:click={playPause}>
        {#if ended}
          <RotateCw size='2rem' />
        {:else}
          {#if paused}
            <Play size='2rem' />
          {:else}
            <Pause size='2rem' />
          {/if}
        {/if}
      </span>
      {#if hasLast}
        <span class='icon ctrl m-5 d-btn text-white' title='Last [B]' use:click={playLast}>
          <SkipBack size='2rem' />
        </span>
      {/if}
      {#if hasNext}
        <span class='icon ctrl m-5 d-btn text-white' title='Next [N]' use:click={playNext}>
          <SkipForward size='2rem' />
        </span>
      {/if}
      <div class='d-none w-auto volume' class:d-flex={!externalPlayback}>
        <span class='icon ctrl m-5 text-white' title='Mute [M]' data-name='toggleMute' use:click={toggleMute}>
          {#if muted}
            <VolumeX size='2rem' />
          {:else}
            <Volume2 size='2rem' />
          {/if}
        </span>
        {#if !volumeBoosted}
          <input class='ctrl h-full custom-range' tabindex='-1' type='range' min='0' max='1' step='any' data-name='setVolume' bind:value={volume} />
        {:else}
          <input class='ctrl h-full custom-range' class:boost-color={gain > 1} tabindex='-1' type='range' min='0' max='3' step='any' data-name='setVolume' bind:value={gain} on:input={setGain}/>
        {/if}
        {#if (volume === 1) || volumeBoosted}
          <span class='icon ctrl boost p-0 mt-15 d-flex align-items-center justify-content-center text-white' class:boost-color={volumeBoosted} title='Increase Volume Limit [V]' data-name='toggleGain' use:click={toggleGain}>
            <SlidersVertical size='1.4rem' />
          </span>
        {/if}
      </div>
      <div class='ts font-scale-20' class:mr-auto={playbackRate === 1}>{toTS(targetTime, safeduration > 3600 ? 2 : 3)} / {toTS(safeduration - targetTime, safeduration > 3600 ? 2 : 3)}</div>
      {#if playbackRate !== 1}
        <div class='ts mr-auto font-scale-20'>x{playbackRate.toFixed(1)}</div>
      {/if}
      <input type='file' class='d-none' id='search-subtitle' accept='.srt,.vtt,.ass,.ssa,.sub,.txt' on:input|preventDefault|stopPropagation={handleFile} bind:this={fileInput}/>
      <span class='icon text-white ctrl d-flex align-items-center h-full' title='More' use:click={openContextMenuFromButton}>
        <EllipsisVertical size='2.5rem' strokeWidth={2.5} />
      </span>
      <span class='icon text-white ctrl mr-5 d-flex align-items-center keybinds' title='Keybinds [`]' use:click={() => (showKeybinds = true)}>
        <Keyboard size='2.5rem' strokeWidth={2.5} />
      </span>
      <span class='icon text-white ctrl mr-5 d-flex align-items-center h-full' title='Episodes' use:click={() => showEpisodes = !showEpisodes}>
        <ListVideo size='2.5rem' strokeWidth={2.5} />
      </span>
      {#if 'audioTracks' in HTMLVideoElement.prototype && video?.audioTracks?.length > 1}
        <div class='dropdown dropup with-arrow' use:click={toggleDropdown}>
          <span class='icon text-white ctrl mr-5 d-flex align-items-center h-full' title='Audio Tracks'>
            <ListMusic size='2.5rem' strokeWidth={2.5} />
          </span>
          <div class='dropdown-menu dropdown-menu-right ctrl p-10 pb-0 mr-15 text-capitalize text-nowrap'>
            <div class='custom-radio overflow-y-auto overflow-x-hidden hm-400'>
              {#each video.audioTracks as track}
                <input name='audio-radio-set' type='radio' id='audio-{track.id}-radio' value={track.id} checked={track.enabled} />
                <label for='audio-{track.id}-radio' use:click={() => selectAudio(track.id)} class='pb-5'>
                  {(track.language || (!Object.values(video.audioTracks).some(track => track.language === 'eng' || track.language === 'en') ? 'eng' : track.label)) + (track.label ? ' - ' + track.label : '')}
                </label>
              {/each}
              <div class='mb-5 invisible'></div>
            </div>
          </div>
        </div>
      {/if}
      {#if $playPage && media?.media}
        <span class='icon text-white ctrl mr-5 d-flex align-items-center' title='Now Playing [O]' use:click={() => modal.toggle(modal.ANIME_DETAILS, media.media)}>
          <Eye size='2.5rem' strokeWidth={2.5} />
        </span>
      {/if}
      {#if 'videoTracks' in HTMLVideoElement.prototype && video?.videoTracks?.length > 1}
        <div class='dropdown dropup with-arrow' use:click={toggleDropdown}>
          <span class='icon text-white ctrl mr-5 d-flex align-items-center h-full' title='Video Tracks'>
            <ListVideo size='2.5rem' strokeWidth={2.5} />
          </span>
          <div class='dropdown-menu dropdown-menu-right ctrl p-10 pb-0 mr-15 text-capitalize text-nowrap'>
            <div class='custom-radio overflow-y-auto overflow-x-hidden hm-400'>
              {#each video.videoTracks as track}
                <input name='video-radio-set' type='radio' id='video-{track.id}-radio' value={track.id} checked={track.selected} />
                <label for='video-{track.id}-radio' use:click={() => selectVideo(track.id)} class='pb-5'>
                  {(track.language || (!Object.values(video.videoTracks).some(track => track.language === 'eng' || track.language === 'en') ? 'eng' : track.label)) + (track.label ? ' - ' + track.label : '')}
                </label>
              {/each}
              <div class='mb-5 invisible'></div>
            </div>
          </div>
        </div>
      {/if}
      {#if subHeaders?.length && !externalPlayback}
        <div class='subtitles dropdown dropup with-arrow' use:click={toggleDropdown}>
          <span class='icon text-white ctrl mr-5 d-flex align-items-center h-full' title='Subtitles [C]'>
            <Captions size='2.5rem' strokeWidth={2.5} />
          </span>
          <div class='dropdown-menu dropdown-menu-right ctrl p-10 pb-5 mr-15 text-capitalize text-nowrap'>
            <div class='custom-radio overflow-y-auto overflow-x-hidden hm-400'>
              <input name='subtitle-radio-set' type='radio' id='subtitle-off-radio' value='off' checked={subHeaders && subs?.current === -1} />
              <label for='subtitle-off-radio' use:click={() => { subs.selectCaptions(-1); updateSubs(); cache.setEntry(caches.HISTORY, 'lastSubtitle', { ...(cache.getEntry(caches.HISTORY, 'lastSubtitle') || {}), [media?.media?.id || media?.title || media?.parseObject?.title || media?.parseObject?.file_name]: 'OFF' }) }} class='pb-5'> OFF </label>
              {#each subHeaders as track}
                {#if track}
                  {@const trackName = (track.language || (!Object.values(subs.headers).some(header => header.language === 'eng' || header.language === 'en') ? 'eng' : track.type)) + (track.name ? ' - ' + track.name : '')}
                  <input name='subtitle-radio-set' type='radio' id='subtitle-{track.number}-radio' value={track.number} checked={track.number === subs.current} />
                  <label for='subtitle-{track.number}-radio' use:click={() => { subs.selectCaptions(track.number); updateSubs(); cache.setEntry(caches.HISTORY, 'lastSubtitle', { ...(cache.getEntry(caches.HISTORY, 'lastSubtitle') || {}), [media?.media?.id || media?.title || media?.parseObject?.title || media?.parseObject?.file_name]: trackName }) }} class='pb-5'>
                    {trackName}
                  </label>
                {/if}
              {/each}
              <div class='mb-5 invisible'></div>
              <div class='subtitle-offset'>
                <div role='button' aria-label='Add External Subtitles' class='position-absolute not-reactive' title='Add External Subtitles' style='margin-left: 0.1rem !important; margin-top: 0.3rem !important' use:click={(target) => { fileInput.click(); toggleDropdown(target) }}>
                  <FilePlus2 size='2rem' strokeWidth={2.5} />
                </div>
                <input type='text' inputmode='numeric' pattern='-?[0-9]*.?[0-9]*' step='0.1' title='Subtitle Offset' bind:value={subDelay} on:click|stopPropagation class='form-control text-right form-control-sm not-reactive' />
              </div>
            </div>
          </div>
        </div>
      {/if}

      <!--{#if 'PresentationRequest' in window && canCast && current}-->
      <!--  <span class='icon text-white ctrl mr-5 d-flex align-items-center text-white' title='Cast Video [D]' data-name='toggleCast' use:click={toggleCast}>-->
      <!--    {#if presentationConnection}-->
      <!--      <Cast size='2.5rem' fill='currentColor' strokeWidth={0} />-->
      <!--    {:else}-->
      <!--      <Cast size='2.5rem' strokeWidth={2.5} />-->
      <!--    {/if}-->
      <!--  </span>-->
      <!--{/if}-->
      {#if 'pictureInPictureEnabled' in document}
        <span class='icon text-white ctrl mr-5 d-none align-items-center' class:d-flex={!externalPlayback} title='Popout Window [P]' data-name='togglePopout' use:click={togglePopout}>
          {#if pip}
            <PictureInPicture size='2.5rem' strokeWidth={2.5} />
          {:else}
            <PictureInPicture2 size='2.5rem' strokeWidth={2.5} />
          {/if}
        </span>
      {/if}
      <span class='icon text-white ctrl mr-5 d-none align-items-center' class:d-flex={!externalPlayback} title='Fullscreen [F]' data-name='toggleFullscreen' use:click={toggleFullscreen}>
        {#if isFullscreen}
          <Minimize size='2.5rem' strokeWidth={2.5} />
        {:else}
          <Maximize size='2.5rem' strokeWidth={2.5} />
        {/if}
      </span>
    </div>
  </div>

  {#if showEpisodes && media?.media}
    <div class='episodes-overlay' on:click={() => showEpisodes = false} on:contextmenu|preventDefault={() => showEpisodes = false}></div>
    <div class='episodes-panel' on:click|stopPropagation on:contextmenu|stopPropagation>
      <div class='episodes-panel-header'>
        <span class='episodes-panel-title'>EPISODES</span>
        <button class='episodes-panel-close' on:click={() => showEpisodes = false}>✕</button>
      </div>
      <EpisodePanel
        media={media.media}
        episodeCount={getMediaMaxEp(media.media)}
        userProgress={media.media?.mediaListEntry?.progress || 0}
        play={(m, ep) => { playAnime(m, ep); showEpisodes = false }}
      />
    </div>
  {/if}

<SoftModal class='p-0 w-700 mw-full rounded overflow-hidden jimaku-modal' bind:showModal={jimakuShow} close={closeJimaku} id='jimaku'>

  <!-- Header -->
  <div class='jimaku-header'>
    <div>
      <div class='jimaku-label'>Subtitles</div>
      <h5 class='jimaku-title'>Jimaku</h5>
    </div>
    <button class='jimaku-close' on:click={closeJimaku}>✕</button>
  </div>

  <!-- Body -->
  {#if jimakuFiles.length}
    <div class='jimaku-list'>
      {#each jimakuFiles as file, i}
        <div class='jimaku-row'>
          <span class='jimaku-index'>{String(i + 1).padStart(2, '0')}</span>
          <div class='jimaku-name'>{file.name}</div>
          <button class='jimaku-dl' on:click={() => downloadJimakuFile(file)}>
            <Download size='0.85rem' />
            DL
          </button>
        </div>
      {/each}
    </div>
  {:else}
    <div class='jimaku-empty'>No subtitles found for this series</div>
  {/if}
</SoftModal>
{#if contextMenu}
  <div
    class="ctx-overlay"
    on:click={() => contextMenu = false}
    on:contextmenu|preventDefault={() => contextMenu = false}
  >
    <div
      class="ctx-menu"
      style="left: {contextMenuX}px; top: {contextMenuY}px;"
      on:click|stopPropagation
      on:contextmenu|stopPropagation
    >
      <div class="ctx-item" role="button" tabindex="-1" on:click={() => { playPause(); contextMenu = false }}>
        <span class="ctx-label">{paused ? 'Play' : 'Pause'}</span>
        <span class="ctx-hint">Space</span>
      </div>
      <div class="ctx-sep"></div>
      <div class="ctx-item" role="button" tabindex="-1" on:click={() => { toggleMute(); contextMenu = false }}>
        <span class="ctx-label">{muted ? 'Unmute' : 'Mute'}</span>
        <span class="ctx-hint">M</span>
      </div>
      <div class="ctx-item" role="button" tabindex="-1" on:click={() => { fitWidth = !fitWidth; cache.setEntry(caches.GENERAL, 'fitWidth', String(fitWidth)); contextMenu = false }}>
        <span class="ctx-label">{fitWidth ? 'Contain' : 'Cover'}</span>
        <span class="ctx-hint">W</span>
      </div>
      <div class="ctx-sep"></div>
      <div class="ctx-item" role="button" tabindex="-1" on:click={() => { cycleSubtitles(); contextMenu = false }}>
        <span class="ctx-label">Subtitles</span>
        <span class="ctx-arrow">›</span>
      </div>
      <div class="ctx-sep"></div>
      <div class="ctx-item" role="button" tabindex="-1" on:click={() => { toggleFullscreen(); contextMenu = false }}>
        <span class="ctx-label">{isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}</span>
        <span class="ctx-hint">F</span>
      </div>
      <div class="ctx-item" role="button" tabindex="-1" on:click={() => { togglePopout(); contextMenu = false }}>
        <span class="ctx-label">{pip ? 'Exit PiP' : 'Picture in Picture'}</span>
        <span class="ctx-hint">P</span>
      </div>
      <div class="ctx-sep"></div>
      <div class="ctx-item" role="button" tabindex="-1" on:click={() => { playLast(); contextMenu = false }}>
        <span class="ctx-label">Previous Episode</span>
        <span class="ctx-hint">B</span>
      </div>
      <div class="ctx-item" role="button" tabindex="-1" on:click={() => { playNext(); contextMenu = false }}>
        <span class="ctx-label">Next Episode</span>
        <span class="ctx-hint">N</span>
      </div>
      <div class="ctx-sep"></div>
      <div class="ctx-item" role="button" tabindex="-1" on:click={() => { volumeLimit = volumeLimit >= 3 ? 1 : volumeLimit + 0.5; contextMenu = false }}>
        <span class="ctx-label">Volume Limit: {(volumeLimit * 100).toFixed(0)}%</span>
      </div>
      <div class="ctx-item" role="button" tabindex="-1" class:d-none={externalPlayback} on:click={() => { fileInput.click(); contextMenu = false }}>
        <span class="ctx-label">Add Subtitles</span>
      </div>
      <div class="ctx-item" role="button" tabindex="-1" class:d-none={!media?.media || externalPlayback} on:click={() => { exploreJimaku(); contextMenu = false }}>
        <span class="ctx-label">Jimaku Subtitles</span>
      </div>
      <div class="ctx-item" role="button" tabindex="-1" class:d-none={externalPlayback} on:click={() => { if ($settings.playerChapterSkip === 'embedded') { $settings.playerChapterSkip = 'aniskip'; findChapters() } else { $settings.playerChapterSkip = 'embedded'; chapters = embeddedChapters }; contextMenu = false }}>
        <span class="ctx-label">Chapter Source</span>
        <span class="ctx-hint">{$settings.playerChapterSkip === 'embedded' ? 'Embedded' : 'Aniskip'}</span>
      </div>
      <div class="ctx-item" role="button" tabindex="-1" class:d-none={!((!externalPlayback || launchedExternal) && (SUPPORTS.isAndroid || $settings.playerPath))} on:click={() => { setCurrent(current, true); contextMenu = false }}>
        <span class="ctx-label">External Player</span>
      </div>
      <div class="ctx-item" role="button" tabindex="-1" on:click={() => { resolvePrompt = false; modal.toggle(modal.FILE_MANAGER); contextMenu = false }}>
        <span class="ctx-label">File Manager</span>
      </div>
      <div class="ctx-item" role="button" tabindex="-1" on:click={() => { showTorrentStats = !showTorrentStats; contextMenu = false }}>
        <span class="ctx-label">{showTorrentStats ? 'Hide' : 'Show'} Stats</span>
      </div>
    </div>
  </div>
{/if}
</div>
<style>
  :global(.deband-canvas) {
    max-width: 100%;
    max-height: 100%;
    width: 100% !important;
    height: 100% !important;
    top: 50%;
    left: 50%;
    position: absolute;
    transform: translate(-50%, -50%);
    pointer-events: none;
    object-fit: contain;
  }
  :global(.deband-canvas) ~ video {
    opacity: 0;
  }
  .fitWidth video, .fitWidth :global(.deband-canvas) {
    object-fit: cover !important;
  }
  .custom-range {
    color: var(--player-accent);
    --thumb-height: 0px;
    --track-height: 3px;
    --track-color: hsla(var(--white-color-hsl), 0.2);
    --brightness-hover: 120%;
    --brightness-down: 80%;
    --clip-edges: 2px;
    --target-height: max(var(--track-height), var(--thumb-height));
    position: relative;
    background: hsla(var(--white-color-hsl), 0);
    overflow: hidden;
    transition: all ease 100ms;
    appearance: none;
  }
  .custom-range:hover {
    --thumb-height: 12px;
  }

  .custom-range:active {
    cursor: grabbing;
  }
  .custom-range::-webkit-slider-runnable-track {
    height: var(--target-height);
    position: relative;
        background: linear-gradient(var(--track-color) 0 0) scroll no-repeat center /
      100% calc(var(--track-height));
  }

  .custom-range::-webkit-slider-thumb {
    position: relative;
    height: var(--thumb-height);
    width: var(--thumb-width, var(--thumb-height));
    -webkit-appearance: none;
    --thumb-radius: calc((var(--target-height) * 0.5) - 1px);
    --clip-top: calc((var(--target-height) - var(--track-height)) * 0.5);
    --clip-bottom: calc(var(--target-height) - var(--clip-top));
    --clip-further: calc(100% + 1px);
    --box-fill: calc(-100vmax - var(--thumb-width, var(--thumb-height))) 0 0
      100vmax currentColor;

    background: linear-gradient(currentColor 0 0) scroll no-repeat left center /
      50% calc(var(--track-height) + 1px);
    background-color: currentColor;
    box-shadow: var(--box-fill);
    border-radius: var(--thumb-width, var(--thumb-height));

    filter: brightness(100%);
    clip-path: polygon(
      100% -1px,
      var(--clip-edges) -1px,
      0 var(--clip-top),
      -100vmax var(--clip-top),
      -100vmax var(--clip-bottom),
      0 var(--clip-bottom),
      var(--clip-edges) 100%,
      var(--clip-further) var(--clip-further)
    );
  }

  .custom-range:hover::-webkit-slider-thumb {
    filter: brightness(var(--brightness-hover));
    cursor: grab;
  }

  .custom-range:active::-webkit-slider-thumb {
    filter: brightness(var(--brightness-down));
    cursor: grabbing;
  }

  .custom-range.boost-color {
    color: var(--player-accent);
    filter: saturate(1.4);
  }

  .custom-range:focus {
    outline: none;
  }

  .bind {
    font-size: 1.8rem;
    font-weight: bold;
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100%;
  }
  .stats {
    font-size: 2.3rem;
    padding-top: 1.5rem;
    white-space: nowrap;
    font-weight: 600;
    font-family: var(--font-mono);
    letter-spacing: 0.04em;
  }
  .skipPrompt {
    margin-top: 10rem;
    font-family: var(--font-mono);
    background: var(--card-surface) !important;
    border: 1px solid var(--card-line) !important;
    color: var(--card-fg);
    backdrop-filter: blur(12px);
  }
  .skipFont {
    font-size: 1.6rem !important;
    color: var(--card-dim);
    line-height: 1.6;
  }
  .skipFont b {
    color: var(--card-accent);
    font-weight: 600;
  }
  .miniplayer {
    height: auto !important;
    cursor: pointer !important;
  }
  .miniplayer .top,
  .miniplayer .bottom, .miniplayer .skip {
    display: none !important;
  }
  .miniplayer video {
    position: relative !important;
  }
  .bg-tp {
    background: hsla(var(--bg-hsl), 0.82);
    backdrop-filter: blur(16px);
    border: 1px solid var(--card-line);
    border-radius: 6px;
  }
  .bg-tp .close {
    position: absolute;
    top: 0;
    right: 0;
    cursor: pointer;
    color: inherit;
    padding: var(--alert-close-padding);
    line-height: var(--alert-close-line-height);
    font-size: var(--alert-close-font-size);
    background-color: transparent;
    border-color: transparent;
  }

  video {
    transition: margin-top 0.2s ease;
  }
  .player {
    user-select: none;
    font-family: var(--font-mono);
    background: var(--black-color);
  }

  /* ── Top bar title/subtitle ─────────────────── */
  /* NOTE: these use px/vw, not rem — this app's root font-size is scaled
     down to ~48-62% (see :root --default-html-font-size), so 1rem here is
     only ~8-10px, not 16px. rem-based clamps were silently capping the
     title around 22-34px. */
  .now-playing {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    padding-left: clamp(16px, 1.6vw, 32px);
    /* readability scrim so the text holds up over any banner art */
    background: linear-gradient(100deg, rgba(0,0,0,0.325) 0%, rgba(0,0,0,0.195) 30%, rgba(0,0,0,0.039) 60%, rgba(0,0,0,0) 80%);
    pointer-events: none;
  }
  .now-playing-inner {
    max-width: min(640px, 46vw);
    pointer-events: none;
  }
  .np-eyebrow {
    font-family: var(--font-mono);
    font-weight: 700;
    font-size: 15px;
    letter-spacing: 0.24em;
    text-transform: uppercase;
    color: var(--card-fg);
    opacity: 0.7;
    text-shadow: 0 1px 4px rgba(0,0,0,0.9);
    margin-bottom: 10px;
  }
  .np-title {
    font-family: var(--font-display);
    font-weight: 800;
    letter-spacing: -0.01em;
    font-size: clamp(30px, 3.4vw, 54px);
    line-height: 1.18;
    color: var(--card-fg);
    text-shadow: 0 1px 3px rgba(0,0,0,0.9), 0 4px 5px rgba(0,0,0,0.55);
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
    margin-bottom: 14px;
  }
  .np-episode {
    font-family: var(--font-mono);
    font-weight: 700;
    font-size: clamp(17px, 1.3vw, 23px);
    letter-spacing: 0.04em;
    color: var(--card-fg);
    opacity: 0.78;
    text-shadow: 0 1px 4px rgba(0,0,0,0.9);
  }

  .pip :global(canvas:not(.w-full)) {
    width: 1px !important;
    height: 1px !important;
  }

  .icon {
    font-size: 2.8rem;
    padding: 1.5rem;
    display: flex;
  }

  .immersed {
    cursor: none;
  }

  .immersed .middle .ctrl,
  .immersed .top,
  .immersed .bottom, .immersed .skip {
    pointer-events: none;
    opacity: 0;
  }
  /*:fullscreen .ctrl[data-name='toggleCast'] {*/
  /*  display: none !important;*/
  /*}*/

  .pip video {
    opacity: 0.1%;
  }

  .middle .bufferingDisplay {
    border: 4px solid hsla(var(--white-color-hsl), 0);
    border-top: 4px solid var(--white-color);
    border-radius: 50%;
    width: 40px;
    height: 40px;
    animation: spin 1s linear infinite;
    will-change: transform;
    opacity: 0;
    visibility: hidden;
    transition: 0.2s opacity ease 0s;
    filter: drop-shadow(0 0 8px var(--black-color));
  }

  .middle .bufferingPos {
    margin-bottom: 5rem;
  }

  .buffering .middle .bufferingDisplay {
    opacity: 1 !important;
    visibility: visible !important;
  }
  .pip .bufferingDisplay {
    display: none;
  }

  @keyframes spin {
    0% {
      transform: rotate(0deg);
    }

    100% {
      transform: rotate(360deg);
    }
  }

  .middle .ctrl {
    font-size: 4rem;
    z-index: 3;
    display: none;
  }
  :fullscreen {
    background: var(--black-color) !important;
  }

  @media (pointer: none), (pointer: coarse) {
    .middle .ctrl {
      display: flex;
    }
  }
  .miniplayer .middle {
    transition: background 0.2s ease;
    position: absolute !important;
    width: 100%;
    height: 100%;
  }
  .miniplayer .middle .ctrl[data-name='playPause'] {
    display: flex;
    font-size: 2.8rem;
  }
  .miniplayer .middle .ctrl[data-name='playPause'] {
    font-size: 5.625rem;
  }
  .miniplayer:hover .middle {
    background: hsla(var(--black-color-hsl), 0.4);
  }
  .middle .ctrl[data-name='playPause'] {
    font-size: 6.75rem;
  }

  .middle .ctrl,
  .bottom .ctrl:hover,
  .bottom .ts:hover,
  .bottom .hover .ts {
    filter: drop-shadow(0 0 8px var(--black-color));
  }
  .skip {
    transition: background 0.12s;
    font-family: inherit !important;
    font-size: 1rem !important;
    font-weight: 600 !important;
    letter-spacing: 0 !important;
    background: rgba(18, 18, 18, 0.9) !important;
    color: #fff !important;
    border: 1px solid rgba(255, 255, 255, 0.2) !important;
    border-radius: 6px !important;
    padding: 8px 14px !important;
    gap: 6px;
  }
  .skip:hover {
    background: rgba(0, 0, 0, 0.95) !important;
    border-color: rgba(255, 255, 255, 0.35) !important;
  }
  .skip :global(svg) {
    color: inherit;
  }
  .skip:hover :global(svg) {
    filter: none;
  }

  .bottom {
    transition: 0.2s opacity ease 0s;
    zoom: 1.3;
  }
  .top {
    transition: 0.2s opacity ease 0s;
  }
  .mr-50 {
    margin-right: 5rem !important;
  }
  .mb-50 {
    margin-bottom: 5rem !important;
  }
  .pbf:hover {
    background: var(--tertiary-color);
  }

  .ctrl {
    cursor: pointer;
  }

  .boost-color {
    color: var(--quindenary-color) !important;
  }

  .bottom .volume .boost {
    width: 3rem;
    height: 3rem;
  }

  .bottom .volume .custom-range {
    width: 5vw;
    height: 100%;
    color: var(--white-color);
  }
  .bottom .volume .custom-range.boost-color {
    color: var(--white-color) !important;
  }

  .mt-100 {
    margin-top: 10rem !important;
  }
  .h-20 {
    height: 2rem;
  }
  .rounded-10 {
    border-radius: 1rem;
  }

  @keyframes boostPulse {
    0%, 100% { color: var(--white-color); }
    20% { color: var(--quindenary-color); }
  }
  .ui-volume.muted, .ui-volume.boosting {
    transition: opacity .3s ease-in-out, color .7s ease-in-out !important;
  }
  .ui-volume.boosting {
    animation: boostPulse 1.5s ease-in-out infinite !important;
  }
  .ui-volume.muted {
    color: var(--paused-color) !important;
  }
  .volume-ring {
    width: 7rem;
    height: 7rem;
    transform: rotate(-90deg);
  }
  .ring-bg {
    fill: none;
    stroke: rgba(255, 255, 255, 0.15);
    stroke-width: 6;
  }
  .ring-fill {
    fill: none;
    stroke: var(--white-color);
    stroke-width: 6;
    stroke-linecap: round;
    stroke-dasharray: 264;
    transition: stroke-dashoffset 0.1s ease-out;
  }
  .ui-volume.muted .ring-fill {
    stroke: var(--paused-color);
  }
  .ui-volume.boosting .ring-fill {
    stroke: var(--quindenary-color);
  }
  .volume-icon-inner {
    position: absolute;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .btn-shadow {
    filter: drop-shadow(0rem 0rem 0.5rem hsla(var(--black-color-hsl), 0.9));
  }

  .bottom .ts {
    font-family: var(--font-mono);
    color: var(--card-fg);
    white-space: nowrap;
    align-self: center;
    line-height: var(--base-line-height);
    padding: 0 1.56rem;
    font-weight: 500;
    letter-spacing: 0.04em;
    text-shadow: 0 1px 6px rgba(0,0,0,0.8);
  }

  .seekbar {
    font-size: 2rem !important;
  }
  .miniplayer .mobile-focus-target {
    display: block !important;
  }
  .miniplayer .mobile-focus-target:focus-visible {
    background: hsla(209, 100%, 55%, 0.3);
  }

  @media (max-width: 30rem) {
    .d-btn {
      display: none !important;
    }
  }

  @media (max-width: 60rem) {
    .d-title {
      display: block !important;
      max-width: none !important;
      grid-row: unset !important;
      grid-column: unset !important;
    }
    .d-filler {
      display: flex !important;
    }
    .mt-60 {
      margin-top: 6rem !important;
    }
  }

  @media (pointer: none), (pointer: coarse) {
    .bottom .ctrl[data-name='playPause'],
    .bottom .volume,
    .bottom .keybinds {
      display: none !important;
    }
    @media (orientation: portrait) {
      .top  {
        padding-top: max(var(--safe-area-top), env(safe-area-inset-top, 0)) !important;
      }
    }
    .middle .ctrl {
      display: flex !important;
    }
    .miniplayer .middle .ctrl {
      display: none !important;
    }
    .toggle-immerse {
      display: block !important;
    }
    .toggle-fullscreen {
      display: none !important;
    }
  }

  /* ── Skip/Resolve prompt action buttons ────────── */
  .skipPrompt :global(.btn-primary) {
    font-family: var(--font-mono) !important;
    font-size: 1.1rem !important;
    font-weight: 500 !important;
    letter-spacing: 0.08em !important;
    background: transparent !important;
    color: var(--card-dim) !important;
    border: 1px solid var(--card-line) !important;
    border-radius: 3px !important;
    box-shadow: none !important;
    transition: background 0.12s, border-color 0.12s, color 0.12s;
    min-width: 8rem;
  }
  .skipPrompt :global(.btn-primary:hover) {
    background: var(--card-faint) !important;
    border-color: rgba(255,255,255,0.22) !important;
    color: var(--card-fg) !important;
  }
  .skipPrompt :global(.btn-secondary) {
    font-family: var(--font-mono) !important;
    font-size: 1.1rem !important;
    font-weight: 500 !important;
    letter-spacing: 0.08em !important;
    background: var(--card-accent) !important;
    color: var(--card-bg) !important;
    border: none !important;
    border-radius: 3px !important;
    box-shadow: 0 2px 14px rgba(212,245,94,0.2) !important;
    min-width: 8rem;
    transition: opacity 0.12s;
  }
  .skipPrompt :global(.btn-secondary:hover) { opacity: 0.85; }

  /* ── Stats debug panel ──────────────────────────── */
  :global(.text-monospace.rounded) {
    font-family: var(--font-mono) !important;
    font-size: 1rem !important;
    background: var(--card-surface) !important;
    border: 1px solid var(--card-line) !important;
    color: var(--card-fg) !important;
    backdrop-filter: blur(12px);
    border-radius: 4px !important;
  }
  :global(.text-monospace.rounded .pbf:hover) {
    background: var(--card-accent-dim) !important;
    color: var(--card-accent) !important;
  }

  /* ── Ctrl icon hover glow ───────────────────────── */
  .ctrl {
    cursor: pointer;
    transition: color 0.12s, filter 0.12s;
  }
  .ctrl:hover {
    color: var(--card-fg) !important;
    filter: drop-shadow(0 0 6px var(--card-acc-dim));
  }

  /* ── Dropdown menu ──────────────────────────────── */
  :global(.player .dropdown-menu),
  :global(.player .bg-dark.rounded.dr-arrow) {
    font-family: var(--font-mono) !important;
    background: var(--card-surface) !important;
    border: 1px solid var(--card-line) !important;
    border-radius: 4px !important;
    color: var(--card-fg) !important;
    box-shadow: 0 8px 32px rgba(0,0,0,0.7) !important;
  }
  :global(.player .option) {
    font-family: var(--font-mono) !important;
    font-size: 1.1rem !important;
    color: var(--card-dim) !important;
    transition: background 0.1s, color 0.1s;
  }
  :global(.player .option:hover) {
    background: var(--card-faint) !important;
    color: var(--card-fg) !important;
  }
  :global(.player .option svg) {
    color: var(--card-accent);
    filter: drop-shadow(0 0 4px var(--card-acc-dim));
  }

  /* ── Torrent stats bar (peers / speed) ─────────── */
  .top .stats {
    font-size: 1.8rem;
    padding-top: 0;
    font-weight: 500;
    letter-spacing: 0.04em;
    color: var(--card-dim);
    text-shadow: 0 1px 8px rgba(0,0,0,0.9);
  }
  .top .icon {
    color: var(--card-accent);
    filter: drop-shadow(0 0 5px var(--card-acc-dim));
    padding: 0.8rem 0.6rem;
    text-shadow: none;
  }


  /* ══ Jimaku subtitle modal ═════════════════════════════════ */
  :global(.jimaku-modal) {
    background: var(--card-surface) !important;
    border: 1px solid var(--card-line) !important;
    font-family: var(--font-mono) !important;
    color: var(--card-fg) !important;
    box-shadow: 0 24px 64px rgba(0,0,0,0.85) !important;
  }

  /* Header */
  :global(.jimaku-header) {
    padding: 1.5rem 2rem 1.25rem;
    border-bottom: 1px solid var(--card-line);
    display: flex;
    align-items: baseline;
    justify-content: space-between;
  }
  :global(.jimaku-label) {
    font-size: 0.72rem;
    font-weight: 500;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--card-accent);
    margin-bottom: 0.3rem;
    filter: drop-shadow(0 0 5px var(--card-acc-dim));
  }
  :global(.jimaku-title) {
    margin: 0;
    font-family: var(--font-display) !important;
    font-size: 1.6rem;
    font-weight: 800;
    letter-spacing: -0.02em;
    color: var(--card-fg);
  }
  :global(.jimaku-close) {
    background: none;
    border: none;
    color: var(--card-dim);
    cursor: pointer;
    font-size: 1.4rem;
    line-height: 1;
    padding: 0.25rem;
    transition: color 0.15s;
    font-family: var(--font-mono);
  }
  :global(.jimaku-close:hover) { color: var(--card-accent); }

  /* File list */
  :global(.jimaku-list) {
    overflow-y: auto;
    max-height: 60vh;
    scrollbar-width: thin;
    scrollbar-color: var(--card-line) transparent;
  }
  :global(.jimaku-row) {
    display: flex;
    align-items: center;
    gap: 0.85rem;
    padding: 0.85rem 2rem;
    border-bottom: 1px solid var(--card-line);
    transition: background 0.1s, padding-left 0.15s;
    cursor: default;
  }
  :global(.jimaku-row:hover) {
    background: var(--card-faint);
    padding-left: 2.4rem;
  }
  :global(.jimaku-index) {
    font-size: 0.78rem;
    color: var(--card-accent);
    flex-shrink: 0;
    width: 1.5rem;
    font-variant-numeric: tabular-nums;
    filter: drop-shadow(0 0 4px var(--card-acc-dim));
  }
  :global(.jimaku-name) {
    flex: 1;
    min-width: 0;
    font-size: 1rem;
    font-weight: 300;
    color: var(--card-fg);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    letter-spacing: 0.02em;
  }
  :global(.jimaku-dl) {
    flex-shrink: 0;
    background: var(--card-accent-dim);
    border: 1px solid var(--card-acc-dim);
    color: var(--card-accent);
    padding: 0.35rem 0.85rem;
    border-radius: 3px;
    font-family: var(--font-mono);
    font-size: 0.72rem;
    letter-spacing: 0.08em;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 0.4rem;
    transition: background 0.15s, border-color 0.15s, box-shadow 0.15s;
  }
  :global(.jimaku-dl:hover) {
    background: var(--card-acc-dim) !important;
    border-color: var(--card-accent) !important;
    box-shadow: 0 0 10px var(--card-acc-dim) !important;
  }
  :global(.jimaku-empty) {
    padding: 3rem 2rem;
    text-align: center;
    font-size: 0.88rem;
    color: var(--card-faint);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    font-family: var(--font-mono);
  }

  /* ══ Context Menu (Windows-style) ════════════════════════════ */
  .ctx-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 99999;
  }
  .ctx-menu {
    position: fixed;
    min-width: 240px;
    padding: 4px 0;
    background: var(--card-surface);
    border: 1px solid color-mix(in srgb, var(--player-accent) 30%, var(--card-line));
    border-radius: 6px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.7);
    font-family: var(--font-mono);
    font-size: 1.1rem;
    color: var(--card-fg);
    user-select: none;
    z-index: 100000;
  }
  .ctx-item {
    display: flex;
    align-items: center;
    padding: 5px 28px 5px 16px;
    cursor: default;
    color: var(--card-dim);
    transition: background 0.08s, color 0.08s;
    white-space: nowrap;
    gap: 24px;
  }
  .ctx-item:hover {
    background: color-mix(in srgb, var(--player-accent) 12%, transparent);
    color: var(--player-accent);
  }
  .ctx-item .ctx-label {
    flex: 1;
  }
  .ctx-item .ctx-hint {
    font-size: 1rem;
    color: var(--card-faint);
    font-family: var(--font-mono);
    text-align: right;
  }
  .ctx-item:hover .ctx-hint {
    color: color-mix(in srgb, var(--player-accent) 75%, var(--card-fg));
  }
  .ctx-item .ctx-arrow {
    font-size: 1.4rem;
    color: var(--card-faint);
    line-height: 1;
  }
  .ctx-item:hover .ctx-arrow {
    color: color-mix(in srgb, var(--player-accent) 75%, var(--card-fg));
  }
  .ctx-sep {
    height: 1px;
    margin: 4px 8px;
    background: var(--card-line);
  }

  .episodes-overlay {
    position: fixed;
    inset: 0;
    z-index: 49;
  }

  .episodes-panel {
    position: absolute;
    bottom: 7.5rem;
    right: 3rem;
    width: 420px;
    max-height: 60vh;
    background: var(--card-surface);
    border: 1px solid var(--card-line);
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.7);
    z-index: 50;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .episodes-panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid var(--card-line);
    background: var(--card-bg2);
  }
  .episodes-panel-title {
    font-size: 0.75rem;
    font-weight: 900;
    letter-spacing: 0.1em;
    color: var(--card-fg);
  }
  .episodes-panel-close {
    background: none;
    border: none;
    color: var(--card-dim);
    cursor: pointer;
    font-size: 1rem;
    padding: 4px 8px;
    border-radius: 4px;
    transition: color 0.15s, background 0.15s;
  }
  .episodes-panel-close:hover {
    color: var(--card-fg);
    background: var(--card-faint);
  }
  @media (max-width: 480px) {
    .episodes-panel {
      width: calc(100vw - 2rem);
      right: 1rem;
      bottom: 7rem;
    }
  }

</style>