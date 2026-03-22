<script context='module'>
  import { click } from '@/modules/click.js'
  import { cache, caches } from '@/modules/cache.js'
  import { SUPPORTS } from '@/modules/support.js'
  import { IPC, VERSION } from '@/modules/bridge.js'

  async function importSettings () {
    try {
      const settings = JSON.parse(await navigator.clipboard.readText())
      await cache.write(caches.GENERAL, 'settings', settings)
      location.reload()
    } catch (error) {
      toast.error('Failed to import settings', {
        description: 'Failed to import settings from clipboard, make sure the copied data is valid JSON.',
        duration: 5_000
      })
    }
  }

  IPC.on('log-exported', detail => {
    if (detail.error) {
      toast.error('Log Not Saved', {
        description: 'Failed to save the log file to the selected location',
        duration: 10_000
      })
    } else {
      toast.success('Log Saved', {
        description: 'The log file has been saved to the selected location',
        duration: 5_000
      })
    }
  })
  IPC.on('log-reset', detail => {
    if (detail.success) {
      toast.success('Logs Reset', {
        description: 'The log file has successfully been reset',
        duration: 5_000
      })
    } else {
      toast.error('Log Not Reset', {
        description: 'Failed to reset the log file',
        duration: 10_000
      })
    }
  })
</script>
<script>
  import { persisted } from 'svelte-persisted-store'
  import { capitalize, defaults } from '@/modules/util.js'
  import { onDestroy } from 'svelte'
  import { updateState } from '@/modals/UpdateModal.svelte'
  import { platformMap } from '@/routes/settings/SettingsPage.svelte'
  import SettingCard from '@/routes/settings/components/SettingCard.svelte'
  import ChangelogTab from '@/routes/settings/tabs/ChangelogTab.svelte'
  import ConfirmButton from '@/components/inputs/ConfirmButton.svelte'
  import { modal } from '@/modules/navigation.js'
  import WPC from '@/modules/wpc.js'
  import { copyToClipboard } from '@/modules/clipboard.js'
  import { toast } from 'svelte-sonner'
  import semver from 'semver'
  import Debug from 'debug'
  const debugStore = persisted('debug', '', { serializer: { parse: e => e, stringify: e => e }})
  const debug = Debug('ui:app-settings')
  let debugPrev = null

  export let version = ''
  export let settings
  export let searchQuery = ''

  $: query = searchQuery.toLowerCase()
  $: matches = (title, description) => !query || (title.toLowerCase().includes(query) || description.toLowerCase().includes(query))
  $: appSection = () => !query ? true : query.includes('about') || query.includes('update') || query.includes('exit') || query.includes('notification') || query.includes('history') || query.includes('cache') || query.includes('import') || query.includes('export') || query.includes('query') || query.includes('reset') || query.includes('settings') || query.includes('channel') || query.includes('version') || query.includes('nightly') || query.includes('stable')
  $: debugSection = () => !query ? true : query.includes('debug') || query.includes('log') || query.includes('toast') || query.includes('info') || query.includes('devtools') || query.includes('torrent') || query.includes('memory') || query.includes('performance') || query.includes('level')
  export let hasResults = true
  $: hasResults = query ? (appSection() || debugSection()) : true

  function resetSettings () {
    IPC.emit('set:angle', defaults.angle)
    cache.resetSettings()
  }

  function updateDebug (debug) {
    Debug.disable()
    if (debug) Debug.enable(debug)
    WPC.send('debug', debug)
  }

  $: updateDebug($debugStore)

  let unsubscribeDebug
  unsubscribeDebug = debugStore.subscribe(value => {
    if (value && debugPrev === '') setTimeout(() => debug('Current Settings: ', JSON.stringify(settings)))
    debugPrev = value
  })

  onDestroy(() => {
    unsubscribeDebug()
    IPC.off('device-info', writeAppInfo)
  })

  function writeAppInfo (info) {
    const deviceInfo = JSON.parse(info)
    deviceInfo.appInfo = {
      version,
      platform: VERSION.platform,
      userAgent: navigator.userAgent,
      support: SUPPORTS,
      settings
    }
    copyToClipboard(JSON.stringify(deviceInfo, null, 2), 'device info')
  }

  IPC.on('device-info', writeAppInfo)
</script>

{#if appSection()}
<h4 class='mb-10 font-weight-bold'>App Settings</h4>
{/if}
{#if matches('About This App', 'Restart may be required')}
<SettingCard title='About This App' description="Restart may be required for some settings to take effect. If you don't know what settings do what, use defaults." class='d-lg-none'>
  <div class='d-flex flex-column'>
    <span class='text-nowrap'>{version ? `v${version} ${semver.prerelease(version) ? `(Nightly)` : ``}` : ``} {platformMap[VERSION.platform] || 'dev'} {VERSION.arch || 'dev'} {capitalize(VERSION.session) || ''}</span>
    <button type='button' use:click={() => { toast('Update is downloading...', { description: 'This may take a moment, the update will be ready shortly.' }) }} class='btn btn-primary mt-5 d-none align-items-center justify-content-center' style='background-color: var(--tertiary-color-light);' class:d-flex={$updateState === 'downloading'}><span class='text-truncate'>Update Downloading...</span></button>
    <button type='button' use:click={() => { if ($updateState !== 'ready') updateState.set('ready'); else modal.open(modal.UPDATE_PROMPT) }} class='btn btn-primary mt-5 d-none align-items-center justify-content-center bg-success-light' class:d-flex={$updateState === 'ready' || $updateState === 'ignored' || $updateState === 'aborted'}><span class='text-truncate'>Update Available!</span></button>
  </div>
</SettingCard>
{/if}
{#if matches('Update Channel', 'type of updates you receive')}
<SettingCard title='Update Channel' description={'Choose which type of updates you receive. Stable provides tested releases only, while Nightly includes frequent pre-release builds with the latest features and fixes but may include bugs.\n\nOnce you switch to Nightly and update you cannot downgrade back to the previous stable release. Nightly users automatically receive stable updates when available.'}>
  <div>
    <select class='form-control bg-dark mw-150 w-150 text-truncate' bind:value={settings.updateChannel}>
      <option value='stable'>Stable</option>
      <option value='nightly'>Nightly (Beta)</option>
    </select>
  </div>
</SettingCard>
{/if}
{#if !SUPPORTS.isAndroid}
{#if matches('Exit Action', 'functionality of the close button')}
<SettingCard title='Exit Action' description='Choose the functionality of the close button for the app. You can choose to receive a Prompt to Minimize or Exit, default to Minimize, or default to Exiting the app.'>
  <div>
    <select class='form-control bg-dark mw-150 w-150 text-truncate' bind:value={settings.closeAction}>
      <option value='Prompt'>Prompt</option>
      <option value='Minimize'>Minimize</option>
      <option value='Close'>Exit</option>
    </select>
  </div>
</SettingCard>
{/if}
{/if}

<ChangelogTab {version} class='d-lg-none' />