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
import React, { useState } from "react"
import { uploadAudioFile } from "@/services/upload"
import { toast } from "./ui/toast"
import { useAuth } from "@/hooks/useAuth"
import type { AudioFileItem } from "@/types/AudioFileItem"

interface NewFileFormProps {
  onUploaded: (
    blobPath: string,
    status: NonNullable<AudioFileItem["status"]>
  ) => Promise<void>
  droppedFile?: File | null
  onDroppedFileHandled?: () => void
  className?: string
}

export default function NewFileForm({
  className,
  onUploaded,
  droppedFile,
  onDroppedFileHandled,
}: NewFileFormProps) {
  const { user } = useAuth()

  const [open, setOpen] = useState<boolean>(false)
  const [file, setFile] = useState<File | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const processedDroppedFile = React.useRef<File | null>(null)

  const handleOpenChange = React.useCallback((isOpen: boolean) => {
    setOpen(isOpen)
    if (!isOpen) {
      setFile(null)
      setError(null)
    }
  }, [])

  const uploadFile = React.useCallback(
    async (fileToUpload: File, source: "form" | "drop") => {
      if (!user?.id) return
      if (isUploading) {
        if (source === "drop") {
          toast.add({
            type: "error",
            description: "An upload is already in progress.",
          })
        }
        return
      }

      setIsUploading(true)
      setError(null)

      try {
        let blobPath: string
        try {
          blobPath = await uploadAudioFile(fileToUpload, user.id)
        } catch (err) {
          const message = err instanceof Error ? err.message : "Upload failed"
          if (source === "form") {
            setError(message)
          } else {
            toast.add({ type: "error", description: message })
          }
          return
        }

        try {
          await onUploaded(blobPath, "Transcribing")
          toast.add({
            type: "success",
            description: `File ${fileToUpload.name} uploaded. Transcription started.`,
          })
        } catch (err) {
          toast.add({
            type: "error",
            description:
              err instanceof Error
                ? `File uploaded, but the file list could not be refreshed: ${err.message}`
                : "File uploaded, but the file list could not be refreshed.",
          })
        }

        if (source === "form") handleOpenChange(false)
      } finally {
        setIsUploading(false)
      }
    },
    [handleOpenChange, isUploading, onUploaded, user?.id]
  )

  React.useEffect(() => {
    if (!droppedFile) {
      processedDroppedFile.current = null
      return
    }
    if (processedDroppedFile.current === droppedFile) return

    processedDroppedFile.current = droppedFile
    onDroppedFileHandled?.()
    void uploadFile(droppedFile, "drop")
  }, [droppedFile, onDroppedFileHandled, uploadFile])

  const handleSubmit = (event: React.SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!file) return

    void uploadFile(file, "form")
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <div className={cn(className)}>
        <DialogTrigger
          render={
            <Button
              className="bg-zinc-100 hover:bg-zinc-200"
              size="lg"
              variant="outline"
            >
              <Plus /> Add new transcript
            </Button>
          }
        ></DialogTrigger>
      </div>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Upload transcript</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <Field>
            <Input
              id="file"
              type="file"
              accept="audio/mp3, audio/wav"
              required
              disabled={isUploading}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            ></Input>
            <FieldDescription>
              Types of files allowed: <span className="font-mono">.mp3</span>,{" "}
              <span className="font-mono">.wav</span>
            </FieldDescription>
          </Field>

          {error && (
            <p role="alert" className="text-red-400">
              {error}
            </p>
          )}

          <Button
            className="mt-2 w-full"
            type="submit"
            disabled={!file || isUploading}
          >
            {isUploading ? "Uploading…" : "Upload"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
