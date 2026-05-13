import { PrismaClient } from '@prisma/client'
import { randomUUID } from 'crypto'
import cors from 'cors'
import dotenv from 'dotenv'
import express from 'express'

dotenv.config()

const app = express()
const prisma = new PrismaClient()

const PORT = Number(process.env.PORT) || 4000
const REWARD_POOL = 20
const REFERRAL_JOIN_BONUS = 5000
const REFERRAL_HOURLY_BONUS_PERCENT = 0.05
const TOP_1_REWARD_MULTIPLIER = 1.3
const TOP_2_REWARD_MULTIPLIER = 1.2
const TOP_3_REWARD_MULTIPLIER = 1.1

const GAME_STATE_ID = 'main'
const GAME_DURATION_DAYS = 14
const GAME_DURATION_MS = GAME_DURATION_DAYS * 24 * 60 * 60 * 1000
const LEVEL_10_CRACK_STEPS = 3
const COIN_SKIN_IDS = [1, 2, 3, 4]
const UNLUCKY_DURATION_MS = 24 * 60 * 60 * 1000
const DEFAULT_ADMIN_TELEGRAM_IDS = '973268077'
const ADMIN_TELEGRAM_IDS = new Set(
  (process.env.ADMIN_TELEGRAM_IDS ?? DEFAULT_ADMIN_TELEGRAM_IDS)
    .split(',')
    .map((telegramId) => telegramId.trim())
    .filter(Boolean),
)
const TELEGRAM_BOT_TOKEN =
  process.env.TELEGRAM_BOT_TOKEN ?? process.env.BOT_TOKEN ?? ''
const TELEGRAM_BOT_USERNAME = process.env.TELEGRAM_BOT_USERNAME ?? 'MinersEmpire_bot'
const WEB_LOGIN_CODE_TTL_MS = 10 * 60 * 1000

const INITIAL_GAME_STARTED_AT = process.env.GAME_STARTED_AT
  ? new Date(process.env.GAME_STARTED_AT)
  : new Date()

app.use(cors())
app.use(express.json())

type GameStatus = 'active' | 'finished'

type UpgradeLevels = Record<string, number>

type PlayerSyncRequest = {
  telegramId?: number
  username?: string
  firstName?: string
  startParam?: string | null
  gameStartedAt?: string | null
  gameEndsAt?: string | null
  balance: number
  clickProfit: number
  hourlyProfit: number
  upgradeLevels: UpgradeLevels
  level10UnlockStep?: number
  level10AnimationCompleted?: boolean
  selectedCoinSkin?: number | null
  knownPlayerUpdatedAt?: string | null
}

type PlayerReward = {
  playerId: string
  telegramId: string | null
  username: string | null
  firstName: string | null
  finalBalance: number
  sharePercent: number
  rewardAmount: number
  promoCode: string
}

type WebLoginSession = {
  sessionId: string
  code: string
  expiresAt: number
  telegramUser: {
    id: number
    username: string | null
    firstName: string | null
  } | null
}

const webLoginSessions = new Map<string, WebLoginSession>()

function getPlayerId(body: Partial<PlayerSyncRequest>) {
  if (typeof body.telegramId === 'number') {
    return `telegram:${body.telegramId}`
  }

  return 'browser:beta-user'
}

function getPlayerIdFromQuery(telegramId: unknown) {
  if (typeof telegramId === 'string' && telegramId.trim() !== '') {
    return `telegram:${telegramId}`
  }

  return 'browser:beta-user'
}

function getReferrerIdFromStartParam(startParam: unknown) {
  if (typeof startParam !== 'string') {
    return null
  }

  const trimmedStartParam = startParam.trim()

  if (!trimmedStartParam.startsWith('USER-')) {
    return null
  }

  const telegramId = trimmedStartParam.replace('USER-', '').trim()

  if (!telegramId) {
    return null
  }

  return `telegram:${telegramId}`
}

function normalizeUpgradeLevels(value: unknown): UpgradeLevels | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([upgradeId, level]) => {
      const parsedLevel = Math.floor(toSafeNumber(level, 0))

      return [upgradeId, Math.max(0, parsedLevel)]
    }),
  )
}

function getLegacyUpgradeLevel(upgradeLevels: UpgradeLevels, upgradeId: string) {
  return Math.max(0, Math.floor(toSafeNumber(upgradeLevels[upgradeId], 0)))
}

function getStoredUpgradeLevels(player: { upgradeLevels?: unknown | null; smallBoneLevel: number; bigBoneLevel: number; autoFarm1Level: number; autoFarm2Level: number }) {
  return (
    normalizeUpgradeLevels(player.upgradeLevels) ??
    normalizeUpgradeLevels({
      smallBone: player.smallBoneLevel,
      bigBone: player.bigBoneLevel,
      autoFarm1: player.autoFarm1Level,
      autoFarm2: player.autoFarm2Level,
    }) ??
    {}
  )
}

function roundReward(value: number) {
  return Math.round(value * 1000000) / 1000000
}

function getRankRewardMultiplier(rank: number) {
  if (rank === 1) {
    return TOP_1_REWARD_MULTIPLIER
  }

  if (rank === 2) {
    return TOP_2_REWARD_MULTIPLIER
  }

  if (rank === 3) {
    return TOP_3_REWARD_MULTIPLIER
  }

  return 1
}

function getRewardScore(finalBalance: number, rank: number) {
  return Math.max(0, finalBalance) * getRankRewardMultiplier(rank)
}

function toSafeNumber(value: unknown, fallback = 0) {
  const parsedValue = Number(value)

  return Number.isFinite(parsedValue) ? parsedValue : fallback
}

