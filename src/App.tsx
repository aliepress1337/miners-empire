import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
} from 'react'
import './App.css'

import {
  finalizeRewards,
  finishGameForTest,
  getCurrentPlayer,
  getFinalRewards,
  getGameState,
  getLeaderboard,
  getPlayerReferrals,
  resetGameForTest,
  syncPlayerProgress,
  syncPlayerProgressBeacon,
  type FinalRewardsDto,
  type GameStateDto,
  type LeaderboardPlayerDto,
  type PlayerRewardDto,
  type PlayerSyncPayload,
  type ReferralDto,
} from './api'

import {
  getTelegramStartParam,
  getTelegramUser,
  initTelegramMiniApp,
  isOpenedInTelegram,
  type TelegramUser,
} from './telegram'

import bgImage from './assets/bg.png'
import coinImage from './assets/coin.png'
import mainCoinImage from './assets/main-coin.png'

import dogLevel1 from './assets/dogs_lvl/1.png'
import dogLevel2 from './assets/dogs_lvl/2.png'
import dogLevel3 from './assets/dogs_lvl/3.png'
import dogLevel4 from './assets/dogs_lvl/4.png'
import dogLevel5 from './assets/dogs_lvl/5.png'
import dogLevel6 from './assets/dogs_lvl/6.png'
import dogLevel7 from './assets/dogs_lvl/7.png'
import dogLevel8 from './assets/dogs_lvl/8.png'

import clickerIcon from './assets/icons/clicker.png'
import feedIcon from './assets/icons/feed.png'
import friendsIcon from './assets/icons/friends.png'
import rankingIcon from './assets/icons/ranking.png'
import shopIcon from './assets/icons/shop.png'

type LevelConfig = {
  level: number
  name: string
  minCoins: number
}

type TabName = 'clicker' | 'feed' | 'friends' | 'earn' | 'shop'

type UpgradeId = string

type UpgradeType = 'click' | 'hourly'

type FeedCategory = 'food' | 'auto'

type FeedUpgrade = {
  id: UpgradeId
  title: string
  type: UpgradeType
  category: FeedCategory
  basePrice: number
  profitIncrease: number
  description: string
  emoji: string
  tag: string
}

type ShopItem = {
  title: string
  description: string
  badge: string
  priceLabel: string
  icon: string
}

type UpgradeLevels = Record<UpgradeId, number>

type GameSave = {
  balance: number
  clickProfit: number
  hourlyProfit: number
  upgradeLevels: UpgradeLevels
  gameStartedAt: number
  gameEndsAt: number
  savedAt: number
}

const SAVE_KEY = 'tsutsik-game-save'

const GAME_DURATION_DAYS = 7
const GAME_DURATION_MS = GAME_DURATION_DAYS * 24 * 60 * 60 * 1000

const OFFLINE_HOURLY_MULTIPLIER = 0.5
const ONLINE_HOURLY_MULTIPLIER = 1
const PRICE_GROWTH = 1.75
const PROFIT_GROWTH = 1.25
const AUTO_SYNC_DELAY_MS = 1500
const SOCIAL_REFRESH_INTERVAL_MS = 10000

const BOT_USERNAME = 'MinersEmpire_bot'
const REFERRAL_JOIN_BONUS = 5000
const REFERRAL_HOURLY_BONUS_PERCENT = 0.05
const REFERRAL_HOURLY_BONUS_PERCENT_LABEL = 5

const FEED_SECTIONS: Array<{
  category: FeedCategory
  title: string
  description: string
}> = [
  {
    category: 'food',
    title: 'Еда для кликов',
    description: 'Редкие, но заметные апгрейды силы клика.',
  },
  {
    category: 'auto',
    title: 'Пассивный фарм',
    description: 'Стабильный рост монет в час без постоянных кликов.',
  },
]

