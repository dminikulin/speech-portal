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
  className?: string
}

export default function NewFileForm({
  className,
  onUploaded,
}: NewFileFormProps) {
  const { user } = useAuth()

  const [open, setOpen] = useState<boolean>(false)
  const [file, setFile] = useState<File | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen)
    if (!isOpen) {
      setFile(null)
      setError(null)
    }
  }

  const handleSubmit = async (event: React.SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!file || isUploading || !user?.id) return

    setIsUploading(true)
    setError(null)

    let blobPath: string
    try {
      blobPath = await uploadAudioFile(file, user.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed")
      setIsUploading(false)
      return
    }

    let status: NonNullable<AudioFileItem["status"]> = "Failed"
    let transcriptionError: unknown
    try {
      await onUploaded(blobPath, "Transcribing")
      status = "Transcribing"
    } catch (err) {
      transcriptionError = err
    }

    try {
      await onUploaded(blobPath, status)
    } catch (err) {
      toast.add({
        type: "error",
        description:
          err instanceof Error
            ? `File uploaded, but the file list could not be refreshed: ${err.message}`
            : "File uploaded, but the file list could not be refreshed.",
      })
      handleOpenChange(false)
      setIsUploading(false)
      return
    }

    if (transcriptionError) {
      toast.add({
        type: "error",
        description:
          transcriptionError instanceof Error
            ? `File uploaded, but transcription could not start: ${transcriptionError.message}`
            : "File uploaded, but transcription could not start.",
      })
    } else {
      toast.add({
        type: "success",
        description: `File ${file.name} uploaded. Transcription started.`,
      })
    }

    handleOpenChange(false)
    setIsUploading(false)
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
