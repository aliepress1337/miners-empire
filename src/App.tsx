import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from 'react'
import './App.css'

import {
  finalizeRewards,
  getCurrentPlayer,
  getFinalRewards,
  getGameState,
  getLeaderboard,
  getPlayerReferrals,
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
import coinSkin1 from './assets/skins/1.png'
import coinSkin2 from './assets/skins/2.png'
import coinSkin3 from './assets/skins/3.png'
import coinSkin4 from './assets/skins/4.png'

import dogLevel1 from './assets/dogs_lvl/1.png'
import dogLevel2 from './assets/dogs_lvl/2.png'
import dogLevel3 from './assets/dogs_lvl/3.png'
import dogLevel4 from './assets/dogs_lvl/4.png'
import dogLevel5 from './assets/dogs_lvl/5.png'
import dogLevel6 from './assets/dogs_lvl/6.png'
import dogLevel7 from './assets/dogs_lvl/7.png'
import dogLevel8 from './assets/dogs_lvl/8.png'
import dogLevel9 from './assets/dogs_lvl/9.png'
import dogLevel10 from './assets/dogs_lvl/10.png'
import glassCrackSound from './assets/sound/glass.mp3'

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
  commandLabel: string
  kind: 'afk' | 'unluck' | 'reset' | 'ban'
}

type UpgradeLevels = Record<UpgradeId, number>

type CoinSkinId = 1 | 2 | 3 | 4

type CoinSkin = {
  id: CoinSkinId
  title: string
  description: string
  image: string
}

type Level10UnlockStep = 0 | 1 | 2 | 3

type TelegramHapticImpactStyle = 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'

type TelegramWebAppWithHaptic = {
  HapticFeedback?: {
    impactOccurred?: (style: TelegramHapticImpactStyle) => void
  }
}

type GameSave = {
  balance: number
  clickProfit: number
  hourlyProfit: number
  upgradeLevels: UpgradeLevels
  gameStartedAt: number
  gameEndsAt: number
  savedAt: number
  level10UnlockStep: Level10UnlockStep
  level10AnimationCompleted: boolean
  unlockedCoinSkins: CoinSkinId[]
  selectedCoinSkin: CoinSkinId | null
  afkFullFarmUnlocked: boolean
  unluckyUntil: string | null
  bannedAt: string | null
  banReason: string | null
}

const SAVE_KEY = 'tsutsik-game-save'

const GAME_DURATION_DAYS = 14
const GAME_DURATION_MS = GAME_DURATION_DAYS * 24 * 60 * 60 * 1000

const OFFLINE_HOURLY_MULTIPLIER = 0.5
const BOOSTED_OFFLINE_HOURLY_MULTIPLIER = 1
const ONLINE_HOURLY_MULTIPLIER = 1
const UNLUCKY_PROFIT_MULTIPLIER = 0.25
const PRICE_GROWTH = 1.9
const PROFIT_GROWTH = 1.15
const AUTO_SYNC_DELAY_MS = 1500
const SOCIAL_REFRESH_INTERVAL_MS = 10000
const LEVEL_10_MIN_COINS = 1000000000000
const LEVEL_10_CRACK_STEPS = 3
const LEVEL_10_FINAL_CRACK_DELAY_MS = 520
const LEVEL_10_VIDEO_URL = new URL('./assets/dogs_lvl/10.MOV', import.meta.url).href
const COIN_SKIN_SELLER_USERNAME = 'Ivan210'
const COIN_SKIN_PRICE_LABEL = '0.99$'
const MIN_TAP_INTERVAL_MS = 22
const MAX_VALID_TAPS_PER_SECOND = 24
const AUTOCLICKER_COOLDOWN_MS = 650
const AUTOCLICKER_WARNING_MS = 1000

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

