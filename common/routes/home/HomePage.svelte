<script context='module'>
  import SectionsManager, { sections } from '@/modules/sections.js'
  import { anilistClient, currentSeason, currentYear } from '@/modules/anilist.js'
  import { animeSchedule } from '@/modules/anime/animeschedule.js'
  import { settings } from '@/modules/settings.js'
  import { uniqueStore } from '@/modules/util.js'
  import equal from 'fast-deep-equal/es6'
  import { RSSManager } from '@/modules/rss.js'
  import Helper from '@/modules/helper.js'
  import WPC from '@/modules/wpc.js'
  import { writable } from 'simple-store-svelte'
  import Debug from 'debug'
  const debug = Debug('ui:home')

  const bannerData = writable(getTitles())
  // Refresh banner every 15 minutes
  setInterval(() => getTitles(true), 5 * 60 * 1000)

  async function getTitles(refresh) {
    const res = anilistClient.search({ method: 'Search', ...(settings.value.adult === 'hentai' && settings.value.hentaiBanner ? { genre: ['Hentai'] } : {}), sort: 'TRENDING_DESC', perPage: 50, onList: false, ...(settings.value.adult !== 'hentai' || !settings.value.hentaiBanner ? { season: currentSeason } : {}), year: currentYear, status_not: 'NOT_YET_RELEASED' })
    if (refresh) {
      const renderData = await res
      bannerData.set(Promise.resolve(renderData))
    }
    else return res
  }

  let mappedSections = {}
  const manager = new SectionsManager()
  mapSections()
  WPC.listen('remap-sections', () => {
    manager.clear()
    mappedSections = {}
    mapSections()
  })

  function mapSections() {
    for (const section of sections.value) mappedSections[section.title] = section
    for (const sectionTitle of settings.value.homeSections) manager.add(mappedSections[sectionTitle[0]])
  }

  const continueWatching = 'Continue Watching'
  const resolveData = async (data) => Promise.all(
    data.map(async item => {
      const resolved = item.data && typeof item.data.then === 'function' ? await item.data : item.data
      const media = resolved?.media || resolved
      return { ...item, data: (media ? { id: media.id, idMal: media.idMal, title: media.title, bannerImage: media.bannerImage, isAdult: media.isAdult, duration: media.duration, episodes: media.episodes, format: media.format } : resolved) }
    })
  )
  if (Helper.getUser()) {
    refreshSections(Helper.getClient().userLists, ['Dubbed Releases', 'Subbed Releases', 'Hentai Releases'], true)
    refreshSections(Helper.getClient().userLists, [continueWatching, 'Sequels You Missed', 'Stories You Missed', 'Planning List', 'Completed List', 'Paused List', 'Dropped List', 'Watching List', 'Rewatching List'])
  }
  if (Helper.isMalAuth()) refreshSections(animeSchedule.subAiredLists, continueWatching) 
  refreshSections(animeSchedule.dubAiredLists, continueWatching)
  function refreshSections(list, sections, schedule = false) {
    uniqueStore(list).subscribe(async (_value) => {
      const value = await _value
      if (!value) return
      for (const section of manager.sections) {
        if (sections.includes(section.title) && !section.hide && (!schedule || section.isSchedule)) {
          const loaded = section.load(1, 50, section.variables)
          if (!section.preview.value || !equal(await resolveData(loaded), await resolveData(section.preview.value))) section.preview.value = loaded
        }
      }
    })
  }

  WPC.listen('feedChanged', ({ updateFeeds, manifest }) => {
    for (const section of manager.sections) {
      try {
        if (section.isSchedule && updateFeeds.includes(section.title)) {
          animeSchedule.feedChanged(section.title.includes('Subbed') ? 'Sub' : section.title.includes('Dubbed') ? 'Dub' : 'Hentai', false, true, manifest).then((changed) => {
            if (changed) section.preview.value = section.load(1, 50, section.variables)
          })
        }
      } catch (error) {
        debug(`Failed to update ${section.title} feed:`, error)
      }
    }
  })

  window.addEventListener('fileEdit', async () => {
    for (const section of manager.sections) {
      if (section.isRSS && !section.isSchedule) {
        const url = settings.value.rssFeedsNew.find(([feedTitle]) => feedTitle === section.title)?.[1]
        if (url) {
          const loaded = RSSManager.getMediaForRSS(1, 12, url, false, true)
          if (!section.preview.value || !equal(await resolveData(loaded), await resolveData(section.preview.value))) section.preview.value = loaded
        }
      }
    }
  })

  const isPreviousRSS = (i) => {
    let index = i - 1
    while (index >= 0) {
      if (!manager.sections[index]?.hide) return manager.sections[index]?.isRSS ?? false
      else if ((index - 1 >= 0) && manager.sections[index - 1]?.isRSS) return true
      index--
    }
    return false
  }
</script>

<script>
  import HomeSection from '@/routes/home/components/HomeSection.svelte'
  import Banner from '@/components/banner/Banner.svelte'
</script>

<style>
  :global(:root) {
    --editorial-bg: #0a0a0c;
    --accent-primary: #ff3e00;
    --glass-border: rgba(255, 255, 255, 0.08);
    --font-display: 'Syncopate', sans-serif; /* Bold, industrial display font */
  }

  .magazine-root {
    background-color: var(--editorial-bg);
    background-image: 
      radial-gradient(at 0% 0%, rgba(255, 62, 0, 0.05) 0px, transparent 50%),
      url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
    background-blend-mode: overlay;
  }

  .content-grid {
    display: grid;
    grid-template-columns: repeat(12, 1fr);
    gap: 2rem;
    padding: 0 4vw;
    margin-top: -80px; /* Overlap the banner for depth */
    position: relative;
    z-index: 2;
  }

  .section-wrapper {
    grid-column: span 12;
    transition: transform 0.6s cubic-bezier(0.22, 1, 0.36, 1);
  }

  /* Asymmetric Layout Pattern */
  .section-wrapper:nth-child(even) {
    grid-column: 2 / span 11;
  }

  .section-wrapper:nth-child(3n) {
    grid-column: 1 / span 10;
  }

  .glass-card {
    background: rgba(255, 255, 255, 0.02);
    backdrop-filter: blur(12px);
    border: 1px solid var(--glass-border);
    border-radius: 4px; /* Industrial sharp corners */
    padding: 1.5rem;
    box-shadow: 20px 20px 60px rgba(0, 0, 0, 0.5);
  }
</style>

<div class='h-full w-full overflow-y-scroll magazine-root overflow-x-hidden'>
  <Banner data={$bannerData} />
  
  <div class='content-grid pb-20'>
    {#each manager.sections as section, i (i)}
      {#if !section.hide}
        <div class="section-wrapper" style="transition-delay: {i * 100}ms">
          <div class="glass-card">
            <HomeSection bind:opts={section} lastEpisode={isPreviousRSS(i)}/>
          </div>
        </div>
      {/if}
    {/each}
  </div>
</div>