function isStaleGameSync(options: {
  gameStartedAt: Date
  clientGameStartedAt: unknown
}) {
  if (typeof options.clientGameStartedAt !== 'string') {
    return false
  }

  const parsedClientGameStartedAt = Date.parse(options.clientGameStartedAt)

  if (!Number.isFinite(parsedClientGameStartedAt)) {
    return false
  }

  return parsedClientGameStartedAt + 5000 < options.gameStartedAt.getTime()
}

function normalizeLevel10UnlockStep(value: unknown) {
  const parsedValue = Math.floor(toSafeNumber(value, 0))

  if (parsedValue <= 0) {
    return 0
  }

  return Math.min(parsedValue, LEVEL_10_CRACK_STEPS)
}

function normalizeLevel10AnimationCompleted(value: unknown) {
  return value === true
}


function normalizeCoinSkinId(value: unknown) {
  const parsedValue = Math.floor(toSafeNumber(value, 0))

  return COIN_SKIN_IDS.includes(parsedValue) ? parsedValue : null
}

function normalizeUnlockedCoinSkins(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as number[]
  }

  return Array.from(
    new Set(
      value
        .map((skinId) => normalizeCoinSkinId(skinId))
        .filter((skinId): skinId is number => skinId !== null),
    ),
  ).sort((leftSkinId, rightSkinId) => leftSkinId - rightSkinId)
}

function normalizeSelectedCoinSkin(
  value: unknown,
  unlockedCoinSkins: number[],
) {
  const skinId = normalizeCoinSkinId(value)

  if (!skinId) {
    return null
  }

  return unlockedCoinSkins.includes(skinId) ? skinId : null
}

function addUnlockedCoinSkin(unlockedCoinSkins: number[], skinId: number) {
  return Array.from(new Set([...unlockedCoinSkins, skinId])).sort(
    (leftSkinId, rightSkinId) => leftSkinId - rightSkinId,
  )
}

function isAdminTelegramUser(telegramId: unknown) {
  if (typeof telegramId !== 'number' && typeof telegramId !== 'string') {
    return false
  }

  return ADMIN_TELEGRAM_IDS.has(String(telegramId))
}

async function sendTelegramMessage(chatId: string | number, text: string) {
  if (!TELEGRAM_BOT_TOKEN) {
    console.log('Telegram bot token is not configured. Message:', text)
    return false
  }

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: chatId,
          text,
        }),
      },
    )

    if (!response.ok) {
      console.error('Failed to send Telegram message:', await response.text())
      return false
    }

    return true
  } catch (error) {
    console.error('Failed to send Telegram message:', error)
    return false
  }
}

async function sendTelegramPhoto(options: {
  chatId: string | number
  photoFileId: string
  caption?: string
}) {
  if (!TELEGRAM_BOT_TOKEN) {
    console.log('Telegram bot token is not configured. Photo caption:', options.caption)
    return false
  }

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: options.chatId,
          photo: options.photoFileId,
          caption: options.caption,
        }),
      },
    )

    if (!response.ok) {
      console.error('Failed to send Telegram photo:', await response.text())
      return false
    }

    return true
  } catch (error) {
    console.error('Failed to send Telegram photo:', error)
    return false
  }
}

function wait(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

async function findPlayerByUnlockTarget(target: string) {
  const normalizedTarget = target.trim().replace(/^@/, '')

  if (!normalizedTarget) {
    return null
  }

  if (/^\d+$/.test(normalizedTarget)) {
    return prisma.player.findFirst({
      where: {
        OR: [
          { telegramId: normalizedTarget },
          { id: `telegram:${normalizedTarget}` },
        ],
      },
    })
  }

  return prisma.player.findFirst({
    where: {
      username: {
        equals: normalizedTarget,
        mode: 'insensitive',
      },
    },
  })
}

function isPlayerUnlucky(unluckyUntil: Date | null) {
  return unluckyUntil !== null && unluckyUntil.getTime() > Date.now()
}

function getCommandName(text: string) {
  const firstPart = text.trim().split(/\s+/)[0] ?? ''

  return firstPart.split('@')[0].toLowerCase()
}

function getCommandParts(text: string) {
  return text.trim().split(/\s+/).filter(Boolean)
}

function getPostText(text: string) {
  return text.replace(/^\/post(?:@\w+)?\s*/i, '').trim()
}

function cleanupExpiredWebLoginSessions() {
  const now = Date.now()

  for (const [sessionId, session] of webLoginSessions.entries()) {
    if (session.expiresAt <= now) {
      webLoginSessions.delete(sessionId)
    }
  }
}

function generateWebLoginCode() {
  cleanupExpiredWebLoginSessions()

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const code = String(Math.floor(100000 + Math.random() * 900000))
    const isAlreadyUsed = [...webLoginSessions.values()].some(
      (session) => session.code === code,
    )

    if (!isAlreadyUsed) {
      return code
    }
  }

  return String(Math.floor(100000 + Math.random() * 900000))
}

function findWebLoginSessionByCode(code: string) {
  cleanupExpiredWebLoginSessions()

  for (const session of webLoginSessions.values()) {
    if (session.code === code) {
      return session
    }
  }

  return null
}

function getLargestPhotoFileId(
  photo:
    | Array<{
        file_id?: string
        width?: number
        height?: number
        file_size?: number
      }>
    | undefined,
) {
  if (!photo || photo.length === 0) {
    return null
  }

  const largestPhoto = [...photo].sort((leftPhoto, rightPhoto) => {
    const leftScore =
      toSafeNumber(leftPhoto.file_size, 0) ||
      toSafeNumber(leftPhoto.width, 0) * toSafeNumber(leftPhoto.height, 0)
    const rightScore =
      toSafeNumber(rightPhoto.file_size, 0) ||
      toSafeNumber(rightPhoto.width, 0) * toSafeNumber(rightPhoto.height, 0)

    return rightScore - leftScore
  })[0]

  return largestPhoto?.file_id ?? null
}

