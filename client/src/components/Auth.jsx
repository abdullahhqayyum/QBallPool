import React, { useState } from 'react'
import supabase from '../lib/supabase'

export default function Auth({ onAuth, onGuest }) {
  const [mode, setMode]       = useState('login') // 'login' | 'signup'
  const [email, setEmail]     = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [error, setError]     = useState(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit() {
    setError(null)
    setLoading(true)
    try {
      if (mode === 'signup') {
        const normalizedUsername = username.trim().toLowerCase()
        if (!normalizedUsername) {
          throw new Error('Username is required')
        }

        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              username: normalizedUsername,
              name: normalizedUsername,
              full_name: normalizedUsername,
              display_name: normalizedUsername,
            }
          }
        })
        if (error) throw error
        onAuth(data.user)
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password
        })
        if (error) throw error
        onAuth(data.user)
      }
    } catch (err) {
      if (err?.message === 'Database error saving new user') {
        setError('Signup failed in database trigger. Use a new username or fix handle_new_user() in Supabase SQL.')
      } else {
        setError(err.message)
      }
    } finally {
      setLoading(false)
    }
  }

  function handleGuest() {
    const guestUser = {
      id: `guest-${Math.random().toString(36).slice(2, 10)}`,
      email: null,
      isGuest: true,
    }
    if (onGuest) onGuest(guestUser)
    else onAuth(guestUser)
  }

  return (
    <div style={{ maxWidth: 360, margin: '80px auto', padding: '0 16px' }}>
      <h2 style={{ marginBottom: 24 }}>
        {mode === 'login' ? 'Log in' : 'Sign up'}
      </h2>

      {mode === 'signup' && (
        <input
          placeholder="Username"
          value={username}
          onChange={e => setUsername(e.target.value)}
          style={{ display: 'block', width: '100%', marginBottom: 12, padding: 8 }}
        />
      )}

      <input
        placeholder="Email"
        type="email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        style={{ display: 'block', width: '100%', marginBottom: 12, padding: 8 }}
      />
      <input
        placeholder="Password"
        type="password"
        value={password}
        onChange={e => setPassword(e.target.value)}
        style={{ display: 'block', width: '100%', marginBottom: 16, padding: 8 }}
      />

      {error && (
        <p style={{ color: 'red', marginBottom: 12, fontSize: 13 }}>{error}</p>
      )}

      <button
        onClick={handleSubmit}
        disabled={loading}
        style={{ width: '100%', padding: '10px 0', marginBottom: 12 }}
      >
        {loading ? 'Please wait...' : mode === 'login' ? 'Log in' : 'Sign up'}
      </button>

      <button
        onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
        style={{ width: '100%', padding: '8px 0', background: 'transparent' }}
      >
        {mode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Log in'}
      </button>

      <button
        onClick={handleGuest}
        style={{ width: '100%', padding: '8px 0', marginTop: 8, background: '#111', color: '#fff' }}
      >
        Continue as Guest
      </button>
    </div>
  )
}