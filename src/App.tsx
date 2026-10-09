import Header from "./components/Header"
import Login from "./components/Login"
import MainContent from "./components/MainContent"

export default function App() {
  const authenticated = true

  if (!authenticated) {
    return <Login></Login>
  }

  return (
    <div className="flex h-screen flex-col items-center bg-zinc-50">
      <Header></Header>
      <MainContent></MainContent>
    </div>
  )
}
