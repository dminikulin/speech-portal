import { Plus } from "lucide-react"
import { Button } from "./ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog"
import { Field, FieldDescription } from "./ui/field"
import { Input } from "./ui/input"
import { cn } from "cn"

export default function NewFileForm({
  className,
}: React.ComponentProps<"form">) {
  return (
    <Dialog>
      <form className={cn(className)}>
        <DialogTrigger
          render={
            <Button
              // className="bg-teal-400 hover:bg-teal-200"
              size="lg"
              variant="outline"
            >
              <Plus /> Add new transcript
            </Button>
          }
        ></DialogTrigger>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Upload transcript</DialogTitle>
          </DialogHeader>
          <Field>
            <Input type="file"></Input>
            <FieldDescription>
              Types of files allowed: <span className="font-mono">.mp3</span>,{" "}
              <span className="font-mono">.wav</span>
            </FieldDescription>
          </Field>
        </DialogContent>
      </form>
    </Dialog>
  )
}