async function broadcastTelegramPost(options: {
  adminChatId: string | number
  text: string
  photoFileId: string | null
}) {
  const players = await prisma.player.findMany({
    where: {
      telegramId: {
        not: null,
      },
      bannedAt: null,
    },
    select: {
      telegramId: true,
    },
  })

  const chatIds = Array.from(
    new Set(
      players
        .map((player) => player.telegramId)
        .filter((telegramId): telegramId is string => Boolean(telegramId)),
    ),
  )

  let sentCount = 0
  let failedCount = 0

  for (const chatId of chatIds) {
    const wasSent = options.photoFileId
      ? await sendTelegramPhoto({
          chatId,
          photoFileId: options.photoFileId,
          caption: options.text,
        })
      : await sendTelegramMessage(chatId, options.text)

    if (wasSent) {
      sentCount += 1
    } else {
      failedCount += 1
    }

    await wait(45)
  }

  await sendTelegramMessage(
    options.adminChatId,
    `✅ Рассылка завершена. Отправлено: ${sentCount}/${chatIds.length}. Ошибок: ${failedCount}.`,
  )

  return {
    totalCount: chatIds.length,
    sentCount,
    failedCount,
  }
}


async function resetPlayerProgress(playerId: string) {
  return prisma.player.update({
    where: {
      id: playerId,
    },
    data: {
      balance: 0,
      clickProfit: 1,
      hourlyProfit: 0,
      upgradeLevels: {},
      level10UnlockStep: 0,
      level10AnimationCompleted: false,
      selectedCoinSkin: null,
      smallBoneLevel: 0,
      bigBoneLevel: 0,
      autoFarm1Level: 0,
      autoFarm2Level: 0,
    },
  })
}

async function resetGameForOfficialRelease() {
  const gameStartedAt = new Date()
  const gameEndsAt = new Date(gameStartedAt.getTime() + GAME_DURATION_MS)

  return prisma.$transaction(async (transaction) => {
    await transaction.finalReward.deleteMany()

    const playersResetResult = await transaction.player.updateMany({
      data: {
        balance: 0,
        clickProfit: 1,
        hourlyProfit: 0,
        upgradeLevels: {},
        level10UnlockStep: 0,
        level10AnimationCompleted: false,
        unlockedCoinSkins: [],
        selectedCoinSkin: null,
        afkFullFarmUnlocked: false,
        unluckyUntil: null,
        bannedAt: null,
        banReason: null,
        smallBoneLevel: 0,
        bigBoneLevel: 0,
        autoFarm1Level: 0,
        autoFarm2Level: 0,
        referrerId: null,
        referralBonusClaimed: false,
      },
    })

    const gameState = await transaction.gameState.upsert({
      where: {
        id: GAME_STATE_ID,
      },
      update: {
        gameStartedAt,
        gameEndsAt,
        rewardPool: REWARD_POOL,
        finalizedAt: null,
      },
      create: {
        id: GAME_STATE_ID,
        gameStartedAt,
        gameEndsAt,
        rewardPool: REWARD_POOL,
      },
    })

    return {
      playersReset: playersResetResult.count,
      gameState,
    }
  })
}

function calculateReferralHourlyBonus(referrals: Array<{ hourlyProfit: number }>) {
  const hourlyBonus = referrals.reduce((sum, referral) => {
    return (
      sum +
      Math.max(0, toSafeNumber(referral.hourlyProfit, 0)) *
        REFERRAL_HOURLY_BONUS_PERCENT
    )
  }, 0)

  return Math.round(hourlyBonus * 10) / 10
}

function generatePromoCode(playerId: string, rewardAmount: number) {
  const safeId = playerId.replace(/[^a-zA-Z0-9]/g, '').slice(-8).toUpperCase()
  const safeReward = Math.round(rewardAmount * 1000000)

  return `MINERS-${safeId}-${safeReward}`
}

function playerToDto(player: {
  id: string
  telegramId: string | null
  username: string | null
  firstName: string | null
  balance: number
  clickProfit: number
  hourlyProfit: number
  level10UnlockStep: number
  level10AnimationCompleted: boolean
  unlockedCoinSkins?: unknown | null
  selectedCoinSkin?: number | null
  afkFullFarmUnlocked: boolean
  unluckyUntil: Date | null
  bannedAt: Date | null
  banReason: string | null
  smallBoneLevel: number
  bigBoneLevel: number
  autoFarm1Level: number
  autoFarm2Level: number
  upgradeLevels?: unknown | null
  referrerId: string | null
  referralBonusClaimed: boolean
  createdAt: Date
  updatedAt: Date
}) {
  return {
    id: player.id,
    telegramId: player.telegramId,
    username: player.username,
    firstName: player.firstName,
    balance: player.balance,
    clickProfit: player.clickProfit,
    hourlyProfit: player.hourlyProfit,
    upgradeLevels: getStoredUpgradeLevels(player),
    level10UnlockStep: normalizeLevel10UnlockStep(player.level10UnlockStep),
    level10AnimationCompleted: player.level10AnimationCompleted,
    unlockedCoinSkins: normalizeUnlockedCoinSkins(player.unlockedCoinSkins),
    selectedCoinSkin: normalizeSelectedCoinSkin(
      player.selectedCoinSkin,
      normalizeUnlockedCoinSkins(player.unlockedCoinSkins),
    ),
    afkFullFarmUnlocked: player.afkFullFarmUnlocked === true,
    unluckyUntil: player.unluckyUntil?.toISOString() ?? null,
    isUnlucky: isPlayerUnlucky(player.unluckyUntil),
    bannedAt: player.bannedAt?.toISOString() ?? null,
    banReason: player.banReason,
    isBanned: player.bannedAt !== null,
    referrerId: player.referrerId,
    referralBonusClaimed: player.referralBonusClaimed,
    createdAt: player.createdAt,
    updatedAt: player.updatedAt,
  }
}