const FEED_UPGRADES: FeedUpgrade[] = [
  {
    id: 'crumbs',
    title: 'Crumbs',
    type: 'click',
    category: 'food',
    basePrice: 10,
    profitIncrease: 1,
    description: 'Самый дешёвый стартовый корм.',
    emoji: '🍪',
    tag: 'Start',
  },
  {
    id: 'smallBone',
    title: 'Small Bone',
    type: 'click',
    category: 'food',
    basePrice: 45,
    profitIncrease: 2,
    description: 'Первый нормальный буст для кликов.',
    emoji: '🦴',
    tag: 'Basic',
  },
  {
    id: 'puppyCookie',
    title: 'Puppy Cookie',
    type: 'click',
    category: 'food',
    basePrice: 140,
    profitIncrease: 4,
    description: 'Дешёвый буст, но уже ощутимее старта.',
    emoji: '🍪',
    tag: 'Snack',
  },
  {
    id: 'tastyBone',
    title: 'Tasty Bone',
    type: 'click',
    category: 'food',
    basePrice: 420,
    profitIncrease: 8,
    description: 'Плавный переход к средним апгрейдам.',
    emoji: '🍖',
    tag: 'Food',
  },
  {
    id: 'meatSnack',
    title: 'Meat Snack',
    type: 'click',
    category: 'food',
    basePrice: 1200,
    profitIncrease: 15,
    description: 'Больше смысла копить, меньше мелких +3/+5.',
    emoji: '🍗',
    tag: 'Meat',
  },
  {
    id: 'dogBowl',
    title: 'Dog Bowl',
    type: 'click',
    category: 'food',
    basePrice: 3200,
    profitIncrease: 28,
    description: 'Первый уверенный апгрейд для активной игры.',
    emoji: '🥣',
    tag: 'Meal',
  },
  {
    id: 'snackBox',
    title: 'Snack Box',
    type: 'click',
    category: 'food',
    basePrice: 8500,
    profitIncrease: 50,
    description: 'Хороший буст после накопления.',
    emoji: '📦',
    tag: 'Combo',
  },
  {
    id: 'premiumKibble',
    title: 'Premium Kibble',
    type: 'click',
    category: 'food',
    basePrice: 20000,
    profitIncrease: 90,
    description: 'Середина прогресса для сильного клика.',
    emoji: '🍲',
    tag: 'Plus',
  },
  {
    id: 'championMeal',
    title: 'Champion Meal',
    type: 'click',
    category: 'food',
    basePrice: 45000,
    profitIncrease: 150,
    description: 'Первая покупка даёт +150, дальше эффект растёт.',
    emoji: '🏅',
    tag: 'Pro',
  },
  {
    id: 'proteinPlate',
    title: 'Protein Plate',
    type: 'click',
    category: 'food',
    basePrice: 100000,
    profitIncrease: 250,
    description: 'Сильный апгрейд для активного фарма.',
    emoji: '🥘',
    tag: 'Strong',
  },
  {
    id: 'powerSteak',
    title: 'Power Steak',
    type: 'click',
    category: 'food',
    basePrice: 220000,
    profitIncrease: 420,
    description: 'Большой скачок, но цена уже серьёзная.',
    emoji: '🥩',
    tag: 'Power',
  },
  {
    id: 'royalBone',
    title: 'Royal Bone',
    type: 'click',
    category: 'food',
    basePrice: 500000,
    profitIncrease: 700,
    description: 'Премиальная еда до late-game.',
    emoji: '👑',
    tag: 'Royal',
  },
  {
    id: 'goldenFeast',
    title: 'Golden Feast',
    type: 'click',
    category: 'food',
    basePrice: 1100000,
    profitIncrease: 1100,
    description: 'Крупный апгрейд для миллионных балансов.',
    emoji: '🍛',
    tag: 'Gold',
  },
  {
    id: 'legendaryFeast',
    title: 'Legendary Feast',
    type: 'click',
    category: 'food',
    basePrice: 2500000,
    profitIncrease: 1800,
    description: 'Сильный кликовый предмет для поздней игры.',
    emoji: '🔥',
    tag: 'Legend',
  },
  {
    id: 'mythicBowl',
    title: 'Mythic Bowl',
    type: 'click',
    category: 'food',
    basePrice: 5500000,
    profitIncrease: 3000,
    description: 'Очень дорогой, но заметный рост клика.',
    emoji: '💫',
    tag: 'Mythic',
  },
  {
    id: 'feastHall',
    title: 'Tsutsik Feast Hall',
    type: 'click',
    category: 'food',
    basePrice: 12000000,
    profitIncrease: 5000,
    description: 'Финальный кликовый апгрейд в обычной еде.',
    emoji: '🏛️',
    tag: 'Hall',
  },
  {
    id: 'waterBowl',
    title: 'Water Bowl',
    type: 'hourly',
    category: 'auto',
    basePrice: 160,
    profitIncrease: 18,
    description: 'Дешёвый старт пассивной прибыли.',
    emoji: '💧',
    tag: 'Passive',
  },
  {
    id: 'comfyMat',
    title: 'Comfy Mat',
    type: 'hourly',
    category: 'auto',
    basePrice: 360,
    profitIncrease: 45,
    description: 'Небольшой, но полезный автофарм.',
    emoji: '🧺',
    tag: 'Rest',
  },
  {
    id: 'autoFarm1',
    title: 'Auto Farm I',
    type: 'hourly',
    category: 'auto',
    basePrice: 850,
    profitIncrease: 110,
    description: 'Первый серьёзный доход в час.',
    emoji: '⛏️',
    tag: 'Farm',
  },
  {
    id: 'puppyBed',
    title: 'Puppy Bed',
    type: 'hourly',
    category: 'auto',
    basePrice: 1900,
    profitIncrease: 240,
    description: 'Пассивный рост для начала игры.',
    emoji: '🛏️',
    tag: 'Sleep',
  },
  {
    id: 'toyBasket',
    title: 'Toy Basket',
    type: 'hourly',
    category: 'auto',
    basePrice: 4200,
    profitIncrease: 520,
    description: 'Хороший автофарм после первых кликов.',
    emoji: '🧸',
    tag: 'Fun',
  },
  {
    id: 'autoFarm2',
    title: 'Auto Farm II',
    type: 'hourly',
    category: 'auto',
    basePrice: 9000,
    profitIncrease: 1100,
    description: 'Переход к тысячам монет в час.',
    emoji: '⚙️',
    tag: 'Auto',
  },
  {
    id: 'dogHouse',
    title: 'Dog House',
    type: 'hourly',
    category: 'auto',
    basePrice: 20000,
    profitIncrease: 2400,
    description: 'Домик приносит стабильный доход.',
    emoji: '🏠',
    tag: 'House',
  },
  {
    id: 'trainerVisit',
    title: 'Trainer Visit',
    type: 'hourly',
    category: 'auto',
    basePrice: 45000,
    profitIncrease: 5000,
    description: 'Тренер ускоряет прогресс без кликов.',
    emoji: '🧑‍🏫',
    tag: 'Coach',
  },
  {
    id: 'goldenBowl',
    title: 'Golden Bowl',
    type: 'hourly',
    category: 'auto',
    basePrice: 100000,
    profitIncrease: 10500,
    description: 'Пассивный предмет для средних балансов.',
    emoji: '🏆',
    tag: 'Gold',
  },
  {
    id: 'boneGarden',
    title: 'Bone Garden',
    type: 'hourly',
    category: 'auto',
    basePrice: 230000,
    profitIncrease: 22000,
    description: 'Сад косточек растит доход каждый час.',
    emoji: '🌱',
    tag: 'Grow',
  },
  {
    id: 'sleepyGuard',
    title: 'Sleepy Guard',
    type: 'hourly',
    category: 'auto',
    basePrice: 520000,
    profitIncrease: 47000,
    description: 'Охранник фармит, даже когда отдыхает.',
    emoji: '🐶',
    tag: 'Guard',
  },
  {
    id: 'autoKitchen',
    title: 'Auto Kitchen',
    type: 'hourly',
    category: 'auto',
    basePrice: 1100000,
    profitIncrease: 100000,
    description: 'Кухня автоматически создаёт прибыль.',
    emoji: '🍳',
    tag: 'Kitchen',
  },
  {
    id: 'kennelNetwork',
    title: 'Kennel Network',
    type: 'hourly',
    category: 'auto',
    basePrice: 2500000,
    profitIncrease: 220000,
    description: 'Сеть домиков для большого автофарма.',
    emoji: '🏘️',
    tag: 'Network',
  },
  {
    id: 'foodTruck',
    title: 'Food Truck',
    type: 'hourly',
    category: 'auto',
    basePrice: 5500000,
    profitIncrease: 480000,
    description: 'Мобильная кухня приносит монеты в час.',
    emoji: '🚚',
    tag: 'Truck',
  },
  {
    id: 'boneFactory',
    title: 'Bone Factory',
    type: 'hourly',
    category: 'auto',
    basePrice: 12000000,
    profitIncrease: 1000000,
    description: 'Фабрика для миллионного пассивного дохода.',
    emoji: '🏭',
    tag: 'Factory',
  },
  {
    id: 'cityShelter',
    title: 'City Shelter',
    type: 'hourly',
    category: 'auto',
    basePrice: 26000000,
    profitIncrease: 2200000,
    description: 'Большой shelter для сильного late-game.',
    emoji: '🏙️',
    tag: 'City',
  },
  {
    id: 'trainingWhistle',
    title: 'Training Whistle',
    type: 'click',
    category: 'food',
    basePrice: 75000,
    profitIncrease: 180,
    description: 'Премиальный буст активной игры.',
    emoji: '📣',
    tag: 'Boost',
  },
  {
    id: 'silverLeash',
    title: 'Silver Leash',
    type: 'click',
    category: 'food',
    basePrice: 180000,
    profitIncrease: 380,
    description: 'Редкий предмет для кликового роста.',
    emoji: '🔗',
    tag: 'Rare',
  },
  {
    id: 'goldenCollar',
    title: 'Golden Collar',
    type: 'click',
    category: 'food',
    basePrice: 420000,
    profitIncrease: 800,
    description: 'Эпический клик-буст для сильной игры.',
    emoji: '📿',
    tag: 'Epic',
  },
  {
    id: 'vipKennel',
    title: 'VIP Kennel',
    type: 'hourly',
    category: 'auto',
    basePrice: 850000,
    profitIncrease: 160000,
    description: 'VIP пассивный доход для богатых игроков.',
    emoji: '🏡',
    tag: 'VIP',
  },
  {
    id: 'guardDogCamp',
    title: 'Guard Dog Camp',
    type: 'hourly',
    category: 'auto',
    basePrice: 1800000,
    profitIncrease: 360000,
    description: 'Охрана приносит большой доход в час.',
    emoji: '🛡️',
    tag: 'Camp',
  },
  {
    id: 'tsutsikFactory',
    title: 'Tsutsik Factory',
    type: 'hourly',
    category: 'auto',
    basePrice: 4000000,
    profitIncrease: 800000,
    description: 'Фабрика для быстрого роста баланса.',
    emoji: '🏭',
    tag: 'Mega',
  },
  {
    id: 'boneMine',
    title: 'Bone Mine',
    type: 'hourly',
    category: 'auto',
    basePrice: 9000000,
    profitIncrease: 1700000,
    description: 'Шахта косточек для late-game фарма.',
    emoji: '💎',
    tag: 'Mine',
  },
  {
    id: 'royalKitchen',
    title: 'Royal Kitchen',
    type: 'hourly',
    category: 'auto',
    basePrice: 18000000,
    profitIncrease: 3200000,
    description: 'Королевская кухня с огромным доходом.',
    emoji: '🍽️',
    tag: 'Royal',
  },
  {
    id: 'legendaryTrainer',
    title: 'Legendary Trainer',
    type: 'click',
    category: 'food',
    basePrice: 22000000,
    profitIncrease: 8000,
    description: 'Очень сильный click апгрейд.',
    emoji: '🏋️',
    tag: 'Legend',
  },
  {
    id: 'tsutsikBank',
    title: 'Tsutsik Bank',
    type: 'hourly',
    category: 'auto',
    basePrice: 40000000,
    profitIncrease: 7000000,
    description: 'Банк для огромного пассивного дохода.',
    emoji: '🏦',
    tag: 'Bank',
  },
  {
    id: 'worldDogCup',
    title: 'World Dog Cup',
    type: 'click',
    category: 'food',
    basePrice: 55000000,
    profitIncrease: 20000,
    description: 'Финальный кликовый трофей.',
    emoji: '🏆',
    tag: 'World',
  },
  {
    id: 'championEmpire',
    title: 'Champion Empire',
    type: 'hourly',
    category: 'auto',
    basePrice: 90000000,
    profitIncrease: 15000000,
    description: 'Самый дорогой пассивный апгрейд.',
    emoji: '🏰',
    tag: 'Endgame',
  },
]

