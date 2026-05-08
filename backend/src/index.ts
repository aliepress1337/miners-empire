import cors from 'cors'
import dotenv from 'dotenv'
import express from 'express'
import fs from 'node:fs/promises'

dotenv.config()

const app = express()

const PORT = Number(process.env.PORT) || 4000
const REWARD_POOL = 20

const GAME_DURATION_DAYS = 7
const GAME_DURATION_MS = GAME_DURATION_DAYS * 24 * 60 * 60 * 1000

const INITIAL_GAME_STARTED_AT = process.env.GAME_STARTED_AT
  ? new Date(process.env.GAME_STARTED_AT).getTime()
  : Date.now()

const DB_DIR = new URL('../data/', import.meta.url)
const DB_FILE = new URL('../data/db.json', import.meta.url)

let gameStartedAt = INITIAL_GAME_STARTED_AT
let gameEndsAt = gameStartedAt + GAME_DURATION_MS

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
  balance: number
  clickProfit: number
  hourlyProfit: number
  upgradeLevels: UpgradeLevels
}

type StoredPlayer = {
  id: string
  telegramId: number | null
  username: string | null
  firstName: string | null
  balance: number
  clickProfit: number
  hourlyProfit: number
  upgradeLevels: UpgradeLevels
  createdAt: string
  updatedAt: string
}

type PlayerReward = {
  playerId: string
  telegramId: number | null
  username: string | null
  firstName: string | null
  finalBalance: number
  sharePercent: number
  rewardAmount: number
  promoCode: string
}

type FinalizedRewards = {
  rewardPool: number
  playersCount: number
  totalBalance: number
  rewards: PlayerReward[]
  finalizedAt: string
}

type DatabaseFile = {
  gameStartedAt: number
  gameEndsAt: number
  players: StoredPlayer[]
  finalizedRewards: FinalizedRewards | null
}

const players = new Map<string, StoredPlayer>()

let finalizedRewards: FinalizedRewards | null = null

function getGameStatus(): GameStatus {
  return Date.now() >= gameEndsAt ? 'finished' : 'active'
}

function getGameState() {
  const now = Date.now()
  const status = getGameStatus()

  return {
    status,
    startedAt: new Date(gameStartedAt).toISOString(),
    endsAt: new Date(gameEndsAt).toISOString(),
    serverTime: new Date(now).toISOString(),
    rewardPool: REWARD_POOL,
    rewardsFinalized: finalizedRewards !== null,
  }
}

function getPlayerId(body: Partial<PlayerSyncRequest>) {
  if (typeof body.telegramId === 'number') {
    return `telegram:${body.telegramId}`
  }

  return 'browser:beta-user'
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

function calculateRewards(): FinalizedRewards {
  const allPlayers = Array.from(players.values())
  const totalBalance = allPlayers.reduce((sum, player) => {
    return sum + player.balance
  }, 0)

  const rewards: PlayerReward[] =
    totalBalance <= 0
      ? allPlayers.map((player) => ({
          playerId: player.id,
          telegramId: player.telegramId,
          username: player.username,
          firstName: player.firstName,
          finalBalance: player.balance,
          sharePercent: 0,
          rewardAmount: 0,
          promoCode: generatePromoCode(player.id, 0),
        }))
      : allPlayers.map((player) => {
          const share = player.balance / totalBalance
          const rewardAmount = roundReward(share * REWARD_POOL)
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
    rewardPool: REWARD_POOL,
    playersCount: allPlayers.length,
    totalBalance,
    rewards,
    finalizedAt: new Date().toISOString(),
  }
}

async function loadDatabase() {
  try {
    const rawDatabase = await fs.readFile(DB_FILE, 'utf-8')
    const database = JSON.parse(rawDatabase) as Partial<DatabaseFile>

    gameStartedAt = Number(database.gameStartedAt) || INITIAL_GAME_STARTED_AT
    gameEndsAt = Number(database.gameEndsAt) || gameStartedAt + GAME_DURATION_MS
    finalizedRewards = database.finalizedRewards ?? null

    players.clear()

    if (Array.isArray(database.players)) {
      for (const player of database.players) {
        if (player?.id) {
          players.set(player.id, player)
        }
      }
    }

    console.log(`Database loaded. Players: ${players.size}`)
  } catch {
    console.log('No database file found. Starting with empty database.')
    await saveDatabase()
  }
}

async function saveDatabase() {
  const database: DatabaseFile = {
    gameStartedAt,
    gameEndsAt,
    players: Array.from(players.values()),
    finalizedRewards,
  }

  await fs.mkdir(DB_DIR, { recursive: true })
  await fs.writeFile(DB_FILE, JSON.stringify(database, null, 2), 'utf-8')
}

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'miners-empire-backend',
    timestamp: new Date().toISOString(),
  })
})

