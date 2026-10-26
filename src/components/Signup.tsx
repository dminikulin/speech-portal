import { useState } from "react"
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
import { useAuth } from "@/hooks/useAuth"
import { validatePassword } from "@/utils/validatePassword"
import { cn } from "cn"

interface SignupProps {
  onToggleLogin: () => void
}

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  "https://speechportal-func-app.azurewebsites.net/api"

export default function Signup({ onToggleLogin }: SignupProps) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()

  const handleSubmit = async (event: React.SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

    const passwordCheck = validatePassword(password)
    if (!passwordCheck.valid) {
      setError(passwordCheck.message || "Invalid password.")
      return
    }

    setLoading(true)

    try {
      const res = await fetch(`${API_BASE_URL}/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || "Signup failed")
      }

      login(data.token, data.user)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signup failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="grid min-h-dvh place-items-center bg-zinc-50">
      <Card className="w-full max-w-sm p-0 pt-4 shadow-lg">
        <CardHeader>
          <CardTitle className="font-semibold">Sign up</CardTitle>
          <CardDescription>Welcome, whoever you are!</CardDescription>
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
                      error?.startsWith("Password"),
                  })}
                ></Input>
              </div>
              {error && <p className="text-sm text-red-500">{error}</p>}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Creating account..." : "Sign up"}
              </Button>
            </div>
          </form>
        </CardContent>
        <CardFooter className="flex-col bg-stone-100">
          <div className="flex flex-row items-center gap-2 py-2">
            <p className="text-zinc-500">Already registered?</p>
            <Button variant="link" onClick={onToggleLogin}>
              Log in
            </Button>
          </div>
        </CardFooter>
      </Card>
    </div>
  )
}
