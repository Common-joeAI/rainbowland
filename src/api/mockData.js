/**
 * Mock video feed + user data — replace with real backend later.
 * All creators are fictional.
 */

// Maps pride flag identity → emoji + gradient colors
export const PRIDE_FLAGS = {
  rainbow:   { emoji: '🏳️‍🌈', colors: ['#E40303','#FF8C00','#FFED00','#008026','#004DFF','#750787'] },
  trans:     { emoji: '⚧️',    colors: ['#55CDFC','#F7A8B8','#FFFFFF','#F7A8B8','#55CDFC'] },
  nonbinary: { emoji: '🏳️',   colors: ['#FCF434','#FFFFFF','#9C59D1','#2D2D2D'] },
  bisexual:  { emoji: '💜',    colors: ['#D60270','#D60270','#9B4F96','#0038A8','#0038A8'] },
  lesbian:   { emoji: '🧡',    colors: ['#D52D00','#EF7627','#FF9A56','#FFFFFF','#D162A4','#B55690','#A50062'] },
  pan:       { emoji: '💛',    colors: ['#FF218C','#FFD800','#21B1FF'] },
  ace:       { emoji: '🖤',    colors: ['#000000','#A4A4A4','#FFFFFF','#810081'] },
  enby:      { emoji: '💛',    colors: ['#FCF434','#FFFFFF','#9C59D1','#2D2D2D'] },
}

export const MOCK_VIDEOS = [
  {
    id: '1',
    creator:    { name: 'Nova Starr',    handle: '@novastarr',   avatar: '🌟', prideFlag: 'rainbow',   pronouns: 'she/her'   },
    videoUrl:   'https://sample-videos.com/video321/mp4/720/big_buck_bunny_720p_1mb.mp4',
    thumbnail:  '',
    caption:    '✨ Pride is every day, not just June 🏳️‍🌈 #pride #rainbow',
    likes:      4821,
    comments:   312,
    shares:     89,
    hashtags:   ['pride', 'rainbow', 'lgbtq'],
    music:      { title: 'Rainbow Frequency', artist: 'Nova Collective', loudmanHandle: 'novacollective' },
  },
  {
    id: '2',
    creator:    { name: 'River Moon',    handle: '@rivermoon',   avatar: '🌙', prideFlag: 'nonbinary', pronouns: 'they/them' },
    videoUrl:   'https://sample-videos.com/video321/mp4/720/big_buck_bunny_720p_2mb.mp4',
    thumbnail:  '',
    caption:    'Non-binary and thriving 💛🤍💜🖤 #nonbinary #queer',
    likes:      2930,
    comments:   178,
    shares:     55,
    hashtags:   ['nonbinary', 'queer', 'pride'],
    music:      { title: 'Moonrise Drift', artist: 'Lunar Vibe', loudmanHandle: 'lunarvibe' },
  },
  {
    id: '3',
    creator:    { name: 'Sage Flores',   handle: '@sageflores',  avatar: '🌿', prideFlag: 'trans',     pronouns: 'he/him'    },
    videoUrl:   'https://www.w3schools.com/html/mov_bbb.mp4',
    thumbnail:  '',
    caption:    'Trans joy is the best joy 🏳️‍⚧️💖 #trans #transjoy',
    likes:      6104,
    comments:   541,
    shares:     210,
    hashtags:   ['trans', 'transjoy', 'pride'],
    music:      { title: 'Trans Euphoria', artist: 'Sage Sound', loudmanHandle: 'sagesound' },
  },
  {
    id: '4',
    creator:    { name: 'Lyric Chen',    handle: '@lyricchen',   avatar: '🎵', prideFlag: 'bisexual',  pronouns: 'she/they'  },
    videoUrl:   'https://www.learningcontainer.com/wp-content/uploads/2020/05/sample-mp4-file.mp4',
    thumbnail:  '',
    caption:    'Bisexual lighting hits different 💜💙💗 #bi #bisexual',
    likes:      3317,
    comments:   229,
    shares:     77,
    hashtags:   ['bisexual', 'bi', 'pride'],
    music:      { title: 'Bisexual Lighting', artist: 'Lyric Beats', loudmanHandle: 'lyricbeats' },
  },
  {
    id: '5',
    creator:    { name: 'Atlas Rey',     handle: '@atlasrey',    avatar: '🗺️', prideFlag: 'lesbian',   pronouns: 'she/her'   },
    videoUrl:   'https://media.w3.org/2010/05/sintel/trailer_hd.mp4',
    thumbnail:  '',
    caption:    'Lesbian visibility every single day 🧡🤍💗 #lesbian #wlw',
    likes:      5882,
    comments:   403,
    shares:     134,
    hashtags:   ['lesbian', 'wlw', 'pride'],
    music:      { title: 'WLW Summer', artist: 'Atlas Audio', loudmanHandle: 'atlasaudio' },
  },
  {
    id: '6',
    creator:    { name: 'Zara Phoenix',  handle: '@zaraphoenix', avatar: '🔥', prideFlag: 'trans',     pronouns: 'she/her'   },
    videoUrl:   'https://sample-videos.com/video321/mp4/720/big_buck_bunny_720p_5mb.mp4',
    thumbnail:  '',
    caption:    'Trans mutual aid saves lives 💙🩷🤍 tap the 💜 Aid button to help a sis out #TransMutualAid #trans',
    likes:      9241,
    comments:   834,
    shares:     512,
    hashtags:   ['transmutualaid', 'trans', 'mutualaid', 'pride'],
    music:      { title: 'Rise Up', artist: 'Phoenix Collective', loudmanHandle: 'phoenixcollective' },
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
    pronouns:  'she/her',
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
    pronouns:  'they/them',
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

// Tags considered safe — SafeSpace mode only shows content tagged with these
export const SAFESPACE_TRUSTED_TAGS = [
  'pride', 'lgbtq', 'rainbow', 'trans', 'transjoy', 'nonbinary',
  'queer', 'bisexual', 'bi', 'lesbian', 'wlw', 'mlm', 'ace',
  'pan', 'enby', 'rainbowland', 'safespace', 'inclusive',
]
