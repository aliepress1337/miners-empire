import type { TelegramUser } from './telegram'

export type UpgradeLevelsDto = Record<string, number>

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
  hourlyProfit: number
  createdAt: string
}

export type LeaderboardPlayerDto = {
  rank: number
  id: string
  telegramId: string | null
  username: string | null
  firstName: string | null
  displayName: string
  balance: number
}

export type LeaderboardDto = {
  status: 'ok'
  playersCount: number
  leaderboard: LeaderboardPlayerDto[]
  currentPlayer: LeaderboardPlayerDto | null
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
    hourlyBonusPercent: number
    hourlyBonus: number
  }>(response)
}

export async function getLeaderboard(telegramUser: TelegramUser | null) {
  const params = new URLSearchParams()

  if (telegramUser?.id) {
    params.set('telegramId', String(telegramUser.id))
  }

  params.set('limit', '50')

  const response = await fetch(`${API_BASE_URL}/api/leaderboard?${params}`)

  return parseJsonResponse<LeaderboardDto>(response)
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

export async function finishGameForTest() {
  const response = await fetch(`${API_BASE_URL}/api/game/finish-for-test`, {
    method: 'POST',
  })

  return parseJsonResponse<{
    status: 'ok'
    game: GameStateDto
  }>(response)
}

export async function resetGameForTest() {
  const response = await fetch(`${API_BASE_URL}/api/game/reset-for-test`, {
    method: 'POST',
  })

  return parseJsonResponse<{
    status: 'ok'
    game: GameStateDto
  }>(response)
}

export async function finalizeRewards() {
  const response = await fetch(`${API_BASE_URL}/api/rewards/finalize`, {
    method: 'POST',
  })

  return parseJsonResponse<{
    status: 'ok'
    alreadyFinalized: boolean
    game: GameStateDto
    finalRewards: FinalRewardsDto
  }>(response)
}
