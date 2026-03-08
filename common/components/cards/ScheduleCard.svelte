<script>
  import { onMount, onDestroy } from 'svelte'
  import { airingAt, getAiringInfo } from '@/modules/anime/anime.js'
  import { click } from '@/modules/click.js'
  import SmartImage from '@/components/visual/SmartImage.svelte'
  import { anilistClient } from '@/modules/anilist.js'
  import { mediaCache } from '@/modules/cache.js'
  import { modal } from '@/modules/navigation.js'
  import { getAccentColor } from '@/modules/color.js'
  import { settings } from '@/modules/settings.js'
  import { Smile, Heart } from 'lucide-svelte'

  export let data, variables = null, resolvedView = null

  const SOURCE_LABELS = { MANGA:'Manga', LIGHT_NOVEL:'Light Novel', ORIGINAL:'Original', VISUAL_NOVEL:'Visual Novel', VIDEO_GAME:'Video Game', OTHER:'Other', NOVEL:'Novel', DOUJINSHI:'Doujinshi', ANIME:'Anime', WEB_MANGA:'Web Manga' }
  const WATCH_STATUS_LABELS = { CURRENT:'Watching', PLANNING:'Plan to Watch', COMPLETED:'Completed', DROPPED:'Dropped', PAUSED:'Paused', REPEATING:'Rewatching' }
  const WATCH_STATUS_COLORS = { CURRENT:'#2edf82', PLANNING:'#5ba4f5', COMPLETED:'#888', DROPPED:'#ff3d64', PAUSED:'#f5a623', REPEATING:'#a78bfa' }

  let media = data, airingInterval = null, _airingAt = null, mouseX = 0, mouseY = 0

  $: if (data && !data.__dayHeader) media = data

  const unsubCache = mediaCache.subscribe(v => {
    if (v?.[media?.id] && JSON.stringify(v[media.id]) !== JSON.stringify(media)) media = v[media.id]
  })

  $: activeView  = (resolvedView ?? $settings.scheduleView ?? 'grid') === 'auto' ? 'grid' : (resolvedView ?? $settings.scheduleView ?? 'grid')
  $: isTextView  = activeView === 'list' || activeView === 'agenda'
  $: airingInfo  = getAiringInfo(_airingAt)
  $: mediaColor  = media?.coverImage?.color || '#333344'
  $: accentColor = getAccentColor(mediaColor)
  $: episodeInfo = (_airingAt?.time && typeof _airingAt.time !== 'string') ? { episode: airingInfo?.episode || 'Ep 1', time: airingInfo?.time || '' } : null
  $: ranking     = media?.popularity   ? '#' + media.popularity : null
  $: rating      = media?.averageScore ? Math.round(media.averageScore / 10) * 10 : null
  $: sequelInfo  = media?.relations?.edges?.find(e => e.relationType === 'SEQUEL')?.node?.title?.userPreferred
  $: sourceInfo  = SOURCE_LABELS[media?.source] ?? null
  $: watchStatus = media?.mediaListEntry?.status ?? null

  onMount(() => {
  /** @type {any} */
  const v = variables;
  _airingAt = media && v?.scheduleList && airingAt(media, v);
  if (v?.scheduleList) {
    airingInterval = setInterval(() => { airingInfo = getAiringInfo(_airingAt) }, 60_000);
  }
});

onDestroy(() => { if (airingInterval) clearInterval(airingInterval); unsubCache(); });

const viewMedia = () => {
  /** @type {any} */
  const v = variables;
  return v?.fileEdit ? v.fileEdit(media) : modal.open(modal.ANIME_DETAILS, media);
};

const onMouseMove = e => { mouseX = e.clientX; mouseY = e.clientY };
</script>

