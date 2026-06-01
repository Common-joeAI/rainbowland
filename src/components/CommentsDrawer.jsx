import React, { useState } from 'react'
import { X, Send, Heart } from 'lucide-react'
import { useStore } from '../hooks/useStore'
import { MOCK_VIDEOS } from '../api/mockData'
import { generateReply } from '../api/grok'
import clsx from 'clsx'

const MOCK_COMMENTS = [
  { id: 1, author: 'Rainbow Ray 🌈', handle: '@ray', avatar: '🌈', text: 'This made my whole day 🥹💜', likes: 342, ts: '2h' },
  { id: 2, author: 'Jade Prism', handle: '@jadeprism', avatar: '💎', text: 'YASS QUEEN you ate and left no crumbs!!!', likes: 128, ts: '3h' },
  { id: 3, author: 'Orion Blue', handle: '@orionblue', avatar: '🌊', text: 'the confidence is everything 🙌', likes: 89, ts: '4h' },
  { id: 4, author: 'Starfish Sky', handle: '@starfishsky', avatar: '⭐', text: 'Representation matters 🏳️‍🌈', likes: 213, ts: '5h' },
]

export default function CommentsDrawer({ videoId }) {
  const { showComments, setShowComments, comments, addComment, user } = useStore()
  const [input, setInput] = useState('')
  const [aiReplying, setAiReplying] = useState(null)
  const [aiReply, setAiReply] = useState({})

  const video = MOCK_VIDEOS.find(v => v.id === videoId)
  const userComments = comments[videoId] || []
  const allComments = [...MOCK_COMMENTS, ...userComments]

  const handleSend = () => {
    if (!input.trim()) return
    addComment(videoId, input.trim())
    setInput('')
  }

  const handleAiReply = async (comment) => {
    if (!video) return
    setAiReplying(comment.id)
    try {
      const reply = await generateReply(comment.text, video.creator.name)
      setAiReply(r => ({ ...r, [comment.id]: reply }))
    } catch { }
    setAiReplying(null)
  }

  if (!showComments) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={() => setShowComments(false)} />

      {/* Drawer */}
      <div className="relative w-full glass rounded-t-3xl flex flex-col max-h-[75vh] animate-slide-up">
        {/* Pride strip */}
        <div className="pride-strip rounded-t-3xl" />

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3">
          <span className="font-bold text-white text-base">{allComments.length} comments</span>
          <button onClick={() => setShowComments(false)}>
            <X className="w-5 h-5 text-white/60" />
          </button>
        </div>

        {/* Comments list */}
        <div className="flex-1 overflow-y-auto px-4 space-y-4 pb-2">
          {allComments.map((c) => (
            <div key={c.id} className="flex gap-3">
              <div className="w-9 h-9 rounded-full bg-dark-500 flex items-center justify-center text-lg flex-shrink-0">
                {c.avatar || '👤'}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-white text-sm">{c.author}</span>
                  <span className="text-white/40 text-xs">{c.ts || 'now'}</span>
                </div>
                <p className="text-white/80 text-sm mt-0.5">{c.text}</p>
                {aiReply[c.id] && (
                  <p className="text-rainbow-purple text-xs mt-1 italic">🤖 {aiReply[c.id]}</p>
                )}
                <div className="flex items-center gap-3 mt-1">
                  <button className="flex items-center gap-1 text-white/40 text-xs">
                    <Heart className="w-3.5 h-3.5" /> {c.likes || 0}
                  </button>
                  <button className="text-white/40 text-xs">Reply</button>
                  {video && (
                    <button
                      onClick={() => handleAiReply(c)}
                      disabled={aiReplying === c.id}
                      className="text-rainbow-purple text-xs"
                    >
                      {aiReplying === c.id ? '✨ generating...' : '✨ AI reply'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Input */}
        <div className="px-4 py-3 flex items-center gap-3 border-t border-white/10">
          <div className="w-8 h-8 rounded-full bg-dark-500 flex items-center justify-center text-sm">
            {user.avatar}
          </div>
          <input
            className="flex-1 bg-dark-500 rounded-full px-4 py-2 text-sm text-white placeholder-white/30 outline-none border border-white/10"
            placeholder="Add a comment..."
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className={clsx('p-2 rounded-full transition-all',
              input.trim() ? 'bg-rainbow-purple text-white' : 'bg-dark-500 text-white/30')}
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
