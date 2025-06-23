// src/pages/Login.jsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]     = useState('')
  const navigate              = useNavigate()

  const handleSubmit = async e => {
    e.preventDefault()
    setError('')
    try {
      const body = new URLSearchParams()
      body.append('username', username)
      body.append('password', password)

      const res = await fetch('/auth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body
      })
      if (!res.ok) throw new Error('Invalid credentials')
      const { access_token } = await res.json()
      localStorage.setItem('token', access_token)
      navigate('/')   // or '/empty-slots'
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="p-4 max-w-sm mx-auto">
      <h2 className="text-xl mb-4">Sign In</h2>
      {error && <div className="text-red-500 mb-2">{error}</div>}
      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <input
          type="text"
          placeholder="Username"
          value={username}
          onChange={e => setUsername(e.target.value)}
          className="border px-2 py-1"
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          className="border px-2 py-1"
        />
        <button type="submit" className="bg-blue-600 text-white px-4 py-2">
          Log In
        </button>
      </form>
    </div>
  )
}