const DEFAULT_UPGRADE_LEVELS: UpgradeLevels = FEED_UPGRADES.reduce<UpgradeLevels>(
  (levels, upgrade) => {
    levels[upgrade.id] = 0
    return levels
  },
  {},
)

const SHOP_ITEMS: ShopItem[] = [
  {
    title: 'Starter Bones',
    description: 'Набор для быстрого старта: монеты, кости и небольшой буст прогресса.',
    badge: 'Soon',
    priceLabel: 'Basic pack',
    icon: '🦴',
  },
  {
    title: 'Click Booster',
    description: 'Временное усиление кликов для активной игры и быстрого роста баланса.',
    badge: 'Beta 2',
    priceLabel: '+ click power',
    icon: '⚡',
  },
  {
    title: 'Auto Farm Pack',
    description: 'Пакет для пассивной прибыли: будет полезен, когда игрок не в игре.',
    badge: 'Planned',
    priceLabel: '+ hourly farm',
    icon: '⏱️',
  },
  {
    title: 'Rare Dog Skin',
    description: 'Косметический предмет без преимущества в балансе, только стиль профиля.',
    badge: 'Cosmetic',
    priceLabel: 'visual item',
    icon: '👑',
  },
]

const LEVELS: LevelConfig[] = [
  { level: 1, name: 'Bronze', minCoins: 0 },
  { level: 2, name: 'Silver', minCoins: 1000 },
  { level: 3, name: 'Gold', minCoins: 50000 },
  { level: 4, name: 'Platinum', minCoins: 300000 },
  { level: 5, name: 'Diamond', minCoins: 1000000 },
  { level: 6, name: 'Master', minCoins: 5000000 },
  { level: 7, name: 'Legend', minCoins: 25000000 },
  { level: 8, name: 'Tsutsik King', minCoins: 100000000 },
]

const DOG_IMAGES: Record<number, string> = {
  1: dogLevel1,
  2: dogLevel2,
  3: dogLevel3,
  4: dogLevel4,
  5: dogLevel5,
  6: dogLevel6,
  7: dogLevel7,
  8: dogLevel8,
}

const TABS: Array<{
  id: TabName
  label: string
  icon: string
}> = [
  { id: 'clicker', label: 'Clicker', icon: clickerIcon },
  { id: 'feed', label: 'Feed', icon: feedIcon },
  { id: 'friends', label: 'Friends', icon: friendsIcon },
  { id: 'earn', label: 'Ranking', icon: rankingIcon },
  { id: 'shop', label: 'Shop', icon: shopIcon },
]

function getSafeNumber(value: unknown, fallback = 0) {
  const parsedValue = Number(value)

  return Number.isFinite(parsedValue) ? parsedValue : fallback
}

function getSafePositiveNumber(value: unknown, fallback = 0) {
  return Math.max(0, getSafeNumber(value, fallback))
}

function formatNumber(value: number) {
  const safeValue = getSafeNumber(value, 0)
  const absoluteValue = Math.abs(safeValue)

  if (absoluteValue < 1000) {
    const roundedValue = Math.round(safeValue * 10) / 10
    return Number.isInteger(roundedValue)
      ? String(roundedValue)
      : roundedValue.toFixed(1)
  }

  const units = [
    { value: 1000000000000, suffix: 'T' },
    { value: 1000000000, suffix: 'B' },
    { value: 1000000, suffix: 'M' },
    { value: 1000, suffix: 'K' },
  ]

  const unit = units.find((currentUnit) => absoluteValue >= currentUnit.value)

  if (!unit) {
    return String(Math.floor(safeValue))
  }

  const shortValue = safeValue / unit.value
  const roundedShortValue = Math.floor(shortValue * 10) / 10

  return `${Number.isInteger(roundedShortValue) ? roundedShortValue.toFixed(0) : roundedShortValue.toFixed(1)}${unit.suffix}`
}

function calculateUpgradePrice(basePrice: number, upgradeLevel: number) {
  return Math.floor(basePrice * PRICE_GROWTH ** upgradeLevel)
}

function calculateUpgradeProfit(baseProfit: number, upgradeLevel: number) {
  return Math.round(baseProfit * PROFIT_GROWTH ** upgradeLevel * 10) / 10
}

function getUpgradeProfitLabel(upgrade: FeedUpgrade, upgradeLevel: number) {
  const profit = calculateUpgradeProfit(upgrade.profitIncrease, upgradeLevel)

  return upgrade.type === 'click'
    ? `+${formatNumber(profit)} за клик`
    : `+${formatNumber(profit)}/час`
}

function normalizeUpgradeLevels(value: unknown): UpgradeLevels {
  const normalizedLevels: UpgradeLevels = { ...DEFAULT_UPGRADE_LEVELS }

  if (!value || typeof value !== 'object') {
    return normalizedLevels
  }

  const partialLevels = value as Partial<Record<UpgradeId, unknown>>

  Object.keys(normalizedLevels).forEach((upgradeId) => {
    const typedUpgradeId = upgradeId as UpgradeId
    const parsedLevel = Number(partialLevels[typedUpgradeId])

    normalizedLevels[typedUpgradeId] = Number.isFinite(parsedLevel)
      ? Math.max(Math.floor(parsedLevel), 0)
      : 0
  })

  return normalizedLevels
}

function createDefaultSave(): GameSave {
  const now = Date.now()

  return {
    balance: 0,
    clickProfit: 1,
    hourlyProfit: 0,
    upgradeLevels: DEFAULT_UPGRADE_LEVELS,
    gameStartedAt: now,
    gameEndsAt: now + GAME_DURATION_MS,
    savedAt: now,
  }
}

function loadSavedGame(): GameSave {
  const defaultSave = createDefaultSave()
  const rawSave = localStorage.getItem(SAVE_KEY)

  if (!rawSave) {
    return defaultSave
  }

  try {
    const parsedSave = JSON.parse(rawSave) as Partial<GameSave> & {
      smallBoneLevel?: number
      bigBoneLevel?: number
      autoFarm1Level?: number
      autoFarm2Level?: number
    }

    const now = Date.now()

    const gameStartedAt = Number(parsedSave.gameStartedAt) || now
    const gameEndsAt =
      Number(parsedSave.gameEndsAt) || gameStartedAt + GAME_DURATION_MS

    const balance = getSafePositiveNumber(parsedSave.balance, 0)
    const clickProfit = getSafePositiveNumber(parsedSave.clickProfit, 1) || 1
    const hourlyProfit = getSafePositiveNumber(parsedSave.hourlyProfit, 0)
    const savedAt = getSafeNumber(parsedSave.savedAt, now) || now

    const upgradeLevels =
      parsedSave.upgradeLevels !== undefined
        ? normalizeUpgradeLevels(parsedSave.upgradeLevels)
        : normalizeUpgradeLevels({
            smallBone: Number(parsedSave.smallBoneLevel) || 0,
            bigBone: Number(parsedSave.bigBoneLevel) || 0,
            autoFarm1: Number(parsedSave.autoFarm1Level) || 0,
            autoFarm2: Number(parsedSave.autoFarm2Level) || 0,
          })

    const offlineEndTime = Math.min(now, gameEndsAt)
    const offlineMilliseconds = Math.max(offlineEndTime - savedAt, 0)
    const offlineHours = offlineMilliseconds / 1000 / 60 / 60
    const offlineReward = hourlyProfit * OFFLINE_HOURLY_MULTIPLIER * offlineHours

    return {
      balance: balance + offlineReward,
      clickProfit,
      hourlyProfit,
      upgradeLevels,
      gameStartedAt,
      gameEndsAt,
      savedAt: now,
    }
  } catch {
    return defaultSave
  }
}

