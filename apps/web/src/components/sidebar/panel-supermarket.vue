<template>
  <div class="flex h-full min-h-0 min-w-0 flex-col">
    <div class="shrink-0 px-3 py-2">
      <Input
        v-model="search"
        :placeholder="t('supermarket.searchPlaceholder')"
        :aria-label="t('supermarket.searchPlaceholder')"
      />
    </div>
    <ScrollArea class="sidebar-scroll min-h-0 flex-1">
      <div class="space-y-3 px-3 pb-6">
        <p
          v-if="!botId"
          class="text-caption text-muted-foreground"
        >
          {{ t('chat.noBotSelected') }}
        </p>
        <p
          v-else-if="!canManage"
          class="text-caption text-muted-foreground"
        >
          {{ t('supermarket.sidebar.manageRequired') }}
        </p>
        <template v-if="canManage && botId">
          <SidebarPanelHeader
            :label="t('supermarket.sidebar.installed')"
            class="h-8"
          />
          <InlineLoadingRow v-if="installedQuery.isLoading.value">
            {{ t('common.loading') }}
          </InlineLoadingRow>
          <div
            v-else-if="installedQuery.error.value"
            class="space-y-2"
          >
            <p class="text-caption text-muted-foreground">
              {{ t('apps.loadFailed') }}
            </p>
            <Button
              variant="outline"
              size="sm"
              @click="installedQuery.refetch()"
            >
              {{ t('common.retry') }}
            </Button>
          </div>
          <template v-else>
            <p
              v-if="installedQuery.data.value?.workspace_state !== 'running'"
              class="text-caption text-muted-foreground"
            >
              {{ t('apps.workspaceNotRunningDescription') }}
            </p>
            <p
              v-if="!installed.length"
              class="text-caption text-muted-foreground"
            >
              {{ t(query.trim() ? 'supermarket.noAppResults' : 'apps.emptyTitle') }}
            </p>
            <div
              v-for="app in installed"
              :key="`${app.registry_id}/${app.app_id}`"
              :class="appRowClass"
              role="button"
              tabindex="0"
              @click="openInstalled(app)"
              @keydown.enter.prevent="openInstalled(app)"
              @keydown.space.prevent="openInstalled(app)"
            >
              <SkillIcon
                :icon="app.icon"
                class="shrink-0"
              />
              <div class="min-w-0 flex-1">
                <p
                  class="truncate text-sm font-medium"
                  :title="appDisplayName(app, locale)"
                >
                  {{ appDisplayName(app, locale) }}
                </p>
                <p class="line-clamp-2 break-words text-caption text-muted-foreground">
                  {{ appDisplayDescription(app, locale) }}
                </p>
                <p
                  v-if="app.status === 'failed' || app.status === 'partial'"
                  class="flex items-center gap-1 text-caption"
                  :class="app.status === 'failed' ? 'text-destructive' : 'text-warning-foreground'"
                >
                  <AlertTriangle
                    class="size-3 shrink-0"
                    aria-hidden="true"
                  />
                  {{ t(app.status === 'failed' ? 'apps.diagnostics.failed' : 'apps.diagnostics.partial') }}
                </p>
                <p
                  v-else-if="app.status && app.status !== 'installed'"
                  class="text-caption text-muted-foreground"
                >
                  {{ t(app.status === 'discovered' ? 'supermarket.sidebar.discovered' : `bots.dependencies.status.${app.status}`) }}
                </p>
              </div>
            </div>
          </template>
        </template>
        <SidebarPanelHeader
          :label="t('supermarket.title')"
          class="h-8"
        />
        <InlineLoadingRow v-if="catalogQuery.isLoading.value">
          {{ t('common.loading') }}
        </InlineLoadingRow>
        <div
          v-else-if="catalogQuery.error.value"
          class="space-y-2"
        >
          <p class="text-caption text-muted-foreground">
            {{ t('supermarket.loadError') }}
          </p>
          <Button
            variant="outline"
            size="sm"
            @click="catalogQuery.refetch()"
          >
            {{ t('common.retry') }}
          </Button>
        </div>
        <template v-else>
          <p
            v-if="!catalog.length"
            class="text-caption text-muted-foreground"
          >
            {{ t('supermarket.noAppResults') }}
          </p>
          <div
            v-for="app in catalog"
            :key="`${app.registry_id}/${app.app_id}`"
            :class="appRowClass"
            role="button"
            tabindex="0"
            @click="openCatalog(app)"
            @keydown.enter.prevent="openCatalog(app)"
            @keydown.space.prevent="openCatalog(app)"
          >
            <SkillIcon
              :icon="app.icon"
              class="shrink-0"
            />
            <div class="min-w-0 flex-1 space-y-1">
              <p
                class="truncate text-sm font-medium"
                :title="appDisplayName(app, locale)"
              >
                {{ appDisplayName(app, locale) }}
              </p>
              <p class="line-clamp-2 break-words text-caption text-muted-foreground">
                {{ appDisplayDescription(app, locale) }}
              </p>
              <div class="flex flex-wrap items-center justify-between gap-2">
                <span class="truncate text-caption text-muted-foreground">{{ app.author?.name || app.registry_id }}</span>
                <Button
                  size="sm"
                  variant="outline"
                  :disabled="!canInstall || !!pendingApp"
                  :loading="pendingApp === appKey(app)"
                  @click.stop="prepareInstall(app)"
                  @keydown.stop
                >
                  {{ t('supermarket.install') }}
                </Button>
              </div>
            </div>
          </div>
          <div
            v-if="page > 1 || hasNextPage"
            class="flex justify-end gap-2"
          >
            <Button
              variant="ghost"
              size="icon-sm"
              :disabled="page === 1"
              :aria-label="t('supermarket.previousPage')"
              @click="page--"
            >
              <ChevronLeft />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              :disabled="!hasNextPage"
              :aria-label="t('supermarket.nextPage')"
              @click="page++"
            >
              <ChevronRight />
            </Button>
          </div>
        </template>
      </div>
    </ScrollArea>
    <InstallAppDialog
      v-model:open="installOpen"
      :pkg="selectedApp"
      :default-bot-id="installBotId"
      lock-bot
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { refDebounced } from '@vueuse/core'
import { useQuery } from '@pinia/colada'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-vue-next'
import { Button, InlineLoadingRow, Input, ScrollArea, toast } from '@felinic/ui'
import { getBotsByBotIdApps, getSupermarketApps, getSupermarketRegistriesByRegistryIdAppsByAppId, type HandlersAppItem, type HandlersSupermarketAppDescriptor, type HandlersSupermarketAppSummary } from '@memohai/sdk'
import { appDisplayDescription, appDisplayName, appKey, botAppsQueryKey } from '@/composables/api/useApps'
import { resolveApiErrorMessage } from '@/utils/api-error'
import SkillIcon from '@/pages/supermarket/components/skill-icon.vue'
import InstallAppDialog from '@/pages/supermarket/components/install-app-dialog.vue'
import SidebarPanelHeader from './panel-header.vue'
import { filterInstalledApps, uninstalledApps } from './supermarket-apps'