function getPlayerDisplayName(player: {
  telegramId: string | null
  username: string | null
  firstName: string | null
  id: string
}) {
  if (player.username) {
    return `@${player.username}`
  }

  if (player.firstName) {
    return player.firstName
  }

  if (player.telegramId) {
    return `ID ${player.telegramId}`
  }

  return player.id
}

function isRealTelegramPlayer(player: {
  id: string
  telegramId: string | null
}) {
  return Boolean(player.telegramId) && player.id.startsWith('telegram:')
}

async function getOrCreateGameState() {
  const existingGameState = await prisma.gameState.findUnique({
    where: {
      id: GAME_STATE_ID,
    },
  })

  if (existingGameState) {
    const expectedGameEndsAt = new Date(
      existingGameState.gameStartedAt.getTime() + GAME_DURATION_MS,
    )

    if (
      existingGameState.finalizedAt === null &&
      existingGameState.gameEndsAt.getTime() < expectedGameEndsAt.getTime()
    ) {
      return prisma.gameState.update({
        where: {
          id: GAME_STATE_ID,
        },
        data: {
          gameEndsAt: expectedGameEndsAt,
        },
      })
    }

    return existingGameState
  }

  const gameStartedAt = INITIAL_GAME_STARTED_AT
  const gameEndsAt = new Date(gameStartedAt.getTime() + GAME_DURATION_MS)

  return prisma.gameState.create({
    data: {
      id: GAME_STATE_ID,
      gameStartedAt,
      gameEndsAt,
      rewardPool: REWARD_POOL,
    },
  })
}

function getGameStatus(gameEndsAt: Date): GameStatus {
  return Date.now() >= gameEndsAt.getTime() ? 'finished' : 'active'
}

async function getGameStateResponse() {
  const gameState = await getOrCreateGameState()
  const status = getGameStatus(gameState.gameEndsAt)

  return {
    status,
    startedAt: gameState.gameStartedAt.toISOString(),
    endsAt: gameState.gameEndsAt.toISOString(),
    serverTime: new Date().toISOString(),
    rewardPool: gameState.rewardPool,
    rewardsFinalized: gameState.finalizedAt !== null,
  }
}

async function applyReferralIfNeeded(options: {
  playerId: string
  startParam: string | null | undefined
}) {
  const referrerId = getReferrerIdFromStartParam(options.startParam)

  if (!referrerId) {
    return
  }

  if (referrerId === options.playerId) {
    return
  }

  const invitedPlayer = await prisma.player.findUnique({
    where: {
      id: options.playerId,
    },
  })

  if (!invitedPlayer) {
    return
  }

  if (invitedPlayer.referralBonusClaimed) {
    return
  }

  const referrer = await prisma.player.findUnique({
    where: {
      id: referrerId,
    },
  })

  if (!referrer) {
    return
  }

  await prisma.$transaction([
    prisma.player.update({
      where: {
        id: referrerId,
      },
      data: {
        balance: {
          increment: REFERRAL_JOIN_BONUS,
        },
      },
    }),
    prisma.player.update({
      where: {
        id: options.playerId,
      },
      data: {
        referrerId,
        referralBonusClaimed: true,
      },
    }),
  ])
}

async function calculateRewards() {
  const gameState = await getOrCreateGameState()

  const players = await prisma.player.findMany({
    where: {
      telegramId: {
        not: null,
      },
    },
    orderBy: [
      {
        balance: 'desc',
      },
      {
        createdAt: 'asc',
      },
    ],
  })

  const totalBalance = players.reduce((sum, player) => {
    return sum + player.balance
  }, 0)

  const scoredPlayers = players.map((player, index) => {
    const rank = index + 1

    return {
      player,
      rank,
      rewardScore: getRewardScore(player.balance, rank),
    }
  })

  const totalRewardScore = scoredPlayers.reduce((sum, scoredPlayer) => {
    return sum + scoredPlayer.rewardScore
  }, 0)

  const rewards: PlayerReward[] =
    totalRewardScore <= 0
      ? scoredPlayers.map(({ player }) => ({
          playerId: player.id,
          telegramId: player.telegramId,
          username: player.username,
          firstName: player.firstName,
          finalBalance: player.balance,
          sharePercent: 0,
          rewardAmount: 0,
          promoCode: generatePromoCode(player.id, 0),
        }))
      : scoredPlayers.map(({ player, rewardScore }) => {
          const share = rewardScore / totalRewardScore
          const rewardAmount = roundReward(share * gameState.rewardPool)
          const sharePercent = roundReward(share * 100)

          return {
            playerId: player.id,
            telegramId: player.telegramId,
            username: player.username,
            firstName: player.firstName,
            finalBalance: player.balance,
            sharePercent,
            rewardAmount,
            promoCode: generatePromoCode(player.id, rewardAmount),
          }
        })

  return {
    rewardPool: gameState.rewardPool,
    playersCount: players.length,
    totalBalance,
    rewards,
    finalizedAt: new Date().toISOString(),
  }
}

app.get('/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`

    res.json({
      status: 'ok',
      service: 'miners-empire-backend',
      database: 'connected',
      timestamp: new Date().toISOString(),
    })
  } catch {
    res.status(500).json({
      status: 'error',
      service: 'miners-empire-backend',
      database: 'disconnected',
      timestamp: new Date().toISOString(),
    })
  }
})

app.get('/api/game/state', async (_req, res) => {
  const game = await getGameStateResponse()

  res.json({
    status: 'ok',
    game,
  })
})

app.post('/api/game/finish-for-test', async (_req, res) => {
  res.status(404).json({
    status: 'disabled',
    message: 'Test endpoint is disabled for the public release.',
  })
})

