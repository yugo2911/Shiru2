<script>
  import SoftModal from '@/components/modals/SoftModal.svelte'
  import { click } from '@/modules/click.js'
  import { X, ChevronLeft, Lock, MessageSquare, Eye, Heart, Send, Pencil, Trash2 } from 'lucide-svelte'
  import { anilistClient } from '@/modules/anilist.js'
  import { alToken } from '@/modules/settings.js'
  import { modal } from '@/modules/navigation.js'
  import { since } from '@/modules/util.js'
  import { toast } from 'svelte-sonner'
  import DOMPurify from 'dompurify'
  import { marked } from 'marked'

  export let staticMedia

  marked.setOptions({
    pedantic: false,
    breaks: true,
    gfm: true
  })

  const SANITIZE_CONFIG = {
    ALLOWED_TAGS: [
      'p', 'br', 'span', 'div',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'strong', 'em', 'b', 'i', 'u', 's', 'del', 'ins', 'mark',
      'ul', 'ol', 'li',
      'blockquote',
      'code', 'pre',
      'a',
      'img',
      'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
      'hr',
      'details', 'summary',
      'input'
    ],
    ALLOWED_ATTR: [
      'href', 'target', 'rel', 'title',
      'src', 'alt', 'width', 'height',
      'class', 'id',
      'style',
      'align',
      'type', 'checked', 'disabled'
    ]
  }

  function convertAniImages (body) {
    return body.replace(/img\s*(\d+)?%?\(\s*((?:[^()]|\([^()]*\))*)\s*\)/gi, (match, size, inner) => {
      const url = inner.match(/href=["']([^"']+)["']/)?.[1]
        || inner.match(/\]\(\s*([^)\s]+)\s*\)/)?.[1]
        || inner.trim()
      const style = size ? ` style="max-width: min(${size}%, 100%)"` : ''
      return `<img src="${url}"${style} />`
    })
  }

  // AniList-flavored spoiler syntax: ~!hidden text!~
  // Standard markdown doesn't know this, so marked would leave the raw
  // tildes/bangs in the output if we didn't convert it first. Runs before
  // marked.parse, same as convertAniImages.
  function convertSpoilers (body) {
    return body.replace(/~!([\s\S]*?)!~/g, (match, inner) => `<span class="spoiler">${inner}</span>`)
  }

  function sanitize (body) {
    if (!body) return ''
    const cleanBody = body.trim()
      .replace(/\.\.+(?=\s*$)/gm, '.')
      .replace(/\n/g, '<br>')
      .replace(/(<br\s*\/?>){2,}/gi, '<br><br>')
      .replace(/^(<br\s*\/?>\s*)+|(<br\s*\/?>\s*)+$/gi, '')
    const withEmbeds = convertSpoilers(convertAniImages(cleanBody))
    return DOMPurify.sanitize(marked.parse(withEmbeds).trim(), SANITIZE_CONFIG)
  }

  function plainText (body) {
    if (!body) return ''
    return body
      .replace(/img\d*\([^)]*\)/gi, '')
      .replace(/~!([\s\S]*?)!~/g, '$1')
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/[*_`#>-]/g, '')
  }

  // Spoiler spans live inside raw {@html sanitize(...)} output, so individual
  // spans can't carry their own Svelte listeners. Bind this to on:click on
  // whatever container renders that HTML (comment-text, thread-body, etc.)
  // and it'll toggle whichever spoiler was actually clicked.
  function toggleSpoiler (event) {
    const spoiler = event.target.closest('.spoiler')
    if (spoiler) spoiler.classList.toggle('revealed')
  }

  // Flattens the nested childComments tree into a depth-annotated list so the
  // comments can be rendered from a single component (Svelte 4 has no inline
  // recursive components, so each level is indented instead of nested).
  function flattenComments (comments, depth = 0, out = []) {
    for (const comment of comments) {
      out.push({ comment, depth })
      if (Array.isArray(comment.childComments) && comment.childComments.length) {
        flattenComments(comment.childComments, depth + 1, out)
      }
    }
    return out
  }

  let threads = null
  let comments = null
  let selectedThread = null
  let flatComments = []
  let threadLikeCount = 0
  let threadIsLiked = false
  let threadReplyCount = 0
  let commentDraft = ''
  let commentSubmitting = false
  let replyingTo = null
  let editingComment = null
  let editDraft = ''
  let editSubmitting = false
  let composerRef = null
  let deleteConfirmId = null
  let deleteTimer = null

  function close () {
    modal.close(modal.THREADS)
    selectedThread = null
  }

  async function loadThreads () {
    if (!staticMedia?.id) return
    const res = await anilistClient.threads({ id: staticMedia.id })
    threads = res?.data?.Page?.threads || []
  }

  async function loadComments (refresh = false) {
    if (!selectedThread?.id) return
    if (!refresh) comments = null
    try {
      const res = await anilistClient.threadComments({ id: selectedThread.id })
      comments = res?.data?.Page?.threadComments || []
    } catch (error) {
      comments = []
    }
  }

  async function toggleThreadLike (thread) {
    if (!thread) return
    const wasLiked = threadIsLiked
    threadIsLiked = !wasLiked
    threadLikeCount = Math.max(0, threadLikeCount + (wasLiked ? -1 : 1))
    thread.isLiked = threadIsLiked
    thread.likeCount = threadLikeCount
    try {
      await anilistClient.toggleLike({ id: thread.id, type: 'THREAD' })
    } catch (error) {
      threadIsLiked = wasLiked
      threadLikeCount = Math.max(0, threadLikeCount + (wasLiked ? 1 : -1))
      thread.isLiked = threadIsLiked
      thread.likeCount = threadLikeCount
    }
  }

  async function toggleCommentLike (comment) {
    if (!comment) return
    const wasLiked = comment.isLiked
    comment.isLiked = !wasLiked
    comment.likeCount = Math.max(0, (comment.likeCount || 0) + (wasLiked ? -1 : 1))
    comments = comments
    try {
      await anilistClient.toggleLike({ id: comment.id, type: 'THREAD_COMMENT' })
    } catch (error) {
      comment.isLiked = wasLiked
      comment.likeCount = Math.max(0, (comment.likeCount || 0) + (wasLiked ? 1 : -1))
      comments = comments
    }
  }

  function replyTo (comment) {
    replyingTo = comment
  }

  function cancelReply () {
    replyingTo = null
  }

  function focusComposer () {
    replyingTo = null
    requestAnimationFrame(() => {
      composerRef?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      composerRef?.focus()
    })
  }

  function startEdit (comment) {
    editingComment = comment
    editDraft = comment.comment || ''
  }

  function cancelEdit () {
    editingComment = null
    editDraft = ''
  }

  function countReplies (comment) {
    if (!Array.isArray(comment.childComments)) return 0
    let n = 0
    for (const child of comment.childComments) n += 1 + countReplies(child)
    return n
  }

  function removeCommentTree (list, id) {
    const out = []
    let removed = 0
    for (const c of list) {
      if (c.id === id) {
        removed += 1 + countReplies(c)
        continue
      }
      if (Array.isArray(c.childComments) && c.childComments.length) {
        const res = removeCommentTree(c.childComments, id)
        c.childComments = res.list
        removed += res.removed
      }
      out.push(c)
    }
    return { list: out, removed }
  }

  function requestDelete (comment) {
    if (deleteConfirmId !== comment.id) {
      deleteConfirmId = comment.id
      clearTimeout(deleteTimer)
      deleteTimer = setTimeout(() => { deleteConfirmId = null }, 3000)
      return
    }
    deleteComment(comment)
  }

  async function deleteComment (comment) {
    if (!alToken) return
    deleteConfirmId = null
    clearTimeout(deleteTimer)
    try {
      await anilistClient.deleteThreadComment({ id: comment.id })
      const res = removeCommentTree(comments || [], comment.id)
      comments = res.list
      threadReplyCount = Math.max(0, threadReplyCount - res.removed)
    } catch (error) {
      toast.error('Delete Failed', {
        description: 'Failed to delete your comment. Please try again.',
        duration: 10000
      })
    }
  }

  function checkEditInput (event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      saveEdit()
    } else if (event.key === 'Escape') {
      cancelEdit()
    }
  }

  async function saveEdit () {
    if (!alToken || !editingComment || !editDraft.trim() || editSubmitting) return
    editSubmitting = true
    try {
      const res = await anilistClient.updateThreadComment({
        id: editingComment.id,
        comment: editDraft.trim()
      })
      const updated = res?.data?.SaveThreadComment
      if (!updated) throw new Error('No comment returned')
      editingComment.comment = updated.comment
      comments = comments
      cancelEdit()
    } catch (error) {
      toast.error('Edit Failed', {
        description: 'Failed to update your comment. Please try again.',
        duration: 10000
      })
    } finally {
      editSubmitting = false
    }
  }

  $: rows = Math.min(Math.max(commentDraft.split('\n').length, 1), 8)
  $: editRows = Math.min(Math.max(editDraft.split('\n').length, 1), 8)
  $: currentUserId = alToken?.viewer?.data?.Viewer?.id

  function checkCommentInput (event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      submitComment()
    } else if (event.key === 'Escape') {
      cancelReply()
    }
  }

  async function submitComment () {
    if (!alToken || !commentDraft.trim() || commentSubmitting) return
    commentSubmitting = true
    try {
      const res = await anilistClient.saveThreadComment({
        threadId: selectedThread.id,
        ...(replyingTo ? { parentCommentId: replyingTo.id } : {}),
        comment: commentDraft.trim()
      })
      const newComment = res?.data?.SaveThreadComment
      if (!newComment) throw new Error('No comment returned')
      if (replyingTo) {
        if (!Array.isArray(replyingTo.childComments)) replyingTo.childComments = []
        replyingTo.childComments.push(newComment)
        comments = comments
      } else {
        comments = [newComment, ...comments]
      }
      threadReplyCount++
      commentDraft = ''
      replyingTo = null
      await loadComments(true)
    } catch (error) {
      toast.error('Comment Failed', {
        description: 'Failed to post your comment. Please try again.',
        duration: 10000
      })
    } finally {
      commentSubmitting = false
    }
  }

  $: flatComments = comments ? flattenComments(comments) : []
  $: threadLikeCount = selectedThread?.likeCount || 0
  $: threadIsLiked = !!selectedThread?.isLiked
  $: threadReplyCount = selectedThread?.replyCount || 0
  $: if ($modal[modal.THREADS] && !threads) loadThreads()
  $: if (selectedThread) loadComments()
  $: if (!$modal[modal.THREADS]) {
    selectedThread = null
    comments = null
    commentDraft = ''
    replyingTo = null
    editingComment = null
    editDraft = ''
    deleteConfirmId = null
    clearTimeout(deleteTimer)
  }
</script>

<SoftModal 
  class='pointer-events-none w-full scrollbar-none align-items-center mb-30' 
  css='top-0 left-0 position-fixed' 
  bind:showModal={$modal[modal.THREADS]} 
  shouldRender={true} 
  {close} 
  id={modal.THREADS}
>
  <div class='pointer-events-auto d-flex align-items-center rounded-top-5 w-full wm-calc bg-dark h-40'>
    {#if selectedThread}
      <button type='button' class='btn btn-square bg-transparent shadow-none border-0 d-flex align-items-center justify-content-center ml-5' data-toggle='tooltip' data-placement='top' data-title='Back to Discussions' use:click={() => selectedThread = null}>
        <ChevronLeft size='1.5rem' strokeWidth='3'/>
      </button>
    {/if}
    <span class='title ml-15 font-weight-very-bold text-muted select-all mr-20 font-scale-18'>{anilistClient.title(staticMedia)} - Discussions</span>
    <button type='button' class='btn btn-square bg-transparent shadow-none border-0 d-flex align-items-center justify-content-center ml-auto mr-5' use:click={close}><X size='1.7rem' strokeWidth='3'/></button>
  </div>

  <div class='pointer-events-auto w-full wm-calc rounded-bottom-5 threads-scope thread-content'>
    {#if selectedThread}
      <div class='thread-detail'>
        <div class='thread-detail-top'>
          <div class='thread-detail-title'>{selectedThread.title}</div>
          <div class='thread-detail-meta'>
            {#if selectedThread.user?.avatar?.medium}
              <img class='comment-avatar' src={selectedThread.user.avatar.medium} alt='' />
            {/if}
            <span>By <span class='author'>{selectedThread.user?.name || 'Anonymous'}</span></span>
              {#if selectedThread.createdAt}<span title={new Date(selectedThread.createdAt * 1000).toLocaleString()}>{since(new Date(selectedThread.createdAt * 1000))}</span>{/if}
            <span class='stat'><MessageSquare size='1.3rem'/>{threadReplyCount}</span>
            <span class='stat'><Eye size='1.3rem'/>{selectedThread.viewCount}</span>
            <button type='button' class='comment-reply stat' data-toggle='tooltip' data-placement='top' data-title='Reply' use:click={focusComposer}>
              <MessageSquare size='1.3rem'/>Reply
            </button>
            <button type='button' class='comment-likes stat' class:liked={threadIsLiked} use:click={() => toggleThreadLike(selectedThread)}>
              <Heart size='1.3rem' fill={threadIsLiked ? 'currentColor' : 'none'}/>
              {threadLikeCount}
            </button>
          </div>
        </div>
        {#if selectedThread.body}
          <div class='thread-body' on:click={toggleSpoiler}>{@html sanitize(selectedThread.body)}</div>
        {/if}
        <div class='comments-title'>COMMENTS</div>
        <div class='comments-list'>
          {#if comments === null}
            <div class='empty'>Loading comments...</div>
          {:else if flatComments.length}
            {#each flatComments as { comment, depth } (comment.id)}
              {#if depth > 0}
                <div class='comment-replies' style='margin-left: {(depth - 1) * 46}px'>
                  <div class='comment-card'>
                    {#if comment.user?.avatar?.medium}
                      <img class='comment-avatar' src={comment.user.avatar.medium} alt='' />
                    {:else}
                      <div class='comment-avatar'></div>
                    {/if}
                    <div class='comment-main'>
                    <div class='comment-head'>
                      <span class='author'>{comment.user?.name || 'Anonymous'}</span>
                      {#if comment.createdAt}<span title={new Date(comment.createdAt * 1000).toLocaleString()}>{since(new Date(comment.createdAt * 1000))}</span>{/if}
                      <button type='button' class='comment-reply' use:click={() => replyTo(comment)}><MessageSquare size='1.2rem'/>Reply</button>
                      {#if comment.user?.id === currentUserId}
                        <button type='button' class='comment-edit-btn' use:click={() => startEdit(comment)}><Pencil size='1.2rem'/>Edit</button>
                        <button type='button' class='comment-delete-btn' class:confirming={deleteConfirmId === comment.id} use:click={() => requestDelete(comment)}>
                          <Trash2 size='1.2rem'/>{deleteConfirmId === comment.id ? 'Confirm?' : 'Delete'}
                        </button>
                      {/if}
                      <button type='button' class='comment-likes' class:liked={comment.isLiked} use:click={() => toggleCommentLike(comment)}>
                        <Heart size='1.2rem' fill={comment.isLiked ? 'currentColor' : 'none'}/>
                        {comment.likeCount || 0}
                      </button>
                    </div>
                    {#if editingComment === comment}
                      <div class='comment-edit'>
                        <textarea class='comment-edit-textarea' bind:value={editDraft} rows={editRows} disabled={editSubmitting} placeholder='Edit your comment...' on:keydown={checkEditInput} />
                        <div class='comment-edit-actions'>
                          <button type='button' class='comment-edit-save' disabled={editSubmitting || !editDraft.trim()} use:click={saveEdit}>Save</button>
                          <button type='button' class='comment-edit-cancel' disabled={editSubmitting} use:click={cancelEdit}>Cancel</button>
                        </div>
                      </div>
                    {:else}
                      {#if comment.comment}
                        <div class='comment-text' on:click={toggleSpoiler}>{@html sanitize(comment.comment)}</div>
                      {/if}
                    {/if}
                  </div>
                </div>
              </div>
              {:else}
                <div class='comment-card'>
                  {#if comment.user?.avatar?.medium}
                    <img class='comment-avatar' src={comment.user.avatar.medium} alt='' />
                  {:else}
                    <div class='comment-avatar'></div>
                  {/if}
                  <div class='comment-main'>
                    <div class='comment-head'>
                      <span class='author'>{comment.user?.name || 'Anonymous'}</span>
                      {#if comment.createdAt}<span title={new Date(comment.createdAt * 1000).toLocaleString()}>{since(new Date(comment.createdAt * 1000))}</span>{/if}
                      <button type='button' class='comment-reply' use:click={() => replyTo(comment)}><MessageSquare size='1.2rem'/>Reply</button>
                      {#if comment.user?.id === currentUserId}
                        <button type='button' class='comment-edit-btn' use:click={() => startEdit(comment)}><Pencil size='1.2rem'/>Edit</button>
                        <button type='button' class='comment-delete-btn' class:confirming={deleteConfirmId === comment.id} use:click={() => requestDelete(comment)}>
                          <Trash2 size='1.2rem'/>{deleteConfirmId === comment.id ? 'Confirm?' : 'Delete'}
                        </button>
                      {/if}
                      <button type='button' class='comment-likes' class:liked={comment.isLiked} use:click={() => toggleCommentLike(comment)}>
                        <Heart size='1.2rem' fill={comment.isLiked ? 'currentColor' : 'none'}/>
                        {comment.likeCount || 0}
                      </button>
                    </div>
                    {#if editingComment === comment}
                      <div class='comment-edit'>
                        <textarea class='comment-edit-textarea' bind:value={editDraft} rows={editRows} disabled={editSubmitting} placeholder='Edit your comment...' on:keydown={checkEditInput} />
                        <div class='comment-edit-actions'>
                          <button type='button' class='comment-edit-save' disabled={editSubmitting || !editDraft.trim()} use:click={saveEdit}>Save</button>
                          <button type='button' class='comment-edit-cancel' disabled={editSubmitting} use:click={cancelEdit}>Cancel</button>
                        </div>
                      </div>
                    {:else}
                      {#if comment.comment}
                        <div class='comment-text' on:click={toggleSpoiler}>{@html sanitize(comment.comment)}</div>
                      {/if}
                    {/if}
                  </div>
                </div>
              {/if}
            {/each}
          {:else}
            <div class='empty'>No comments yet</div>
          {/if}
        </div>
        {#if !alToken}
          <div class='comment-composer disabled'>
            <textarea disabled placeholder='Log in to comment' />
          </div>
        {:else}
          <div class='comment-composer'>
            {#if replyingTo}
              <div class='reply-context'>
                <span>Replying to {replyingTo.user?.name || 'Anonymous'}</span>
                <button type='button' class='reply-cancel' data-toggle='tooltip' data-placement='top' data-title='Cancel Reply' use:click={cancelReply}><X size='1.2rem'/></button>
              </div>
            {/if}
            <div class='comment-input-row'>
              <textarea
                bind:this={composerRef}
                bind:value={commentDraft}
                {rows}
                class='form-control h-auto line-height-normal'
                style='resize: none; min-height: 0 !important'
                autocomplete='off'
                placeholder={replyingTo ? `Reply to ${replyingTo.user?.name || 'Anonymous'}...` : 'Add a comment...'}
                on:keydown={checkCommentInput}
                disabled={commentSubmitting}
              />
              <button type='button' class='comment-send' data-toggle='tooltip' data-placement='top' data-title='Send' disabled={commentSubmitting || !commentDraft.trim()} use:click={submitComment}>
                <Send size='1.5rem'/>
              </button>
            </div>
          </div>
        {/if}
      </div>
    {:else if threads === null}
      <div class='empty'>Loading discussions...</div>
    {:else if !threads?.length}
      <div class='empty'>No discussions yet</div>
    {:else}
      <div class='thread-list'>
        {#each threads as thread}
          <button class='thread-card' type='button' use:click={() => selectedThread = thread}>
            {#if thread.user?.avatar?.medium}
              <img class='avatar' src={thread.user.avatar.medium} alt='' />
            {:else}
              <div class='avatar'></div>
            {/if}
            <div class='thread-main'>
              <span class='category-tag'>{thread.categories?.[0]?.name || 'General'}</span>
              {#if thread.isSticky}<span class='sticky-tag'>PINNED</span>{/if}
              {#if thread.isLocked}<span class='sticky-tag locked'><Lock size='1.1rem'/></span>{/if}
              <span class='thread-title'>{thread.title}</span>
              {#if thread.body}
                <div class='thread-preview'>{plainText(thread.body)}</div>
              {/if}
              <div class='thread-meta'>
                <span>By <span class='author'>{thread.user?.name || 'Anonymous'}</span></span>
                {#if thread.createdAt}<span title={new Date(thread.createdAt * 1000).toLocaleString()}>{since(new Date(thread.createdAt * 1000))}</span>{/if}
              </div>
            </div>
            <div class='thread-stats'>
              <span class='replies-count'>{thread.replyCount}</span>
              <span>replies</span>
            </div>
          </button>
        {/each}
      </div>
    {/if}
  </div>
</SoftModal>

<style>
  .wm-calc {
    max-width: min(max(70vw, 90rem), 120rem);
  }
  .title {
    display: inline-block;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }

  .threads-scope {
    --tp-bg: #11161d;
    --ts-bg: #151f2e;
    --tt-bg: #1f2937;
    --ts-accent: #3db4f2;
    --ts-text: #9fadbd;
    --ts-bright: #ffffff;
    --ts-border: #233142;
    background-color: var(--tp-bg);
    color: var(--ts-text);
  }

  .thread-content {
    overflow: hidden;
  }

  .thread-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 15px;
    max-height: 70vh;
    overflow-y: auto;
  }

  .thread-card {
    background-color: var(--ts-bg);
    border: 1px solid var(--ts-border);
    border-radius: 6px;
    padding: 15px;
    display: flex;
    gap: 15px;
    text-align: left;
    font: inherit;
    color: inherit;
    cursor: pointer;
    transition: border-color 0.2s;
    scale: 1;
  }
  .thread-card:hover {
    border-color: var(--ts-accent);
  }

  .avatar {
    width: 52px;
    height: 52px;
    border-radius: 6px;
    background-color: var(--tt-bg);
    /* background-image: url('./404_square.png'); */
    background-size: cover;
    background-position: center;
    flex-shrink: 0;
    object-fit: cover;
  }

  .thread-main {
    flex-grow: 1;
    min-width: 0;
  }

  .thread-preview {
    color: var(--ts-text);
    font-size: 1.4rem;
    margin-bottom: 6px;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .category-tag {
    background-color: var(--tt-bg);
    color: var(--ts-accent);
    padding: 3px 10px;
    border-radius: 4px;
    font-size: 1.15rem;
    display: inline-block;
    margin-bottom: 4px;
    margin-right: 6px;
  }

  .sticky-tag {
    display: inline-flex;
    align-items: center;
    background-color: var(--tt-bg);
    color: var(--ts-accent);
    padding: 3px 10px;
    border-radius: 4px;
    font-size: 1.1rem;
    font-weight: 700;
    letter-spacing: 0.05em;
    margin-bottom: 4px;
    margin-right: 6px;
    vertical-align: top;
  }
  .sticky-tag.locked {
    color: #f87171;
  }

  .thread-title {
    color: var(--ts-bright);
    font-size: 1.8rem;
    margin-bottom: 6px;
    display: block;
    transition: color 0.2s;
  }
  .thread-card:hover .thread-title {
    color: var(--ts-accent);
  }

  .thread-meta {
    font-size: 1.35rem;
    display: flex;
    gap: 15px;
  }
  .author {
    color: var(--ts-bright);
    font-weight: 500;
  }

  .thread-stats {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    justify-content: center;
    font-size: 1.35rem;
    min-width: 80px;
    flex-shrink: 0;
  }
  .replies-count {
    color: var(--ts-bright);
    font-weight: 600;
  }

  .thread-detail {
    padding: 20px;
    max-height: 70vh;
    overflow-y: auto;
  }
  .thread-detail-top {
    border-bottom: 1px solid var(--ts-border);
    padding-bottom: 15px;
    margin-bottom: 15px;
  }
  .thread-detail-title {
    color: var(--ts-bright);
    font-size: 2rem;
    font-weight: 700;
    margin-bottom: 10px;
  }
  .thread-detail-meta {
    font-size: 1.35rem;
    display: flex;
    flex-wrap: wrap;
    gap: 15px;
    align-items: center;
  }
  .thread-detail-meta .stat {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }
  .thread-detail-meta svg {
    color: var(--ts-accent);
  }
  .thread-body {
    font-size: 1.5rem;
    line-height: 1.7;
    color: var(--ts-text);
    margin-bottom: 20px;
    overflow-wrap: break-word;
  }
  .thread-body :global(p) { margin: 0 0 0.5em; }
  .thread-body :global(p:last-child) { margin-bottom: 0; }
  .thread-body :global(a) { color: var(--ts-accent); }
  .thread-body :global(pre) {
    background: var(--tt-bg);
    border: 1px solid var(--ts-border);
    border-radius: 4px;
    padding: 10px;
    overflow-x: auto;
  }
  .thread-body :global(code) { color: var(--ts-bright); }
  .thread-body :global(img) { max-width: 100%; border-radius: 4px; }
  .thread-body :global(blockquote) {
    border-left: 3px solid var(--ts-accent);
    margin: 0 0 0.5em;
    padding-left: 10px;
    color: var(--ts-text);
  }
  .thread-body :global(ul), .thread-body :global(ol) { padding-left: 20px; }
  .thread-body :global(h1), .thread-body :global(h2), .thread-body :global(h3),
  .thread-body :global(h4), .thread-body :global(h5), .thread-body :global(h6) {
    color: var(--ts-bright);
  }
  .thread-body :global(.spoiler) {
    background-color: var(--tt-bg);
    color: transparent;
    border-radius: 3px;
    cursor: pointer;
    transition: color 0.15s;
  }
  .thread-body :global(.spoiler.revealed) {
    color: inherit;
  }
  .comments-title {
    font-size: 1.2rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    color: var(--ts-accent);
    margin-bottom: 12px;
  }
  .comments-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .empty {
    padding: 20px;
    text-align: center;
    color: var(--ts-text);
    font-size: 1.35rem;
  }

  .comment-card {
    display: flex;
    gap: 12px;
    background-color: var(--ts-bg);
    border: 1px solid var(--ts-border);
    border-radius: 6px;
    padding: 12px 14px;
  }
  .comment-avatar {
    width: 40px;
    height: 40px;
    border-radius: 6px;
    background-color: var(--tt-bg);
    /* background-image: url('./404_square.png'); */
    background-size: cover;
    background-position: center;
    flex-shrink: 0;
    object-fit: cover;
  }
  .comment-main {
    flex-grow: 1;
    min-width: 0;
  }
  .comment-head {
    font-size: 1.2rem;
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
    margin-bottom: 4px;
  }
  .comment-likes {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-left: auto;
    padding: 2px 6px;
    background: none;
    border: none;
    border-radius: 4px;
    font: inherit;
    color: var(--ts-text);
    cursor: pointer;
    transition: color 0.15s;
  }
  .comment-reply {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 6px;
    background: none;
    border: none;
    border-radius: 4px;
    font: inherit;
    color: var(--ts-text);
    cursor: pointer;
    transition: color 0.15s;
  }
  .comment-reply:hover {
    color: var(--ts-accent);
  }
  .comment-edit-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 6px;
    background: none;
    border: none;
    border-radius: 4px;
    font: inherit;
    color: var(--ts-text);
    cursor: pointer;
    transition: color 0.15s;
  }
  .comment-edit-btn:hover {
    color: var(--ts-accent);
  }
  .comment-delete-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 6px;
    background: none;
    border: none;
    border-radius: 4px;
    font: inherit;
    color: var(--ts-text);
    cursor: pointer;
    transition: color 0.15s;
  }
  .comment-delete-btn:hover,
  .comment-delete-btn.confirming {
    color: var(--ts-danger, #ff6b6b);
  }
  .comment-edit {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 6px;
  }
  .comment-edit-textarea {
    width: 100%;
    background-color: var(--ts-bg);
    border: 1px solid var(--ts-border);
    border-radius: 6px;
    color: var(--ts-text);
    font: inherit;
    line-height: 1.5;
    padding: 8px 10px;
    resize: none;
  }
  .comment-edit-textarea:focus {
    outline: none;
    border-color: var(--ts-accent);
  }
  .comment-edit-actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }
  .comment-edit-save,
  .comment-edit-cancel {
    padding: 4px 12px;
    border-radius: 4px;
    border: 1px solid var(--ts-border);
    background: none;
    font: inherit;
    color: var(--ts-text);
    cursor: pointer;
    transition: color 0.15s, border-color 0.15s;
  }
  .comment-edit-save:hover:not(:disabled),
  .comment-edit-cancel:hover:not(:disabled) {
    color: var(--ts-accent);
    border-color: var(--ts-accent);
  }
  .comment-edit-save:disabled,
  .comment-edit-cancel:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .comment-composer {
    margin-top: 15px;
    border-top: 1px solid var(--ts-border);
    padding-top: 15px;
  }
  .comment-composer.disabled {
    opacity: 0.6;
  }
  .comment-input-row {
    display: flex;
    align-items: flex-end;
    gap: 10px;
  }
  .comment-input-row textarea {
    background-color: var(--ts-bg);
    border: 1px solid var(--ts-border);
    border-radius: 6px;
    color: var(--ts-text);
    font: inherit;
    padding: 10px 12px;
  }
  .comment-input-row textarea:focus {
    outline: none;
    border-color: var(--ts-accent);
  }
  .comment-input-row textarea:disabled {
    cursor: not-allowed;
  }
  .comment-send {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 3.4rem;
    height: 3.4rem;
    flex-shrink: 0;
    background-color: var(--ts-accent);
    border: none;
    border-radius: 6px;
    color: #fff;
    cursor: pointer;
    transition: opacity 0.15s;
  }
  .comment-send:hover:not(:disabled) {
    opacity: 0.85;
  }
  .comment-send:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .reply-context {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    font-size: 1.2rem;
    color: var(--ts-accent);
    padding: 4px 6px 10px;
  }
  .reply-cancel {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 2px;
    background: none;
    border: none;
    border-radius: 4px;
    color: var(--ts-text);
    cursor: pointer;
    transition: color 0.15s;
  }
  .reply-cancel:hover {
    color: #f87171;
  }
  .comment-likes :global(svg) {
    color: var(--ts-accent);
  }
  .comment-likes:hover {
    color: var(--ts-bright);
  }
  .comment-likes.liked {
    color: var(--ts-accent);
  }
  .comment-text {
    font-size: 1.45rem;
    line-height: 1.55;
    overflow-wrap: break-word;
  }
  .comment-text :global(p) { margin: 0 0 0.5em; }
  .comment-text :global(p:last-child) { margin-bottom: 0; }
  .comment-text :global(a) { color: var(--ts-accent); }
  .comment-text :global(img) { max-width: 100%; border-radius: 4px; }
  .comment-text :global(.spoiler) {
    background-color: var(--tt-bg);
    color: transparent;
    border-radius: 3px;
    cursor: pointer;
    transition: color 0.15s;
  }
  .comment-text :global(.spoiler.revealed) {
    color: inherit;
  }

  .comment-replies {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin: 10px 0 0 26px;
    padding-left: 20px;
    border-left: 2px solid var(--ts-border);
  }
</style>
