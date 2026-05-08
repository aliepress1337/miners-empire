import type { TelegramUser } from './telegram'

export type UpgradeLevelsDto = {
  smallBone: number
  bigBone: number
  autoFarm1: number
  autoFarm2: number
}

export type PlayerSyncPayload = {
  telegramUser: TelegramUser | null
  balance: number
  clickProfit: number
  hourlyProfit: number
  upgradeLevels: UpgradeLevelsDto
}

export type GameStateDto = {
  status: 'active' | 'finished'
  startedAt: string
  endsAt: string
  serverTime: string
  rewardPool: number
  rewardsFinalized?: boolean
}

export type PlayerRewardDto = {
  playerId: string
  telegramId: number | null
  username: string | null
  firstName: string | null
  finalBalance: number
  sharePercent: number
  rewardAmount: number
  promoCode: string
}

export type FinalRewardsDto = {
  rewardPool: number
  playersCount: number
  totalBalance: number
  rewards: PlayerRewardDto[]
  finalizedAt: string
}

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') ??
  'http://localhost:4000'

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => null)

  if (!response.ok) {
    const message =
      data && typeof data === 'object' && 'error' in data
        ? String(data.error)
        : `Request failed with status ${response.status}`

    throw new Error(message)
  }

  return data as T
}

export async function getGameState() {
  const response = await fetch(`${API_BASE_URL}/api/game/state`)

  return parseJsonResponse<{
    status: 'ok'
    game: GameStateDto
  }>(response)
}

export async function syncPlayerProgress(payload: PlayerSyncPayload) {
  const response = await fetch(`${API_BASE_URL}/api/player/sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      telegramId: payload.telegramUser?.id,
      username: payload.telegramUser?.username,
      firstName: payload.telegramUser?.firstName,
      balance: payload.balance,
      clickProfit: payload.clickProfit,
      hourlyProfit: payload.hourlyProfit,
      upgradeLevels: payload.upgradeLevels,
    }),
  })

  return parseJsonResponse<{
    status: 'ok'
    game: GameStateDto
    player: unknown
  }>(response)
}

export async function getFinalRewards() {
  const response = await fetch(`${API_BASE_URL}/api/rewards/final`)

  return parseJsonResponse<{
    status: 'ok'
    game: GameStateDto
    finalRewards: FinalRewardsDto
  }>(response)
}

export async function getRewardsPreview() {
  const response = await fetch(`${API_BASE_URL}/api/rewards/preview`)

  return parseJsonResponse<{
    status: 'ok'
    game: GameStateDto
    rewardPool: number
    playersCount: number
    totalBalance: number
    rewards: PlayerRewardDto[]
    calculatedAt: string
  }>(response)
}