app.post('/api/game/reset-for-test', async (_req, res) => {
  res.status(404).json({
    status: 'disabled',
    message: 'Test endpoint is disabled for the public release.',
  })
})

app.get('/api/player/current', async (req, res) => {
  const playerId = getPlayerIdFromQuery(req.query.telegramId)

  const player = await prisma.player.findUnique({
    where: {
      id: playerId,
    },
  })

  const game = await getGameStateResponse()

  if (!player) {
    res.json({
      status: 'ok',
      game,
      player: null,
    })
    return
  }

  res.json({
    status: 'ok',
    game,
    player: playerToDto(player),
  })
})


app.post('/api/web-login/start', async (_req, res) => {
  const sessionId = randomUUID()
  const code = generateWebLoginCode()
  const expiresAt = Date.now() + WEB_LOGIN_CODE_TTL_MS

  webLoginSessions.set(sessionId, {
    sessionId,
    code,
    expiresAt,
    telegramUser: null,
  })

  res.json({
    status: 'ok',
    sessionId,
    code,
    expiresAt: new Date(expiresAt).toISOString(),
    botUsername: TELEGRAM_BOT_USERNAME,
  })
})

app.get('/api/web-login/status', async (req, res) => {
  cleanupExpiredWebLoginSessions()

  const sessionId = typeof req.query.sessionId === 'string'
    ? req.query.sessionId
    : ''
  const session = webLoginSessions.get(sessionId)

  if (!session) {
    res.status(404).json({
      status: 'expired',
      confirmed: false,
    })
    return
  }

  if (!session.telegramUser) {
    res.json({
      status: 'pending',
      confirmed: false,
      expiresAt: new Date(session.expiresAt).toISOString(),
    })
    return
  }

  const player = await prisma.player.findUnique({
    where: {
      id: `telegram:${session.telegramUser.id}`,
    },
  })

  res.json({
    status: 'confirmed',
    confirmed: true,
    telegramUser: session.telegramUser,
    player: player ? playerToDto(player) : null,
  })
})

app.post('/api/player/sync', async (req, res) => {
  const gameState = await getOrCreateGameState()
  const gameStatus = getGameStatus(gameState.gameEndsAt)

  if (gameStatus === 'finished') {
    const game = await getGameStateResponse()

    res.status(403).json({
      error: 'game is finished',
      game,
    })
    return
  }

  const body = req.body as Partial<PlayerSyncRequest>

  if (typeof body.balance !== 'number') {
    res.status(400).json({
      error: 'balance must be a number',
    })
    return
  }

  if (typeof body.clickProfit !== 'number') {
    res.status(400).json({
      error: 'clickProfit must be a number',
    })
    return
  }

  if (typeof body.hourlyProfit !== 'number') {
    res.status(400).json({
      error: 'hourlyProfit must be a number',
    })
    return
  }

  const upgradeLevels = normalizeUpgradeLevels(body.upgradeLevels)

  if (!upgradeLevels) {
    res.status(400).json({
      error: 'upgradeLevels is required',
    })
    return
  }

  const requestedBalance = Math.max(0, Math.floor(body.balance))
  const requestedClickProfit = Math.max(1, Math.floor(body.clickProfit))
  const requestedHourlyProfit = Math.max(0, Math.floor(body.hourlyProfit))

  const playerId = getPlayerId(body)
  const existingPlayer = await prisma.player.findUnique({
    where: {
      id: playerId,
    },
  })

  if (existingPlayer?.bannedAt) {
    const game = await getGameStateResponse()

    res.status(403).json({
      error: 'player is banned',
      game,
      player: playerToDto(existingPlayer),
    })
    return
  }

  const game = await getGameStateResponse()
  const progressReset = isStaleGameSync({
    gameStartedAt: gameState.gameStartedAt,
    clientGameStartedAt: body.gameStartedAt,
  })

  if (progressReset && existingPlayer) {
    res.json({
      status: 'ok',
      game,
      player: playerToDto(existingPlayer),
      progressReset: true,
    })
    return
  }

  const knownPlayerUpdatedAt = typeof body.knownPlayerUpdatedAt === 'string'
    ? new Date(body.knownPlayerUpdatedAt)
    : null
  const hasKnownPlayerUpdatedAt = Boolean(
    knownPlayerUpdatedAt && !Number.isNaN(knownPlayerUpdatedAt.getTime()),
  )

  if (
    existingPlayer &&
    hasKnownPlayerUpdatedAt &&
    existingPlayer.updatedAt.getTime() > knownPlayerUpdatedAt!.getTime() + 500
  ) {
    res.json({
      status: 'ok',
      game,
      player: playerToDto(existingPlayer),
      syncConflict: true,
    })
    return
  }

  const existingUnlockedCoinSkins = normalizeUnlockedCoinSkins(
    existingPlayer?.unlockedCoinSkins,
  )
  const nextSelectedCoinSkin =
    body.selectedCoinSkin === undefined
      ? normalizeSelectedCoinSkin(
          existingPlayer?.selectedCoinSkin,
          existingUnlockedCoinSkins,
        )
      : normalizeSelectedCoinSkin(body.selectedCoinSkin, existingUnlockedCoinSkins)

  const player = await prisma.player.upsert({
    where: {
      id: playerId,
    },
    create: {
      id: playerId,
      telegramId:
        typeof body.telegramId === 'number' ? String(body.telegramId) : null,
      username: body.username ?? null,
      firstName: body.firstName ?? null,
      balance: requestedBalance,
      clickProfit: requestedClickProfit,
      hourlyProfit: requestedHourlyProfit,
      upgradeLevels,
      level10UnlockStep: normalizeLevel10UnlockStep(body.level10UnlockStep),
      level10AnimationCompleted: normalizeLevel10AnimationCompleted(
        body.level10AnimationCompleted,
      ),
      unlockedCoinSkins: [],
      selectedCoinSkin: null,
      smallBoneLevel: getLegacyUpgradeLevel(upgradeLevels, 'smallBone'),
      bigBoneLevel: getLegacyUpgradeLevel(upgradeLevels, 'bigBone'),
      autoFarm1Level: getLegacyUpgradeLevel(upgradeLevels, 'autoFarm1'),
      autoFarm2Level: getLegacyUpgradeLevel(upgradeLevels, 'autoFarm2'),
    },
    update: {
      telegramId:
        typeof body.telegramId === 'number' ? String(body.telegramId) : null,
      username: body.username ?? null,
      firstName: body.firstName ?? null,
      balance: requestedBalance,
      clickProfit: requestedClickProfit,
      hourlyProfit: requestedHourlyProfit,
      upgradeLevels,
      level10UnlockStep: normalizeLevel10UnlockStep(body.level10UnlockStep),
      level10AnimationCompleted: normalizeLevel10AnimationCompleted(
        body.level10AnimationCompleted,
      ),
      selectedCoinSkin: nextSelectedCoinSkin,
      smallBoneLevel: getLegacyUpgradeLevel(upgradeLevels, 'smallBone'),
      bigBoneLevel: getLegacyUpgradeLevel(upgradeLevels, 'bigBone'),
      autoFarm1Level: getLegacyUpgradeLevel(upgradeLevels, 'autoFarm1'),
      autoFarm2Level: getLegacyUpgradeLevel(upgradeLevels, 'autoFarm2'),
    },
  })

  await applyReferralIfNeeded({
    playerId,
    startParam: body.startParam,
  })

  const updatedPlayer = await prisma.player.findUniqueOrThrow({
    where: {
      id: player.id,
    },
  })

  console.log('Player stored:', updatedPlayer)

  res.json({
    status: 'ok',
    game,
    player: playerToDto(updatedPlayer),
  })
})

