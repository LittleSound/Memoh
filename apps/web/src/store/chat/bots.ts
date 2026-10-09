import { ref, type Ref } from 'vue'
import { fetchBots, type Bot } from '@/composables/api/useChat'
import { isPendingBot } from '../chat-list.normalize'

/**
 * Deletion is asynchronous: the API keeps listing a bot as "deleting" until its
 * cleanup finishes, but nothing can be done with it from that point on.
 */
const isDeletingBot = (bot: Bot) => bot.status === 'deleting'

/**
 * The bot the chat should sit on for `list`: the current one while it is still
 * listed and ready, otherwise the first ready bot (falling back to a bot that is
 * still being created, so a provisioning account is not treated as empty), or
 * null when no usable bot is left.
 */
function resolveSelectableBot(list: Bot[], currentBotId: string | null): string | null {
  if (currentBotId) {
    const found = list.find(bot => bot.id === currentBotId)
    if (found && !isPendingBot(found)) return currentBotId
  }
  const ready = list.find(bot => !isPendingBot(bot))
  const creating = list.find(bot => !isDeletingBot(bot))
  return (ready?.id ?? creating?.id ?? '').trim() || null
}

export function createChatBots(deps: {
  currentBotId: Ref<string | null>
  userScopeGeneration: () => number
  /**
   * Called when a refreshed list no longer offers the selected bot (deleted
   * here or in another tab/window, including one still being torn down), with
   * the bot to fall back to, or null when none is left. The owner must move
   * the selection, otherwise every later request still targets the removed
   * bot. For null, clearing `currentBotId` is enough: the bot-id watch tears
   * the old bot down into the empty state, whereas routing null through
   * `initialize()` races that same teardown.
   */
  onCurrentBotRemoved: (nextBotId: string | null) => Promise<void> | void
}) {
  const bots = ref<Bot[]>([])

  async function ensureBot(): Promise<string | null> {
    const generation = deps.userScopeGeneration()
    try {
      const list = await fetchBots()
      if (generation !== deps.userScopeGeneration()) return null
      bots.value = list
      deps.currentBotId.value = resolveSelectableBot(list, deps.currentBotId.value)
      return deps.currentBotId.value
    } catch (error) {
      // Stale run (user scope changed mid-flight): resolve quietly. A live
      // failure must surface so bootstrap recovery retries it — swallowing it
      // here used to read as "account has no bots", letting initialize()
      // complete "successfully" with no WebSocket and no recovery (#1070).
      if (generation !== deps.userScopeGeneration()) return null
      console.error('Failed to fetch bots:', error)
      throw error
    }
  }

  /**
   * Re-pull the bot list. Unlike `ensureBot` it never rewrites the selection
   * itself; a selected bot that vanished is handed to `onCurrentBotRemoved` so
   * the owner can run a full bot switch.
   */
  async function refreshBots() {
    const generation = deps.userScopeGeneration()
    let list: Bot[]
    try {
      list = await fetchBots()
    } catch (error) {
      if (generation === deps.userScopeGeneration()) {
        console.error('Failed to refresh bots:', error)
      }
      return
    }
    if (generation !== deps.userScopeGeneration()) return
    bots.value = list
    const current = (deps.currentBotId.value ?? '').trim()
    const currentBot = list.find(bot => bot.id === current)
    if (current && (!currentBot || isDeletingBot(currentBot))) {
      await deps.onCurrentBotRemoved(resolveSelectableBot(list, null))
    }
  }

  return {
    bots,
    ensureBot,
    refreshBots,
    reset: () => { bots.value = [] },
  }
}