app.get('/api/game/state', (_req, res) => {
  res.json({
    status: 'ok',
    game: getGameState(),
  })
})

app.post('/api/game/finish-for-test', async (_req, res) => {
  gameEndsAt = Date.now()
  await saveDatabase()

  res.json({
    status: 'ok',
    game: getGameState(),
  })
})

app.post('/api/player/sync', async (req, res) => {
  const gameStatus = getGameStatus()

  if (gameStatus === 'finished') {
    res.status(403).json({
      error: 'game is finished',
      game: getGameState(),
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

  const now = new Date().toISOString()
  const playerId = getPlayerId(body)
  const existingPlayer = players.get(playerId)

  const storedPlayer: StoredPlayer = {
    id: playerId,
    telegramId: body.telegramId ?? null,
    username: body.username ?? null,
    firstName: body.firstName ?? null,
    balance: Math.max(0, Math.floor(body.balance)),
    clickProfit: Math.max(1, Math.floor(body.clickProfit)),
    hourlyProfit: Math.max(0, Math.floor(body.hourlyProfit)),
    upgradeLevels,
    createdAt: existingPlayer?.createdAt ?? now,
    updatedAt: now,
  }

  players.set(playerId, storedPlayer)
  await saveDatabase()

  console.log('Player stored:', storedPlayer)

  res.json({
    status: 'ok',
    game: getGameState(),
    player: storedPlayer,
  })
})

app.get('/api/players', (_req, res) => {
  const allPlayers = Array.from(players.values())

  res.json({
    status: 'ok',
    game: getGameState(),
    players: allPlayers,
  })
})

app.get('/api/players/summary', (_req, res) => {
  const allPlayers = Array.from(players.values())
  const totalBalance = allPlayers.reduce((sum, player) => {
    return sum + player.balance
  }, 0)

  res.json({
    status: 'ok',
    game: getGameState(),
    playersCount: allPlayers.length,
    totalBalance,
    rewardPool: REWARD_POOL,
    updatedAt: new Date().toISOString(),
  })
})

app.get('/api/rewards/preview', (_req, res) => {
  const preview = calculateRewards()

  res.json({
    status: 'ok',
    game: getGameState(),
    rewardPool: preview.rewardPool,
    playersCount: preview.playersCount,
    totalBalance: preview.totalBalance,
    rewards: preview.rewards,
    calculatedAt: new Date().toISOString(),
  })
})

app.post('/api/rewards/finalize', async (_req, res) => {
  if (getGameStatus() !== 'finished') {
    res.status(400).json({
      error: 'game is still active',
      game: getGameState(),
    })
    return
  }

  if (finalizedRewards) {
    res.json({
      status: 'ok',
      alreadyFinalized: true,
      game: getGameState(),
      finalRewards: finalizedRewards,
    })
    return
  }

  finalizedRewards = calculateRewards()
  await saveDatabase()

  res.json({
    status: 'ok',
    alreadyFinalized: false,
    game: getGameState(),
    finalRewards: finalizedRewards,
  })
})

app.get('/api/rewards/final', (_req, res) => {
  if (!finalizedRewards) {
    res.status(404).json({
      error: 'rewards are not finalized yet',
      game: getGameState(),
    })
    return
  }

  res.json({
    status: 'ok',
    game: getGameState(),
    finalRewards: finalizedRewards,
  })
})

async function startServer() {
  await loadDatabase()

  app.listen(PORT, () => {
    console.log(`Miners Empire backend is running on http://localhost:${PORT}`)
  })
}

startServer().catch((error) => {
  console.error('Failed to start backend:', error)
  process.exit(1)
})