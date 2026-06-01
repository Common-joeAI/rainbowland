/**
 * Mock video feed + user data — replace with real backend later.
 * All creators are fictional.
 * Using Cloudflare Stream sample / public domain videos (no auth required).
 */

export const MOCK_VIDEOS = [
  {
    id: '1',
    creator:    { name: 'Nova Starr',    handle: '@novastarr',   avatar: '🌟', prideFlag: 'rainbow'  },
    videoUrl:   'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    thumbnail:  '',
    caption:    '✨ Pride is every day, not just June 🏳️‍🌈 #pride #rainbow',
    likes:      4821,
    comments:   312,
    shares:     89,
    hashtags:   ['pride', 'rainbow', 'lgbtq'],
  },
  {
    id: '2',
    creator:    { name: 'River Moon',    handle: '@rivermoon',   avatar: '🌙', prideFlag: 'nonbinary' },
    videoUrl:   'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
    thumbnail:  '',
    caption:    'Non-binary and thriving 💛🤍💜🖤 #nonbinary #queer',
    likes:      2930,
    comments:   178,
    shares:     55,
    hashtags:   ['nonbinary', 'queer', 'pride'],
  },
  {
    id: '3',
    creator:    { name: 'Sage Flores',   handle: '@sageflores',  avatar: '🌿', prideFlag: 'trans'    },
    videoUrl:   'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    thumbnail:  '',
    caption:    'Trans joy is the best joy 🏳️‍⚧️💖 #trans #transjoy',
    likes:      6104,
    comments:   541,
    shares:     210,
    hashtags:   ['trans', 'transjoy', 'pride'],
  },
  {
    id: '4',
    creator:    { name: 'Lyric Chen',    handle: '@lyricchen',   avatar: '🎵', prideFlag: 'bisexual' },
    videoUrl:   'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
    thumbnail:  '',
    caption:    'Bisexual lighting hits different 💜💙💗 #bi #bisexual',
    likes:      3317,
    comments:   229,
    shares:     77,
    hashtags:   ['bisexual', 'bi', 'pride'],
  },
  {
    id: '5',
    creator:    { name: 'Atlas Rey',     handle: '@atlasrey',    avatar: '🗺️', prideFlag: 'lesbian'  },
    videoUrl:   'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4',
    thumbnail:  '',
    caption:    'Lesbian visibility every single day 🧡🤍💗 #lesbian #wlw',
    likes:      5882,
    comments:   403,
    shares:     134,
    hashtags:   ['lesbian', 'wlw', 'pride'],
  },
]

export const MOCK_LIVE_CREATORS = [
  {
    id: 'l1',
    name:      'Aurora Skye',
    handle:    '@aurorasky',
    avatar:    '🌌',
    thumbnail: '🎤',
    title:     'Late night pride chat — come hang 🏳️‍🌈',
    viewers:   1204,
    hashtags:  ['chat', 'pride', 'chill'],
    prideFlag: 'rainbow',
  },
  {
    id: 'l2',
    name:      'Pixel Witch',
    handle:    '@pixelwitch',
    avatar:    '🧙',
    thumbnail: '🎮',
    title:     'Gaming with the gays 🕹️ !drops',
    viewers:   3870,
    hashtags:  ['gaming', 'queer', 'lgbtq'],
    prideFlag: 'nonbinary',
  },
]

export const formatCount = (n) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

export const MOCK_TRENDING_TAGS = [
  { tag: 'rainbowland',   count: 482100 },
  { tag: 'vibes',         count: 312400 },
  { tag: 'lofi',          count: 298700 },
  { tag: 'gaming',        count: 245300 },
  { tag: 'chill',         count: 198200 },
  { tag: 'livestream',    count: 187600 },
  { tag: 'creator',       count: 165400 },
  { tag: 'neon',          count: 143900 },
  { tag: 'music',         count: 132100 },
  { tag: 'aesthetic',     count: 118700 },
]
