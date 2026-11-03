import React, { createContext, useEffect, useState } from "react"

interface User {
  id: string
  email: string
}

interface AuthContextType {
  user: User | null
  token: string | null
  login: (token: string, user: User) => void
  logout: () => void
  isAuthenticated: boolean
}

const INACTIVITY_TIMEOUT_MS = 60 * 60 * 1000
const STORAGE_ACTIVITY_KEY = "speechportal_last_activity"

// eslint-disable-next-line react-refresh/only-export-components
export const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(null)

  useEffect(() => {
    const savedToken = localStorage.getItem("token")
    const savedUser = localStorage.getItem("user")
    const lastActivity = localStorage.getItem(STORAGE_ACTIVITY_KEY)

    if (savedToken && savedUser) {
      if (
        lastActivity &&
        Date.now() - parseInt(lastActivity, 10) >= INACTIVITY_TIMEOUT_MS
      ) {
        localStorage.removeItem("token")
        localStorage.removeItem("user")
        localStorage.removeItem("speechportal_last_activity")
        return
      }

      // eslint-disable-next-line react-hooks/set-state-in-effect
      setToken(savedToken)
      try {
        setUser(JSON.parse(savedUser))
      } catch {
        localStorage.removeItem("user")
      }
    }
  }, [])

  const login = (jwtToken: string, userData: User) => {
    setToken(jwtToken)
    setUser(userData)
    localStorage.setItem("token", jwtToken)
    localStorage.setItem("user", JSON.stringify(userData))
    localStorage.setItem("speechportal_last_activity", Date.now().toString())
  }

  const logout = () => {
    setToken(null)
    setUser(null)
    localStorage.removeItem("token")
    localStorage.removeItem("speechportal_last_activity")
    localStorage.removeItem("user")
  }

  return (
    <AuthContext.Provider
      value={{ user, token, login, logout, isAuthenticated: !!token }}
    >
      {children}
    </AuthContext.Provider>
  )
}
