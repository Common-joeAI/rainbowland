/**
 * Grok-3 AI integration — caption generation, hashtag suggestions,
 * content moderation (hate-speech detection), and bio writing.
 */

const XAI_KEY = import.meta.env.VITE_XAI_API_KEY || ''
const XAI_URL = 'https://api.x.ai/v1/chat/completions'

async function grokChat(messages, opts = {}) {
  const resp = await fetch(XAI_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${XAI_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'grok-3',
      messages,
      max_tokens: opts.max_tokens || 300,
      temperature: opts.temperature ?? 0.8,
    }),
  })
  if (!resp.ok) throw new Error(`Grok API error: ${resp.status}`)
  const data = await resp.json()
  return data.choices[0].message.content.trim()
}

/** Generate a catchy caption + hashtags for a video */
export async function generateCaption(description, tone = 'fun') {
  const msg = `You are the AI behind Rainbow Land, a TikTok-style platform for LGBT+ creators. 
Generate a SHORT, catchy caption (max 120 chars) and 5 relevant hashtags for this video:
"${description}"
Tone: ${tone}
Format: {"caption": "...", "hashtags": ["#tag1","#tag2","#tag3","#tag4","#tag5"]}`
  const raw = await grokChat([{ role: 'user', content: msg }], { max_tokens: 150 })
  try { return JSON.parse(raw) } catch { return { caption: raw, hashtags: ['#RainbowLand','#Pride','#LGBT'] } }
}

/** Suggest hashtags from a caption text */
export async function suggestHashtags(caption) {
  const msg = `Give 8 relevant TikTok-style hashtags for this LGBT+ creator video caption: "${caption}". 
Return only a JSON array of strings like ["#tag1","#tag2"...]`
  const raw = await grokChat([{ role: 'user', content: msg }], { max_tokens: 100, temperature: 0.6 })
  try { return JSON.parse(raw) } catch { return ['#RainbowLand','#Pride','#LGBTQ','#QueerJoy'] }
}

/** Write an LGBT-affirming creator bio */
export async function generateBio(name, pronouns, vibes) {
  const msg = `Write a short, authentic creator bio (max 150 chars) for Rainbow Land (LGBT+ video platform).
Creator name: ${name}, pronouns: ${pronouns}, vibes/content: ${vibes}. Be warm, inclusive, genuine.`
  return grokChat([{ role: 'user', content: msg }], { max_tokens: 120 })
}

/** Content moderation — returns { safe: bool, reason: string } */
export async function moderateContent(text) {
  const msg = `You are a content moderator for an LGBT+ platform. 
Review this text for hate speech, homophobia, transphobia, or harassment. 
Text: "${text}"
Respond ONLY with JSON: {"safe": true/false, "reason": "brief explanation"}`
  const raw = await grokChat([{ role: 'user', content: msg }], { max_tokens: 80, temperature: 0.1 })
  try { return JSON.parse(raw) } catch { return { safe: true, reason: 'OK' } }
}

/** Generate a personalized comment reply */
export async function generateReply(comment, creatorName, opts = {}) {
  if (!XAI_KEY) throw new Error('Missing XAI key')

  const personality = opts.personality || localStorage.getItem('rl_ai_personality') || 'warm'
  const customInstr = opts.customInstr  || localStorage.getItem('rl_ai_custom_instr') || ''

  const personalityMap = {
    warm:      'warm, caring, and affirming',
    hype:      'enthusiastic, high-energy, and hyped up',
    witty:     'witty, playful, and a bit clever',
    authentic: 'authentic, chill, and real — no corporate vibes',
  }
  const tone = personalityMap[personality] || personalityMap.warm

  const msg = `You are ${creatorName}, an LGBT+ creator on Rainbow Land.
Your reply style: ${tone}.
${customInstr ? `Additional instructions: ${customInstr}` : ''}
Write a genuine 1-sentence reply (max 90 chars) to this comment: "${comment}"
Be inclusive, never preachy. Just sound like a real person.`

  return grokChat([{ role: 'user', content: msg }], { max_tokens: 90 })
}
