import type { TelegramUser } from './telegram'

export type UpgradeLevelsDto = {
  smallBone: number
  bigBone: number
  autoFarm1: number
  autoFarm2: number
}

export type PlayerDto = {
  id: string
  telegramId: string | null
  username: string | null
  firstName: string | null
  balance: number
  clickProfit: number
  hourlyProfit: number
  upgradeLevels: UpgradeLevelsDto
  referrerId?: string | null
  referralBonusClaimed?: boolean
  createdAt: string
  updatedAt: string
}

export type ReferralDto = {
  id: string
  telegramId: string | null
  username: string | null
  firstName: string | null
  balance: number
  createdAt: string
}

export type PlayerSyncPayload = {
  telegramUser: TelegramUser | null
  startParam: string | null
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
  telegramId: string | null
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

export async function getCurrentPlayer(telegramUser: TelegramUser | null) {
  const params = new URLSearchParams()

  if (telegramUser?.id) {
    params.set('telegramId', String(telegramUser.id))
  }

  const query = params.toString()
  const url = query
    ? `${API_BASE_URL}/api/player/current?${query}`
    : `${API_BASE_URL}/api/player/current`

  const response = await fetch(url)

  return parseJsonResponse<{
    status: 'ok'
    game: GameStateDto
    player: PlayerDto | null
  }>(response)
}

export async function getPlayerReferrals(telegramUser: TelegramUser | null) {
  const params = new URLSearchParams()

  if (telegramUser?.id) {
    params.set('telegramId', String(telegramUser.id))
  }

  const query = params.toString()
  const url = query
    ? `${API_BASE_URL}/api/player/referrals?${query}`
    : `${API_BASE_URL}/api/player/referrals`

  const response = await fetch(url)

  return parseJsonResponse<{
    status: 'ok'
    referrals: ReferralDto[]
    count: number
    joinBonus: number
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
      startParam: payload.startParam,
      balance: payload.balance,
      clickProfit: payload.clickProfit,
      hourlyProfit: payload.hourlyProfit,
      upgradeLevels: payload.upgradeLevels,
    }),
  })

  return parseJsonResponse<{
    status: 'ok'
    game: GameStateDto
    player: PlayerDto
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