app.get('/api/player/referrals', async (req, res) => {
  const playerId = getPlayerIdFromQuery(req.query.telegramId)

  const referrals = await prisma.player.findMany({
    where: {
      referrerId: playerId,
    },
    orderBy: {
      createdAt: 'desc',
    },
  })

  const referralHourlyBonus = calculateReferralHourlyBonus(referrals)

  res.json({
    status: 'ok',
    referrals: referrals.map((player) => ({
      id: player.id,
      telegramId: player.telegramId,
      username: player.username,
      firstName: player.firstName,
      balance: player.balance,
      hourlyProfit: player.hourlyProfit,
      createdAt: player.createdAt,
    })),
    count: referrals.length,
    joinBonus: REFERRAL_JOIN_BONUS,
    hourlyBonusPercent: REFERRAL_HOURLY_BONUS_PERCENT * 100,
    hourlyBonus: referralHourlyBonus,
  })
})

app.get('/api/leaderboard', async (req, res) => {
  const currentPlayerId = getPlayerIdFromQuery(req.query.telegramId)
  const limit = Math.min(Number(req.query.limit) || 50, 100)

  const allPlayers = await prisma.player.findMany({
    where: {
      telegramId: {
        not: null,
      },
    },
    orderBy: [
      {
        balance: 'desc',
      },
      {
        createdAt: 'asc',
      },
    ],
  })

  const leaderboard = allPlayers.slice(0, limit).map((player, index) => ({
    rank: index + 1,
    id: player.id,
    telegramId: player.telegramId,
    username: player.username,
    firstName: player.firstName,
    displayName: getPlayerDisplayName(player),
    balance: player.balance,
  }))

  const currentPlayerIndex = allPlayers.findIndex(
    (player) => isRealTelegramPlayer(player) && player.id === currentPlayerId,
  )

  const currentPlayer =
    currentPlayerIndex >= 0
      ? {
          rank: currentPlayerIndex + 1,
          id: allPlayers[currentPlayerIndex].id,
          telegramId: allPlayers[currentPlayerIndex].telegramId,
          username: allPlayers[currentPlayerIndex].username,
          firstName: allPlayers[currentPlayerIndex].firstName,
          displayName: getPlayerDisplayName(allPlayers[currentPlayerIndex]),
          balance: allPlayers[currentPlayerIndex].balance,
        }
      : null

  res.json({
    status: 'ok',
    playersCount: allPlayers.length,
    leaderboard,
    currentPlayer,
  })
})

app.get('/api/players', async (_req, res) => {
  const players = await prisma.player.findMany({
    orderBy: {
      balance: 'desc',
    },
  })

  const game = await getGameStateResponse()

  res.json({
    status: 'ok',
    game,
    players: players.map(playerToDto),
  })
})

app.get('/api/players/summary', async (_req, res) => {
  const players = await prisma.player.findMany({
    where: {
      telegramId: {
        not: null,
      },
    },
  })
  const game = await getGameStateResponse()

  const totalBalance = players.reduce((sum, player) => {
    return sum + player.balance
  }, 0)

  res.json({
    status: 'ok',
    game,
    playersCount: players.length,
    totalBalance,
    rewardPool: game.rewardPool,
    updatedAt: new Date().toISOString(),
  })
})

app.get('/api/rewards/preview', async (_req, res) => {
  const preview = await calculateRewards()
  const game = await getGameStateResponse()

  res.json({
    status: 'ok',
    game,
    rewardPool: preview.rewardPool,
    playersCount: preview.playersCount,
    totalBalance: preview.totalBalance,
    rewards: preview.rewards,
    calculatedAt: new Date().toISOString(),
  })
})

