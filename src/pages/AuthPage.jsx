import React, { useState } from 'react'
import { Eye, EyeOff, Rainbow, Mic, Radio, Sparkles } from 'lucide-react'
import { register, login } from '../api/auth'
import { useStore } from '../hooks/useStore'

const PRONOUNS = ['she/her','he/him','they/them','she/they','he/they','xe/xem','any/all']
const FLAGS    = ['🏳️‍🌈','⚧️','🩷','💜','💙','🌈','🖤','🤍']

export default function AuthPage({ onAuth }) {
  const [mode, setMode] = useState('login')       // 'login' | 'signup'
  const [role, setRole] = useState('viewer')      // 'viewer' | 'host'
  const [form, setForm] = useState({
    handle: '', email: '', password: '', confirmPassword: '',
    displayName: '', pronouns: 'they/them', flag: '🏳️‍🌈',
  })
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { setUser } = useStore()

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      let result
      if (mode === 'login') {
        result = await login({ identifier: form.email || form.handle, password: form.password })
      } else {
        if (form.password !== form.confirmPassword) {
          setError('Passwords do not match')
          setLoading(false)
          return
        }
        result = await register({
          handle:      form.handle,
          email:       form.email,
          password:    form.password,
          displayName: form.displayName,
          role,
        })
      }

      if (!result.ok) {
        setError(result.error || 'Something went wrong')
        return
      }

      // Sync user into Zustand store
      const u = result.user
      setUser({
        name:      u.display_name,
        handle:    u.handle,
        avatar:    u.avatar_emoji || '🌈',
        pronouns:  u.pronouns,
        prideFlag: u.pride_flag,
        bio:       u.bio,
        role:      u.role,
        id:        u.id,
        email:     u.email,
      })

      onAuth(result.user)
    } catch (err) {
      setError('Network error — check your connection')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0d0d18] flex flex-col items-center justify-center p-4">
      {/* Logo */}
      <div className="mb-8 text-center">
        <div className="text-5xl mb-2">🌈</div>
        <h1 className="text-3xl font-bold bg-gradient-to-r from-pink-400 via-purple-400 to-blue-400 bg-clip-text text-transparent">
          Rainbow Land
        </h1>
        <p className="text-gray-400 text-sm mt-1">Live streaming for everyone 🏳️‍🌈</p>
      </div>

      <div className="w-full max-w-sm bg-[#1a1a2e] rounded-2xl p-6 shadow-2xl border border-purple-900/30">
        {/* Mode toggle */}
        <div className="flex bg-[#0d0d18] rounded-xl p-1 mb-6">
          {['login','signup'].map(m => (
            <button key={m}
              onClick={() => { setMode(m); setError('') }}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                mode === m
                  ? 'bg-purple-600 text-white shadow'
                  : 'text-gray-400 hover:text-white'
              }`}>
              {m === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          ))}
        </div>

        {/* Role picker — signup only */}
        {mode === 'signup' && (
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setRole('viewer')}
              className={`flex-1 flex flex-col items-center gap-1 p-3 rounded-xl border transition-all ${
                role === 'viewer'
                  ? 'border-purple-500 bg-purple-500/20 text-purple-300'
                  : 'border-gray-700 text-gray-400 hover:border-gray-500'
              }`}>
              <Sparkles size={18}/>
              <span className="text-xs font-medium">Viewer</span>
              <span className="text-[10px] text-gray-500">Watch & chat</span>
            </button>
            <button
              onClick={() => setRole('host')}
              className={`flex-1 flex flex-col items-center gap-1 p-3 rounded-xl border transition-all ${
                role === 'host'
                  ? 'border-pink-500 bg-pink-500/20 text-pink-300'
                  : 'border-gray-700 text-gray-400 hover:border-gray-500'
              }`}>
              <Radio size={18}/>
              <span className="text-xs font-medium">Host</span>
              <span className="text-[10px] text-gray-500">Go live</span>
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Signup-only fields */}
          {mode === 'signup' && (
            <>
              <input
                type="text"
                placeholder="Display name"
                value={form.displayName}
                onChange={e => set('displayName', e.target.value)}
                required
                className="w-full bg-[#0d0d18] border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-purple-500"
              />
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 text-sm">@</span>
                <input
                  type="text"
                  placeholder="handle"
                  value={form.handle.replace(/^@/, '')}
                  onChange={e => set('handle', e.target.value.replace(/^@/, ''))}
                  required
                  className="w-full bg-[#0d0d18] border border-gray-700 rounded-xl pl-8 pr-4 py-3 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-purple-500"
                />
              </div>
            </>
          )}

          {/* Email / identifier */}
          <input
            type={mode === 'login' ? 'text' : 'email'}
            placeholder={mode === 'login' ? 'Email or @handle' : 'Email address'}
            value={form.email}
            onChange={e => set('email', e.target.value)}
            required
            className="w-full bg-[#0d0d18] border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-purple-500"
          />

          {/* Password */}
          <div className="relative">
            <input
              type={showPw ? 'text' : 'password'}
              placeholder="Password"
              value={form.password}
              onChange={e => set('password', e.target.value)}
              required
              minLength={8}
              className="w-full bg-[#0d0d18] border border-gray-700 rounded-xl px-4 py-3 pr-12 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-purple-500"
            />
            <button type="button" onClick={() => setShowPw(v => !v)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">
              {showPw ? <EyeOff size={16}/> : <Eye size={16}/>}
            </button>
          </div>

          {mode === 'signup' && (
            <input
              type={showPw ? 'text' : 'password'}
              placeholder="Confirm password"
              value={form.confirmPassword}
              onChange={e => set('confirmPassword', e.target.value)}
              required
              className="w-full bg-[#0d0d18] border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-purple-500"
            />
          )}

          {/* Error */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl font-semibold text-white bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 disabled:opacity-50 transition-all mt-2">
            {loading
              ? (mode === 'login' ? 'Signing in...' : 'Creating account...')
              : (mode === 'login' ? 'Sign In' : 'Create Account')}
          </button>
        </form>

        {/* Switch mode link */}
        <p className="text-center text-gray-500 text-xs mt-4">
          {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
          <button onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError('') }}
            className="text-purple-400 hover:text-purple-300 underline">
            {mode === 'login' ? 'Sign up' : 'Sign in'}
          </button>
        </p>

        {/* Host note */}
        {mode === 'signup' && role === 'host' && (
          <p className="mt-3 text-center text-[11px] text-gray-500 border-t border-gray-800 pt-3">
            Host accounts can go live immediately 🎙️<br/>
            You can always upgrade a viewer account later in Profile settings.
          </p>
        )}
      </div>

      <p className="mt-6 text-gray-600 text-xs text-center">
        By signing up you agree to be cool and kind 🏳️‍🌈
      </p>
    </div>
  )
}
