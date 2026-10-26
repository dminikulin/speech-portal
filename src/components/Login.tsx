import { useAuth } from "@/hooks/useAuth"
import { Button } from "./ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./ui/card"
import { Input } from "./ui/input"
import { Label } from "./ui/label"
import { useState } from "react"
import { cn } from "cn"

interface LoginProps {
  onToggleSignup: () => void
}

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  "https://speechportal-func-app.azurewebsites.net/api"

export default function Login({ onToggleSignup }: LoginProps) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()

  const handleSubmit = async (event: React.SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const res = await fetch(`${API_BASE_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || "Login failed")
      }

      login(data.token, data.user)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-zinc-50">
      <Card className="w-full max-w-sm p-0 pt-4 shadow-lg">
        <CardHeader>
          <CardTitle className="font-semibold">Log in</CardTitle>
          <CardDescription>Welcome back!</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit}>
            <div className="flex flex-col gap-6">
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="m@example.com"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={cn({
                    "border-red-500 bg-red-50":
                      error === "Invalid email or password.",
                  })}
                ></Input>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="email">Password</Label>
                <Input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={cn({
                    "border-red-500 bg-red-50":
                      error === "Invalid email or password.",
                  })}
                ></Input>
              </div>
              {error && <p className="text-sm text-red-500">{error}</p>}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Logging in..." : "Login"}
              </Button>
            </div>
          </form>
        </CardContent>
        <CardFooter className="flex-col bg-stone-100">
          <div className="flex flex-row items-center gap-2 py-2">
            <p className="text-zinc-500">Don't have an account?</p>
            <Button variant="link" onClick={onToggleSignup}>
              Sign up!
            </Button>
          </div>
        </CardFooter>
      </Card>
    </main>
  )
}