app.post('/api/rewards/finalize', async (_req, res) => {
  const gameState = await getOrCreateGameState()

  if (getGameStatus(gameState.gameEndsAt) !== 'finished') {
    const game = await getGameStateResponse()

    res.status(400).json({
      error: 'game is still active',
      game,
    })
    return
  }

  const existingFinalRewards = await prisma.finalReward.findMany({
    orderBy: {
      rewardAmount: 'desc',
    },
  })

  if (existingFinalRewards.length > 0 && gameState.finalizedAt) {
    const game = await getGameStateResponse()

    res.json({
      status: 'ok',
      alreadyFinalized: true,
      game,
      finalRewards: {
        rewardPool: gameState.rewardPool,
        playersCount: existingFinalRewards.length,
        totalBalance: existingFinalRewards.reduce((sum, reward) => {
          return sum + reward.finalBalance
        }, 0),
        rewards: existingFinalRewards.map((reward) => ({
          playerId: reward.playerId,
          telegramId: reward.telegramId,
          username: reward.username,
          firstName: reward.firstName,
          finalBalance: reward.finalBalance,
          sharePercent: reward.sharePercent,
          rewardAmount: reward.rewardAmount,
          promoCode: reward.promoCode,
        })),
        finalizedAt: gameState.finalizedAt.toISOString(),
      },
    })
    return
  }

  const calculatedRewards = await calculateRewards()
  const finalizedAt = new Date()

  await prisma.$transaction([
    prisma.finalReward.deleteMany(),
    ...calculatedRewards.rewards.map((reward) =>
      prisma.finalReward.create({
        data: {
          id: reward.playerId,
          playerId: reward.playerId,
          telegramId: reward.telegramId,
          username: reward.username,
          firstName: reward.firstName,
          finalBalance: reward.finalBalance,
          sharePercent: reward.sharePercent,
          rewardAmount: reward.rewardAmount,
          promoCode: reward.promoCode,
          finalizedAt,
        },
      }),
    ),
    prisma.gameState.update({
      where: {
        id: GAME_STATE_ID,
      },
      data: {
        finalizedAt,
      },
    }),
  ])

  const game = await getGameStateResponse()

  res.json({
    status: 'ok',
    alreadyFinalized: false,
    game,
    finalRewards: {
      ...calculatedRewards,
      finalizedAt: finalizedAt.toISOString(),
    },
  })
})

app.get('/api/rewards/final', async (_req, res) => {
  const gameState = await getOrCreateGameState()

  if (!gameState.finalizedAt) {
    const game = await getGameStateResponse()

    res.status(404).json({
      error: 'rewards are not finalized yet',
      game,
    })
    return
  }

  const rewards = await prisma.finalReward.findMany({
    orderBy: {
      rewardAmount: 'desc',
    },
  })

  const game = await getGameStateResponse()

  res.json({
    status: 'ok',
    game,
    finalRewards: {
      rewardPool: gameState.rewardPool,
      playersCount: rewards.length,
      totalBalance: rewards.reduce((sum, reward) => {
        return sum + reward.finalBalance
      }, 0),
      rewards: rewards.map((reward) => ({
        playerId: reward.playerId,
        telegramId: reward.telegramId,
        username: reward.username,
        firstName: reward.firstName,
        finalBalance: reward.finalBalance,
        sharePercent: reward.sharePercent,
        rewardAmount: reward.rewardAmount,
        promoCode: reward.promoCode,
      })),
      finalizedAt: gameState.finalizedAt.toISOString(),
    },
  })
})



