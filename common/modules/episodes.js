import { cache, caches } from '@/modules/cache.js'
import { getKitsuMappings } from '@/modules/anime/anime.js'
import { codes, getRandomInt, sleep, isValidNumber } from '@/modules/util.js'
import { printError, status, isOffline } from '@/modules/networking.js'
import Bottleneck from 'bottleneck'
import Debug from 'debug'
const debug = Debug('ui:episodes')

/*
 * MAL Episode Information
 * Primary source: api.tenrai.org (v1)
 * Fallback / dub info: kitsu.app JSON:API
 * NOTE: api.jikan.moe is deprecated here — kept commented for reference only.
 */
class Episodes {
    limiter = new Bottleneck({
        reservoir: 60,
        reservoirRefreshAmount: 60,
        reservoirRefreshInterval: 60 * 1000,
        maxConcurrent: 3,
        minTime: 333
    })

    rateLimitPromise = null
    concurrentRequests = new Map()

    constructor() {
        this.limiter.on('failed', async (error) => {
            let info = error
            try { info = (await error.json()) || error } catch { /* body already consumed */ }
            if (await isOffline(info)) throw new Error('Failed making episode request, network is offline... not retrying.')
            if (info?.status === 500) return 1

            const time = (((error?.headers?.get?.('retry-after')) || 2) + 1) * 1000
            if (!this.rateLimitPromise) this.rateLimitPromise = sleep(time).then(() => { this.rateLimitPromise = null })
            return time
        })
    }

    async getEpisodeData(idMal) {
        if (!idMal) return []
        const res = await this.requestEpisodes('tenrai', idMal, 1)
        if (res && res.pagination?.has_next_page && res.pagination?.last_visible_page) {
            const lastRes = await this.requestEpisodes('tenrai', idMal, res.pagination.last_visible_page * 100)
            return (lastRes?.data || []).map(this.mapEpisode)
        }
        return (res?.data || []).map(this.mapEpisode)
    }

    async getSingleEpisode(idMal, episode) {
        if (!idMal) return []
        const ep = Number(episode || 1) !== 0 ? (episode || 1) : 1
        const res = await this.requestEpisodes('tenrai', idMal, ep)
        const singleEpisode = res?.data?.find(e => (e.mal_id === ep) || (e.mal_id === Number(ep)))
        return singleEpisode ? this.mapEpisode(singleEpisode) : []
    }

    async getKitsuEpisodes(id) {
        const mappings = await getKitsuMappings(id)
        const kitsuId = mappings?.data?.[0]?.relationships?.data?.id || mappings?.included?.[0]?.id
        if (!kitsuId) return null
        const res = await this.requestEpisodes('kitsu', kitsuId, 1)
        return res?.data ? this.normalizeKitsuEpisodes(res) : null
    }

    async getMedia(idMal) {
        if (!idMal) return []
        return this.requestEpisodes('tenrai', idMal, 1, true)
    }

    // Tenrai / Jikan-shaped episode -> internal shape
    mapEpisode(e) {
        return {
            filler: e.filler,
            recap: e.recap,
            episode_id: e.mal_id, // mal_id is the episode_id in the v4 API very stupid
            title: e.title || e.title_romanji || e.title_japanese,
            aired: e.aired,
        }
    }

    // Kitsu JSON:API episode -> internal shape
    normalizeKitsuEpisodes(json) {
        return (json?.data || []).map(e => ({
            filler: false,
            recap: false,
            episode_id: e.attributes?.number ?? null,
            title: e.attributes?.canonicalTitle || e.attributes?.titles?.en_jp || e.attributes?.titles?.en || '',
            aired: e.attributes?.airdate || null,
        }))
    }

    handleArray(episodes, fileName) {
        const episodeArray  = (Array.isArray(episodes) && episodes?.length && episodes)
        const fileMatch = !episodeArray && fileName?.match(/(?<!Part\s)(?<!Cour\s)\b(\d+)\s*[-~]\s*(\d+)\b/i)?.slice(1)?.map(n => +n.trim())?.filter(n => isValidNumber(n))
        const episodeParts = episodeArray
            || (typeof episodes === 'string' && episodes.match(/^\d+\s*~\s*\d+$/) && episodes.split(/~\s*/)?.map(n => +n.trim())?.filter(n => isValidNumber(n)))
            || (fileMatch?.length && fileMatch)
        if (episodeParts?.length && ((Number(episodeParts[0]) || episodeParts[0]) < (Number(episodeParts[1]) || episodeParts[1])))
            return { first: (Number(episodeParts[0]) || episodeParts[0]), last: (Number(episodeParts[1]) || episodeParts[1]) }
        return null
    }

    /**
     * @param {'tenrai'|'kitsu'} source
     */
    async requestEpisodes(source = 'tenrai', id, episode, root) {
        const page = Math.ceil(episode / 100)
        const key = `${source}:${id}:${page}:${root}`
        const cachedEntry = cache.cachedEntry(caches.EPISODES, key, status.value === 'offline')
        if (cachedEntry) return cachedEntry
        else if (status.value === 'offline') return
        if (this.concurrentRequests.has(key)) return this.concurrentRequests.get(key)

        const requestPromise = this.limiter.wrap(async () => {
            await this.rateLimitPromise
            debug(`Fetching Episode ${episode} for ${id} (${source}) with Page ${page}`)

            let url
            if (source === 'kitsu') {
                url = `https://kitsu.app/api/edge/anime/${id}/episodes`
            } else {
                // tenrai (primary)
                url = `https://api.tenrai.org/v1/anime/${id}${!root ? `/episodes?page=${page}` : ``}`
            }
            // jikan (deprecated):
            // if (source === 'jikan') url = `https://api.jikan.moe/v4/anime/${id}${!root ? `/episodes?page=${page}` : ``}`

            let res = {}
            try {
                res = await fetch(url)
            } catch (e) {
                if (!res || res.status !== 404) throw e
            }
            if (!res.ok && (res.status === 429 || res.status === 500)) {
                throw res
            }
            let json = null
            try {
                json = await res.json()
            } catch (error) {
                if (res.ok) this.checkError(error, source)
            }
            if (!res.ok) {
                if (json) {
                    for (const error of json?.errors || []) this.checkError(error, source, true)
                } else {
                    this.checkError(res, source)
                }
            }
            return cache.cacheEntry(caches.EPISODES, key, {}, json, Date.now() + getRandomInt(1, 3) * 24 * 60 * 60 * 1000)
        })().catch((error) => {
            if (status.value === 'offline') {
                debug(`Network offline, returning cached episode data if available`, error)
                const cachedEntry = cache.cachedEntry(caches.EPISODES, key, true)
                if (cachedEntry) return cachedEntry
            } else throw new Error(error)
        }).finally(() => {
            this.concurrentRequests.delete(key)
        })

        this.concurrentRequests.set(key, requestPromise)
        return requestPromise
    }

    checkError(error, type, silent) {
        if (!error || error.status === 404 || error.status === 521) {
            debug(`Error (API Down): ${error?.status || 429} - ${error?.message || codes[error?.status || 429]}`)
            return
        }
        if (!silent) printError('Episode Fetching Failed', `Failed to fetch ${type} anime episodes!`, error)
    }
}

export const episodesList = new Episodes()