function generateLocalPromoCode(balance: number) {
  const safeBalance = Math.max(Math.floor(balance), 0)
  return `TSUTSIK-${safeBalance}-BETA`
}

function getReferralCode(telegramUser: TelegramUser | null) {
  if (!telegramUser) {
    return 'BETA-USER'
  }

  return `USER-${telegramUser.id}`
}

function getReferralLink(telegramUser: TelegramUser | null) {
  return `https://t.me/${BOT_USERNAME}?startapp=${getReferralCode(telegramUser)}`
}

function getTelegramDisplayName(telegramUser: TelegramUser | null) {
  if (!telegramUser) {
    return 'Browser beta mode'
  }

  if (telegramUser.username) {
    return `@${telegramUser.username}`
  }

  return telegramUser.firstName
}

function getReferralDisplayName(referral: ReferralDto) {
  if (referral.username) {
    return `@${referral.username}`
  }

  if (referral.firstName) {
    return referral.firstName
  }

  if (referral.telegramId) {
    return `ID ${referral.telegramId}`
  }

  return referral.id
}

function findMyReward(
  finalRewards: FinalRewardsDto | null,
  telegramUser: TelegramUser | null,
): PlayerRewardDto | null {
  if (!finalRewards) {
    return null
  }

  if (telegramUser) {
    return (
      finalRewards.rewards.find(
        (reward) => reward.telegramId === String(telegramUser.id),
      ) ?? null
    )
  }

  return (
    finalRewards.rewards.find(
      (reward) => reward.playerId === 'browser:beta-user',
    ) ?? null
  )
}

function isLocalDevelopmentHost() {
  if (typeof window === 'undefined') {
    return false
  }

  return (
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname === '0.0.0.0'
  )
}

function isPhoneLikeDevice() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return true
  }

  const userAgent = navigator.userAgent.toLowerCase()
  const isMobileUserAgent =
    /android|iphone|ipod|windows phone|iemobile|opera mini|mobile/.test(
      userAgent,
    )
  const isIpadOs =
    /macintosh/.test(userAgent) && Number(navigator.maxTouchPoints ?? 0) > 1
  const hasTouch = Number(navigator.maxTouchPoints ?? 0) > 0
  const hasCoarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false
  const shortestScreenSide = Math.min(
    window.screen?.width ?? window.innerWidth,
    window.screen?.height ?? window.innerHeight,
  )

  return (
    isMobileUserAgent ||
    isIpadOs ||
    (hasTouch && hasCoarsePointer && shortestScreenSide <= 820)
  )
}

function shouldBlockDesktopPlay() {
  return !isLocalDevelopmentHost() && !isPhoneLikeDevice()
}

function DesktopBlockedScreen() {
  return (
    <div
      className="app desktop-blocked-app"
      style={{ backgroundImage: `url(${bgImage})` }}
    >
      <main className="desktop-blocked-screen">
        <div className="desktop-blocked-card">
          <img
            className="desktop-blocked-coin"
            src={coinImage}
            alt="Tsutsik coin"
          />

          <h1>Играть можно только с телефона</h1>

          <p>
            Чтобы всё было честно, Tsutsik Game недоступна с компьютера или
            ноутбука. Открой игру в Telegram-приложении на телефоне.
          </p>

          <div className="desktop-blocked-note">
            📱 Телефон → Telegram → Miners Empire Bot → Open App
          </div>
        </div>
      </main>
    </div>
  )
}

