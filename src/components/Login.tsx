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

export default function Login() {
  return (
    <main className="grid min-h-dvh place-items-center p-4 bg-zinc-50">
      <Card className="w-full max-w-sm shadow-lg">
        <CardHeader>
          <CardTitle className="font-semibold">Log in</CardTitle>
          <CardDescription>Welcome back!</CardDescription>
        </CardHeader>
        <CardContent>
          <form>
            <div className="flex flex-col gap-6">
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="m@example.com"
                  required
                ></Input>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="email">Password</Label>
                <Input id="password" type="password" required></Input>
              </div>
            </div>
          </form>
        </CardContent>
        <CardFooter className="flex-col gap-2">
          <Button type="submit" className="w-full">
            Login
          </Button>
          <div className="flex flex-row gap-2">
            <p className="text-zinc-500">Don't have an account?</p>
            <a
              href="#"
              className="ml-auto inline-block text-sm underline-offset-4 hover:underline"
            >
              Sign up!
            </a>
          </div>
        </CardFooter>
      </Card>
    </main>
  )
}
