export type TelegramUser = {
  id: number
  firstName: string
  lastName?: string
  username?: string
  languageCode?: string
  photoUrl?: string
}

type TelegramWebAppUser = {
  id?: number
  first_name?: string
  last_name?: string
  username?: string
  language_code?: string
  photo_url?: string
}

type TelegramWebApp = {
  initData?: string
  initDataUnsafe?: {
    user?: TelegramWebAppUser
    start_param?: string
  }
  ready?: () => void
  expand?: () => void
  close?: () => void
  platform?: string
  colorScheme?: string
}

declare global {
  interface Window {
    Telegram?: {
      WebApp?: TelegramWebApp
    }
  }
}

export function getTelegramWebApp() {
  return window.Telegram?.WebApp
}

export function initTelegramMiniApp() {
  const webApp = getTelegramWebApp()

  if (!webApp) {
    return
  }

  webApp.ready?.()
  webApp.expand?.()
}

export function getTelegramUser(): TelegramUser | null {
  const webApp = getTelegramWebApp()
  const user = webApp?.initDataUnsafe?.user

  if (!user?.id || !user.first_name) {
    return null
  }

  return {
    id: user.id,
    firstName: user.first_name,
    lastName: user.last_name,
    username: user.username,
    languageCode: user.language_code,
    photoUrl: user.photo_url,
  }
}

export function getTelegramStartParam() {
  const webApp = getTelegramWebApp()

  return webApp?.initDataUnsafe?.start_param ?? null
}

export function isOpenedInTelegram() {
  return Boolean(getTelegramWebApp()?.initData)
}