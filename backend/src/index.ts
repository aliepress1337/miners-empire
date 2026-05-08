import { PrismaClient } from '@prisma/client'
import cors from 'cors'
import dotenv from 'dotenv'
import express from 'express'

dotenv.config()

const app = express()
const prisma = new PrismaClient()

const PORT = Number(process.env.PORT) || 4000
const REWARD_POOL = 20
const REFERRAL_JOIN_BONUS = 500

const GAME_STATE_ID = 'main'
const GAME_DURATION_DAYS = 7
const GAME_DURATION_MS = GAME_DURATION_DAYS * 24 * 60 * 60 * 1000

const INITIAL_GAME_STARTED_AT = process.env.GAME_STARTED_AT
  ? new Date(process.env.GAME_STARTED_AT)
  : new Date()

app.use(cors())
app.use(express.json())

type GameStatus = 'active' | 'finished'

type UpgradeLevels = {
  smallBone: number
  bigBone: number
  autoFarm1: number
  autoFarm2: number
}

type PlayerSyncRequest = {
  telegramId?: number
  username?: string
  firstName?: string
  startParam?: string | null
  balance: number
  clickProfit: number
  hourlyProfit: number
  upgradeLevels: UpgradeLevels
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
  if (!value || typeof value !== 'object') {
    return null
  }

  const levels = value as Partial<UpgradeLevels>

  return {
    smallBone: Number(levels.smallBone) || 0,
    bigBone: Number(levels.bigBone) || 0,
    autoFarm1: Number(levels.autoFarm1) || 0,
    autoFarm2: Number(levels.autoFarm2) || 0,
  }
}

function roundReward(value: number) {
  return Math.round(value * 1000000) / 1000000
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
  smallBoneLevel: number
  bigBoneLevel: number
  autoFarm1Level: number
  autoFarm2Level: number
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
    upgradeLevels: {
      smallBone: player.smallBoneLevel,
      bigBone: player.bigBoneLevel,
      autoFarm1: player.autoFarm1Level,
      autoFarm2: player.autoFarm2Level,
    },
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

async function getOrCreateGameState() {
  const existingGameState = await prisma.gameState.findUnique({
    where: {
      id: GAME_STATE_ID,
    },
  })

  if (existingGameState) {
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
    orderBy: {
      balance: 'desc',
    },
  })

  const totalBalance = players.reduce((sum, player) => {
    return sum + player.balance
  }, 0)

  const rewards: PlayerReward[] =
    totalBalance <= 0
      ? players.map((player) => ({
          playerId: player.id,
          telegramId: player.telegramId,
          username: player.username,
          firstName: player.firstName,
          finalBalance: player.balance,
          sharePercent: 0,
          rewardAmount: 0,
          promoCode: generatePromoCode(player.id, 0),
        }))
      : players.map((player) => {
          const share = player.balance / totalBalance
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
  await prisma.gameState.update({
    where: {
      id: GAME_STATE_ID,
    },
    data: {
      gameEndsAt: new Date(),
    },
  })

  const game = await getGameStateResponse()

  res.json({
    status: 'ok',
    game,
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

  const playerId = getPlayerId(body)

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
      balance: Math.max(0, Math.floor(body.balance)),
      clickProfit: Math.max(1, Math.floor(body.clickProfit)),
      hourlyProfit: Math.max(0, Math.floor(body.hourlyProfit)),
      smallBoneLevel: upgradeLevels.smallBone,
      bigBoneLevel: upgradeLevels.bigBone,
      autoFarm1Level: upgradeLevels.autoFarm1,
      autoFarm2Level: upgradeLevels.autoFarm2,
    },
    update: {
      telegramId:
        typeof body.telegramId === 'number' ? String(body.telegramId) : null,
      username: body.username ?? null,
      firstName: body.firstName ?? null,
      balance: Math.max(0, Math.floor(body.balance)),
      clickProfit: Math.max(1, Math.floor(body.clickProfit)),
      hourlyProfit: Math.max(0, Math.floor(body.hourlyProfit)),
      smallBoneLevel: upgradeLevels.smallBone,
      bigBoneLevel: upgradeLevels.bigBone,
      autoFarm1Level: upgradeLevels.autoFarm1,
      autoFarm2Level: upgradeLevels.autoFarm2,
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

  const game = await getGameStateResponse()

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

  res.json({
    status: 'ok',
    referrals: referrals.map((player) => ({
      id: player.id,
      telegramId: player.telegramId,
      username: player.username,
      firstName: player.firstName,
      balance: player.balance,
      createdAt: player.createdAt,
    })),
    count: referrals.length,
    joinBonus: REFERRAL_JOIN_BONUS,
  })
})

app.get('/api/leaderboard', async (req, res) => {
  const currentPlayerId = getPlayerIdFromQuery(req.query.telegramId)
  const limit = Math.min(Number(req.query.limit) || 50, 100)

  const allPlayers = await prisma.player.findMany({
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
    (player) => player.id === currentPlayerId,
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
  const players = await prisma.player.findMany()
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