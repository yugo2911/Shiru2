<script>
  import { Building2, Earth, Adult, FolderKanban, Languages, CalendarRange, MonitorPlay, Type } from 'lucide-svelte'
  import { getKitsuMappings } from '@/modules/anime/anime.js'
  import { seasons } from '@/modules/anilist.js'

  export let media = null
  export let alt = null

  let scrollDetails
  $: if (media && scrollDetails) scrollDetails.scrollLeft = 0

  const countryMap = { JP: 'Japan', KR: 'South Korea', US: 'United States', CN: 'China', HK: 'Hong Kong', TW: 'Taiwan' }
  const detailsMap = [
    { property: 'status', label: 'Status', icon: MonitorPlay },
    { property: 'studios', label: 'Studio', icon: Building2, custom: 'property' },
    { property: 'source', label: 'Source', icon: FolderKanban },
    { property: 'countryOfOrigin', label: 'Country', icon: Earth, custom: 'property' },
    { property: 'isAdult', label: 'Adult', icon: Adult },
    { property: 'titles', label: 'Titles', icon: Type, custom: 'titles' }
  ]

  let studio
  function getCustomProperty (property, media) {
    if (property === 'averageScore') return media.averageScore + '%'
    if (property === 'countryOfOrigin') return countryMap[media.countryOfOrigin]
    if (property === 'studios') return studio
    return media[property]
  }

  async function getProperty (property, media) {
    if (property === 'episode') return media.nextAiringEpisode?.episode
    if (property === 'titles') {
      return {
        main: media.title.romaji || media.title.english,
        subs: [media.title.english, media.title.native].filter(t => t && t !== (media.title.romaji || media.title.english))
      }
    }
    if (property === 'isAdult') return (media.isAdult === true ? 'Rated 18+' : false)
    if (property === 'countryOfOrigin') return countryMap[media.countryOfOrigin]
    if (property === 'studios') { 
      studio = ((await alt)?.data?.Media || media)?.studios?.nodes?.map(node => node.name)?.[0]
      return studio
    }
    return media[property]
  }
</script>

<div bind:this={scrollDetails} class='details-strip d-flex flex-row align-items-center flex-wrap'>
  {#each detailsMap as detail}
    {#await getProperty(detail.property, media) then property}
      {#if property}
        <div class='detail-item d-flex flex-row align-items-center' class:title-container={detail.custom === 'titles'}>
          <svelte:component size='8px' this={detail.icon} class='mr-5' />
          <span class='value-text'>
            {#if detail.custom === 'property'}
              {getCustomProperty(detail.property, media)}
            {:else if detail.custom === 'titles'}
              <span class="main-title">{property.main.toLowerCase()}</span>
              {#if property.subs.length > 0}
                <div class="tooltip-box">{property.subs.join(' • ').toLowerCase()}</div>
              {/if}
            {:else}
              {property.toString().replace(/_/g, ' ').toLowerCase()}
            {/if}
          </span>
        </div>
      {/if}
    {/await}
  {/each}
</div>

<style>
  .details-strip {
    font-family: 'IBM Plex Mono', monospace !important;
    background: transparent !important;
    padding: 4px 0;
    gap: 8px;
    position: relative;
  }

  .detail-item {
    color: #444;
    position: relative;
  }

  .detail-item:not(:last-child) .value-text::after {
    content: ',';
    color: #222;
    margin-right: 2px;
  }

  .value-text {
    color: #777; /* Significantly lower brightness */
    font-size: 8px; 
    letter-spacing: -0.01em;
  }

  /* First item muted highlight */
  .detail-item:first-child .value-text {
    color: #5d6b2f; 
    font-weight: bold;
  }

  :global(.details-strip svg) {
    color: #5d6b2f;
    opacity: 0.4;
  }

  /* Stable Hover (Tooltip Style) */
  .title-container {
    cursor: pointer;
  }

  .tooltip-box {
    visibility: hidden;
    opacity: 0;
    position: absolute;
    bottom: 100%;
    left: 0;
    background: #111;
    color: #888;
    padding: 4px 8px;
    white-space: nowrap;
    border: 1px solid #222;
    z-index: 10;
    transition: opacity 0.2s ease;
    pointer-events: none;
    font-size: 8px;
  }

  .title-container:hover .tooltip-box {
    visibility: visible;
    opacity: 1;
  }
</style>