// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import { createI18n } from 'vue-i18n'
import en from '@/i18n/locales/en.json'
import PanelSupermarket from './panel-supermarket.vue'

const mocks = vi.hoisted(() => ({ push: vi.fn(), preview: vi.fn(), catalog: vi.fn() }))
vi.mock('@/pages/supermarket/components/skill-icon.vue', () => ({ default: { template: '<span />' } }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock('@memohai/sdk', async importOriginal => ({
  ...await importOriginal<object>(),
  getSupermarketApps: mocks.catalog,
  getSupermarketRegistriesByRegistryIdAppsByAppId: mocks.preview,
}))
vi.mock('@/pages/supermarket/components/install-app-dialog.vue', () => ({
  default: { props: ['open'], template: '<div v-if="open" data-install-dialog />' },
}))
vi.mock('@pinia/colada', async importOriginal => {
  const { ref } = await import('vue')
  return {
    ...await importOriginal<object>(),
    useQuery: (options: { key: () => string[] }) => ({
      data: ref(options.key()[0] === 'bot-apps'
        ? { workspace_state: 'running', items: [
          { registry_id: 'memoh', app_id: 'bun', name: 'Bun', author: { name: 'Memoh Team' }, status: 'partial' },
          { registry_id: 'memoh', app_id: 'node', name: 'Node.js', status: 'discovered', dependencies: [
            { id: 'other', dependency: { icon_url: '/workspace-dependencies/icons/' + 'b'.repeat(64) } },
            { id: 'node', dependency: { icon_url: '/workspace-dependencies/icons/' + 'a'.repeat(64) } },
          ] },
          { registry_id: 'memoh', app_id: 'uv', name: 'uv', status: 'discovered', dependencies: [
            { id: 'python-tools', dependency: { icon_url: '/workspace-dependencies/icons/' + 'c'.repeat(64) } },
          ] },
        ] }
        : { data: [{ registry_id: 'memoh', app_id: 'go', name: 'Go' }], total: 1 }),
      error: ref(null), isLoading: ref(false), refetch: vi.fn(),
    }),
  }
})
let app: ReturnType<typeof createApp>
let root: HTMLDivElement
beforeEach(async () => {
  vi.clearAllMocks()
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  mocks.catalog.mockResolvedValue({ data: { data: [{ registry_id: 'memoh', app_id: 'go', name: 'Go' }], total: 1, limit: 30 } })
  mocks.preview.mockResolvedValue({ data: { registry_id: 'memoh', app_id: 'go' } })
  root = document.createElement('div')
  document.body.append(root)
  app = createApp(PanelSupermarket, { botId: 'qa-bot', canManage: true })
  app.use(createI18n({ legacy: false, locale: 'en', messages: { en } }))
  app.mount(root)
  await nextTick()
})
afterEach(() => { app.unmount(); root.remove(); vi.unstubAllGlobals() })

function card(name: string) {
  const element = Array.from(root.querySelectorAll<HTMLElement>('[role="button"]')).find(el => el.textContent?.includes(name))
  expect(element).toBeDefined()
  return element!
}

it('opens the installed app management page from the whole card without a separate action', () => {
  expect(root.textContent).not.toContain('View details')
  card('Bun').click()
  expect(mocks.push).toHaveBeenCalledWith({ name: 'bot-detail', params: { botName: 'qa-bot' }, query: { tab: 'apps', app: 'memoh/bun' } })
})
it('opens the market detail from the catalog card and preserves the selected bot', () => {
  card('Go').click()
  expect(mocks.push).toHaveBeenCalledWith({ name: 'supermarket-app-detail', params: { registryId: 'memoh', appId: 'go' }, query: { botId: 'qa-bot' } })
  expect(mocks.preview).not.toHaveBeenCalled()
})
it('keeps installation separate from card navigation, including keyboard events', async () => {
  const button = card('Go').querySelector('button')!
  button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  expect(mocks.push).not.toHaveBeenCalled()
  button.click()
  await nextTick()
  await nextTick()
  expect(mocks.preview).toHaveBeenCalledOnce()
  expect(root.querySelector('[data-install-dialog]')).not.toBeNull()
  expect(mocks.push).not.toHaveBeenCalled()
})
it.each(['Enter', ' '])('supports %s on the card itself', key => {
  card('Go').dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  expect(mocks.push).toHaveBeenCalledOnce()
})

it('keeps publishers visible and places an installed warning in the action row', () => {
  const warning = Array.from(card('Bun').querySelectorAll('p')).find(el => el.textContent?.includes(en.apps.diagnostics.partial))
  expect(warning?.parentElement?.textContent).toContain('Memoh Team')
  expect(card('Node.js').textContent).toContain('memoh')
  expect(card('Go').querySelector('button')?.parentElement?.textContent).toContain('memoh')
})

it('uses dependency icons for discovered apps without showing a redundant source label', () => {
  expect(card('Node.js').querySelector('img')?.getAttribute('src')).toContain('/workspace-dependencies/icons/' + 'a'.repeat(64))
  expect(card('uv').querySelector('img')?.getAttribute('src')).toContain('/workspace-dependencies/icons/' + 'c'.repeat(64))
  expect(root.textContent).not.toContain(en.supermarket.sidebar.discovered)
})
