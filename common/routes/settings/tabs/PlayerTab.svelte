<script>
  import { toast } from 'svelte-sonner'
  import FontSelect from 'simple-font-select'
  import ClampedNumber from '@/components/inputs/ClampedNumber.svelte'
  import SettingCard from '@/routes/settings/components/SettingCard.svelte'
  import { playPage } from '@/modules/navigation.js'
  import { SUPPORTS } from '@/modules/support.js'
  import { click } from '@/modules/click.js'
  import { IPC } from '@/modules/bridge.js'
  import { Trash2, Eraser } from 'lucide-svelte'
  export let settings
  export let searchQuery = ''

  $: query = searchQuery.toLowerCase()
  $: matches = (title, description, header = '') => !query || (header.toLowerCase().includes(query) || title.toLowerCase().includes(query) || description.toLowerCase().includes(query))
  $: playerSection = () => matches('Disable Miniplayer', 'miniplayer', 'Player') || matches('Auto-Hide Miniplayer', 'miniplayer shelve', 'Player')
  $: subtitleSection = () => matches('Default Subtitle Font', 'font to use when the current loaded video', 'Subtitle') || matches('Missing Subtitle Fonts', 'finds and loads fonts that are missing', 'Subtitle') || matches('Fast Subtitle Rendering', 'Disables blur when rendering subtitles', 'Subtitle')
  $: subtitleIntSection = () => matches('Jimaku API', 'Jimaku.cc', 'Subtitle') || matches('Subtitle Render Resolution', 'render subtitles at', 'Subtitle')
  $: languageSection = () => matches('Preferred Subtitle Language', 'subtitle language to automatically select', 'Language')
  $: playbackSection = () => matches('Autoplay Next Episode', 'Automatically starts playing next episode', 'Playback') || matches('Pause On Lost Focus', 'Pauses/Resumes video playback when tabbing', 'Playback') || matches('Auto-Complete Episodes', 'Automatically marks episodes as complete', 'Playback') || matches('Deband Video', 'Reduces banding on dark and compressed videos', 'Playback') || matches('Seek Duration', 'skip forward or backward when using the seek buttons', 'Playback') || matches('Chapter Source', 'chapter source to use during video playback', 'Playback') || matches('Auto-Skip Intro', 'automatically skip intro and outro', 'Playback')
  $: externalSection = () => matches('External Player', 'external video player to play video', 'External') || matches('External Video Player', 'Executable for an external video player', 'External')
  $: hasResults = query ? (playerSection() || subtitleSection() || subtitleIntSection() || languageSection() || playbackSection() || externalSection()) : true

  async function changeFont ({ detail }) {
    try {
      const blob = await detail.blob()
      await blob.arrayBuffer()
      settings.font = {
        name: detail.fullName,
        value: detail.postscriptName
      }
      settings.missingFont = true
    } catch (error) {
      console.warn(error)
      toast.error('File Error', {
        description: `${error.message}\n Try using a different font.`,
        duration: 8000
      })
    }
  }
  function removeFont () {
    settings.font = null
  }
  function handleExecutable () {
    IPC.emit('player')
  }
  $: if (!settings.missingFont) removeFont()
</script>