{#if data?.__dayHeader}
  <div class='day-header-label' id='day-col-{data.day}'>{data.day}</div>
{:else}
<div class='schedule-card-ct' class:view-grid={activeView === 'grid'} class:view-compact={activeView === 'compact'} class:view-text={isTextView} on:mousemove={onMouseMove} use:click={viewMedia}>
  <div class='schedule-card pointer load-in' style='--media-color:{mediaColor};--accent-color:{accentColor}'>
    <div class='img-col'>
      <a href='https://anilist.co/anime/{media?.id}' target='_blank' rel='noopener noreferrer' class='cover-link'>
        <SmartImage class='cover-img' images={[media?.coverImage?.extraLarge, media?.coverImage?.medium, './404_cover.png']}/>
      </a>
      <div class='cover-meta'>
        <span class='cover-title'>{anilistClient.title(media)}</span>
        {#if media?.studios?.nodes?.[0]}<span class='cover-studio'>{media.studios.nodes[0].name}</span>{/if}
      </div>
    </div>
    <div class='content-col'>
      <div class='mobile-title'>{anilistClient.title(media)}</div>
      <div class='top-row'>
        <div class='airing-block'>
          <div class='episode-label'>{episodeInfo?.episode ?? 'Upcoming'}</div>
          <div class='countdown'>{episodeInfo?.time ?? 'TBA'}</div>
        </div>
        <div class='stats-col'>
          {#if watchStatus && WATCH_STATUS_LABELS[watchStatus]}
            <div class='watch-chip' style='--chip-color:{WATCH_STATUS_COLORS[watchStatus]}'>{WATCH_STATUS_LABELS[watchStatus]}</div>
          {/if}
          {#if rating}
            <div class='stat-row'><Smile class='stat-icon stat-icon--score' size={18} strokeWidth={2} /><span class='stat-val'>{rating}%</span></div>
          {/if}
          {#if ranking}
            <div class='stat-row'><Heart class='stat-icon stat-icon--rank' size={18} strokeWidth={2} /><span class='stat-val'>{ranking}</span></div>
          {/if}
        </div>
      </div>
      {#if sequelInfo}<div class='subtitle'>Sequel to {sequelInfo}</div>
      {:else if sourceInfo}<div class='subtitle'>Source • {sourceInfo}</div>{/if}
      {#if media?.description}
        <div class='description-wrap'><p class='description'>{media.description.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()}</p></div>
      {/if}
      {#if media?.genres?.length}
        <div class='genres'>{#each media.genres.slice(0, 3) as genre}<span class='genre'>{genre}</span>{/each}</div>
      {/if}
    </div>
  </div>
  <div class='text-hover-art' style='left:{mouseX + 24}px;top:{mouseY - 220}px'>
    <SmartImage class='text-hover-img' images={[media?.coverImage?.extraLarge, media?.coverImage?.medium, './404_cover.png']}/>
  </div>
</div>
{/if}

<style>
  .schedule-card-ct { display:flex; justify-content:flex-start; padding:0.7rem 0.5rem; position:relative; width:100%; }
  .schedule-card-ct:hover { z-index:30; }
  .schedule-card { display:flex; flex-direction:row; width:52rem; height:36rem; border-radius:0.8rem; overflow:hidden; background:hsl(var(--dark-color-light-hsl)); border:1px solid var(--border-color-sp); box-shadow:0 2px 16px rgba(0,0,0,0.4); transition:transform 0.18s,box-shadow 0.18s; }
  .schedule-card:hover { transform:translateY(-2px); box-shadow:0 8px 28px rgba(0,0,0,0.55); }

  .img-col { display:flex; flex-direction:column; flex:0 0 26.5rem; width:26.5rem; background:hsl(var(--dark-color-dim-hsl)); }
  .cover-link { display:block; flex:1; overflow:hidden; min-height:0; }
  .cover-link :global(.cover-img) { width:100%; height:100%; object-fit:cover; display:block; transition:transform 0.3s; }
  .schedule-card:hover .cover-link :global(.cover-img) { transform:scale(1.04); }
  .cover-meta { flex-shrink:0; padding:0.8rem 1rem 0.9rem; background:hsl(var(--dark-color-very-dim-hsl)); border-top:1px solid var(--border-color-sp); display:flex; flex-direction:column; gap:0.25rem; }
  .cover-title { font-size:1.65em; font-weight:800; color:#fff; display:-webkit-box; line-height:1.3; letter-spacing:-0.01em; }
  .cover-studio { font-size:0.95em; font-weight:500; color:var(--accent-color); letter-spacing:0.06em; text-transform:uppercase; opacity:0.85; }

  .content-col { flex:1; display:flex; flex-direction:column; padding:1.4rem 1.1rem 1.2rem; min-width:0; }
  .top-row { display:flex; justify-content:space-between; align-items:flex-start; gap:1rem; }
  .airing-block { display:flex; flex-direction:column; gap:0.05rem; }
  .episode-label { font-size:0.9em; font-weight:500; color:rgba(190,190,210,0.35); letter-spacing:0.08em; text-transform:uppercase; }
  .countdown { font-size:2.4em; font-weight:900; color:var(--accent-color); line-height:1.4; letter-spacing:-0.03em; }
  .stats-col { display:flex; flex-direction:column; align-items:flex-end; gap:0.45rem; padding-top:0.15rem; flex-shrink:0; }
  .stat-row { display:flex; align-items:center; gap:0.4rem; }
  .stat-icon { width:2rem; height:2rem; flex-shrink:0; opacity:0.9; }
  :global(.stat-icon--score) { color:#2edf82; }
  :global(.stat-icon--rank)  { color:#ff3d64; }
  .watch-chip { font-size:0.75em; font-weight:700; text-transform:uppercase; letter-spacing:0.07em; color:var(--chip-color); border:1px solid var(--chip-color); border-radius:10rem; padding:0.2rem 0.6rem; opacity:0.9; white-space:nowrap; }
  .stat-val { font-size:1.35em; font-weight:700; color:rgba(255,255,255,0.92); letter-spacing:-0.01em; }
  .mobile-title { display:none; }
  .subtitle { font-size:0.85em; font-weight:400; color:rgba(190,190,210,0.25); margin-top:1.6rem; letter-spacing:0.01em; }
  .description-wrap { flex:1; overflow:hidden; max-height:10rem; margin-top:0.25rem; mask-image:linear-gradient(to bottom,black 40%,transparent 100%); -webkit-mask-image:linear-gradient(to bottom,black 40%,transparent 100%); }
  .description { margin:0; font-size:1.1em; font-weight:300; line-height:1.75; color:rgba(205,205,220,0.45); }
  .genres { display:flex; flex-wrap:wrap; gap:0.55rem; margin-top:auto; padding-top:0.7rem; border-top:1px solid rgba(255,255,255,0.06); }
  .genre { background:var(--media-color); color:rgba(255,255,255,0.9); padding:0.28rem 0.8rem; border-radius:10rem; font-size:0.9em; font-weight:600; letter-spacing:0.03em; text-transform:uppercase; opacity:0.82; }
  .day-header-label { width:100%; padding:1.6rem 1.2rem 0.5rem; font-size:1.05em; font-weight:700; color:rgba(190,190,210,0.45); text-transform:uppercase; letter-spacing:0.12em; scroll-margin-top:70px; }

  /* grid */
  :global(.view-grid) .schedule-card { width:var(--card-w,38rem); height:var(--card-h,32rem); }
  :global(.view-grid) .img-col { flex:0 0 var(--card-img,17rem); width:var(--card-img,17rem); }

  /* compact */
  :global(.view-compact).schedule-card-ct { padding:0.5rem 0.6rem; }
  :global(.view-compact) .schedule-card { width:100%; height:var(--compact-h,auto); flex-direction:row; align-items:center; border-radius:0.7rem; }
  :global(.view-compact) .img-col { flex:0 0 var(--compact-img,80px); width:var(--compact-img,80px); height:var(--compact-card-h,110px); border-radius:6px 0 0 6px; }
  :global(.view-compact) .cover-link { flex:1; height:100%; }
  :global(.view-compact) .cover-meta, :global(.view-compact) .stats-col, :global(.view-compact) .subtitle, :global(.view-compact) .description-wrap, :global(.view-compact) .genres { display:none; }
  :global(.view-compact) .content-col { padding:0.75em 0.875em; gap:0.25em; justify-content:center; }
  :global(.view-compact) .top-row { flex-direction:column; gap:0; }
  :global(.view-compact) .airing-block { flex-direction:row; align-items:baseline; gap:0.375em; }
  :global(.view-compact) .episode-label, :global(.view-compact) .countdown { font-size:0.875em; color:rgba(190,190,210,0.55); letter-spacing:0; text-transform:none; line-height:1.3; }
  :global(.view-compact) .countdown { font-weight:400; }
  :global(.view-compact) .mobile-title { display:block; font-size:0.9375em; font-weight:700; color:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-bottom:0.25em; line-height:1.2; }

  /* text / agenda / list */
  :global(.view-text).schedule-card-ct { padding:0.25rem 0.4rem; }
  :global(.view-text) .schedule-card { width:100%; height:auto; flex-direction:row; align-items:center; border-radius:0.6rem; }
  :global(.view-text) .img-col { display:none; }
  :global(.view-text) .content-col { flex-direction:row; align-items:center; padding:0.5em 0.75em; gap:0.625em; }
  :global(.view-text) .mobile-title { display:block; flex:1; min-width:0; font-size:0.84em; font-weight:700; color:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-bottom:0; line-height:1.2; }
  :global(.view-text) .top-row { flex-direction:row; align-items:center; gap:0.375em; flex-shrink:0; }
  :global(.view-text) .airing-block { flex-direction:row; align-items:baseline; gap:0.25em; }
  :global(.view-text) .episode-label { font-size:0.69em; color:rgba(190,190,210,0.38); letter-spacing:0; text-transform:none; }
  :global(.view-text) .countdown { font-size:0.75em; font-weight:600; color:var(--accent-color); line-height:1.2; letter-spacing:0; }
  :global(.view-text) .stats-col, :global(.view-text) .subtitle, :global(.view-text) .description-wrap, :global(.view-text) .genres { display:none; }

  /* hover art */
  .text-hover-art { display:none; }
  :global(.view-text) .text-hover-art { display:block; position:fixed; width:200px; height:285px; border-radius:0.7rem; overflow:hidden; box-shadow:0 8px 32px rgba(0,0,0,0.75); opacity:0; pointer-events:none; z-index:9999; transition:opacity 0.15s,transform 0.15s; transform:scale(0.92); }
  :global(.view-text) .text-hover-art :global(.text-hover-img) { width:100%; height:100%; object-fit:cover; display:block; }
  :global(.view-text).schedule-card-ct:hover .text-hover-art { opacity:1; transform:scale(1); }

  @media (max-width:700px) {
    .schedule-card-ct { padding:0.5rem 0.6rem; }
    .schedule-card { width:100%; height:auto; flex-direction:row; align-items:center; border-radius:0.7rem; }
    .img-col { flex:0 0 5em; width:5em; height:6.875em; border-radius:6px 0 0 6px; }
    .cover-link { flex:1; height:100%; }
    .cover-meta, .stats-col, .subtitle, .description-wrap, .genres { display:none; }
    .content-col { padding:0.75em 0.875em; gap:0.25em; justify-content:center; }
    .top-row { flex-direction:column; gap:0; }
    .airing-block { flex-direction:row; align-items:baseline; gap:0.375em; }
    .episode-label, .countdown { font-size:0.875em; color:rgba(190,190,210,0.55); letter-spacing:0; text-transform:none; line-height:1.3; }
    .countdown { font-weight:400; }
    .cover-title, .mobile-title { display:block; font-size:0.9375em; font-weight:700; color:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-bottom:0.25em; line-height:1.2; }
  }
</style>