const FEED_UPGRADES_DESCRIPTION = FEED_SECTIONS.map((section) => section.title).join(' · ')

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
      basePrice: 60,
      profitIncrease: 2,
      description: 'Первый нормальный буст для кликов.',
      emoji: '🦴',
      tag: 'Basic',
    },
  {
      id: 'waterBowl',
      title: 'Water Bowl',
      type: 'hourly',
      category: 'auto',
      basePrice: 180,
      profitIncrease: 18,
      description: 'Дешёвый старт пассивной прибыли.',
      emoji: '💧',
      tag: 'Passive',
    },
  {
      id: 'puppyCookie',
      title: 'Puppy Cookie',
      type: 'click',
      category: 'food',
      basePrice: 600,
      profitIncrease: 5,
      description: 'Дешёвый буст, но уже ощутимее старта.',
      emoji: '🍪',
      tag: 'Snack',
    },
  {
      id: 'comfyMat',
      title: 'Comfy Mat',
      type: 'hourly',
      category: 'auto',
      basePrice: 1800,
      profitIncrease: 80,
      description: 'Небольшой, но полезный автофарм.',
      emoji: '🧺',
      tag: 'Rest',
    },
  {
      id: 'tastyBone',
      title: 'Tasty Bone',
      type: 'click',
      category: 'food',
      basePrice: 5500,
      profitIncrease: 12,
      description: 'Плавный переход к средним апгрейдам.',
      emoji: '🍖',
      tag: 'Food',
    },
  {
      id: 'autoFarm1',
      title: 'Auto Farm I',
      type: 'hourly',
      category: 'auto',
      basePrice: 16000,
      profitIncrease: 350,
      description: 'Первый серьёзный доход в час.',
      emoji: '⛏️',
      tag: 'Farm',
    },
  {
      id: 'meatSnack',
      title: 'Meat Snack',
      type: 'click',
      category: 'food',
      basePrice: 45000,
      profitIncrease: 32,
      description: 'Больше смысла копить, меньше мелких +3/+5.',
      emoji: '🍗',
      tag: 'Meat',
    },
  {
      id: 'puppyBed',
      title: 'Puppy Bed',
      type: 'hourly',
      category: 'auto',
      basePrice: 120000,
      profitIncrease: 1500,
      description: 'Пассивный рост для начала игры.',
      emoji: '🛏️',
      tag: 'Sleep',
    },
  {
      id: 'dogBowl',
      title: 'Dog Bowl',
      type: 'click',
      category: 'food',
      basePrice: 300000,
      profitIncrease: 80,
      description: 'Первый уверенный апгрейд для активной игры.',
      emoji: '🥣',
      tag: 'Meal',
    },
  {
      id: 'toyBasket',
      title: 'Toy Basket',
      type: 'hourly',
      category: 'auto',
      basePrice: 750000,
      profitIncrease: 6000,
      description: 'Хороший автофарм после первых кликов.',
      emoji: '🧸',
      tag: 'Fun',
    },
  {
      id: 'snackBox',
      title: 'Snack Box',
      type: 'click',
      category: 'food',
      basePrice: 1800000,
      profitIncrease: 180,
      description: 'Хороший буст после накопления.',
      emoji: '📦',
      tag: 'Combo',
    },
  {
      id: 'autoFarm2',
      title: 'Auto Farm II',
      type: 'hourly',
      category: 'auto',
      basePrice: 4200000,
      profitIncrease: 25000,
      description: 'Переход к тысячам монет в час.',
      emoji: '⚙️',
      tag: 'Auto',
    },
  {
      id: 'trainingWhistle',
      title: 'Training Whistle',
      type: 'click',
      category: 'food',
      basePrice: 9000000,
      profitIncrease: 420,
      description: 'Премиальный буст активной игры.',
      emoji: '📣',
      tag: 'Boost',
    },
  {
      id: 'dogHouse',
      title: 'Dog House',
      type: 'hourly',
      category: 'auto',
      basePrice: 18000000,
      profitIncrease: 100000,
      description: 'Домик приносит стабильный доход.',
      emoji: '🏠',
      tag: 'House',
    },
  {
      id: 'premiumKibble',
      title: 'Premium Kibble',
      type: 'click',
      category: 'food',
      basePrice: 35000000,
      profitIncrease: 950,
      description: 'Середина прогресса для сильного клика.',
      emoji: '🍲',
      tag: 'Plus',
    },
  {
      id: 'trainerVisit',
      title: 'Trainer Visit',
      type: 'hourly',
      category: 'auto',
      basePrice: 65000000,
      profitIncrease: 400000,
      description: 'Тренер ускоряет прогресс без кликов.',
      emoji: '🧑‍🏫',
      tag: 'Coach',
    },
  {
      id: 'silverLeash',
      title: 'Silver Leash',
      type: 'click',
      category: 'food',
      basePrice: 120000000,
      profitIncrease: 2000,
      description: 'Редкий предмет для кликового роста.',
      emoji: '🔗',
      tag: 'Rare',
    },
  {
      id: 'goldenBowl',
      title: 'Golden Bowl',
      type: 'hourly',
      category: 'auto',
      basePrice: 220000000,
      profitIncrease: 1500000,
      description: 'Пассивный предмет для средних балансов.',
      emoji: '🏆',
      tag: 'Gold',
    },
  {
      id: 'championMeal',
      title: 'Champion Meal',
      type: 'click',
      category: 'food',
      basePrice: 400000000,
      profitIncrease: 4500,
      description: 'Первая покупка даёт +150, дальше эффект растёт.',
      emoji: '🏅',
      tag: 'Pro',
    },
  {
      id: 'boneGarden',
      title: 'Bone Garden',
      type: 'hourly',
      category: 'auto',
      basePrice: 700000000,
      profitIncrease: 5000000,
      description: 'Сад косточек растит доход каждый час.',
      emoji: '🌱',
      tag: 'Grow',
    },
  {
      id: 'proteinPlate',
      title: 'Protein Plate',
      type: 'click',
      category: 'food',
      basePrice: 1200000000,
      profitIncrease: 9000,
      description: 'Сильный апгрейд для активного фарма.',
      emoji: '🥘',
      tag: 'Strong',
    },
  {
      id: 'sleepyGuard',
      title: 'Sleepy Guard',
      type: 'hourly',
      category: 'auto',
      basePrice: 2000000000,
      profitIncrease: 15000000,
      description: 'Охранник фармит, даже когда отдыхает.',
      emoji: '🐶',
      tag: 'Guard',
    },
  {
      id: 'powerSteak',
      title: 'Power Steak',
      type: 'click',
      category: 'food',
      basePrice: 3500000000,
      profitIncrease: 18000,
      description: 'Большой скачок, но цена уже серьёзная.',
      emoji: '🥩',
      tag: 'Power',
    },
  {
      id: 'vipKennel',
      title: 'VIP Kennel',
      type: 'hourly',
      category: 'auto',
      basePrice: 6000000000,
      profitIncrease: 40000000,
      description: 'VIP пассивный доход для богатых игроков.',
      emoji: '🏡',
      tag: 'VIP',
    },
  {
      id: 'royalBone',
      title: 'Royal Bone',
      type: 'click',
      category: 'food',
      basePrice: 9000000000,
      profitIncrease: 35000,
      description: 'Премиальная еда до late-game.',
      emoji: '👑',
      tag: 'Royal',
    },
  {
      id: 'autoKitchen',
      title: 'Auto Kitchen',
      type: 'hourly',
      category: 'auto',
      basePrice: 13000000000,
      profitIncrease: 100000000,
      description: 'Кухня автоматически создаёт прибыль.',
      emoji: '🍳',
      tag: 'Kitchen',
    },
  {
      id: 'goldenCollar',
      title: 'Golden Collar',
      type: 'click',
      category: 'food',
      basePrice: 18000000000,
      profitIncrease: 70000,
      description: 'Эпический клик-буст для сильной игры.',
      emoji: '📿',
      tag: 'Epic',
    },
  {
      id: 'guardDogCamp',
      title: 'Guard Dog Camp',
      type: 'hourly',
      category: 'auto',
      basePrice: 25000000000,
      profitIncrease: 250000000,
      description: 'Охрана приносит большой доход в час.',
      emoji: '🛡️',
      tag: 'Camp',
    },
  {
      id: 'goldenFeast',
      title: 'Golden Feast',
      type: 'click',
      category: 'food',
      basePrice: 34000000000,
      profitIncrease: 130000,
      description: 'Крупный апгрейд для миллионных балансов.',
      emoji: '🍛',
      tag: 'Gold',
    },
  {
      id: 'kennelNetwork',
      title: 'Kennel Network',
      type: 'hourly',
      category: 'auto',
      basePrice: 45000000000,
      profitIncrease: 550000000,
      description: 'Сеть домиков для большого автофарма.',
      emoji: '🏘️',
      tag: 'Network',
    },
  {
      id: 'legendaryFeast',
      title: 'Legendary Feast',
      type: 'click',
      category: 'food',
      basePrice: 60000000000,
      profitIncrease: 250000,
      description: 'Сильный кликовый предмет для поздней игры.',
      emoji: '🔥',
      tag: 'Legend',
    },
  {
      id: 'foodTruck',
      title: 'Food Truck',
      type: 'hourly',
      category: 'auto',
      basePrice: 80000000000,
      profitIncrease: 1100000000,
      description: 'Мобильная кухня приносит монеты в час.',
      emoji: '🚚',
      tag: 'Truck',
    },
  {
      id: 'mythicBowl',
      title: 'Mythic Bowl',
      type: 'click',
      category: 'food',
      basePrice: 105000000000,
      profitIncrease: 450000,
      description: 'Очень дорогой, но заметный рост клика.',
      emoji: '💫',
      tag: 'Mythic',
    },
  {
      id: 'tsutsikFactory',
      title: 'Tsutsik Factory',
      type: 'hourly',
      category: 'auto',
      basePrice: 135000000000,
      profitIncrease: 2000000000,
      description: 'Фабрика для быстрого роста баланса.',
      emoji: '🏭',
      tag: 'Mega',
    },
  {
      id: 'feastHall',
      title: 'Tsutsik Feast Hall',
      type: 'click',
      category: 'food',
      basePrice: 170000000000,
      profitIncrease: 800000,
      description: 'Финальный кликовый апгрейд в обычной еде.',
      emoji: '🏛️',
      tag: 'Hall',
    },
  {
      id: 'boneFactory',
      title: 'Bone Factory',
      type: 'hourly',
      category: 'auto',
      basePrice: 210000000000,
      profitIncrease: 3500000000,
      description: 'Фабрика для миллионного пассивного дохода.',
      emoji: '🏭',
      tag: 'Factory',
    },
  {
      id: 'legendaryTrainer',
      title: 'Legendary Trainer',
      type: 'click',
      category: 'food',
      basePrice: 250000000000,
      profitIncrease: 1300000,
      description: 'Очень сильный click апгрейд.',
      emoji: '🏋️',
      tag: 'Legend',
    },
  {
      id: 'boneMine',
      title: 'Bone Mine',
      type: 'hourly',
      category: 'auto',
      basePrice: 300000000000,
      profitIncrease: 5500000000,
      description: 'Шахта косточек для late-game фарма.',
      emoji: '💎',
      tag: 'Mine',
    },
  {
      id: 'cityShelter',
      title: 'City Shelter',
      type: 'hourly',
      category: 'auto',
      basePrice: 360000000000,
      profitIncrease: 8000000000,
      description: 'Большой shelter для сильного late-game.',
      emoji: '🏙️',
      tag: 'City',
    },
  {
      id: 'royalKitchen',
      title: 'Royal Kitchen',
      type: 'hourly',
      category: 'auto',
      basePrice: 430000000000,
      profitIncrease: 11000000000,
      description: 'Королевская кухня с огромным доходом.',
      emoji: '🍽️',
      tag: 'Royal',
    },
  {
      id: 'tsutsikBank',
      title: 'Tsutsik Bank',
      type: 'hourly',
      category: 'auto',
      basePrice: 500000000000,
      profitIncrease: 15000000000,
      description: 'Банк для огромного пассивного дохода.',
      emoji: '🏦',
      tag: 'Bank',
    },
  {
      id: 'worldDogCup',
      title: 'World Dog Cup',
      type: 'click',
      category: 'food',
      basePrice: 600000000000,
      profitIncrease: 2200000,
      description: 'Финальный кликовый трофей.',
      emoji: '🏆',
      tag: 'World',
    },
  {
      id: 'championEmpire',
      title: 'Champion Empire',
      type: 'hourly',
      category: 'auto',
      basePrice: 750000000000,
      profitIncrease: 22000000000,
      description: 'Самый дорогой пассивный апгрейд.',
      emoji: '🏰',
      tag: 'Endgame',
    }
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
    title: 'AFK Ферма на ослах',
    description: 'Покупатель получает полный пассивный фарм офлайн вместо 0.5x. Навсегда для аккаунта.',
    badge: 'AFK Boost',
    priceLabel: '2.99$',
    commandLabel: '/afkfarm',
    icon: '⏱️',
    kind: 'afk',
  },
  {
    title: 'Наложить неудачу',
    description: 'Выбранный игрок 24 часа получает только 0.25x от кликов и пассивного фарма.',
    badge: '24 hours',
    priceLabel: '2.99$',
    commandLabel: '/unluck',
    icon: '💀',
    kind: 'unluck',
  },
  {
    title: 'Обнулить Аккаунт',
    description: 'Обнуляет прогресс выбранного игрока: баланс, апгрейды, фарм и 10 уровень.',
    badge: 'Reset',
    priceLabel: '10.99$',
    commandLabel: '/resetacc',
    icon: '🧨',
    kind: 'reset',
  },
  {
    title: 'Забанить Пользователя',
    description: 'Навсегда блокирует выбранного игрока в приложении. Только через ручное подтверждение.',
    badge: 'Forever',
    priceLabel: '19.99$',
    commandLabel: '/banuser',
    icon: '🔨',
    kind: 'ban',
  },
]