{#if playerSection()}
<h4 class='mb-10 font-weight-bold'>Player Settings</h4>
{#if matches('Disable Miniplayer', 'miniplayer', 'Player')}
<SettingCard title='Disable Miniplayer' description='Disables the built-in Miniplayer, this is not recommended but could be useful for small screens. When utilizing the minimize button on the Miniplayer, this setting is changed automatically.'>
  <div class='custom-switch'>
    <input type='checkbox' id='miniplayer-disabled' bind:checked={$playPage} />
    <label for='miniplayer-disabled'>{$playPage ? 'On' : 'Off'}</label>
  </div>
</SettingCard>
{/if}
{#if !$playPage}
{#if matches('Auto-Hide Miniplayer', 'miniplayer shelve', 'Player')}
<SettingCard title='Auto-Hide Miniplayer' description='When enabled, the miniplayer will automatically shelve itself when playback is paused and unshelve when hovered or focused. When disabled, you can manually shelve and unshelve the miniplayer by clicking, tapping or swiping. Whether enabled or disabled the miniplayer will always unshelve itself when playback resumes.'>
  <div class='custom-switch'>
    <input type='checkbox' id='autohide-miniplayer' bind:checked={settings.autoHideMiniplayer} />
    <label for='autohide-miniplayer'>{settings.autoHideMiniplayer ? 'On' : 'Off'}</label>
  </div>
</SettingCard>
{/if}
{/if}
{/if}

{#if subtitleSection()}
<h4 class='mb-10 font-weight-bold'>Subtitle Settings</h4>
{#if ('queryLocalFonts' in self)}
{#if matches('Default Subtitle Font', 'font to use when the current loaded video', 'Subtitle')}
<SettingCard title='Default Subtitle Font' description={"What font to use when the current loaded video doesn't provide or specify one.\nThis uses fonts installed on your OS."}>
  <div class='input-group w-400 mw-full'>
    <FontSelect class='form-control bg-dark w-300 mw-full text-truncate' on:change={changeFont} value={settings.font?.name ?? 'Roboto Medium'} />
    <div class='input-group-append'>
      <button type='button' use:click={() => removeFont()} class='btn btn-danger btn-square input-group-append px-5 d-flex align-items-center'><Trash2 size='1.8rem' /></button>
    </div>
  </div>
</SettingCard>
{/if}
{#if matches('Missing Subtitle Fonts', "finds and loads fonts that are missing", 'Subtitle')}
<SettingCard title='Find Missing Subtitle Fonts' description="Automatically finds and loads fonts that are missing from a video's subtitles.">
  <div class='custom-switch'>
    <input type='checkbox' id='player-missingFont' bind:checked={settings.missingFont} />
    <label for='player-missingFont'>{settings.missingFont ? 'On' : 'Off'}</label>
  </div>
</SettingCard>
{/if}
{/if}
{#if matches('Fast Subtitle Rendering', 'Disables blur when rendering subtitles', 'Subtitle')}
<SettingCard title='Fast Subtitle Rendering' description='Disables blur when rendering subtitles reducing lag. Will cause text and subtitle edges to appear sharper and in rare cases might break styling. If you want better rendering speeds without sacrificing accuracy lower the render resolution limit.'>
  <div class='custom-switch'>
    <input type='checkbox' id='player-sub-blur' bind:checked={settings.disableSubtitleBlur} />
    <label for='player-sub-blur'>{settings.disableSubtitleBlur ? 'On' : 'Off'}</label>
  </div>
</SettingCard>
{/if}
{/if}

{#if subtitleIntSection()}
<h4 class='mb-10 font-weight-bold'>Subtitle Integrations</h4>
{#if matches('Jimaku API', 'Jimaku.cc', 'Subtitle')}
<SettingCard title='Jimaku API Key' description='API Key for Jimaku.cc. This enables the app to fetch japanese subtitles for your media.'>
  <input type='text' class='form-control bg-dark mw-100 w-300 mw-full' placeholder='Enter API Key' bind:value={settings.jimakuKey} />
</SettingCard>
{/if}
{#if matches('Subtitle Render Resolution', 'render subtitles at', 'Subtitle')}
<SettingCard title='Subtitle Render Resolution Limit' description="Max resolution to render subtitles at. If your resolution is higher than this setting the subtitles will be upscaled lineary. This will GREATLY improve rendering speeds for complex typesetting for slower devices. It's best to lower this on mobile devices which often have high pixel density where their effective resolution might be ~1440p while having small screens and slow processors.">
  <select class='form-control bg-dark mw-150 w-150 text-truncate' bind:value={settings.subtitleRenderHeight}>
    <option value='0' selected>None</option>
    <option value='1440'>1440p</option>
    <option value='1080'>1080p</option>
    <option value='720'>720p</option>
    <option value='480'>480p</option>
  </select>
</SettingCard>
{/if}
{/if}

{#if languageSection()}
<h4 class='mb-10 font-weight-bold'>Language Settings</h4>
{#if matches('Preferred Subtitle Language', 'subtitle language to automatically select', 'Language')}
<SettingCard title='Preferred Subtitle Language' description="What subtitle language to automatically select when a video is loaded if it exists. This won't find sources with this language automatically. If not found defaults to English.">
  <select class='form-control bg-dark mw-220 w-220 text-truncate' bind:value={settings.subtitleLanguage}>
    <option value=''>None</option>
    <option value='eng' selected>English</option>
    <option value='jpn'>Japanese</option>
    <option value='chi'>Chinese</option>
    <option value='por'>Portuguese</option>
    <option value='spa'>Spanish (Spain)</option>
    <option value='lat'>Spanish (Latin America)</option>
    <option value='ger'>German</option>
    <option value='pol'>Polish</option>
    <option value='cze'>Czech</option>
    <option value='dan'>Danish</option>
    <option value='gre'>Greek</option>
    <option value='fin'>Finnish</option>
    <option value='fre'>French</option>
    <option value='hun'>Hungarian</option>
    <option value='ita'>Italian</option>
    <option value='kor'>Korean</option>
    <option value='dut'>Dutch</option>
    <option value='nor'>Norwegian</option>
    <option value='rum'>Romanian</option>
    <option value='rus'>Russian</option>
    <option value='slo'>Slovak</option>
    <option value='swe'>Swedish</option>
    <option value='ara'>Arabic</option>
    <option value='idn'>Indonesian</option>
  </select>
</SettingCard>
{/if}
{/if}

{#if playbackSection()}
<h4 class='mb-10 font-weight-bold'>Playback Settings</h4>
{#if matches('Autoplay Next Episode', 'Automatically starts playing next episode', 'Playback')}
<SettingCard title='Autoplay Next Episode' description='Automatically starts playing next episode when a video ends.'>
  <div class='custom-switch'>
    <input type='checkbox' id='player-autoplay' bind:checked={settings.playerAutoplay} />
    <label for='player-autoplay'>{settings.playerAutoplay ? 'On' : 'Off'}</label>
  </div>
</SettingCard>
{/if}
{#if matches('Pause On Lost Focus', 'Pauses/Resumes video playback when tabbing', 'Playback')}
<SettingCard title='Pause On Lost Focus' description='Pauses/Resumes video playback when tabbing in/out of the app.'>
  <div class='custom-switch'>
    <input type='checkbox' id='player-pause' bind:checked={settings.playerPause} />
    <label for='player-pause'>{settings.playerPause ? 'On' : 'Off'}</label>
  </div>
</SettingCard>
{/if}
{#if matches('Auto-Complete Episodes', 'Automatically marks episodes as complete', 'Playback')}
<SettingCard title='Auto-Complete Episodes' description='Automatically marks episodes as complete on AniList or MyAnimeList when you finish watching them. You must be logged in.'>
  <div class='custom-switch'>
    <input type='checkbox' id='player-autocomplete' bind:checked={settings.playerAutocomplete} />
    <label for='player-autocomplete'>{settings.playerAutocomplete ? 'On' : 'Off'}</label>
  </div>
</SettingCard>
{/if}
{#if settings.playerAutocomplete}
{#if matches('Auto-Complete Threshold', 'percentage of an episode that must be watched', 'Playback')}
<SettingCard title='Auto-Complete Threshold' description='The percentage of an episode that must be watched before it is automatically marked as complete. A higher value means more of the episode must be watched.'>
  <div class='input-group w-100 mw-full'>
    <ClampedNumber bind:bindTo={settings.playerAutocompleteThreshold} min={1} max={100} class='form-control text-right bg-dark'/>
    <div class='input-group-append'>
      <span class='input-group-text bg-dark'>%</span>
    </div>
  </div>
</SettingCard>
{/if}
{/if}
{#if matches('Deband Video', 'Reduces banding on dark and compressed videos', 'Playback')}
<SettingCard title='Deband Video' description='Reduces banding on dark and compressed videos. High performance impact, not recommended for high quality videos.'>
  <div class='custom-switch'>
    <input type='checkbox' id='player-deband' bind:checked={settings.playerDeband} />
    <label for='player-deband'>{settings.playerDeband ? 'On' : 'Off'}</label>
  </div>
</SettingCard>
{/if}
{#if matches('Seek Duration', 'skip forward or backward when using the seek buttons', 'Playback')}
<SettingCard title='Seek Duration' description='Seconds to skip forward or backward when using the seek buttons or keyboard shortcuts. Higher values might negatively impact buffering speeds.'>
  <div class='input-group w-100 mw-full'>
    <ClampedNumber bind:bindTo={settings.playerSeek} min={0.2} max={360} step={0.1} class='form-control text-right bg-dark'/>
    <div class='input-group-append'>
      <span class='input-group-text bg-dark'>sec</span>
    </div>
  </div>
</SettingCard>
{/if}
{#if matches('Chapter Source', 'chapter source to use during video playback', 'Playback')}
<SettingCard title='Chapter Source Preference' description={"The chapter source to use during video playback. If your preferred source isn't available, another source will be used automatically."}>
  <select class='form-control bg-dark mw-150 w-150 text-truncate' bind:value={settings.playerChapterSkip}>
    <option value='embedded' selected>Embedded</option>
    <option value='aniskip'>Aniskip</option>
  </select>
</SettingCard>
{/if}
{#if matches('Auto-Skip Intro', 'automatically skip intro and outro', 'Playback')}
<SettingCard title='Auto-Skip Intro/Outro' description='Attempt to automatically skip intro and outro. This WILL sometimes skip incorrect chapters, as some of the chapter data is community sourced.'>
  <div class='custom-switch'>
    <input type='checkbox' id='player-skip' bind:checked={settings.playerSkip} />
    <label for='player-skip'>{settings.playerSkip ? 'On' : 'Off'}</label>
  </div>
</SettingCard>
{/if}
{/if}

{#if externalSection()}
<h4 class='mb-10 font-weight-bold'>External Player Settings</h4>
{#if matches('External Player', 'external video player to play video', 'External')}
<SettingCard title='Enable External Player' description='Tells Shiru to open a custom user-picked external video player to play video, instead of using the built-in one.'>
  <div class='custom-switch'>
    <input type='checkbox' id='player-external-enabled' bind:checked={settings.enableExternal} />
    <label for='player-external-enabled'>{settings.enableExternal ? 'On' : 'Off'}</label>
  </div>
</SettingCard>
{/if}
{#if SUPPORTS.externalPlayer}
{#if matches('External Video Player', 'Executable for an external video player', 'External')}
<SettingCard title='External Video Player' description='Executable for an external video player. Make sure the player supports HTTP sources.'>
  <div class='input-group mw-100 w-400 mw-full'>
    <div class='input-group-prepend'>
      <button type='button' use:click={handleExecutable} class='btn btn-primary input-group-append d-flex align-items-center justify-content-center'><span>Select Executable</span></button>
    </div>
    <input type='url' class='form-control bg-dark text-truncate mw-100' readonly value={settings.playerPath} placeholder='Choose an executable…' />
    <div class='input-group-prepend'>
      <button type='button' use:click={() => settings.playerPath = ''} disabled={!settings.playerPath} class='btn btn-danger btn-square input-group-append px-5 d-flex align-items-center' title='Reset Location'><Eraser size='1.8rem' /></button>
    </div>
  </div>
</SettingCard>
{/if}
{/if}
{/if}
{#if query && !hasResults}
<p class='text-muted text-center py-20' style='margin-top: 5rem'>No settings found for "{searchQuery}"</p>
{/if}