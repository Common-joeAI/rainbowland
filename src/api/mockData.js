/**
 * Mock video feed + user data — replace with real backend later.
 * All creators are fictional. Using real Pexels free videos for demo.
 */

export const MOCK_VIDEOS = [
  {
    id: 'v1',
    videoUrl: 'https://videos.pexels.com/video-files/3209828/3209828-uhd_2160_4096_25fps.mp4',
    thumbnail: 'https://images.pexels.com/videos/3209828/free-video-3209828.jpg',
    creator: { id: 'u1', name: 'Nova Starshine ✨', handle: '@novastarshine', avatar: '🌟', pronouns: 'she/her', verified: true },
    caption: 'living in my rainbow era 🌈 #pride #RainbowLand #queerjoy',
    hashtags: ['#pride', '#RainbowLand', '#queerjoy', '#lgbt', '#selfexpression'],
    likes: 48200,
    comments: 1240,
    shares: 892,
    music: { title: 'Loud & Proud', artist: 'Rainbow Band', loudmanHandle: 'alarmclockhero' },
    duration: 28,
  },
  {
    id: 'v2',
    videoUrl: 'https://videos.pexels.com/video-files/2278095/2278095-hd_1920_1080_30fps.mp4',
    thumbnail: 'https://images.pexels.com/videos/2278095/free-video-2278095.jpg',
    creator: { id: 'u2', name: 'Zephyr Blue 💙', handle: '@zephyrblue', avatar: '💙', pronouns: 'they/them', verified: false },
    caption: 'dance like nobody\'s watching 💃 this is my safe space #trans #dance',
    hashtags: ['#trans', '#dance', '#RainbowLand', '#safeSpace', '#joy'],
    likes: 22100,
    comments: 654,
    shares: 341,
    music: { title: 'Free Spirit', artist: 'Egon Ladd', loudmanHandle: 'egonladd' },
    duration: 15,
  },
  {
    id: 'v3',
    videoUrl: 'https://videos.pexels.com/video-files/4763824/4763824-hd_1080_1920_25fps.mp4',
    thumbnail: 'https://images.pexels.com/videos/4763824/free-video-4763824.jpg',
    creator: { id: 'u3', name: 'Marigold 🌻', handle: '@marigoldcreates', avatar: '🌻', pronouns: 'she/her', verified: true },
    caption: 'outfit of the day 🌈 thrifted everything! #queer #fashion #thrift',
    hashtags: ['#queer', '#fashion', '#thrift', '#ootd', '#lgbtfashion'],
    likes: 91300,
    comments: 3210,
    shares: 1500,
    music: { title: 'Sunshine Vibes', artist: 'EricBluJerze', loudmanHandle: 'ericblujerze' },
    duration: 22,
  },
  {
    id: 'v4',
    videoUrl: 'https://videos.pexels.com/video-files/5752729/5752729-hd_1080_1920_24fps.mp4',
    thumbnail: 'https://images.pexels.com/videos/5752729/free-video-5752729.jpg',
    creator: { id: 'u4', name: 'Axel Phoenix 🔥', handle: '@axelphoenix', avatar: '🔥', pronouns: 'he/him', verified: false },
    caption: 'cooking with love for my partner 🫶 gay dads making dinner #gaydad #cooking',
    hashtags: ['#gaydad', '#cooking', '#lgbtfamily', '#love', '#RainbowLand'],
    likes: 34700,
    comments: 890,
    shares: 567,
    music: { title: 'Home Vibes', artist: 'Joseph Schwartz', loudmanHandle: 'joespi' },
    duration: 30,
  },
  {
    id: 'v5',
    videoUrl: 'https://videos.pexels.com/video-files/3015668/3015668-hd_1280_720_30fps.mp4',
    thumbnail: 'https://images.pexels.com/videos/3015668/free-video-3015668.jpg',
    creator: { id: 'u5', name: 'Celestia Moon 🌙', handle: '@celestiamoon', avatar: '🌙', pronouns: 'she/they', verified: true },
    caption: 'bi pride energy only ✨🩷💜💙 #bisexual #pride #bipride',
    hashtags: ['#bisexual', '#pride', '#bipride', '#queer', '#identity'],
    likes: 67400,
    comments: 2100,
    shares: 1200,
    music: { title: 'Lunar Groove', artist: 'Alarm Clock Hero', loudmanHandle: 'alarmclockhero' },
    duration: 18,
  },
]

export const MOCK_TRENDING_TAGS = [
  '#RainbowLand', '#QueerJoy', '#TransVisibility', '#Pride2026',
  '#BiPride', '#NonBinary', '#LGBTCreators', '#LoudmanLive',
  '#DragArt', '#QueerFashion',
]

export const MOCK_LIVE_CREATORS = [
  { id: 'l1', name: 'DJ Prism 🎧', handle: '@djprism', viewers: 4200, thumbnail: '🌈', loudmanHandle: 'egonladd' },
  { id: 'l2', name: 'Vogue Queen 👑', handle: '@voguequeen', viewers: 1800, thumbnail: '👑', loudmanHandle: 'ericblujerze' },
  { id: 'l3', name: 'Rainbow Radio 📻', handle: '@rainbowradio', viewers: 9100, thumbnail: '📻', loudmanHandle: 'alarmclockhero' },
]

export function formatCount(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}
