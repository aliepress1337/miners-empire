import { useEffect, useMemo, useState } from 'react'
import './App.css'

import {
  getFinalRewards,
  getGameState,
  syncPlayerProgress,
  type FinalRewardsDto,
  type GameStateDto,
  type PlayerRewardDto,
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

import clickerIcon from './assets/icons/clicker.png'
import feedIcon from './assets/icons/feed.png'
import friendsIcon from './assets/icons/friends.png'
import earnIcon from './assets/icons/earn.png'
import shopIcon from './assets/icons/shop.png'

type LevelConfig = {
  level: number
  name: string
  minCoins: number
}

type TabName = 'clicker' | 'feed' | 'friends' | 'earn' | 'shop'

type UpgradeId = 'smallBone' | 'bigBone' | 'autoFarm1' | 'autoFarm2'

type UpgradeType = 'click' | 'hourly'

type FeedUpgrade = {
  id: UpgradeId
  title: string
  type: UpgradeType
  basePrice: number
  profitIncrease: number
  description: string
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
const PRICE_GROWTH = 1.5

const BOT_USERNAME = 'MinersEmpire_bot'

const DEFAULT_UPGRADE_LEVELS: UpgradeLevels = {
  smallBone: 0,
  bigBone: 0,
  autoFarm1: 0,
  autoFarm2: 0,
}

const FEED_UPGRADES: FeedUpgrade[] = [
  {
    id: 'smallBone',
    title: 'Small Bone',
    type: 'click',
    basePrice: 50,
    profitIncrease: 1,
    description: '+1 к прибыли за клик',
  },
  {
    id: 'bigBone',
    title: 'Big Bone',
    type: 'click',
    basePrice: 250,
    profitIncrease: 5,
    description: '+5 к прибыли за клик',
  },
  {
    id: 'autoFarm1',
    title: 'Auto Farm I',
    type: 'hourly',
    basePrice: 100,
    profitIncrease: 120,
    description: '+120 монет прибыли в час',
  },
  {
    id: 'autoFarm2',
    title: 'Auto Farm II',
    type: 'hourly',
    basePrice: 500,
    profitIncrease: 600,
    description: '+600 монет прибыли в час',
  },
]

const LEVELS: LevelConfig[] = [
  { level: 1, name: 'Bronze', minCoins: 0 },
  { level: 2, name: 'Silver', minCoins: 100 },
  { level: 3, name: 'Gold', minCoins: 300 },
  { level: 4, name: 'Platinum', minCoins: 700 },
  { level: 5, name: 'Diamond', minCoins: 1500 },
  { level: 6, name: 'Master', minCoins: 3000 },
  { level: 7, name: 'Legend', minCoins: 6000 },
  { level: 8, name: 'Tsutsik King', minCoins: 10000 },
]

const DOG_IMAGES: Record<number, string> = {
  1: dogLevel1,
  2: dogLevel2,
  3: dogLevel3,
  4: dogLevel4,
  5: dogLevel5,
  6: dogLevel6,
  7: dogLevel7,
  8: dogLevel7,
}

const TABS: Array<{
  id: TabName
  label: string
  icon: string
}> = [
  { id: 'clicker', label: 'Clicker', icon: clickerIcon },
  { id: 'feed', label: 'Feed', icon: feedIcon },
  { id: 'friends', label: 'Friends', icon: friendsIcon },
  { id: 'earn', label: 'Earn', icon: earnIcon },
  { id: 'shop', label: 'Shop', icon: shopIcon },
]

function calculateUpgradePrice(basePrice: number, upgradeLevel: number) {
  return Math.floor(basePrice * PRICE_GROWTH ** upgradeLevel)
}

function normalizeUpgradeLevels(value: unknown): UpgradeLevels {
  if (!value || typeof value !== 'object') {
    return DEFAULT_UPGRADE_LEVELS
  }

  const partialLevels = value as Partial<UpgradeLevels>

  return {
    smallBone: Number(partialLevels.smallBone) || 0,
    bigBone: Number(partialLevels.bigBone) || 0,
    autoFarm1: Number(partialLevels.autoFarm1) || 0,
    autoFarm2: Number(partialLevels.autoFarm2) || 0,
  }
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

    const balance = Number(parsedSave.balance) || 0
    const clickProfit = Number(parsedSave.clickProfit) || 1
    const hourlyProfit = Number(parsedSave.hourlyProfit) || 0
    const savedAt = Number(parsedSave.savedAt) || now

    const upgradeLevels =
      parsedSave.upgradeLevels !== undefined
        ? normalizeUpgradeLevels(parsedSave.upgradeLevels)
        : {
            smallBone: Number(parsedSave.smallBoneLevel) || 0,
            bigBone: Number(parsedSave.bigBoneLevel) || 0,
            autoFarm1: Number(parsedSave.autoFarm1Level) || 0,
            autoFarm2: Number(parsedSave.autoFarm2Level) || 0,
          }

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
  return `https://t.me/${BOT_USERNAME}?start=${getReferralCode(telegramUser)}`
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
        (reward) => reward.telegramId === telegramUser.id,
      ) ?? null
    )
  }

  return (
    finalRewards.rewards.find(
      (reward) => reward.playerId === 'browser:beta-user',
    ) ?? null
  )
}