app.post('/api/telegram/webhook', async (req, res) => {
  const update = req.body as {
    message?: {
      chat?: { id?: string | number }
      from?: { id?: number; username?: string; first_name?: string }
      text?: string
      caption?: string
      photo?: Array<{
        file_id?: string
        width?: number
        height?: number
        file_size?: number
      }>
    }
  }

  const message = update.message
  const chatId = message?.chat?.id
  const text = (message?.text ?? message?.caption ?? '').trim()
  const commandName = getCommandName(text)
  const supportedCommands = new Set([
    '/unlock',
    '/afkfarm',
    '/unluck',
    '/resetacc',
    '/banuser',
    '/post',
    '/officialrelease',
    '/startrelease',
    '/login',
  ])

  if (!message || !chatId || !supportedCommands.has(commandName)) {
    res.json({ status: 'ok', ignored: true })
    return
  }

  if (commandName === '/login') {
    const code = getCommandParts(text)[1]?.trim() ?? ''
    const session = /^\d{6}$/.test(code) ? findWebLoginSessionByCode(code) : null

    if (!session || !message.from?.id) {
      await sendTelegramMessage(
        chatId,
        '❌ Код входа не найден или уже истёк. Открой веб-версию игры и получи новый код.',
      )
      res.json({ status: 'ok', error: 'invalid_web_login_code' })
      return
    }

    session.telegramUser = {
      id: message.from.id,
      username: message.from.username ?? null,
      firstName: message.from.first_name ?? null,
    }

    await prisma.player.upsert({
      where: {
        id: `telegram:${message.from.id}`,
      },
      create: {
        id: `telegram:${message.from.id}`,
        telegramId: String(message.from.id),
        username: message.from.username ?? null,
        firstName: message.from.first_name ?? null,
        balance: 0,
        clickProfit: 1,
        hourlyProfit: 0,
        upgradeLevels: {},
        unlockedCoinSkins: [],
      },
      update: {
        telegramId: String(message.from.id),
        username: message.from.username ?? null,
        firstName: message.from.first_name ?? null,
      },
    })

    await sendTelegramMessage(
      chatId,
      '✅ Вход подтверждён. Теперь вернись на сайт с веб-версией игры.',
    )

    res.json({ status: 'ok', confirmed: true })
    return
  }

  if (!isAdminTelegramUser(message.from?.id)) {
    await sendTelegramMessage(chatId, `❌ У тебя нет доступа к ${commandName}.`)
    res.json({ status: 'ok', allowed: false })
    return
  }

  if (commandName === '/officialrelease' || commandName === '/startrelease') {
    const result = await resetGameForOfficialRelease()

    await sendTelegramMessage(
      chatId,
      `✅ Официальный запуск начат. Таймер 14 дней запущен с нуля. Обнулено игроков: ${result.playersReset}. Финиш: ${result.gameState.gameEndsAt.toLocaleString('ru-RU')}.`,
    )

    res.json({
      status: 'ok',
      playersReset: result.playersReset,
      game: {
        startedAt: result.gameState.gameStartedAt.toISOString(),
        endsAt: result.gameState.gameEndsAt.toISOString(),
      },
    })
    return
  }

  if (commandName === '/post') {
    const postText = getPostText(text)
    const photoFileId = getLargestPhotoFileId(message.photo)

    if (!postText && !photoFileId) {
      await sendTelegramMessage(
        chatId,
        'Формат: отправь фото боту с подписью /post текст поста. Можно также отправить /post текст без фото.',
      )
      res.json({ status: 'ok', error: 'bad_command_format' })
      return
    }

    await sendTelegramMessage(chatId, '📣 Запускаю рассылку поста всем игрокам...')

    void broadcastTelegramPost({
      adminChatId: chatId,
      text: postText,
      photoFileId,
    }).catch(async (error) => {
      console.error('Post broadcast failed:', error)
      await sendTelegramMessage(chatId, '❌ Ошибка во время рассылки поста. Проверь Railway logs.')
    })

    res.json({ status: 'ok', broadcast: 'started' })
    return
  }


  const parts = getCommandParts(text)
  const target = parts[1]

  if (!target) {
    await sendTelegramMessage(
      chatId,
      'Форматы:\n/unlock @username 1\n/afkfarm @username\n/unluck @username\n/resetacc @username\n/banuser @username\n/post текст + фото\n/officialrelease',
    )
    res.json({ status: 'ok', error: 'bad_command_format' })
    return
  }

  if (commandName === '/unlock') {
    const skinId = normalizeCoinSkinId(parts[2])

    if (!skinId) {
      await sendTelegramMessage(
        chatId,
        'Формат: /unlock @username 1\nДоступные скины: 1, 2, 3, 4',
      )
      res.json({ status: 'ok', error: 'bad_command_format' })
      return
    }

    const player = await findPlayerByUnlockTarget(target)

    if (!player) {
      await sendTelegramMessage(
        chatId,
        `❌ Игрок ${target} не найден. Он должен хотя бы раз открыть игру через Telegram.`,
      )
      res.json({ status: 'ok', error: 'player_not_found' })
      return
    }

    const unlockedCoinSkins = addUnlockedCoinSkin(
      normalizeUnlockedCoinSkins(player.unlockedCoinSkins),
      skinId,
    )

    const updatedPlayer = await prisma.player.update({
      where: {
        id: player.id,
      },
      data: {
        unlockedCoinSkins,
      },
    })

    await sendTelegramMessage(
      chatId,
      `✅ Скин #${skinId} открыт для ${getPlayerDisplayName(updatedPlayer)}.`,
    )

    res.json({
      status: 'ok',
      player: playerToDto(updatedPlayer),
    })
    return
  }

  const player = await findPlayerByUnlockTarget(target)

  if (!player) {
    await sendTelegramMessage(
      chatId,
      `❌ Игрок ${target} не найден. Он должен хотя бы раз открыть игру через Telegram.`,
    )
    res.json({ status: 'ok', error: 'player_not_found' })
    return
  }

  if (commandName === '/afkfarm') {
    const updatedPlayer = await prisma.player.update({
      where: {
        id: player.id,
      },
      data: {
        afkFullFarmUnlocked: true,
      },
    })

    await sendTelegramMessage(
      chatId,
      `✅ Full AFK Farm открыт для ${getPlayerDisplayName(updatedPlayer)}. Офлайн-фарм теперь 1x вместо 0.5x.`,
    )

    res.json({ status: 'ok', player: playerToDto(updatedPlayer) })
    return
  }

  if (commandName === '/unluck') {
    const unluckyUntil = new Date(Date.now() + UNLUCKY_DURATION_MS)
    const updatedPlayer = await prisma.player.update({
      where: {
        id: player.id,
      },
      data: {
        unluckyUntil,
      },
    })

    await sendTelegramMessage(
      chatId,
      `✅ Неудача наложена на ${getPlayerDisplayName(updatedPlayer)} до ${unluckyUntil.toLocaleString('ru-RU')}.`,
    )

    res.json({ status: 'ok', player: playerToDto(updatedPlayer) })
    return
  }

  if (commandName === '/resetacc') {
    const updatedPlayer = await resetPlayerProgress(player.id)

    await sendTelegramMessage(
      chatId,
      `✅ Прогресс ${getPlayerDisplayName(updatedPlayer)} обнулён. Купленные скины не удалялись.`,
    )

    res.json({ status: 'ok', player: playerToDto(updatedPlayer) })
    return
  }

  if (commandName === '/banuser') {
    const updatedPlayer = await prisma.player.update({
      where: {
        id: player.id,
      },
      data: {
        bannedAt: new Date(),
        banReason: 'Забанен администратором.',
      },
    })

    await sendTelegramMessage(
      chatId,
      `✅ ${getPlayerDisplayName(updatedPlayer)} забанен навсегда.`,
    )

    res.json({ status: 'ok', player: playerToDto(updatedPlayer) })
  }
})


async function startServer() {
  await getOrCreateGameState()

  app.listen(PORT, () => {
    console.log(`Miners Empire backend is running on http://localhost:${PORT}`)
  })
}

startServer().catch((error) => {
  console.error('Failed to start backend:', error)
  process.exit(1)
})

process.on('SIGINT', async () => {
  await prisma.$disconnect()
  process.exit(0)
})

process.on('SIGTERM', async () => {
  await prisma.$disconnect()
  process.exit(0)
})