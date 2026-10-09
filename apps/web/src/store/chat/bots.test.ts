import { afterEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { createChatBots } from './bots'
import { fetchBots } from '@/composables/api/useChat'
import type { Bot } from '@/composables/api/useChat'

vi.mock('@/composables/api/useChat', () => ({
  fetchBots: vi.fn(),
}))

const fetchBotsMock = vi.mocked(fetchBots)

function bot(id: string): Bot {
  return { id, status: 'ready' } as Bot
}

function makeBots(initialBotId: string | null = null) {
  const currentBotId = ref<string | null>(initialBotId)
  let generation = 0
  const store = createChatBots({
    currentBotId,
    userScopeGeneration: () => generation,
    onCurrentBotRemoved: () => {},
  })
  return {
    currentBotId,
    bumpGeneration: () => { generation += 1 },
    ...store,
  }
}

describe('chat bots ensureBot', () => {
  afterEach(() => {
    fetchBotsMock.mockReset()
  })

  it('rethrows live fetch failures so bootstrap recovery can retry (#1070)', async () => {
    fetchBotsMock.mockRejectedValue(new Error('server booting'))
    const { ensureBot, currentBotId } = makeBots('bot-1')

    await expect(ensureBot()).rejects.toThrow('server booting')
    // A failed fetch must not rewrite the current selection either.
    expect(currentBotId.value).toBe('bot-1')
  })

  it('returns null quietly when the user scope changed mid-flight', async () => {
    let rejectFetch!: (error: Error) => void
    fetchBotsMock.mockImplementation(() => new Promise<Bot[]>((_, reject) => {
      rejectFetch = reject
    }))
    const { ensureBot, bumpGeneration } = makeBots('bot-1')

    const pending = ensureBot()
    bumpGeneration()
    rejectFetch(new Error('down'))

    await expect(pending).resolves.toBeNull()
  })

  it('keeps the current bot when it is still present and ready', async () => {
    fetchBotsMock.mockResolvedValue([bot('bot-1'), bot('bot-2')])
    const { ensureBot, currentBotId } = makeBots('bot-2')

    await expect(ensureBot()).resolves.toBe('bot-2')
    expect(currentBotId.value).toBe('bot-2')
  })

  it('returns null for a genuinely empty bot list', async () => {
    fetchBotsMock.mockResolvedValue([])
    const { ensureBot, currentBotId } = makeBots('bot-1')

    await expect(ensureBot()).resolves.toBeNull()
    expect(currentBotId.value).toBeNull()
  })
})

describe('chat bots refreshBots', () => {
  afterEach(() => {
    fetchBotsMock.mockReset()
  })

  function makeRefreshBots(initialBotId: string | null) {
    const currentBotId = ref<string | null>(initialBotId)
    let generation = 0
    const onCurrentBotRemoved = vi.fn()
    const store = createChatBots({
      currentBotId,
      userScopeGeneration: () => generation,
      onCurrentBotRemoved,
    })
    return { ...store, currentBotId, onCurrentBotRemoved, bumpGeneration: () => { generation += 1 } }
  }

  it('hands a vanished current bot to onCurrentBotRemoved with the fallback', async () => {
    fetchBotsMock.mockResolvedValue([{ id: 'bot-pending', status: 'creating' } as Bot, bot('bot-a')])
    const { refreshBots, onCurrentBotRemoved, currentBotId } = makeRefreshBots('bot-b')

    await refreshBots()

    expect(onCurrentBotRemoved).toHaveBeenCalledWith('bot-a')
    // The owner performs the switch; refreshBots must not rewrite it itself.
    expect(currentBotId.value).toBe('bot-b')
  })

  it('treats a current bot that is still being deleted as removed', async () => {
    // Deletion is asynchronous: the API keeps listing the bot as "deleting"
    // until its cleanup finishes, so absence alone would miss it.
    fetchBotsMock.mockResolvedValue([{ id: 'bot-b', status: 'deleting' } as Bot, bot('bot-a')])
    const { refreshBots, onCurrentBotRemoved } = makeRefreshBots('bot-b')

    await refreshBots()

    expect(onCurrentBotRemoved).toHaveBeenCalledWith('bot-a')
  })

  it('passes null when the only listed bot is being deleted', async () => {
    fetchBotsMock.mockResolvedValue([{ id: 'bot-b', status: 'deleting' } as Bot])
    const { refreshBots, onCurrentBotRemoved } = makeRefreshBots('bot-b')

    await refreshBots()

    expect(onCurrentBotRemoved).toHaveBeenCalledWith(null)
  })

  it('keeps a current bot that is still being created', async () => {
    fetchBotsMock.mockResolvedValue([{ id: 'bot-b', status: 'creating' } as Bot, bot('bot-a')])
    const { refreshBots, onCurrentBotRemoved } = makeRefreshBots('bot-b')

    await refreshBots()

    expect(onCurrentBotRemoved).not.toHaveBeenCalled()
  })

  it('passes null when the refreshed list is empty', async () => {
    fetchBotsMock.mockResolvedValue([])
    const { refreshBots, onCurrentBotRemoved } = makeRefreshBots('bot-b')

    await refreshBots()

    expect(onCurrentBotRemoved).toHaveBeenCalledWith(null)
  })

  it('does not treat a failed fetch as the bot being removed', async () => {
    fetchBotsMock.mockRejectedValue(new Error('down'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { refreshBots, onCurrentBotRemoved } = makeRefreshBots('bot-b')

    await refreshBots()

    expect(onCurrentBotRemoved).not.toHaveBeenCalled()
  })

  it('ignores a list that resolves after the user scope changed', async () => {
    let resolveFetch!: (list: Bot[]) => void
    fetchBotsMock.mockImplementation(() => new Promise<Bot[]>((resolve) => {
      resolveFetch = resolve
    }))
    const { refreshBots, onCurrentBotRemoved, bumpGeneration, bots } = makeRefreshBots('bot-b')

    const pending = refreshBots()
    bumpGeneration()
    resolveFetch([bot('bot-a')])
    await pending

    expect(onCurrentBotRemoved).not.toHaveBeenCalled()
    expect(bots.value).toEqual([])
  })
})
