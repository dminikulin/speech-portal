import { useState } from "react"
import Header from "./components/Header"
import Login from "./components/Login"
import MainContent from "./components/MainContent"
import { AuthProvider } from "./context/AuthContext"
import { useAuth } from "./hooks/useAuth"
import Signup from "./components/Signup"
import { useAutoLogout } from "./hooks/useAutoLogout"

function AuthScreen() {
  const [showSignup, setShowSignup] = useState(false)

  return showSignup ? (
    <Signup onToggleLogin={() => setShowSignup(false)} />
  ) : (
    <Login onToggleSignup={() => setShowSignup(true)} />
  )
}

function AppContent() {
  const { isAuthenticated } = useAuth()

  useAutoLogout()

  if (!isAuthenticated) {
    return <AuthScreen />
  }

  return (
    <div className="flex h-screen flex-col items-center bg-zinc-50">
      <Header></Header>
      <MainContent></MainContent>
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}