const COIN_SKINS: CoinSkin[] = [
  {
    id: 1,
    title: 'Homie Shark',
    description: 'Яркий премиум-скин похожий на оскара в 7 лет',
    image: coinSkin1,
  },
  {
    id: 2,
    title: 'BMW Master',
    description: 'Холодный стиль для аккуратного мужчины (Андрей бы заценил)',
    image: coinSkin2,
  },
  {
    id: 3,
    title: 'Frogy Darly',
    description: 'Более знаменита под ником superqueen, глотала 3 члена за один час и это только своих отцов',
    image: coinSkin3,
  },
  {
    id: 4,
    title: 'SC GOAT',
    description: 'Редкий декоративный скин для людей ценящих андерграунд культуру Z',
    image: coinSkin4,
  },
]

const COIN_SKIN_IDS = COIN_SKINS.map((skin) => skin.id)

const LEVELS: LevelConfig[] = [
  { level: 1, name: 'Bronze', minCoins: 0 },
  { level: 2, name: 'Silver', minCoins: 10000 },
  { level: 3, name: 'Gold', minCoins: 200000 },
  { level: 4, name: 'Platinum', minCoins: 1000000 },
  { level: 5, name: 'Diamond', minCoins: 25000000 },
  { level: 6, name: 'Master', minCoins: 150000000 },
  { level: 7, name: 'Legend', minCoins: 1000000000 },
  { level: 8, name: 'Tsutsik King', minCoins: 25000000000 },
  { level: 9, name: 'Level 9', minCoins: 150000000000 },
  { level: 10, name: 'Level 10', minCoins: 1000000000000 },
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
  9: dogLevel9,
  10: dogLevel10,
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

function getSafeOptionalIsoDate(value: unknown) {
  if (typeof value !== 'string') {
    return null
  }

  const timestamp = Date.parse(value)

  if (!Number.isFinite(timestamp)) {
    return null
  }

  return new Date(timestamp).toISOString()
}

function isTimestampInFuture(value: string | null, now = Date.now()) {
  if (!value) {
    return false
  }

  const timestamp = Date.parse(value)

  return Number.isFinite(timestamp) && timestamp > now
}

function getSafeLevel10UnlockStep(value: unknown): Level10UnlockStep {
  const parsedValue = Math.floor(getSafeNumber(value, 0))

  if (parsedValue <= 0) {
    return 0
  }

  if (parsedValue >= LEVEL_10_CRACK_STEPS) {
    return LEVEL_10_CRACK_STEPS as Level10UnlockStep
  }

  return parsedValue as Level10UnlockStep
}

function getSafeCoinSkinId(value: unknown): CoinSkinId | null {
  const parsedValue = Math.floor(getSafeNumber(value, 0))

  return COIN_SKIN_IDS.includes(parsedValue as CoinSkinId)
    ? (parsedValue as CoinSkinId)
    : null
}

function normalizeUnlockedCoinSkins(value: unknown): CoinSkinId[] {
  if (!Array.isArray(value)) {
    return []
  }

  return Array.from(
    new Set(
      value
        .map((skinId) => getSafeCoinSkinId(skinId))
        .filter((skinId): skinId is CoinSkinId => skinId !== null),
    ),
  ).sort((leftSkinId, rightSkinId) => leftSkinId - rightSkinId)
}

function isCoinSkinUnlocked(
  skinId: CoinSkinId,
  unlockedCoinSkins: CoinSkinId[],
) {
  return unlockedCoinSkins.includes(skinId)
}

function getVisibleSelectedCoinSkin(
  selectedCoinSkin: CoinSkinId | null,
  unlockedCoinSkins: CoinSkinId[],
) {
  if (!selectedCoinSkin) {
    return null
  }

  return isCoinSkinUnlocked(selectedCoinSkin, unlockedCoinSkins)
    ? selectedCoinSkin
    : null
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

function formatEventDuration(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000))
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const paddedHours = String(hours).padStart(2, '0')
  const paddedMinutes = String(minutes).padStart(2, '0')
  const paddedSeconds = String(seconds).padStart(2, '0')

  if (days > 0) {
    return `${days}д ${paddedHours}ч ${paddedMinutes}м ${paddedSeconds}с`
  }

  if (hours > 0) {
    return `${hours}ч ${paddedMinutes}м ${paddedSeconds}с`
  }

  return `${minutes}м ${paddedSeconds}с`
}

