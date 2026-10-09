import { UserCircle } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu"
import { Button } from "@base-ui/react"

export default function Header() {
  return (
    <header className="box-border flex w-full flex-row justify-between border-1 border-b-zinc-500 bg-zinc-100 p-4">
      <h1 className="text-2xl font-semibold">Speech portal</h1>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button>
              <UserCircle className="duration-200 ease-in-out hover:text-stone-500"></UserCircle>
            </Button>
          }
        ></DropdownMenuTrigger>
        <DropdownMenuContent className="w-40" align="start">
          <DropdownMenuGroup>
            <DropdownMenuItem className="text-red-400">
              Log out
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}