function App() {
  if (shouldBlockDesktopPlay()) {
    return <DesktopBlockedScreen />
  }

  const savedGame = useMemo(() => loadSavedGame(), [])

  const [balance, setBalance] = useState(savedGame.balance)
  const [activeTab, setActiveTab] = useState<TabName>('clicker')
  const [clickProfit, setClickProfit] = useState(savedGame.clickProfit)
  const [hourlyProfit, setHourlyProfit] = useState(savedGame.hourlyProfit)
  const [upgradeLevels, setUpgradeLevels] = useState(savedGame.upgradeLevels)
  const [gameStartedAt] = useState(savedGame.gameStartedAt)
  const [gameEndsAt] = useState(savedGame.gameEndsAt)
  const [currentTime, setCurrentTime] = useState(Date.now())
  const [referralCopied, setReferralCopied] = useState(false)

  const [telegramUser, setTelegramUser] = useState<TelegramUser | null>(null)
  const [telegramMode, setTelegramMode] = useState(false)
  const [telegramStartParam, setTelegramStartParam] = useState<string | null>(
    null,
  )

  const [serverGame, setServerGame] = useState<GameStateDto | null>(null)
  const [serverStatusText, setServerStatusText] = useState('Checking backend...')
  const [adminStatusText, setAdminStatusText] = useState('Ready for local tests')
  const [adminActionBusy, setAdminActionBusy] = useState(false)
  const [finalRewards, setFinalRewards] = useState<FinalRewardsDto | null>(null)
  const [backendPlayerLoaded, setBackendPlayerLoaded] = useState(false)

  const latestSyncPayloadRef = useRef<PlayerSyncPayload | null>(null)
  const syncInFlightRef = useRef(false)
  const syncVersionRef = useRef(0)
  const lastSuccessfulSyncVersionRef = useRef(0)
  const lastSocialRefreshRef = useRef(0)
  const backendReadyRef = useRef(false)
  const gameSyncAllowedRef = useRef(false)

  const [referrals, setReferrals] = useState<ReferralDto[]>([])
  const [referralsCount, setReferralsCount] = useState(0)
  const [referralJoinBonus, setReferralJoinBonus] = useState(REFERRAL_JOIN_BONUS)
  const [serverReferralHourlyBonus, setServerReferralHourlyBonus] = useState(0)
  const [referralHourlyBonusPercent, setReferralHourlyBonusPercent] = useState(REFERRAL_HOURLY_BONUS_PERCENT_LABEL)

  const [leaderboard, setLeaderboard] = useState<LeaderboardPlayerDto[]>([])
  const [currentLeaderboardPlayer, setCurrentLeaderboardPlayer] =
    useState<LeaderboardPlayerDto | null>(null)
  const [playersCount, setPlayersCount] = useState(0)

  const displayedBalance = Math.floor(getSafePositiveNumber(balance, 0))
  const safeClickProfit = getSafePositiveNumber(clickProfit, 1) || 1
  const safeHourlyProfit = getSafePositiveNumber(hourlyProfit, 0)
  const calculatedReferralHourlyBonus = useMemo(() => {
    const bonus = referrals.reduce((sum, referral) => {
      return (
        sum +
        getSafePositiveNumber(referral.hourlyProfit, 0) *
          REFERRAL_HOURLY_BONUS_PERCENT
      )
    }, 0)

    return Math.round(bonus * 10) / 10
  }, [referrals])
  const referralHourlyBonus = Math.max(
    getSafePositiveNumber(serverReferralHourlyBonus, 0),
    calculatedReferralHourlyBonus,
  )
  const effectiveHourlyProfit = safeHourlyProfit + referralHourlyBonus
  const maxLevel = LEVELS.length

  const localGameFinished = currentTime >= gameEndsAt
  const serverGameFinished = serverGame?.status === 'finished'
  const isGameFinished = serverGame ? serverGameFinished : localGameFinished

  const referralLink = getReferralLink(telegramUser)
  const myReward = findMyReward(finalRewards, telegramUser)
  const showDevTestPanel = !telegramMode

  const ratingText = currentLeaderboardPlayer
    ? `#${currentLeaderboardPlayer.rank}`
    : '...'

  async function loadReferrals(currentTelegramUser: TelegramUser | null) {
    try {
      const referralsResponse = await getPlayerReferrals(currentTelegramUser)

      const safeReferrals = referralsResponse.referrals.map((referral) => ({
        ...referral,
        balance: getSafePositiveNumber(referral.balance, 0),
        hourlyProfit: getSafePositiveNumber(referral.hourlyProfit, 0),
      }))

      const backendJoinBonus = getSafePositiveNumber(referralsResponse.joinBonus, 0)
      const backendHourlyBonusPercent = getSafePositiveNumber(
        referralsResponse.hourlyBonusPercent,
        0,
      )

      setReferrals(safeReferrals)
      setReferralsCount(getSafePositiveNumber(referralsResponse.count, safeReferrals.length))
      setReferralJoinBonus(
        backendJoinBonus >= REFERRAL_JOIN_BONUS
          ? backendJoinBonus
          : REFERRAL_JOIN_BONUS,
      )
      setServerReferralHourlyBonus(getSafePositiveNumber(referralsResponse.hourlyBonus, 0))
      setReferralHourlyBonusPercent(
        backendHourlyBonusPercent > 0
          ? backendHourlyBonusPercent
          : REFERRAL_HOURLY_BONUS_PERCENT_LABEL,
      )
    } catch (error) {
      console.error('Failed to load referrals:', error)
      setReferrals([])
      setReferralsCount(0)
      setReferralJoinBonus(REFERRAL_JOIN_BONUS)
      setServerReferralHourlyBonus(0)
      setReferralHourlyBonusPercent(REFERRAL_HOURLY_BONUS_PERCENT_LABEL)
    }
  }

  async function loadLeaderboard(currentTelegramUser: TelegramUser | null) {
    try {
      const leaderboardResponse = await getLeaderboard(currentTelegramUser)

      setLeaderboard(leaderboardResponse.leaderboard)
      setCurrentLeaderboardPlayer(leaderboardResponse.currentPlayer)
      setPlayersCount(leaderboardResponse.playersCount)
    } catch (error) {
      console.error('Failed to load leaderboard:', error)
      setLeaderboard([])
      setCurrentLeaderboardPlayer(null)
      setPlayersCount(0)
    }
  }

  async function syncLatestProgress(force = false) {
    if (!backendReadyRef.current || !gameSyncAllowedRef.current) {
      return
    }

    if (syncInFlightRef.current) {
      return
    }

    const payload = latestSyncPayloadRef.current

    if (!payload) {
      return
    }

    const versionToSync = syncVersionRef.current

    if (!force && lastSuccessfulSyncVersionRef.current >= versionToSync) {
      return
    }

    syncInFlightRef.current = true

    try {
      const response = await syncPlayerProgress(payload)

      lastSuccessfulSyncVersionRef.current = Math.max(
        lastSuccessfulSyncVersionRef.current,
        versionToSync,
      )

      if (response.game) {
        setServerGame(response.game)
        setServerStatusText(`Backend game: ${response.game.status}, progress saved`)
      }

      const now = Date.now()

      if (now - lastSocialRefreshRef.current >= SOCIAL_REFRESH_INTERVAL_MS) {
        lastSocialRefreshRef.current = now

        await loadReferrals(payload.telegramUser)
        await loadLeaderboard(payload.telegramUser)
      }
    } catch (error) {
      console.error('Auto sync failed:', error)
      setServerStatusText('Backend sync failed')
    } finally {
      syncInFlightRef.current = false
    }
  }

  useEffect(() => {
    async function initApp() {
      initTelegramMiniApp()

      const currentTelegramUser = getTelegramUser()
      const currentStartParam = getTelegramStartParam()

      setTelegramUser(currentTelegramUser)
      setTelegramMode(isOpenedInTelegram())
      setTelegramStartParam(currentStartParam)

      try {
        const currentPlayerResponse = await getCurrentPlayer(currentTelegramUser)

        setServerGame(currentPlayerResponse.game)
        setServerStatusText(`Backend game: ${currentPlayerResponse.game.status}`)

        const loadedPlayer = currentPlayerResponse.player

        if (loadedPlayer) {
          const rawLocalSave = localStorage.getItem(SAVE_KEY)
          let localSavedAt = 0

          if (rawLocalSave) {
            try {
              localSavedAt = getSafeNumber(
                (JSON.parse(rawLocalSave) as Partial<GameSave>).savedAt,
                0,
              )
            } catch {
              localSavedAt = 0
            }
          }

          const backendSavedAt = new Date(loadedPlayer.updatedAt).getTime()
          const shouldUseBackendPlayer =
            !rawLocalSave || backendSavedAt > localSavedAt + 5000

          if (shouldUseBackendPlayer) {
            setBalance(getSafePositiveNumber(loadedPlayer.balance, 0))
            setClickProfit(getSafePositiveNumber(loadedPlayer.clickProfit, 1) || 1)
            setHourlyProfit(getSafePositiveNumber(loadedPlayer.hourlyProfit, 0))
          } else {
            setServerStatusText(
              `Backend game: ${currentPlayerResponse.game.status}, local progress kept`,
            )
          }

          setUpgradeLevels((currentLevels) =>
            normalizeUpgradeLevels({
              ...currentLevels,
              ...loadedPlayer.upgradeLevels,
            }),
          )
        }

        await loadReferrals(currentTelegramUser)
        await loadLeaderboard(currentTelegramUser)

        if (currentPlayerResponse.game.status === 'finished') {
          try {
            const finalRewardsResponse = await getFinalRewards()

            setFinalRewards(finalRewardsResponse.finalRewards)
            setServerStatusText('Backend game: finished, rewards loaded')
          } catch {
            setFinalRewards(null)
            setServerStatusText('Backend game: finished, rewards not finalized')
          }
        } else {
          setFinalRewards(null)
        }
      } catch {
        setServerGame(null)
        setServerStatusText('Backend unavailable, local beta mode')
      } finally {
        setBackendPlayerLoaded(true)
      }
    }

    initApp()
  }, [])

  useEffect(() => {
    const timerId = window.setInterval(() => {
      setCurrentTime(Date.now())
    }, 1000)

    return () => {
      window.clearInterval(timerId)
    }
  }, [])

  useEffect(() => {
    const nonPassiveOptions: AddEventListenerOptions = { passive: false }
    let lastTouchEndTime = 0

    function preventDefaultGesture(event: Event) {
      event.preventDefault()
    }

    function handleTouchMove(event: TouchEvent) {
      const maybeScaledEvent = event as TouchEvent & { scale?: number }

      if (
        event.touches.length > 1 ||
        (typeof maybeScaledEvent.scale === 'number' && maybeScaledEvent.scale !== 1)
      ) {
        event.preventDefault()
      }
    }

    function handleTouchEnd(event: TouchEvent) {
      const now = Date.now()

      if (now - lastTouchEndTime <= 320) {
        event.preventDefault()
      }

      lastTouchEndTime = now
    }

    function handleWheel(event: WheelEvent) {
      if (event.ctrlKey) {
        event.preventDefault()
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (!event.ctrlKey && !event.metaKey) {
        return
      }

      if (['+', '-', '=', '0'].includes(event.key)) {
        event.preventDefault()
      }
    }

    document.addEventListener('gesturestart', preventDefaultGesture, nonPassiveOptions)
    document.addEventListener('gesturechange', preventDefaultGesture, nonPassiveOptions)
    document.addEventListener('gestureend', preventDefaultGesture, nonPassiveOptions)
    document.addEventListener('touchmove', handleTouchMove, nonPassiveOptions)
    document.addEventListener('touchend', handleTouchEnd, nonPassiveOptions)
    window.addEventListener('wheel', handleWheel, nonPassiveOptions)
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('gesturestart', preventDefaultGesture)
      document.removeEventListener('gesturechange', preventDefaultGesture)
      document.removeEventListener('gestureend', preventDefaultGesture)
      document.removeEventListener('touchmove', handleTouchMove)
      document.removeEventListener('touchend', handleTouchEnd)
      window.removeEventListener('wheel', handleWheel)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  useEffect(() => {
    const save: GameSave = {
      balance,
      clickProfit,
      hourlyProfit,
      upgradeLevels,
      gameStartedAt,
      gameEndsAt,
      savedAt: Date.now(),
    }

    localStorage.setItem(SAVE_KEY, JSON.stringify(save))
  }, [balance, clickProfit, hourlyProfit, upgradeLevels, gameStartedAt, gameEndsAt])

  useEffect(() => {
    if (effectiveHourlyProfit <= 0 || isGameFinished) {
      return
    }

    const intervalId = window.setInterval(() => {
      const profitPerSecond =
        (effectiveHourlyProfit * ONLINE_HOURLY_MULTIPLIER) / 3600

      setBalance((currentBalance) => currentBalance + profitPerSecond)
    }, 1000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [effectiveHourlyProfit, isGameFinished])

  useEffect(() => {
    latestSyncPayloadRef.current = {
      telegramUser,
      startParam: telegramStartParam,
      balance: displayedBalance,
      clickProfit: safeClickProfit,
      hourlyProfit: safeHourlyProfit,
      upgradeLevels,
    }

    syncVersionRef.current += 1
  }, [
    telegramUser,
    telegramStartParam,
    displayedBalance,
    safeClickProfit,
    safeHourlyProfit,
    upgradeLevels,
  ])

  useEffect(() => {
    backendReadyRef.current = backendPlayerLoaded
  }, [backendPlayerLoaded])

  useEffect(() => {
    gameSyncAllowedRef.current = !isGameFinished && serverGame?.status === 'active'
  }, [isGameFinished, serverGame?.status])

  useEffect(() => {
    if (!backendPlayerLoaded) {
      return
    }

    void syncLatestProgress(true)

    const intervalId = window.setInterval(() => {
      void syncLatestProgress(false)
    }, AUTO_SYNC_DELAY_MS)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [backendPlayerLoaded])

  useEffect(() => {
    function flushProgressBeforeClose() {
      const payload = latestSyncPayloadRef.current

      if (!payload || !backendReadyRef.current || !gameSyncAllowedRef.current) {
        return
      }

      syncPlayerProgressBeacon(payload)
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        flushProgressBeforeClose()
      }
    }

    window.addEventListener('pagehide', flushProgressBeforeClose)
    window.addEventListener('beforeunload', flushProgressBeforeClose)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('pagehide', flushProgressBeforeClose)
      window.removeEventListener('beforeunload', flushProgressBeforeClose)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  const currentLevel = useMemo(() => {
    const reversedLevels = [...LEVELS].reverse()

    return (
      reversedLevels.find(
        (levelConfig) => displayedBalance >= levelConfig.minCoins,
      ) ?? LEVELS[0]
    )
  }, [displayedBalance])

  const nextLevel = useMemo(() => {
    return LEVELS.find(
      (levelConfig) => levelConfig.level === currentLevel.level + 1,
    )
  }, [currentLevel])

  const currentDogImage = DOG_IMAGES[currentLevel.level]

  const progressPercent = useMemo(() => {
    if (!nextLevel) {
      return 100
    }

    const coinsOnCurrentLevel = displayedBalance - currentLevel.minCoins
    const coinsNeededForNextLevel = nextLevel.minCoins - currentLevel.minCoins

    return Math.min((coinsOnCurrentLevel / coinsNeededForNextLevel) * 100, 100)
  }, [displayedBalance, currentLevel, nextLevel])

  function handleDogClick() {
    if (isGameFinished) {
      return
    }

    setBalance((currentBalance) => currentBalance + safeClickProfit)
  }

  function handleDogPointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (event.pointerType === 'mouse' && event.button !== 0) {
      return
    }

    event.preventDefault()
    handleDogClick()
  }

  function buyUpgrade(upgrade: FeedUpgrade) {
    if (isGameFinished) {
      return
    }

    const currentUpgradeLevel = upgradeLevels[upgrade.id] ?? 0
    const currentUpgradePrice = calculateUpgradePrice(
      upgrade.basePrice,
      currentUpgradeLevel,
    )

    if (displayedBalance < currentUpgradePrice) {
      return
    }

    const currentUpgradeProfit = calculateUpgradeProfit(
      upgrade.profitIncrease,
      currentUpgradeLevel,
    )
    const nextBalance = Math.max(displayedBalance - currentUpgradePrice, 0)
    const nextUpgradeLevels = normalizeUpgradeLevels({
      ...upgradeLevels,
      [upgrade.id]: currentUpgradeLevel + 1,
    })
    const nextClickProfit =
      upgrade.type === 'click'
        ? safeClickProfit + currentUpgradeProfit
        : safeClickProfit
    const nextHourlyProfit =
      upgrade.type === 'hourly'
        ? safeHourlyProfit + currentUpgradeProfit
        : safeHourlyProfit
    const nextPayload: PlayerSyncPayload = {
      telegramUser,
      startParam: telegramStartParam,
      balance: nextBalance,
      clickProfit: nextClickProfit,
      hourlyProfit: nextHourlyProfit,
      upgradeLevels: nextUpgradeLevels,
    }

    setBalance(nextBalance)
    setUpgradeLevels(nextUpgradeLevels)
    setClickProfit(nextClickProfit)
    setHourlyProfit(nextHourlyProfit)

    latestSyncPayloadRef.current = nextPayload
    syncVersionRef.current += 1

    void syncLatestProgress(true)
  }

  async function refreshBackendState() {
    setServerStatusText('Refreshing backend...')

    try {
      const response = await getGameState()

      setServerGame(response.game)
      setServerStatusText(`Backend game: ${response.game.status}`)

      await loadReferrals(telegramUser)
      await loadLeaderboard(telegramUser)

      if (response.game.status === 'finished') {
        try {
          const finalRewardsResponse = await getFinalRewards()

          setFinalRewards(finalRewardsResponse.finalRewards)
          setServerStatusText('Backend game: finished, rewards loaded')
        } catch {
          setFinalRewards(null)
          setServerStatusText('Backend game: finished, rewards not finalized')
        }
      } else {
        setFinalRewards(null)
      }
    } catch {
      setServerGame(null)
      setServerStatusText('Backend unavailable, local beta mode')
    }
  }

  async function finishBackendGameForTest() {
    setAdminActionBusy(true)
    setAdminStatusText('Saving current progress...')

    try {
      if (serverGame?.status === 'active') {
        await syncPlayerProgress({
          telegramUser,
          startParam: telegramStartParam,
          balance: displayedBalance,
          clickProfit: safeClickProfit,
          hourlyProfit: safeHourlyProfit,
          upgradeLevels,
        })
      }

      setAdminStatusText('Finishing backend timer...')

      const response = await finishGameForTest()

      setServerGame(response.game)
      setFinalRewards(null)
      setServerStatusText(`Backend game: ${response.game.status}`)
      setAdminStatusText('Timer finished. Now press Finalize rewards.')

      await loadLeaderboard(telegramUser)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error'

      setAdminStatusText(`Finish failed: ${message}`)
    } finally {
      setAdminActionBusy(false)
    }
  }

  async function finalizeBackendRewardsForTest() {
    setAdminActionBusy(true)
    setAdminStatusText('Finalizing rewards...')

    try {
      const response = await finalizeRewards()

      setServerGame(response.game)
      setFinalRewards(response.finalRewards)
      setServerStatusText('Backend game: finished, rewards loaded')
      setAdminStatusText(
        response.alreadyFinalized
          ? 'Rewards were already finalized.'
          : 'Rewards finalized successfully.',
      )

      await loadLeaderboard(telegramUser)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error'

      setAdminStatusText(`Finalize failed: ${message}`)
    } finally {
      setAdminActionBusy(false)
    }
  }

  async function resetBackendGameForTest() {
    setAdminActionBusy(true)
    setAdminStatusText('Resetting test timer...')

    try {
      const response = await resetGameForTest()

      setServerGame(response.game)
      setFinalRewards(null)
      setServerStatusText('Backend game: active')
      setAdminStatusText('Test timer reset. Balances were not changed.')

      await loadLeaderboard(telegramUser)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error'

      setAdminStatusText(`Reset failed: ${message}`)
    } finally {
      setAdminActionBusy(false)
    }
  }

  async function copyReferralLink() {
    try {
      await navigator.clipboard.writeText(referralLink)
      setReferralCopied(true)

      window.setTimeout(() => {
        setReferralCopied(false)
      }, 1800)
    } catch {
      setReferralCopied(false)
    }
  }

  const adminTestPanel = showDevTestPanel ? (
    <div className="admin-test-card">
      <strong>Local admin test</strong>
      <span>Тестовая панель видна только в browser beta mode.</span>

      <div className="admin-test-status">
        <span>Backend:</span>
        <b>{serverStatusText}</b>
      </div>

      <div className="admin-test-status">
        <span>Admin:</span>
        <b>{adminStatusText}</b>
      </div>

      {finalRewards && (
        <div className="admin-test-status">
          <span>Final rewards:</span>
          <b>
            {finalRewards.playersCount} players / {finalRewards.rewardPool} points
          </b>
        </div>
      )}

      <div className="admin-test-actions">
        <button
          type="button"
          disabled={adminActionBusy || serverGame?.status !== 'active'}
          onClick={finishBackendGameForTest}
        >
          Finish 7 days
        </button>

        <button
          type="button"
          disabled={adminActionBusy || serverGame?.status !== 'finished'}
          onClick={finalizeBackendRewardsForTest}
        >
          Finalize rewards
        </button>

        <button
          type="button"
          disabled={adminActionBusy}
          onClick={refreshBackendState}
        >
          Refresh
        </button>

        <button
          type="button"
          disabled={adminActionBusy}
          onClick={resetBackendGameForTest}
        >
          Reset test
        </button>
      </div>
    </div>
  ) : null

  return (
    <div className="app" style={{ backgroundImage: `url(${bgImage})` }}>
      <main className="game-screen">
        {!isGameFinished && activeTab === 'clicker' && (
          <section className="top-stats">
            <div className="stat-card">
              <span>Прибыль</span>
              <span>за клик +{formatNumber(safeClickProfit)}</span>
            </div>

            <div className="stat-card">
              <span>Рейтинг</span>
              <span>{ratingText}</span>
            </div>

            <div className="stat-card">
              <span>Прибыль</span>
              <span>в час</span>
              <span>+{formatNumber(effectiveHourlyProfit)}</span>
            </div>
          </section>
        )}

        {!isGameFinished && activeTab === 'clicker' && (
          <section className="balance-row">
            <img className="small-coin" src={coinImage} alt="coin" />
            <div className="balance">{formatNumber(displayedBalance)}</div>
          </section>
        )}

        {isGameFinished && (
          <section className="final-screen">
            <h1>Фарм завершён!</h1>
            <p>Финальный баланс зафиксирован.</p>

            <div className="final-row">
              <span>Твой баланс:</span>
              <strong>{formatNumber(myReward?.finalBalance ?? displayedBalance)}</strong>
            </div>

            <div className="final-row">
              <span>Reward pool:</span>
              <strong>{finalRewards?.rewardPool ?? 20} virtual points</strong>
            </div>

            <div className="final-row">
              <span>Твоя доля:</span>
              <strong>
                {myReward ? `${myReward.sharePercent}%` : 'ожидает backend'}
              </strong>
            </div>

            <div className="final-row">
              <span>Твоя награда:</span>
              <strong>
                {myReward
                  ? `${myReward.rewardAmount} virtual points`
                  : 'ожидает backend'}
              </strong>
            </div>

            <div className="final-row">
              <span>Промокод:</span>
              <strong>
                {myReward?.promoCode ?? generateLocalPromoCode(displayedBalance)}
              </strong>
            </div>

            <p className="final-note">
              {serverGameFinished
                ? serverStatusText
                : 'Локальная beta-версия. Backend ещё не завершил событие.'}
            </p>

            <button
              className="final-refresh-button"
              type="button"
              onClick={refreshBackendState}
            >
              Обновить статус
            </button>

            {adminTestPanel}
          </section>
        )}

        {!isGameFinished && activeTab === 'clicker' && (
          <section className="clicker-screen">
            <section className="level-info">
              <div>{currentLevel.name} &gt;</div>
              <div>
                Level {currentLevel.level}/{maxLevel}
              </div>
            </section>

            <section className="progress-wrapper">
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>

              <div className="level-progress-target">
                <span>Next level</span>
                <strong>{nextLevel ? formatNumber(nextLevel.minCoins) : 'MAX'}</strong>
              </div>
            </section>

            <section className="dog-button-wrapper">
              <button
                className="dog-button"
                type="button"
                onPointerDown={handleDogPointerDown}
                disabled={isGameFinished}
              >
                <img className="main-coin" src={mainCoinImage} alt="main coin" />
                <img
                  className="dog-image"
                  src={currentDogImage}
                  alt={`dog level ${currentLevel.level}`}
                />
              </button>
            </section>
          </section>
        )}

        {!isGameFinished && activeTab === 'feed' && (
          <section className="tab-screen feed-screen">
            <div className="feed-wallet-card">
              <div className="feed-wallet-balance">
                <span className="feed-wallet-balance-label">Текущий баланс</span>

                <div className="feed-wallet-balance-row">
                  <div className="feed-wallet-balance-icon">
                    <img src={coinImage} alt="coin" />
                  </div>

                  <strong>{formatNumber(displayedBalance)}</strong>
                </div>

                <small>монет доступно для покупок</small>
              </div>

              <div className="feed-wallet-stats-grid">
                <div className="feed-wallet-stat">
                  <div className="feed-wallet-icon">⚡</div>
                  <div className="feed-wallet-copy">
                    <span className="feed-wallet-title">За клик</span>
                    <strong>+{formatNumber(safeClickProfit)}</strong>
                    <small>за одно нажатие</small>
                  </div>
                </div>

                <div className="feed-wallet-stat">
                  <div className="feed-wallet-icon">⏰</div>
                  <div className="feed-wallet-copy">
                    <span className="feed-wallet-title">В час</span>
                    <strong>+{formatNumber(effectiveHourlyProfit)}</strong>
                    <small>с рефералами</small>
                  </div>
                </div>
              </div>
            </div>

            {FEED_SECTIONS.map((section) => {
              const sectionUpgrades = FEED_UPGRADES.filter(
                (upgrade) => upgrade.category === section.category,
              )

              return (
                <div className="feed-section" key={section.category}>
                  <div className="feed-section-title">
                    <div>
                      <strong>{section.title}</strong>
                      <span>{section.description}</span>
                    </div>
                    <b>{sectionUpgrades.length}</b>
                  </div>

                  <div className="upgrade-list">
                    {sectionUpgrades.map((upgrade) => {
                      const upgradeLevel = upgradeLevels[upgrade.id] ?? 0
                      const upgradePrice = calculateUpgradePrice(
                        upgrade.basePrice,
                        upgradeLevel,
                      )
                      const upgradeProfitLabel = getUpgradeProfitLabel(
                        upgrade,
                        upgradeLevel,
                      )
                      const canBuyUpgrade =
                        displayedBalance >= upgradePrice && !isGameFinished

                      return (
                        <div className="upgrade-card" key={upgrade.id}>
                          <div className="upgrade-icon">{upgrade.emoji}</div>

                          <div className="upgrade-info">
                            <div className="upgrade-title-row">
                              <strong>{upgrade.title}</strong>
                            </div>

                            <div className="upgrade-meta-row">
                              <span>Lvl {upgradeLevel}</span>
                              <span>Покупка: {upgradeProfitLabel}</span>
                            </div>
                          </div>

                          <button
                            type="button"
                            disabled={!canBuyUpgrade}
                            onClick={() => buyUpgrade(upgrade)}
                          >
                            <span>Купить</span>
                            <b>{formatNumber(upgradePrice)}</b>
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </section>
        )}

        {!isGameFinished && activeTab === 'friends' && (
          <section className="tab-screen friends-screen">
            <div className="friends-hero-card">
              <span className="friends-eyebrow">Referral program</span>
              <h1>Friends</h1>
              <p>
                Приглашай игроков, получай +{formatNumber(referralJoinBonus)} монет
                за каждого друга и +{referralHourlyBonusPercent}% от его прибыли в час.
              </p>
            </div>

            <div className="friends-bonus-strip">
              <div>
                <span>За приглашение</span>
                <strong>+{formatNumber(referralJoinBonus)} монет</strong>
              </div>

              <div>
                <span>Пассивный бонус</span>
                <strong>+{referralHourlyBonusPercent}%/час от друга</strong>
              </div>
            </div>

            <div className="friends-reward-grid">
              <div className="friends-reward-card primary">
                <span>Бонус за друга</span>
                <strong>+{formatNumber(referralJoinBonus)}</strong>
                <small>сразу на баланс</small>
              </div>

              <div className="friends-reward-card">
                <span>Твой реф. доход</span>
                <strong>+{formatNumber(referralHourlyBonus)}/ч</strong>
                <small>{referralHourlyBonusPercent}% от друзей</small>
              </div>

              <div className="friends-reward-card">
                <span>Друзей</span>
                <strong>{referralsCount}</strong>
                <small>приглашено</small>
              </div>
            </div>

            <div className="referral-main-card">
              <div className="referral-main-header">
                <div>
                  <span>Твоя ссылка</span>
                  <strong>Поделись и получи бонус</strong>
                </div>
                <div className="referral-main-icon">🔗</div>
              </div>

              <div className="referral-link-box">{referralLink}</div>

              <button type="button" onClick={copyReferralLink}>
                {referralCopied ? 'Ссылка скопирована!' : 'Скопировать ссылку'}
              </button>
            </div>

            <div className="friends-list-card">
              <div className="friends-list-header">
                <strong>Приглашённые друзья</strong>
                <span>{referralsCount}</span>
              </div>

              {referrals.length === 0 && (
                <div className="friend-empty-card">
                  <div className="friend-empty-icon">🐾</div>
                  <strong>Пока друзей нет</strong>
                  <span>Поделись ссылкой с другом.</span>
                  <small>
                    За каждого нового игрока ты получишь +{formatNumber(referralJoinBonus)} монет
                    и +{referralHourlyBonusPercent}% от его прибыли в час.
                  </small>
                </div>
              )}

              {referrals.map((referral) => (
                <div className="friend-row" key={referral.id}>
                  <div className="friend-avatar">🐶</div>

                  <div className="friend-info">
                    <span>{getReferralDisplayName(referral)}</span>
                    <small>{formatNumber(referral.balance)} coins</small>
                  </div>

                  <div className="friend-bonus">
                    <strong>+{formatNumber(getSafePositiveNumber(referral.hourlyProfit, 0) * REFERRAL_HOURLY_BONUS_PERCENT)}/ч</strong>
                    <small>твой бонус</small>
                  </div>
                </div>
              ))}
            </div>

            <div className="friends-status-card">
              <div>
                <span>Mode</span>
                <b>{telegramMode ? 'Telegram Mini App' : 'Browser beta mode'}</b>
              </div>

              <div>
                <span>User</span>
                <b>{getTelegramDisplayName(telegramUser)}</b>
              </div>

              <div>
                <span>Backend</span>
                <b>{serverStatusText}</b>
              </div>
            </div>
          </section>
        )}

        {!isGameFinished && activeTab === 'earn' && (
          <section className="tab-screen ranking-screen">
            <div className="ranking-hero-card">
              <span className="ranking-eyebrow">Leaderboard</span>
              <h1>Ranking</h1>
              <p>Топ игроков по балансу за текущий 7-дневный фарм.</p>
            </div>

            <div className="ranking-summary-grid">
              <div className="ranking-summary-card">
                <span>Игроков</span>
                <strong>{formatNumber(playersCount)}</strong>
              </div>

              <div className="ranking-summary-card">
                <span>Твоё место</span>
                <strong>{currentLeaderboardPlayer ? `#${currentLeaderboardPlayer.rank}` : '...'}</strong>
              </div>
            </div>

            <div className="ranking-list-card">
              <div className="ranking-list-header">
                <strong>Таблица лидеров</strong>
                <span>{leaderboard.length}</span>
              </div>

              {leaderboard.length === 0 && (
                <div className="ranking-empty-card">
                  <strong>Рейтинг загружается</strong>
                  <span>Подожди пару секунд или проверь подключение backend.</span>
                </div>
              )}

              {leaderboard.map((player) => (
                <div
                  className={`ranking-row ${currentLeaderboardPlayer?.id === player.id ? 'current-player' : ''}`}
                  key={player.id}
                >
                  <div className="ranking-place">#{player.rank}</div>

                  <div className="ranking-player-info">
                    <strong>{player.displayName}</strong>
                    <span>{currentLeaderboardPlayer?.id === player.id ? 'Твой профиль' : 'Игрок'}</span>
                  </div>

                  <div className="ranking-player-balance">
                    <strong>{formatNumber(player.balance)}</strong>
                    <span>coins</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {!isGameFinished && activeTab === 'shop' && (
          <section className="tab-screen shop-screen">
            <div className="shop-hero-card">
              <div className="shop-hero-copy">
                <span className="shop-eyebrow">Tsutsik Store</span>
                <h1>Shop</h1>
                <p>Будущий магазин бустов, наборов и косметики. Сейчас это красивый preview без реальных оплат.</p>
              </div>

              <div className="shop-hero-coin">
                <img src={mainCoinImage} alt="coin" />
              </div>
            </div>

            <div className="shop-wallet-card">
              <div>
                <span>Твой баланс</span>
                <strong>{formatNumber(displayedBalance)} coins</strong>
              </div>
              <div>
                <span>Клик</span>
                <strong>+{formatNumber(safeClickProfit)}</strong>
              </div>
              <div>
                <span>В час</span>
                <strong>+{formatNumber(effectiveHourlyProfit)}</strong>
              </div>
            </div>

            <div className="shop-feature-card">
              <div className="shop-feature-icon">🎁</div>
              <div>
                <span className="shop-card-tag">Featured</span>
                <strong>Weekly Reward Chest</strong>
                <p>Еженедельный сундук с бонусами появится после полной настройки экономики.</p>
              </div>
              <button type="button" disabled>
                Скоро
              </button>
            </div>

            <div className="shop-grid">
              {SHOP_ITEMS.map((item) => (
                <article className="shop-item-card" key={item.title}>
                  <div className="shop-item-top">
                    <span className="shop-item-icon">{item.icon}</span>
                    <span className="shop-item-badge">{item.badge}</span>
                  </div>

                  <strong>{item.title}</strong>
                  <p>{item.description}</p>

                  <div className="shop-item-footer">
                    <span>{item.priceLabel}</span>
                    <button type="button" disabled>
                      Locked
                    </button>
                  </div>
                </article>
              ))}
            </div>

            <div className="shop-note-card">
              <strong>Безопасно для beta</strong>
              <span>Кнопки магазина пока заблокированы, поэтому игроки не смогут случайно купить или сломать экономику.</span>
            </div>

            {adminTestPanel}
          </section>
        )}
      </main>

      <nav className="bottom-nav">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`nav-item ${activeTab === tab.id ? 'active' : ''}`}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            disabled={isGameFinished && tab.id !== 'clicker' && tab.id !== 'shop'}
          >
            <img src={tab.icon} alt={tab.label} />
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}

export default App