function formatEventDate(timestamp: number) {
  if (!Number.isFinite(timestamp)) {
    return '—'
  }

  return new Date(timestamp).toLocaleString('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getParsedTimestamp(value: string | undefined, fallback: number) {
  if (!value) {
    return fallback
  }

  const parsedTimestamp = Date.parse(value)

  return Number.isFinite(parsedTimestamp) ? parsedTimestamp : fallback
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
    level10UnlockStep: 0,
    level10AnimationCompleted: false,
    unlockedCoinSkins: [],
    selectedCoinSkin: null,
    afkFullFarmUnlocked: false,
    unluckyUntil: null,
    bannedAt: null,
    banReason: null,
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
      level10UnlockStep?: number
      level10AnimationCompleted?: boolean
      unlockedCoinSkins?: unknown
      selectedCoinSkin?: unknown
      afkFullFarmUnlocked?: unknown
      unluckyUntil?: unknown
      bannedAt?: unknown
      banReason?: unknown
    }

    const now = Date.now()

    const gameStartedAt = Number(parsedSave.gameStartedAt) || now
    const expectedGameEndsAt = gameStartedAt + GAME_DURATION_MS
    const storedGameEndsAt = Number(parsedSave.gameEndsAt) || expectedGameEndsAt
    const gameEndsAt = Math.max(storedGameEndsAt, expectedGameEndsAt)

    const balance = getSafePositiveNumber(parsedSave.balance, 0)
    const clickProfit = getSafePositiveNumber(parsedSave.clickProfit, 1) || 1
    const hourlyProfit = getSafePositiveNumber(parsedSave.hourlyProfit, 0)
    const afkFullFarmUnlocked = parsedSave.afkFullFarmUnlocked === true
    const unluckyUntil = getSafeOptionalIsoDate(parsedSave.unluckyUntil)
    const bannedAt = getSafeOptionalIsoDate(parsedSave.bannedAt)
    const banReason = typeof parsedSave.banReason === 'string' ? parsedSave.banReason : null
    const unluckyMultiplier = isTimestampInFuture(unluckyUntil, now)
      ? UNLUCKY_PROFIT_MULTIPLIER
      : 1
    const offlineMultiplier = afkFullFarmUnlocked
      ? BOOSTED_OFFLINE_HOURLY_MULTIPLIER
      : OFFLINE_HOURLY_MULTIPLIER
    const savedAt = getSafeNumber(parsedSave.savedAt, now) || now
    const level10UnlockStep = getSafeLevel10UnlockStep(
      parsedSave.level10UnlockStep,
    )
    const level10AnimationCompleted =
      parsedSave.level10AnimationCompleted === true
    const unlockedCoinSkins = normalizeUnlockedCoinSkins(
      parsedSave.unlockedCoinSkins,
    )
    const selectedCoinSkin = getVisibleSelectedCoinSkin(
      getSafeCoinSkinId(parsedSave.selectedCoinSkin),
      unlockedCoinSkins,
    )

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
    const offlineReward = hourlyProfit * offlineMultiplier * unluckyMultiplier * offlineHours

    return {
      balance: balance + offlineReward,
      clickProfit,
      hourlyProfit,
      upgradeLevels,
      gameStartedAt,
      gameEndsAt,
      savedAt: now,
      level10UnlockStep,
      level10AnimationCompleted,
      unlockedCoinSkins,
      selectedCoinSkin,
      afkFullFarmUnlocked,
      unluckyUntil,
      bannedAt,
      banReason,
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
  const [level10UnlockStep, setLevel10UnlockStep] = useState<Level10UnlockStep>(
    savedGame.level10UnlockStep,
  )
  const [level10AnimationCompleted, setLevel10AnimationCompleted] = useState(
    savedGame.level10AnimationCompleted,
  )
  const [unlockedCoinSkins, setUnlockedCoinSkins] = useState<CoinSkinId[]>(
    savedGame.unlockedCoinSkins,
  )
  const [selectedCoinSkin, setSelectedCoinSkin] = useState<CoinSkinId | null>(
    savedGame.selectedCoinSkin,
  )
  const [afkFullFarmUnlocked, setAfkFullFarmUnlocked] = useState(
    savedGame.afkFullFarmUnlocked,
  )
  const [unluckyUntil, setUnluckyUntil] = useState<string | null>(
    savedGame.unluckyUntil,
  )
  const [bannedAt, setBannedAt] = useState<string | null>(savedGame.bannedAt)
  const [banReason, setBanReason] = useState<string | null>(savedGame.banReason)
  const [isLevel10VideoPlaying, setIsLevel10VideoPlaying] = useState(false)
  const [level10CrackOrigin, setLevel10CrackOrigin] = useState<{
    x: number
    y: number
  } | null>(null)
  const [referralCopied, setReferralCopied] = useState(false)

  const [telegramUser, setTelegramUser] = useState<TelegramUser | null>(null)
  const [telegramMode, setTelegramMode] = useState(false)
  const [telegramStartParam, setTelegramStartParam] = useState<string | null>(
    null,
  )

  const [serverGame, setServerGame] = useState<GameStateDto | null>(null)
  const [serverStatusText, setServerStatusText] = useState('Checking backend...')
  const [finalRewards, setFinalRewards] = useState<FinalRewardsDto | null>(null)
  const [finalRewardsLoading, setFinalRewardsLoading] = useState(false)
  const [promoCodeVisible, setPromoCodeVisible] = useState(false)
  const [backendPlayerLoaded, setBackendPlayerLoaded] = useState(false)
  const [antiClickerWarning, setAntiClickerWarning] = useState<string | null>(null)

  const latestSyncPayloadRef = useRef<PlayerSyncPayload | null>(null)
  const syncInFlightRef = useRef(false)
  const syncVersionRef = useRef(0)
  const level10VideoRef = useRef<HTMLVideoElement | null>(null)
  const dogButtonRef = useRef<HTMLButtonElement | null>(null)
  const glassCrackAudioRef = useRef<HTMLAudioElement | null>(null)
  const lastSuccessfulSyncVersionRef = useRef(0)
  const lastSocialRefreshRef = useRef(0)
  const backendReadyRef = useRef(false)
  const gameSyncAllowedRef = useRef(false)
  const tapTimestampsRef = useRef<number[]>([])
  const lastAcceptedTapAtRef = useRef(0)
  const blockedTapCountRef = useRef(0)
  const tapCooldownUntilRef = useRef(0)
  const antiClickerWarningTimeoutRef = useRef<number | null>(null)

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
  const isUnluckyActive = isTimestampInFuture(unluckyUntil, currentTime)
  const unluckyTimeLeftText = isUnluckyActive
    ? formatEventDuration(Math.max(Date.parse(unluckyUntil ?? '') - currentTime, 0))
    : ''
  const activeProfitMultiplier = isUnluckyActive ? UNLUCKY_PROFIT_MULTIPLIER : 1
  const effectiveClickProfit = Math.max(1, safeClickProfit * activeProfitMultiplier)
  const baseEffectiveHourlyProfit = safeHourlyProfit + referralHourlyBonus
  const effectiveHourlyProfit = baseEffectiveHourlyProfit * activeProfitMultiplier
  const maxLevel = LEVELS.length
  const sortedFeedUpgrades = useMemo(() => {
    return [...FEED_UPGRADES].sort((leftUpgrade, rightUpgrade) => {
      const leftPrice = calculateUpgradePrice(
        leftUpgrade.basePrice,
        upgradeLevels[leftUpgrade.id] ?? 0,
      )
      const rightPrice = calculateUpgradePrice(
        rightUpgrade.basePrice,
        upgradeLevels[rightUpgrade.id] ?? 0,
      )

      if (leftPrice !== rightPrice) {
        return leftPrice - rightPrice
      }

      return leftUpgrade.basePrice - rightUpgrade.basePrice
    })
  }, [upgradeLevels])

  const localGameFinished = currentTime >= gameEndsAt
  const serverGameFinished = serverGame?.status === 'finished'
  const isGameFinished = serverGame ? serverGameFinished : localGameFinished

  const eventStartedAt = getParsedTimestamp(serverGame?.startedAt, gameStartedAt)
  const eventEndsAt = getParsedTimestamp(serverGame?.endsAt, gameEndsAt)
  const eventDurationMs = Math.max(eventEndsAt - eventStartedAt, 1)
  const eventElapsedMs = Math.min(
    Math.max(currentTime - eventStartedAt, 0),
    eventDurationMs,
  )
  const eventRemainingMs = Math.max(eventEndsAt - currentTime, 0)
  const eventProgressPercent = Math.min(
    Math.max((eventElapsedMs / eventDurationMs) * 100, 0),
    100,
  )
  const eventTotalDays = Math.max(1, Math.ceil(eventDurationMs / 86400000))
  const eventCurrentDay = Math.min(
    eventTotalDays,
    Math.floor(eventElapsedMs / 86400000) + 1,
  )
  const eventTimeLeftText = isGameFinished
    ? 'Ивент завершён'
    : formatEventDuration(eventRemainingMs)
  const eventElapsedText = formatEventDuration(eventElapsedMs)
  const eventEndsAtText = formatEventDate(eventEndsAt)

  const referralLink = getReferralLink(telegramUser)
  const myReward = findMyReward(finalRewards, telegramUser)
  const finalPromoCode = myReward?.promoCode ?? generateLocalPromoCode(displayedBalance)
  const hiddenFinalPromoCode = '•'.repeat(Math.max(finalPromoCode.length, 12))
  const finalRewardAmountText = myReward
    ? `${formatNumber(myReward.rewardAmount)} DOGS`
    : finalRewardsLoading
      ? 'считаем...'
      : 'ожидает backend'
  const finalRewardShareText = myReward
    ? `${myReward.sharePercent}%`
    : finalRewardsLoading
      ? 'считаем...'
      : 'ожидает backend'

  const ratingText = currentLeaderboardPlayer
    ? `#${currentLeaderboardPlayer.rank}`
    : '...'

  function applyPlayerServerState(player: {
    unlockedCoinSkins?: number[]
    selectedCoinSkin?: number | null
    afkFullFarmUnlocked?: boolean
    unluckyUntil?: string | null
    bannedAt?: string | null
    banReason?: string | null
  }) {
    const nextUnlockedCoinSkins = normalizeUnlockedCoinSkins(
      player.unlockedCoinSkins,
    )
    const nextSelectedCoinSkin = getVisibleSelectedCoinSkin(
      getSafeCoinSkinId(player.selectedCoinSkin),
      nextUnlockedCoinSkins,
    )

    setUnlockedCoinSkins(nextUnlockedCoinSkins)
    setSelectedCoinSkin(nextSelectedCoinSkin)
    setAfkFullFarmUnlocked(player.afkFullFarmUnlocked === true)
    setUnluckyUntil(getSafeOptionalIsoDate(player.unluckyUntil))
    setBannedAt(getSafeOptionalIsoDate(player.bannedAt))
    setBanReason(typeof player.banReason === 'string' ? player.banReason : null)
  }

  async function refreshCurrentPlayerCosmetics() {
    try {
      const currentPlayerResponse = await getCurrentPlayer(telegramUser)

      if (currentPlayerResponse.player) {
        applyPlayerServerState(currentPlayerResponse.player)
        setServerStatusText('Coin skins refreshed')
      }
    } catch (error) {
      console.error('Failed to refresh coin skins:', error)
      setServerStatusText('Coin skins refresh failed')
    }
  }

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

      if (response.player) {
        applyPlayerServerState(response.player)
      }

      const now = Date.now()

      if (now - lastSocialRefreshRef.current >= SOCIAL_REFRESH_INTERVAL_MS) {
        lastSocialRefreshRef.current = now

        await loadReferrals(payload.telegramUser)
        await loadLeaderboard(payload.telegramUser)
      }
    } catch (error) {
      console.error('Auto sync failed:', error)

      if (error instanceof Error && error.message.includes('banned')) {
        try {
          const currentPlayerResponse = await getCurrentPlayer(payload.telegramUser)

          if (currentPlayerResponse.player) {
            applyPlayerServerState(currentPlayerResponse.player)
          }
        } catch (refreshError) {
          console.error('Failed to refresh banned player state:', refreshError)
        }
      }

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

          setLevel10UnlockStep(
            getSafeLevel10UnlockStep(loadedPlayer.level10UnlockStep),
          )
          setLevel10AnimationCompleted(
            loadedPlayer.level10AnimationCompleted === true,
          )

          if (loadedPlayer.level10AnimationCompleted === true) {
            setIsLevel10VideoPlaying(false)
          }

          applyPlayerServerState(loadedPlayer)

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
          setFinalRewardsLoading(true)

          try {
            const finalRewardsResponse = await getFinalRewards()

            setFinalRewards(finalRewardsResponse.finalRewards)
            setServerStatusText('Backend game: finished, rewards loaded')
          } catch {
            try {
              const finalizedRewardsResponse = await finalizeRewards()

              setServerGame(finalizedRewardsResponse.game)
              setFinalRewards(finalizedRewardsResponse.finalRewards)
              setServerStatusText('Backend game: finished, rewards finalized')
            } catch {
              setFinalRewards(null)
              setServerStatusText('Backend game: finished, rewards not finalized')
            }
          } finally {
            setFinalRewardsLoading(false)
          }
        } else {
          setFinalRewards(null)
          setFinalRewardsLoading(false)
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
    return () => {
      if (antiClickerWarningTimeoutRef.current !== null) {
        window.clearTimeout(antiClickerWarningTimeoutRef.current)
      }
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
      level10UnlockStep,
      level10AnimationCompleted,
      unlockedCoinSkins,
      selectedCoinSkin,
      afkFullFarmUnlocked,
      unluckyUntil,
      bannedAt,
      banReason,
    }

    localStorage.setItem(SAVE_KEY, JSON.stringify(save))
  }, [
    balance,
    clickProfit,
    hourlyProfit,
    upgradeLevels,
    gameStartedAt,
    gameEndsAt,
    level10UnlockStep,
    level10AnimationCompleted,
    unlockedCoinSkins,
    selectedCoinSkin,
    afkFullFarmUnlocked,
    unluckyUntil,
    bannedAt,
    banReason,
  ])

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
      level10UnlockStep,
      level10AnimationCompleted,
      selectedCoinSkin: getVisibleSelectedCoinSkin(selectedCoinSkin, unlockedCoinSkins),
    }

    syncVersionRef.current += 1
  }, [
    telegramUser,
    telegramStartParam,
    displayedBalance,
    safeClickProfit,
    safeHourlyProfit,
    upgradeLevels,
    level10UnlockStep,
    level10AnimationCompleted,
    selectedCoinSkin,
    unlockedCoinSkins,
  ])

  useEffect(() => {
    backendReadyRef.current = backendPlayerLoaded
  }, [backendPlayerLoaded])

  useEffect(() => {
    gameSyncAllowedRef.current = !isGameFinished && serverGame?.status === 'active'
  }, [isGameFinished, serverGame?.status])

  useEffect(() => {
    if (!backendPlayerLoaded || !isGameFinished || finalRewards || finalRewardsLoading) {
      return
    }

    let cancelled = false

    async function loadFinalRewardsAfterEvent() {
      setFinalRewardsLoading(true)

      try {
        const finalRewardsResponse = await getFinalRewards()

        if (cancelled) {
          return
        }

        setServerGame(finalRewardsResponse.game)
        setFinalRewards(finalRewardsResponse.finalRewards)
        setServerStatusText('Backend game: finished, rewards loaded')
      } catch {
        if (!serverGameFinished) {
          if (!cancelled) {
            setServerStatusText('Backend game: finished locally, waiting for server')
          }

          return
        }

        try {
          const finalizedRewardsResponse = await finalizeRewards()

          if (cancelled) {
            return
          }

          setServerGame(finalizedRewardsResponse.game)
          setFinalRewards(finalizedRewardsResponse.finalRewards)
          setServerStatusText('Backend game: finished, rewards finalized')
        } catch (error) {
          if (!cancelled) {
            const message = error instanceof Error ? error.message : 'unknown error'

            setServerStatusText(`Final rewards loading failed: ${message}`)
          }
        }
      } finally {
        if (!cancelled) {
          setFinalRewardsLoading(false)
        }
      }
    }

    void loadFinalRewardsAfterEvent()

    return () => {
      cancelled = true
    }
  }, [
    backendPlayerLoaded,
    finalRewards,
    finalRewardsLoading,
    isGameFinished,
    serverGameFinished,
  ])

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

  const showLevel10Unlock =
    displayedBalance >= LEVEL_10_MIN_COINS && !level10AnimationCompleted
  const currentDogImage = showLevel10Unlock
    ? dogLevel9
    : DOG_IMAGES[currentLevel.level]
  const activeCoinSkinId = getVisibleSelectedCoinSkin(
    selectedCoinSkin,
    unlockedCoinSkins,
  )
  const activeCoinSkin = COIN_SKINS.find((skin) => skin.id === activeCoinSkinId)
  const activeCoinImage = showLevel10Unlock
    ? currentDogImage
    : activeCoinSkin?.image ?? currentDogImage
  const showLevel10Crack = showLevel10Unlock && level10UnlockStep > 0

  const progressPercent = useMemo(() => {
    if (!nextLevel) {
      return 100
    }

    const coinsOnCurrentLevel = displayedBalance - currentLevel.minCoins
    const coinsNeededForNextLevel = nextLevel.minCoins - currentLevel.minCoins

    return Math.min((coinsOnCurrentLevel / coinsNeededForNextLevel) * 100, 100)
  }, [displayedBalance, currentLevel, nextLevel])


  useEffect(() => {
    const audio = new Audio(glassCrackSound)
    audio.preload = 'auto'
    audio.volume = 1
    glassCrackAudioRef.current = audio

    return () => {
      audio.pause()
      glassCrackAudioRef.current = null
    }
  }, [])

  function updateLevel10CrackOriginFromButton(button?: HTMLButtonElement | null) {
    const targetButton = button ?? dogButtonRef.current

    if (!targetButton) {
      return
    }

    const rect = targetButton.getBoundingClientRect()

    setLevel10CrackOrigin({
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    })
  }

  function playGlassCrackSound() {
    const audio = glassCrackAudioRef.current

    if (!audio) {
      return
    }

    audio.pause()
    audio.currentTime = 0
    audio.volume = 1

    const playPromise = audio.play()

    if (playPromise) {
      playPromise.catch((error) => {
        console.error('Glass crack sound failed:', error)
      })
    }
  }

  function triggerLevel10HapticFeedback(step: Level10UnlockStep) {
    const webApp = window.Telegram?.WebApp as TelegramWebAppWithHaptic | undefined
    const haptic = webApp?.HapticFeedback

    if (haptic?.impactOccurred) {
      try {
        if (step === 1) {
          haptic.impactOccurred('light')
        } else if (step === 2) {
          haptic.impactOccurred('medium')
        } else {
          haptic.impactOccurred('heavy')
        }

        return
      } catch (error) {
        console.error('Telegram haptic feedback failed:', error)
      }
    }

    const navigatorWithVibration = navigator as Navigator & {
      vibrate?: (pattern: number | number[]) => boolean
    }

    if (!navigatorWithVibration.vibrate) {
      return
    }

    if (step === 1) {
      navigatorWithVibration.vibrate(45)
    } else if (step === 2) {
      navigatorWithVibration.vibrate([70, 30, 90])
    } else {
      navigatorWithVibration.vibrate([110, 40, 160, 40, 110])
    }
  }

  function syncLevel10UnlockState(
    nextLevel10UnlockStep: Level10UnlockStep,
    nextLevel10AnimationCompleted: boolean,
    nextBalance?: number,
  ) {
    const currentPayload = latestSyncPayloadRef.current

    if (!currentPayload) {
      return
    }

    latestSyncPayloadRef.current = {
      ...currentPayload,
      balance: nextBalance ?? currentPayload.balance,
      level10UnlockStep: nextLevel10UnlockStep,
      level10AnimationCompleted: nextLevel10AnimationCompleted,
      selectedCoinSkin: getVisibleSelectedCoinSkin(selectedCoinSkin, unlockedCoinSkins),
    }
    syncVersionRef.current += 1

    void syncLatestProgress(true)
  }

  function startLevel10VideoAfterCrack() {
    window.setTimeout(() => {
      setIsLevel10VideoPlaying(true)
    }, LEVEL_10_FINAL_CRACK_DELAY_MS)
  }

  function advanceLevel10UnlockIfNeeded(nextBalance: number) {
    if (level10AnimationCompleted || nextBalance < LEVEL_10_MIN_COINS) {
      return
    }

    setLevel10UnlockStep((currentStep) => {
      if (currentStep >= LEVEL_10_CRACK_STEPS) {
        startLevel10VideoAfterCrack()
        return currentStep
      }

      const nextStep = Math.min(
        currentStep + 1,
        LEVEL_10_CRACK_STEPS,
      ) as Level10UnlockStep

      playGlassCrackSound()
      triggerLevel10HapticFeedback(nextStep)
      syncLevel10UnlockState(nextStep, false, nextBalance)

      if (nextStep >= LEVEL_10_CRACK_STEPS) {
        startLevel10VideoAfterCrack()
      }

      return nextStep
    })
  }

  function completeLevel10Unlock() {
    setIsLevel10VideoPlaying(false)
    setLevel10UnlockStep(LEVEL_10_CRACK_STEPS as Level10UnlockStep)
    setLevel10AnimationCompleted(true)
    syncLevel10UnlockState(LEVEL_10_CRACK_STEPS as Level10UnlockStep, true)
  }

  useEffect(() => {
    if (!isLevel10VideoPlaying) {
      return
    }

    const video = level10VideoRef.current

    if (!video) {
      return
    }

    video.muted = false
    video.volume = 1

    const playPromise = video.play()

    if (playPromise) {
      playPromise.catch((error) => {
        console.error('Level 10 video play with sound failed:', error)
      })
    }
  }, [isLevel10VideoPlaying])

  function showAntiClickerWarning(message: string) {
    setAntiClickerWarning(message)

    if (antiClickerWarningTimeoutRef.current !== null) {
      window.clearTimeout(antiClickerWarningTimeoutRef.current)
    }

    antiClickerWarningTimeoutRef.current = window.setTimeout(() => {
      setAntiClickerWarning(null)
      antiClickerWarningTimeoutRef.current = null
    }, AUTOCLICKER_WARNING_MS)
  }

  function canAcceptDogTap() {
    const now = Date.now()

    if (now < tapCooldownUntilRef.current) {
      showAntiClickerWarning('Пауза: слишком много тапов подряд.')
      return false
    }

    if (now - lastAcceptedTapAtRef.current < MIN_TAP_INTERVAL_MS) {
      blockedTapCountRef.current += 1

      if (blockedTapCountRef.current >= 4) {
        tapCooldownUntilRef.current = now + AUTOCLICKER_COOLDOWN_MS
        blockedTapCountRef.current = 0
      }

      showAntiClickerWarning('Некоторые слишком быстрые тапы не засчитаны.')
      return false
    }

    const recentTaps = tapTimestampsRef.current.filter(
      (tapTime) => now - tapTime < 1000,
    )

    if (recentTaps.length >= MAX_VALID_TAPS_PER_SECOND) {
      blockedTapCountRef.current += 1

      if (blockedTapCountRef.current >= 3) {
        tapCooldownUntilRef.current = now + AUTOCLICKER_COOLDOWN_MS
        blockedTapCountRef.current = 0
      }

      tapTimestampsRef.current = recentTaps
      showAntiClickerWarning('Очень быстрый автокликер ограничен 🙂')
      return false
    }

    recentTaps.push(now)
    tapTimestampsRef.current = recentTaps
    lastAcceptedTapAtRef.current = now
    blockedTapCountRef.current = 0

    return true
  }

  function handleDogClick() {
    if (isGameFinished || isLevel10VideoPlaying) {
      return
    }

    if (!canAcceptDogTap()) {
      return
    }

    const nextBalance = displayedBalance + effectiveClickProfit

    setBalance((currentBalance) => currentBalance + effectiveClickProfit)
    advanceLevel10UnlockIfNeeded(nextBalance)
  }

  function handleDogPointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (event.pointerType === 'mouse' && event.button !== 0) {
      return
    }

    event.preventDefault()
    updateLevel10CrackOriginFromButton(event.currentTarget)
    handleDogClick()
  }


  function openCoinSkinPurchaseChat(skin: CoinSkin) {
    const telegramUrl = `https://t.me/${COIN_SKIN_SELLER_USERNAME}`

    try {
      const telegramWebAppWithLinks = window.Telegram?.WebApp as
        | ({ openTelegramLink?: (url: string) => void })
        | undefined

      if (telegramWebAppWithLinks?.openTelegramLink) {
        telegramWebAppWithLinks.openTelegramLink(telegramUrl)
      } else {
        window.location.href = telegramUrl
        return
      }
    } catch {
      window.location.href = telegramUrl
      return
    }

    setServerStatusText(
      `Напиши @${COIN_SKIN_SELLER_USERNAME}: skin ${skin.id}`,
    )
  }

  function openPaidShopItemChat(item: ShopItem) {
    const telegramUrl = `https://t.me/${COIN_SKIN_SELLER_USERNAME}`

    try {
      const telegramWebAppWithLinks = window.Telegram?.WebApp as
        | { openTelegramLink?: (url: string) => void }
        | undefined

      if (telegramWebAppWithLinks?.openTelegramLink) {
        telegramWebAppWithLinks.openTelegramLink(telegramUrl)
      } else {
        window.location.href = telegramUrl
      }
    } catch {
      window.location.href = telegramUrl
    }

    setServerStatusText(
      `Напиши @${COIN_SKIN_SELLER_USERNAME}: ${item.commandLabel}`,
    )
  }

  function handleCoinSkinAction(skin: CoinSkin) {
    const skinUnlocked = isCoinSkinUnlocked(skin.id, unlockedCoinSkins)

    if (!skinUnlocked) {
      openCoinSkinPurchaseChat(skin)
      return
    }

    const nextSelectedCoinSkin = selectedCoinSkin === skin.id ? null : skin.id

    setSelectedCoinSkin(nextSelectedCoinSkin)
    setServerStatusText(
      nextSelectedCoinSkin
        ? `Coin skin ${skin.id} selected`
        : 'Default coin selected',
    )

    const currentPayload = latestSyncPayloadRef.current

    if (currentPayload) {
      latestSyncPayloadRef.current = {
        ...currentPayload,
        selectedCoinSkin: nextSelectedCoinSkin,
      }
      syncVersionRef.current += 1
      void syncLatestProgress(true)
    }
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
      level10UnlockStep,
      level10AnimationCompleted,
      selectedCoinSkin: getVisibleSelectedCoinSkin(selectedCoinSkin, unlockedCoinSkins),
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
        setFinalRewardsLoading(true)

        try {
          const finalRewardsResponse = await getFinalRewards()

          setFinalRewards(finalRewardsResponse.finalRewards)
          setServerStatusText('Backend game: finished, rewards loaded')
        } catch {
          const finalizedRewardsResponse = await finalizeRewards()

          setServerGame(finalizedRewardsResponse.game)
          setFinalRewards(finalizedRewardsResponse.finalRewards)
          setServerStatusText('Backend game: finished, rewards finalized')
        } finally {
          setFinalRewardsLoading(false)
        }
      } else {
        setFinalRewards(null)
        setFinalRewardsLoading(false)
      }
    } catch {
      setServerGame(null)
      setServerStatusText('Backend unavailable, local beta mode')
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

  if (bannedAt) {
    return (
      <div className="app" style={{ backgroundImage: `url(${bgImage})` }}>
        <main className="game-screen banned-screen">
          <section className="banned-card">
            <div className="banned-icon">🔨</div>
            <span className="shop-card-tag">Account blocked</span>
            <h1>Аккаунт заблокирован</h1>
            <p>Этот профиль больше не может участвовать в игре.</p>
            {banReason && <small>{banReason}</small>}
          </section>
        </main>
      </div>
    )
  }

  return (
    <div className="app" style={{ backgroundImage: `url(${bgImage})` }}>
      <main className="game-screen">
        {!isGameFinished && activeTab === 'clicker' && (
          <section className="top-stats">
            <div className="stat-card">
              <span>Прибыль</span>
              <span>за клик +{formatNumber(effectiveClickProfit)}</span>
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

        {!isGameFinished && activeTab === 'clicker' && isUnluckyActive && (
          <section className="unlucky-status-card">
            <div>
              <span>Эффект неудачи</span>
              <strong>Клики и фарм работают только на 0.25x</strong>
            </div>
            <small>Осталось: {unluckyTimeLeftText}</small>
          </section>
        )}

        {isGameFinished && (
          <section className="final-screen">
            <div className="final-card">
              <div className="final-badge">Event finished</div>

              <h1>Фарм завершён!</h1>
              <p>Финальный баланс зафиксирован. Награда считается из пула 20 DOGS с учётом баланса и места в рейтинге.</p>

              <div className="final-reward-highlight">
                <span>Ты получил</span>
                <strong>{finalRewardAmountText}</strong>
                <small>из пула {finalRewards?.rewardPool ?? 20} DOGS</small>
              </div>

              <div className="final-stats-grid">
                <div className="final-stat-tile">
                  <span>Твой баланс</span>
                  <strong>{formatNumber(myReward?.finalBalance ?? displayedBalance)}</strong>
                </div>

                <div className="final-stat-tile">
                  <span>Твоя доля награды</span>
                  <strong>{finalRewardShareText}</strong>
                </div>
              </div>

              <div className="final-promo-card">
                <div>
                  <span>Промокод</span>
                  <strong className={promoCodeVisible ? 'promo-visible' : 'promo-hidden'}>
                    {promoCodeVisible ? finalPromoCode : hiddenFinalPromoCode}
                  </strong>
                </div>

                <button
                  className="promo-eye-button"
                  type="button"
                  aria-label={promoCodeVisible ? 'Скрыть промокод' : 'Показать промокод'}
                  onClick={() => setPromoCodeVisible((isVisible) => !isVisible)}
                >
                  {promoCodeVisible ? '🙈' : '👁️'}
                </button>
              </div>

              <p className="final-note">
                {finalRewardsLoading
                  ? 'Загружаем финальную награду с backend...'
                  : serverGameFinished
                    ? serverStatusText
                    : 'Локальная beta-версия. Backend ещё не завершил событие.'}
              </p>

              <button
                className="final-refresh-button"
                type="button"
                onClick={refreshBackendState}
                disabled={finalRewardsLoading}
              >
                {finalRewardsLoading ? 'Загружается...' : 'Обновить статус'}
              </button>
            </div>
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

            {showLevel10Crack && (
              <div className="level10-unlock-hint">
                {level10UnlockStep < LEVEL_10_CRACK_STEPS
                  ? 'Включи звук — экран трескается'
                  : 'Включи звук — открывается 10 уровень...'}
              </div>
            )}

            {antiClickerWarning && (
              <div className="anti-clicker-warning">
                {antiClickerWarning}
              </div>
            )}

            <section className="dog-button-wrapper">
              <button
                ref={dogButtonRef}
                className={`dog-button ${
                  showLevel10Crack
                    ? `level10-cracking level10-crack-step-${level10UnlockStep}`
                    : ''
                }`}
                type="button"
                onPointerDown={handleDogPointerDown}
                disabled={isGameFinished || isLevel10VideoPlaying}
              >
                <img className="main-coin" src={mainCoinImage} alt="main coin" />
                <img
                  className="dog-image"
                  src={activeCoinImage}
                  alt={`dog level ${currentLevel.level}`}
                />

              </button>

              {showLevel10Crack && (
                <div
                  className={`level10-crack-overlay level10-crack-step-${level10UnlockStep}`}
                  style={
                    level10CrackOrigin
                      ? ({
                          '--level10-crack-x': `${level10CrackOrigin.x}px`,
                          '--level10-crack-y': `${level10CrackOrigin.y}px`,
                        } as CSSProperties)
                      : undefined
                  }
                  aria-hidden="true"
                >
                  <span className="level10-screen-dim" />
                  <span className="level10-glass-crack core-main" />
                  <span className="level10-glass-crack core-left" />
                  <span className="level10-glass-crack core-right" />
                  <span className="level10-glass-crack core-top" />
                  <span className="level10-glass-crack core-bottom" />
                  <span className="level10-glass-crack mid-left" />
                  <span className="level10-glass-crack mid-right" />
                  <span className="level10-glass-crack mid-top" />
                  <span className="level10-glass-crack mid-bottom" />
                  <span className="level10-glass-crack full-left" />
                  <span className="level10-glass-crack full-right" />
                  <span className="level10-glass-crack full-top-left" />
                  <span className="level10-glass-crack full-top-right" />
                  <span className="level10-glass-crack full-bottom-left" />
                  <span className="level10-glass-crack full-bottom-right" />
                  <span className="level10-glass-crack shard shard-1" />
                  <span className="level10-glass-crack shard shard-2" />
                  <span className="level10-glass-crack shard shard-3" />
                  <span className="level10-glass-crack shard shard-4" />
                  <span className="level10-glass-crack shard shard-5" />
                  <span className="level10-glass-flash" />
                </div>
              )}
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
                    <strong>+{formatNumber(effectiveClickProfit)}</strong>
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

            <div className="feed-section">
              <div className="feed-section-title">
                <div>
                  <strong>Апгрейды по цене</strong>
                  <span>{FEED_UPGRADES_DESCRIPTION}. Предметы теперь идут от дешёвых к дорогим.</span>
                </div>
                <b>{sortedFeedUpgrades.length}</b>
              </div>

              <div className="upgrade-list">
                {sortedFeedUpgrades.map((upgrade) => {
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
                          <span>
                            Lvl {upgradeLevel} · {upgrade.type === 'click' ? 'Клик' : 'В час'}
                          </span>
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
              <p>Топ игроков по балансу за текущий 14-дневный фарм.</p>
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
                <p>Скины монетки и premium-действия можно купить прямо в gmshop.</p>
              </div>

              <div className="shop-hero-coin">
                <img src={activeCoinSkin?.image ?? mainCoinImage} alt="coin" />
              </div>
            </div>

            <div className="shop-event-card">
              <div className="shop-event-header">
                <div>
                  <span className="shop-card-tag">14-day event</span>
                  <strong>До конца фарма</strong>
                </div>
                <div className="shop-event-day-pill">
                  День {eventCurrentDay}/{eventTotalDays}
                </div>
              </div>

              <div className="shop-event-timer-row">
                <div>
                  <span>Осталось</span>
                  <strong>{eventTimeLeftText}</strong>
                </div>
                <div>
                  <span>Финиш</span>
                  <strong>{eventEndsAtText}</strong>
                </div>
              </div>

              <div className="shop-event-progress-top">
                <span>Прогресс ивента</span>
                <strong>{eventProgressPercent.toFixed(1)}%</strong>
              </div>

              <div
                className="shop-event-progress-bar"
                aria-label="Event progress"
              >
                <div style={{ width: `${eventProgressPercent}%` }} />
              </div>

              <div className="shop-event-progress-bottom">
                <span>Прошло: {eventElapsedText}</span>
                <span>{GAME_DURATION_DAYS} дней всего</span>
              </div>
            </div>

            <div className="shop-wallet-card">
              <div>
                <span>Твой баланс</span>
                <strong>{formatNumber(displayedBalance)} coins</strong>
              </div>
              <div>
                <span>Клик</span>
                <strong>+{formatNumber(effectiveClickProfit)}</strong>
              </div>
              <div>
                <span>В час</span>
                <strong>+{formatNumber(effectiveHourlyProfit)}</strong>
              </div>
            </div>

            <div className="coin-skins-card">
              <div className="coin-skins-header">
                <div>
                  <span className="shop-card-tag">Coin skins</span>
                  <strong>Скины монетки</strong>
                  <p>Цена каждого скина - {COIN_SKIN_PRICE_LABEL}. После успешной оплаты вы получите скин.</p>
                </div>
                <button type="button" onClick={refreshCurrentPlayerCosmetics}>
                  Обновить
                </button>
              </div>

              <div className="coin-skins-grid">
                {COIN_SKINS.map((skin) => {
                  const skinUnlocked = isCoinSkinUnlocked(skin.id, unlockedCoinSkins)
                  const skinSelected = selectedCoinSkin === skin.id && skinUnlocked

                  return (
                    <article
                      className={`coin-skin-card ${skinUnlocked ? 'unlocked' : 'locked'} ${skinSelected ? 'selected' : ''}`}
                      key={skin.id}
                    >
                      <div className="coin-skin-preview">
                        <img src={skin.image} alt={skin.title} />
                      </div>

                      <div className="coin-skin-copy">
                        <span>Skin #{skin.id}</span>
                        <strong>{skin.title}</strong>
                        <p>{skin.description}</p>
                      </div>

                      <button
                        type="button"
                        className={skinSelected ? 'selected' : ''}
                        onClick={() => handleCoinSkinAction(skin)}
                      >
                        {!skinUnlocked
                          ? COIN_SKIN_PRICE_LABEL
                          : skinSelected
                            ? 'Снять'
                            : 'Выбрать'}
                      </button>
                    </article>
                  )
                })}
              </div>
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
                    <span>{item.commandLabel}</span>
                    <button
                      type="button"
                      disabled={item.kind === 'afk' && afkFullFarmUnlocked}
                      onClick={() => openPaidShopItemChat(item)}
                    >
                      {item.kind === 'afk' && afkFullFarmUnlocked ? 'Активно' : item.priceLabel}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}
      </main>


      {isLevel10VideoPlaying && (
        <div className="level10-video-overlay">
          <video
            ref={level10VideoRef}
            className="level10-video"
            src={LEVEL_10_VIDEO_URL}
            autoPlay
            playsInline
            preload="auto"
            onCanPlay={(event) => {
              event.currentTarget.muted = false
              event.currentTarget.volume = 1
              void event.currentTarget.play()
            }}
            onEnded={completeLevel10Unlock}
            onError={completeLevel10Unlock}
          />
        </div>
      )}

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