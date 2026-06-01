import React, { useState, useEffect } from 'react'
import { Edit3, Settings, Link, Sparkles } from 'lucide-react'
import { useStore } from '../hooks/useStore'
import { generateBio } from '../api/grok'
import { MOCK_VIDEOS, formatCount } from '../api/mockData'
import TikTokConnect from '../components/TikTokConnect'
import clsx from 'clsx'

const PRONOUNS = ['she/her','he/him','they/them','she/they','he/they','xe/xem','any/all','ask me']
const FLAGS = ['🏳️‍🌈','⚧️','🩷','💜','💙','🌈','🖤🩶🤍💜','🩵🩷🤍']

export default function ProfilePage() {
  const { user, setUser } = useStore()
  const [editing, setEditing]   = useState(false)
  const [activeTab, setActiveTab] = useState('profile') // 'profile' | 'connections'
  const [form, setForm]         = useState({ name: user.name, pronouns: user.pronouns, bio: user.bio, flag: user.flag || '🏳️‍🌈', vibes: '' })
  const [aiLoading, setAiLoading] = useState(false)
  const [tiktokUser, setTiktokUser] = useState(null)

  const handleSave = () => {
    setUser({ name: form.name, pronouns: form.pronouns, bio: form.bio, flag: form.flag })
    setEditing(false)
  }

  const handleAiBio = async () => {
    setAiLoading(true)
    try {
      const bio = await generateBio(form.name, form.pronouns, form.vibes || 'creative content')
      setForm(f => ({ ...f, bio }))
    } catch { }
    setAiLoading(false)
  }

  const myVideos = MOCK_VIDEOS.slice(0, 3)

  return (
    <div className="h-full overflow-y-auto pt-14 pb-20">
      {/* Cover */}
      <div className="h-28 bg-gradient-to-r from-rainbow-purple via-rainbow-pink to-rainbow-orange relative">
        <div className="pride-strip absolute bottom-0 left-0 right-0" />
      </div>

      {/* Avatar */}
      <div className="px-4 -mt-10 flex items-end justify-between mb-4">
        <div className="rainbow-border rounded-full p-0.5">
          <div className="w-20 h-20 rounded-full bg-dark-600 flex items-center justify-center text-4xl">
            {tiktokUser?.avatarUrl
              ? <img src={tiktokUser.avatarUrl} className="w-full h-full rounded-full object-cover" alt="avatar" />
              : user.avatar
            }
          </div>
        </div>
        <div className="flex gap-2">
          {!editing ? (
            <>
              <button onClick={() => setEditing(true)} className="glass px-4 py-2 rounded-full text-sm font-semibold border border-white/20 flex items-center gap-1">
                <Edit3 className="w-4 h-4" /> Edit
              </button>
              <button className="glass p-2 rounded-full border border-white/20">
                <Settings className="w-4 h-4" />
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setEditing(false)} className="glass px-4 py-2 rounded-full text-sm border border-white/20">Cancel</button>
              <button onClick={handleSave} className="bg-gradient-to-r from-rainbow-pink to-rainbow-purple px-4 py-2 rounded-full text-sm font-bold text-white">Save</button>
            </>
          )}
        </div>
      </div>

      <div className="px-4">
        {!editing ? (
          <>
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-white font-black text-xl">
                {tiktokUser?.displayName || user.name}
              </h2>
              <span className="text-lg">{user.flag || '🏳️‍🌈'}</span>
              {tiktokUser && (
                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold"
                  style={{ background: 'rgba(255,255,255,0.08)', color: '#06d6a0' }}>
                  TikTok ✓
                </span>
              )}
            </div>
            <p className="text-white/50 text-sm mb-1">{user.handle} · {user.pronouns}</p>
            <p className="text-white/80 text-sm mb-4">{user.bio}</p>

            {/* Stats */}
            <div className="flex gap-6 mb-5">
              {[
                { label: 'Videos',    val: '0' },
                { label: 'Followers', val: formatCount(user.followers) },
                { label: 'Following', val: formatCount(user.following) },
              ].map(s => (
                <div key={s.label} className="text-center">
                  <p className="text-white font-black text-lg">{s.val}</p>
                  <p className="text-white/40 text-xs">{s.label}</p>
                </div>
              ))}
            </div>

            <button className="flex items-center gap-2 glass border border-white/15 rounded-full px-4 py-2 text-sm text-white/70 mb-6">
              <Link className="w-4 h-4" /> Share profile link
            </button>
          </>
        ) : (
          <div className="space-y-4 mb-6">
            <div>
              <label className="text-white/60 text-xs mb-1 block">Display name</label>
              <input className="w-full bg-dark-600 border border-white/15 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-rainbow-purple/60"
                value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label className="text-white/60 text-xs mb-1 block">Pronouns</label>
              <div className="flex flex-wrap gap-2">
                {PRONOUNS.map(p => (
                  <button key={p} onClick={() => setForm(f => ({ ...f, pronouns: p }))}
                    className={clsx('px-3 py-1 rounded-full text-xs border transition-all',
                      form.pronouns === p ? 'border-rainbow-purple bg-rainbow-purple/20 text-white' : 'border-white/15 text-white/60 glass')}>
                    {p}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-white/60 text-xs mb-1 block">Pride flag</label>
              <div className="flex gap-2 flex-wrap">
                {FLAGS.map(f => (
                  <button key={f} onClick={() => setForm(d => ({ ...d, flag: f }))}
                    className={clsx('text-2xl p-1 rounded-lg transition-all border',
                      form.flag === f ? 'border-rainbow-purple bg-rainbow-purple/20' : 'border-transparent')}>
                    {f}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-white/60 text-xs">Bio</label>
                <div className="flex items-center gap-2">
                  <input className="text-xs bg-dark-500 border border-white/10 rounded-lg px-2 py-1 text-white/60 w-32 outline-none"
                    placeholder="vibes (e.g. music, art)"
                    value={form.vibes} onChange={e => setForm(f => ({ ...f, vibes: e.target.value }))} />
                  <button onClick={handleAiBio} disabled={aiLoading}
                    className="flex items-center gap-1 glass px-3 py-1 rounded-full text-xs text-rainbow-purple border border-rainbow-purple/30">
                    <Sparkles className="w-3 h-3" />
                    {aiLoading ? 'Writing...' : 'AI bio'}
                  </button>
                </div>
              </div>
              <textarea className="w-full bg-dark-600 border border-white/15 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-rainbow-purple/60 resize-none"
                rows={3} value={form.bio} onChange={e => setForm(f => ({ ...f, bio: e.target.value }))}
                placeholder="Tell your story..." maxLength={150} />
              <p className="text-white/30 text-xs text-right">{form.bio.length}/150</p>
            </div>
          </div>
        )}

        {/* ── Tab nav: Videos / Connections ── */}
        <div className="flex gap-1 mb-4 p-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.05)' }}>
          {[['profile','My Videos'],['connections','Connections']].map(([id,label]) => (
            <button key={id} onClick={() => setActiveTab(id)}
              className={clsx('flex-1 py-2 rounded-lg text-sm font-semibold transition-all',
                activeTab === id ? 'bg-gradient-to-r from-rainbow-pink to-rainbow-purple text-white' : 'text-white/40')}>
              {label}
            </button>
          ))}
        </div>

        {activeTab === 'profile' && (
          <div className="grid grid-cols-3 gap-1.5 mb-4">
            {myVideos.map(v => (
              <div key={v.id} className="aspect-[9/16] rounded-xl overflow-hidden bg-dark-600 relative">
                <video src={v.videoUrl} className="w-full h-full object-cover" muted preload="metadata" />
                <div className="absolute bottom-1 left-1 text-white/60 text-[10px]">❤️ {formatCount(v.likes)}</div>
              </div>
            ))}
            <div className="aspect-[9/16] rounded-xl border-2 border-dashed border-white/15 flex items-center justify-center text-white/30 text-xs text-center px-2">
              + Upload your first video
            </div>
          </div>
        )}

        {activeTab === 'connections' && (
          <div className="space-y-3 mb-4">
            <p className="text-white/40 text-xs mb-3">Connect your social accounts to enable streaming and login.</p>
            <TikTokConnect onConnected={(u) => setTiktokUser(u)} />
            {/* Future: YouTube, Twitch, etc */}
            {[
              { name: 'YouTube', icon: '▶️', soon: true },
              { name: 'Twitch',  icon: '🎮', soon: true },
            ].map(p => (
              <div key={p.name} style={{ background: '#13131a', border: '1px solid #2a2a3a', borderRadius: 12, padding: '1rem 1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span style={{ fontSize: '1.5rem' }}>{p.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{p.name}</div>
                    <div style={{ fontSize: '0.8rem', color: '#888899' }}>Coming soon</div>
                  </div>
                  <span style={{ fontSize: '0.75rem', color: '#555', background: '#1a1a2a', padding: '0.25rem 0.75rem', borderRadius: 20 }}>Soon</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
