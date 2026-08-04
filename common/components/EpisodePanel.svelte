<script>
  import { getEpisodes } from '@/modules/anime/episodedata.js'
  import { since } from '@/modules/util.js'
  import { liveAnimeProgress } from '@/modules/anime/animeprogress.js'

  export let media

  export let episodeCount

  export let userProgress = 0

  export let play

  let episodes = null
  let currentEpisodes = []
  let loading = false
  let maxEpisodes = 30
  let loadedAll = false
  let container

  $: animeProgress = liveAnimeProgress(media.id)

  $: if (media) load()

  async function load() {
    loading = true
    episodes = null
    currentEpisodes = []
    loadedAll = false
    episodes = await getEpisodes(media, episodeCount)
    currentEpisodes = episodes?.slice(0, maxEpisodes) || []
    loadedAll = !episodes || currentEpisodes.length >= episodes.length
    loading = false
    ensureCurrentVisible()
  }

  function ensureCurrentVisible() {
    const key = userProgress + 1
    if (episodes && !currentEpisodes.some(ep => getProgressKey(ep) === key)) {
      currentEpisodes = episodes.slice(0, Math.max(currentEpisodes.length, key + 5))
      loadedAll = currentEpisodes.length >= episodes.length
    }
    scrollToCurrent()
  }

  function getProgressKey(ep) {
    return ep.episode + (ep.zeroEpisode ? 1 : 0)
  }

  function handleScroll(event) {
    const el = event.target
    if (!loadedAll && episodes && el.scrollTop + el.clientHeight + 80 >= el.scrollHeight) {
      currentEpisodes = episodes.slice(0, currentEpisodes.length + maxEpisodes)
      loadedAll = currentEpisodes.length >= episodes.length
    }
  }

  function scrollToCurrent() {
    requestAnimationFrame(() => {
      const row = container?.querySelector(`[data-progress="${userProgress + 1}"]`)
      row?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    })
  }

  function onKey(event, episode) {
    if (event.key === 'Enter' || event.key === ' ') play(media, episode)
  }
</script>

<div class='ep-panel'>
  <div class='ep-panel-scroll' bind:this={container} on:scroll={handleScroll}>
    {#if loading || !episodes}
      {#each Array.from({ length: 8 }) as _}
        <div class='ep-row sk'>
          <div class='sk-block num'></div>
          <div class='sk-block title'></div>
          <div class='sk-block air'></div>
        </div>
      {/each}
    {:else}
      {#each currentEpisodes as { zeroEpisode, episode, title, airdate, filler, dubAiring }}
        {@const progressKey = episode + (zeroEpisode ? 1 : 0)}
        {@const unreleased = media?.status !== 'FINISHED' && ((airdate && new Date(airdate).getTime() > new Date()) || (!airdate && (progressKey > 1 || media?.status === 'NOT_YET_RELEASED')))}
        {@const completed = userProgress >= progressKey}
        {@const target = userProgress + 1 === progressKey}
        {@const hasFiller = filler?.filler || filler?.recap}
        {@const progress = !completed && ($animeProgress?.[episode] ?? 0)}
        <div class='ep-row {unreleased ? 'unreleased' : ''} {completed ? 'completed' : ''} {target ? 'target' : ''} {hasFiller ? 'has-filler' : ''}' data-progress={progressKey} role='button' tabindex='0' on:click={() => { if (!unreleased) play(media, episode) }} on:keydown={event => onKey(event, episode)}>
          <div class='ep-num'>{episode}</div>
          <div class='ep-main'>
            <div class='ep-title'>{title || `Episode ${episode}`}</div>
            <div class='ep-badges'>
              {#if hasFiller}<span class='ep-badge'>{filler?.filler ? 'Filler' : 'Recap'}</span>{/if}
              {#if dubAiring}<span class='ep-badge dub'>{dubAiring?.text}</span>{/if}
            </div>
          </div>
          <div class='ep-side'>
            <div class='ep-air'>
              {#if airdate}
                {since(new Date(airdate))}
              {:else if media?.status === 'FINISHED'}
                Released
              {:else}
                Unreleased
              {/if}
            </div>
            {#if completed || progress}
              <div class='progress-track'>
                <div class='progress-fill' style='width: {completed ? 100 : progress}%' />
              </div>
            {/if}
          </div>
        </div>
      {/each}
    {/if}
  </div>
</div>

<style>
  .ep-panel {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
  }

  .ep-panel-scroll {
    overflow-y: auto;
    flex: 1;
    padding: 8px;
  }

  .ep-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border-radius: 8px;
    border: 1px solid transparent;
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s;
  }
  .ep-row:hover {
    background: var(--card-faint);
  }
  .ep-row.unreleased {
    opacity: 0.45;
    cursor: default;
  }
  .ep-row.unreleased:hover {
    background: transparent;
  }
  .ep-row.completed {
    opacity: 0.6;
  }
  .ep-row.target {
    border-color: var(--card-accent);
    background: var(--card-bg2);
  }
  .ep-row.has-filler {
    border-color: var(--card-acc-dim);
  }

  .ep-num {
    flex-shrink: 0;
    width: 1.75rem;
    text-align: center;
    font-weight: 700;
    font-size: 0.95rem;
    color: var(--card-accent);
  }

  .ep-main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .ep-title {
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--card-fg);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .ep-badges {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .ep-badge {
    font-size: 0.65rem;
    font-weight: 700;
    letter-spacing: 0.02em;
    padding: 1px 6px;
    border-radius: 4px;
    background: var(--card-faint);
    color: var(--card-dim);
  }
  .ep-badge.dub {
    color: var(--card-accent);
  }

  .ep-side {
    flex-shrink: 0;
    min-width: 5rem;
    text-align: right;
  }

  .ep-air {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--card-dim);
    white-space: nowrap;
  }

  .progress-track {
    height: 2px;
    border-radius: 50px;
    background: var(--card-line);
    overflow: hidden;
    margin-top: 4px;
  }
  .progress-fill {
    height: 100%;
    background: var(--card-accent);
    border-radius: 50px;
  }

  .ep-row.sk {
    cursor: default;
  }
  .ep-row.sk:hover {
    background: transparent;
  }
  .sk-block {
    background: var(--card-faint);
    border-radius: 4px;
    height: 12px;
    animation: ep-pulse 1.2s ease-in-out infinite;
  }
  .sk-block.num {
    width: 1.75rem;
  }
  .sk-block.title {
    flex: 1;
  }
  .sk-block.air {
    width: 5rem;
  }

  @keyframes ep-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
</style>