/** Preserve sidebar row geometry while sharing its existing hover color. */
const appRowClass = 'flex min-w-0 cursor-pointer items-start gap-3 py-2 hover:bg-[color:var(--sidebar-hover)]' /* ui-allow-style: Dense sidebar rows retain their existing geometry and reuse the sidebar hover token. */

const props = defineProps<{ botId: string, canManage: boolean }>()
const { t, locale } = useI18n()
const router = useRouter()
const search = ref('')
const query = refDebounced(search, 300)
const page = ref(1)
const pageSize = 30
watch(query, () => { page.value = 1 }, { flush: 'sync' })
const installedQuery = useQuery({
  key: () => botAppsQueryKey(props.botId),
  query: async () => (await getBotsByBotIdApps({ path: { bot_id: props.botId }, throwOnError: true })).data,
  enabled: () => !!props.botId && props.canManage,
})
const catalogQuery = useQuery({
  key: () => ['sidebar-supermarket', query.value.trim(), page.value],
  query: async () => (await getSupermarketApps({ query: { q: query.value.trim(), page: page.value, limit: pageSize, sort: 'relevance' }, throwOnError: true })).data,
})
const installedItems = computed(() => props.canManage && props.botId ? installedQuery.data.value?.items ?? [] : [])
const installed = computed(() => filterInstalledApps(installedItems.value, query.value, locale.value))
const catalog = computed(() => uninstalledApps(catalogQuery.data.value?.data ?? [], installedItems.value))
const hasNextPage = computed(() => page.value * pageSize < (catalogQuery.data.value?.total ?? 0))
const canInstall = computed(() => !!props.botId && props.canManage && !installedQuery.error.value && installedQuery.data.value?.workspace_state === 'running')
const pendingApp = ref('')
const selectedApp = ref<HandlersSupermarketAppDescriptor | null>(null)
const installOpen = ref(false)
const installBotId = ref('')
let previewSequence = 0

/** Discard a preview fetched for a bot whose selection or permissions changed. */
watch(() => [props.botId, props.canManage], () => {
  previewSequence++
  pendingApp.value = ''
  installOpen.value = false
})

/** Fetch the immutable release descriptor before opening the shared confirmation flow. */
async function prepareInstall(app: HandlersSupermarketAppSummary) {
  if (!canInstall.value || pendingApp.value) return
  const sequence = ++previewSequence
  const botId = props.botId
  const key = appKey(app)
  pendingApp.value = key
  try {
    const { data } = await getSupermarketRegistriesByRegistryIdAppsByAppId({ path: { registry_id: app.registry_id, app_id: app.app_id }, throwOnError: true })
    if (sequence !== previewSequence || props.botId !== botId || !canInstall.value) return
    selectedApp.value = data
    installBotId.value = botId
    installOpen.value = true
  } catch (error) {
    if (sequence === previewSequence) toast.error(resolveApiErrorMessage(error, t('supermarket.loadError')))
  } finally {
    if (sequence === previewSequence) pendingApp.value = ''
  }
}

function openInstalled(app: HandlersAppItem) {
  void router.push({ name: 'bot-detail', params: { botName: props.botId }, query: { tab: 'apps', app: appKey(app) } })
}
/** Preserve the selected bot when browsing an uninstalled App. */
function openCatalog(app: HandlersSupermarketAppSummary) {
  if (!app.registry_id || !app.app_id) return
  void router.push({
    name: 'supermarket-app-detail',
    params: { registryId: app.registry_id, appId: app.app_id },
    query: props.botId ? { botId: props.botId } : undefined,
  })
}
</script>