function App() {
  const savedGame = useMemo(() => loadSavedGame(), [])

  const [balance, setBalance] = useState(savedGame.balance)
  const [activeTab, setActiveTab] = useState<TabName>('clicker')
  const [clickProfit, setClickProfit] = useState(savedGame.clickProfit)
  const [hourlyProfit, setHourlyProfit] = useState(savedGame.hourlyProfit)
  const [upgradeLevels, setUpgradeLevels] = useState(savedGame.upgradeLevels)
  const [gameStartedAt, setGameStartedAt] = useState(savedGame.gameStartedAt)
  const [gameEndsAt, setGameEndsAt] = useState(savedGame.gameEndsAt)
  const [currentTime, setCurrentTime] = useState(Date.now())
  const [referralCopied, setReferralCopied] = useState(false)
  const [telegramUser, setTelegramUser] = useState<TelegramUser | null>(null)
  const [telegramMode, setTelegramMode] = useState(false)
  const [telegramStartParam, setTelegramStartParam] = useState<string | null>(
    null,
  )
  const [syncStatus, setSyncStatus] = useState('Not synced yet')
  const [syncing, setSyncing] = useState(false)

  const [serverGame, setServerGame] = useState<GameStateDto | null>(null)
  const [serverStatusText, setServerStatusText] = useState('Checking backend...')
  const [finalRewards, setFinalRewards] = useState<FinalRewardsDto | null>(null)

  const displayedBalance = Math.floor(balance)
  const maxLevel = LEVELS.length

  const localGameFinished = currentTime >= gameEndsAt
  const serverGameFinished = serverGame?.status === 'finished'
  const isGameFinished = serverGame ? serverGameFinished : localGameFinished

  const referralLink = getReferralLink(telegramUser)
  const myReward = findMyReward(finalRewards, telegramUser)

  useEffect(() => {
    initTelegramMiniApp()
    setTelegramUser(getTelegramUser())
    setTelegramMode(isOpenedInTelegram())
    setTelegramStartParam(getTelegramStartParam())
  }, [])

  useEffect(() => {
    async function loadBackendGameState() {
      try {
        const response = await getGameState()

        setServerGame(response.game)
        setServerStatusText(`Backend game: ${response.game.status}`)

        if (response.game.status === 'finished') {
          try {
            const finalRewardsResponse = await getFinalRewards()

            setFinalRewards(finalRewardsResponse.finalRewards)
            setServerStatusText('Backend game: finished, rewards loaded')
          } catch {
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

    loadBackendGameState()
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
  }, [
    balance,
    clickProfit,
    hourlyProfit,
    upgradeLevels,
    gameStartedAt,
    gameEndsAt,
  ])

  useEffect(() => {
    if (hourlyProfit <= 0 || isGameFinished) {
      return
    }

    const intervalId = window.setInterval(() => {
      const profitPerSecond = (hourlyProfit * ONLINE_HOURLY_MULTIPLIER) / 3600

      setBalance((currentBalance) => currentBalance + profitPerSecond)
    }, 1000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [hourlyProfit, isGameFinished])

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

    setBalance((currentBalance) => currentBalance + clickProfit)
  }

  function buyUpgrade(upgrade: FeedUpgrade) {
    if (isGameFinished) {
      return
    }

    const currentUpgradeLevel = upgradeLevels[upgrade.id]
    const currentUpgradePrice = calculateUpgradePrice(
      upgrade.basePrice,
      currentUpgradeLevel,
    )

    if (displayedBalance < currentUpgradePrice) {
      return
    }

    setBalance((currentBalance) => currentBalance - currentUpgradePrice)

    setUpgradeLevels((currentLevels) => ({
      ...currentLevels,
      [upgrade.id]: currentLevels[upgrade.id] + 1,
    }))

    if (upgrade.type === 'click') {
      setClickProfit(
        (currentClickProfit) => currentClickProfit + upgrade.profitIncrease,
      )
    }

    if (upgrade.type === 'hourly') {
      setHourlyProfit(
        (currentHourlyProfit) => currentHourlyProfit + upgrade.profitIncrease,
      )
    }
  }

  async function syncWithBackend() {
    setSyncing(true)
    setSyncStatus('Syncing...')

    try {
      const response = await syncPlayerProgress({
        telegramUser,
        balance: displayedBalance,
        clickProfit,
        hourlyProfit,
        upgradeLevels,
      })

      if (response.game) {
        setServerGame(response.game)
      }

      setSyncStatus(`Synced successfully: ${new Date().toLocaleTimeString()}`)
    } catch (error) {
      console.error(error)
      setSyncStatus('Sync failed. Check backend and console.')
    } finally {
      setSyncing(false)
    }
  }

  async function refreshBackendState() {
    setServerStatusText('Refreshing backend...')

    try {
      const response = await getGameState()

      setServerGame(response.game)
      setServerStatusText(`Backend game: ${response.game.status}`)

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

  function resetProgress() {
    const newSave = createDefaultSave()

    localStorage.removeItem(SAVE_KEY)

    setBalance(newSave.balance)
    setClickProfit(newSave.clickProfit)
    setHourlyProfit(newSave.hourlyProfit)
    setUpgradeLevels(newSave.upgradeLevels)
    setGameStartedAt(newSave.gameStartedAt)
    setGameEndsAt(newSave.gameEndsAt)
    setCurrentTime(Date.now())
    setSyncStatus('Not synced yet')
    setFinalRewards(null)
    setServerGame(null)
    setServerStatusText('Checking backend...')
    setActiveTab('clicker')
  }

  return (
    <div className="app" style={{ backgroundImage: `url(${bgImage})` }}>
      <main className="game-screen">
        <section className="top-stats">
          <div className="stat-card">
            <span>Прибыль</span>
            <span>за клик +{clickProfit}</span>
          </div>

          <div className="stat-card">
            <span>Рейтинг</span>
            <span>10000+</span>
          </div>

          <div className="stat-card">
            <span>Прибыль</span>
            <span>в час</span>
            <span>+{hourlyProfit}</span>
          </div>
        </section>

        <section className="balance-row">
          <img className="small-coin" src={coinImage} alt="coin" />
          <div className="balance">{displayedBalance}</div>
        </section>

        {isGameFinished && (
          <section className="final-screen">
            <h1>Фарм завершён!</h1>
            <p>Финальный баланс зафиксирован.</p>

            <div className="final-row">
              <span>Твой баланс:</span>
              <strong>{myReward?.finalBalance ?? displayedBalance}</strong>
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
            </section>

            <section className="dog-button-wrapper">
              <button
                className="dog-button"
                type="button"
                onClick={handleDogClick}
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
          <section className="tab-screen">
            <h1>Feed</h1>
            <p>Покупай еду и улучшения для собачки.</p>

            {FEED_UPGRADES.map((upgrade) => {
              const upgradeLevel = upgradeLevels[upgrade.id]
              const upgradePrice = calculateUpgradePrice(
                upgrade.basePrice,
                upgradeLevel,
              )

              return (
                <div className="upgrade-card" key={upgrade.id}>
                  <div>
                    <strong>{upgrade.title}</strong>
                    <span>Level: {upgradeLevel}</span>
                    <span>{upgrade.description}</span>

                    {upgrade.type === 'hourly' && (
                      <>
                        <span>Онлайн: 100% прибыли</span>
                        <span>Офлайн: 50% прибыли</span>
                      </>
                    )}

                    <span>Цена: {upgradePrice} монет</span>
                  </div>

                  <button
                    type="button"
                    disabled={displayedBalance < upgradePrice || isGameFinished}
                    onClick={() => buyUpgrade(upgrade)}
                  >
                    Купить
                  </button>
                </div>
              )
            })}
          </section>
        )}

        {!isGameFinished && activeTab === 'friends' && (
          <section className="tab-screen friends-screen">
            <h1>Friends</h1>
            <p>Приглашай друзей и получай бонусы.</p>

            <div className="telegram-status-card">
              <strong>Telegram status</strong>

              <div className="telegram-status-row">
                <span>Mode:</span>
                <b>{telegramMode ? 'Telegram Mini App' : 'Browser beta mode'}</b>
              </div>

              <div className="telegram-status-row">
                <span>User:</span>
                <b>{getTelegramDisplayName(telegramUser)}</b>
              </div>

              {telegramUser && (
                <div className="telegram-status-row">
                  <span>ID:</span>
                  <b>{telegramUser.id}</b>
                </div>
              )}

              {telegramStartParam && (
                <div className="telegram-status-row">
                  <span>Start param:</span>
                  <b>{telegramStartParam}</b>
                </div>
              )}

              <div className="telegram-status-row">
                <span>Backend:</span>
                <b>{serverStatusText}</b>
              </div>
            </div>

            <div className="referral-main-card">
              <strong>Твоя ссылка</strong>

              <div className="referral-link-box">{referralLink}</div>

              <button type="button" onClick={copyReferralLink}>
                {referralCopied ? 'Скопировано!' : 'Скопировать ссылку'}
              </button>
            </div>

            <div className="bonus-grid">
              <div className="bonus-card">
                <strong>+500</strong>
                <span>монет за друга</span>
              </div>

              <div className="bonus-card">
                <strong>+5%</strong>
                <span>от фарма друга</span>
              </div>
            </div>

            <div className="friends-list-card">
              <strong>Приглашённые друзья</strong>

              <div className="friend-row">
                <span>Пока друзей нет</span>
                <small>Поделись ссылкой</small>
              </div>
            </div>
          </section>
        )}

        {!isGameFinished && activeTab === 'earn' && (
          <section className="tab-screen">
            <h1>Earn</h1>
            <p>Заданий пока не будет. Этот экран оставим под будущие бонусы.</p>
          </section>
        )}

        {!isGameFinished && activeTab === 'shop' && (
          <section className="tab-screen">
            <h1>Shop</h1>
            <p>Тут позже будет донат.</p>

            <div className="upgrade-card">
              <div>
                <strong>Backend sync test</strong>
                <span>{syncStatus}</span>
                <span>Отправляет текущий прогресс на backend.</span>
              </div>
              <button type="button" onClick={syncWithBackend} disabled={syncing}>
                {syncing ? 'Syncing...' : 'Sync'}
              </button>
            </div>

            <div className="upgrade-card">
              <div>
                <strong>Backend state</strong>
                <span>{serverStatusText}</span>
              </div>
              <button type="button" onClick={refreshBackendState}>
                Refresh
              </button>
            </div>

            <div className="upgrade-card">
              <div>
                <strong>Coming soon</strong>
                <span>Донат и платные наборы добавим позже.</span>
              </div>
              <button type="button" disabled>
                Скоро
              </button>
            </div>

            <div className="upgrade-card">
              <div>
                <strong>Reset beta progress</strong>
                <span>Только для теста. Потом уберём.</span>
              </div>
              <button type="button" onClick={resetProgress}>
                Сбросить
              </button>
            </div>
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