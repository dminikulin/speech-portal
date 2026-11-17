import { AudioLines, EllipsisVertical } from "lucide-react"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "./ui/empty"
import NewFileForm from "./NewFileForm"
import { ScrollArea } from "./ui/scroll-area"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table"
import { Badge } from "./ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog"
import { useCallback, useEffect, useRef, useState } from "react"
import type { DragEvent as ReactDragEvent } from "react"
import TranscribedText from "./TranscribedText"
import type { AudioFileItem } from "@/types/AudioFileItem"
import { deleteAudioFile, fetchUploadedFiles } from "@/services/files"
import { useAuth } from "@/hooks/useAuth"
import { formatDate, formatFileSize } from "@/utils/tableFormatter"
import { toast } from "./ui/toast"
import {
  requestNotificationPermission,
  showNotification,
} from "@/services/notifications"
import { getSignalRConnection } from "@/services/signalR"
import { cn } from "cn"

export default function MainContent() {
  const { user } = useAuth()
  const userId = user?.id

  const [selectedFile, setSelectedFile] = useState<AudioFileItem | null>(null)
  const [fileToDelete, setFileToDelete] = useState<AudioFileItem | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const [files, setFiles] = useState<AudioFileItem[]>([])
  const [loading, setLoading] = useState(Boolean(userId))
  const [isDragging, setIsDragging] = useState(false)
  const [droppedFile, setDroppedFile] = useState<File | null>(null)
  const previousStatuses = useRef(new Map<string, AudioFileItem["status"]>())

  const clearDroppedFile = useCallback(() => setDroppedFile(null), [])

  const handleFileDragOver = (event: ReactDragEvent<HTMLElement>) => {
    if (!Array.from(event.dataTransfer.types).includes("Files")) return
    event.preventDefault()
    setIsDragging(true)
  }

  const handleFileDragLeave = (event: ReactDragEvent<HTMLElement>) => {
    if (
      !(event.relatedTarget instanceof Node) ||
      !event.currentTarget.contains(event.relatedTarget)
    ) {
      setIsDragging(false)
    }
  }

  const handleFileDrop = (event: ReactDragEvent<HTMLElement>) => {
    if (!Array.from(event.dataTransfer.types).includes("Files")) return
    event.preventDefault()
    setIsDragging(false)

    const droppedFiles = event.dataTransfer.files
    if (droppedFiles.length !== 1) {
      toast.add({
        type: "error",
        description: "Please drop one audio file at a time.",
      })
      return
    }

    const file = droppedFiles[0]
    if (!/\.(mp3|wav)$/i.test(file.name)) {
      toast.add({
        type: "error",
        description: "Please drop an MP3 or WAV audio file.",
      })
      return
    }

    setDroppedFile(file)
  }

  const loadFiles = useCallback(async () => {
    if (!userId) return
    try {
      setLoading(true)
      const data = await fetchUploadedFiles(userId)
      for (const file of data) {
        if (
          previousStatuses.current.get(file.blobPath) === "Transcribing" &&
          file.status === "Transcribed"
        ) {
          toast.add({
            type: "success",
            description: `File ${file.name} transcribed`,
          })
        }
      }
      setFiles(Array.isArray(data) ? data : [])
      previousStatuses.current = new Map(
        data.map((file) => [file.blobPath, file.status])
      )
      setSelectedFile((current) =>
        current
          ? (data.find((file) => file.blobPath === current.blobPath) ?? current)
          : null
      )
    } catch (err) {
      console.error("Error loading files:", err)
      setFiles([])
    } finally {
      setLoading(false)
    }
  }, [userId])

  // to prevent the browser automatically open the file in a different window if the file isn't dragged into an area
  useEffect(() => {
    const preventDefaultFileNavigation = (event: DragEvent) => {
      if (Array.from(event.dataTransfer?.types ?? []).includes("Files")) {
        event.preventDefault()
      }
    }

    window.addEventListener("dragover", preventDefaultFileNavigation, true)
    window.addEventListener("drop", preventDefaultFileNavigation, true)

    return () => {
      window.removeEventListener("dragover", preventDefaultFileNavigation, true)
      window.removeEventListener("drop", preventDefaultFileNavigation, true)
    }
  }, [])

  const handleUploaded = useCallback(
    async (blobPath: string, status: NonNullable<AudioFileItem["status"]>) => {
      if (!userId) return

      setLoading(true)
      try {
        const uploadedFiles = await fetchUploadedFiles(userId)
        const refreshedFiles = uploadedFiles.map((file) =>
          file.blobPath === blobPath && file.status !== "Transcribed"
            ? { ...file, status }
            : file
        )
        previousStatuses.current = new Map(
          refreshedFiles.map((file) => [file.blobPath, file.status])
        )
        setFiles(refreshedFiles)
        const uploadedFile = refreshedFiles.find(
          (file) => file.blobPath === blobPath
        )
        if (!uploadedFile) {
          throw new Error("Uploaded file was not found in the file list.")
        }
        if (
          status === "Transcribing" &&
          uploadedFile.status === "Transcribed"
        ) {
          toast.add({
            type: "success",
            description: `File ${uploadedFile.name} transcribed`,
          })
        }
      } finally {
        setLoading(false)
      }
    },
    [userId]
  )

  useEffect(() => {
    // Ask for permission when the user enters the main screen
    requestNotificationPermission()
  }, [])

  useEffect(() => {
    if (!userId) return

    let cancelled = false
    fetchUploadedFiles(userId)
      .then((data) => {
        if (!cancelled) {
          setFiles(data || [])
          previousStatuses.current = new Map(
            data.map((file) => [file.blobPath, file.status])
          )
        }
      })
      .catch((err) => {
        if (!cancelled) console.error("Error loading files:", err)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [userId])

  useEffect(() => {
    if (!user?.id) return

    let activeConnection: Awaited<
      ReturnType<typeof getSignalRConnection>
    > | null = null

    const handleJobStatusUpdated = (data: { fileName?: string }) => {
      showNotification("Transcription Complete", {
        body: `Your transcript for "${data.fileName || "audio file"}" is ready.`,
      })
      loadFiles()
    }

    getSignalRConnection(user.id).then((connection) => {
      activeConnection = connection
      connection.on("jobStatusUpdated", handleJobStatusUpdated)
    })

    return () => {
      activeConnection?.off("jobStatusUpdated", handleJobStatusUpdated)
    }
  }, [user?.id, loadFiles])

  const handleRowClick = (file: AudioFileItem) => {
    setSelectedFile((prev) => (prev === file ? null : file))
  }

  const handleDeleteConfirm = async () => {
    if (!fileToDelete || !user?.id) return

    setIsDeleting(true)
    try {
      await deleteAudioFile(fileToDelete.blobPath, user.id)

      // If the currently open detail panel was the deleted file, close it
      if (selectedFile?.blobPath === fileToDelete.blobPath) {
        setSelectedFile(null)
      }

      toast.add({
        type: "success",
        description: `File ${fileToDelete.name} deleted`,
      })

      setFileToDelete(null)
      await loadFiles() // Refresh table list
    } catch (err) {
      toast.add({
        type: "error",
        description: err instanceof Error ? err.message : "Deletion failed",
      })
    } finally {
      setIsDeleting(false)
    }
  }

  const renderDropOverlay = (positionClass: string) =>
    isDragging ? (
      <div
        className={`${positionClass} pointer-events-none z-20 flex items-center justify-center rounded-md border-2 border-dashed border-zinc-400 bg-white/75 text-lg font-medium text-zinc-400`}
      >
        Drop one MP3 or WAV audio file to upload
      </div>
    ) : null

  return (
    <main
      className="flex min-h-0 min-w-[75%] flex-1 flex-col items-center bg-zinc-50"
      onDragOver={handleFileDragOver}
      onDragLeave={handleFileDragLeave}
      onDrop={handleFileDrop}
    >
      <div className="my-5 flex w-full items-center gap-3">
        <NewFileForm
          className="self-start"
          onUploaded={handleUploaded}
          droppedFile={droppedFile}
          onDroppedFileHandled={clearDroppedFile}
        ></NewFileForm>
      </div>
      {loading ? (
        <div className="relative m-5 flex min-h-0 w-full flex-1 items-center justify-center">
          <div className="loader"></div>
          {renderDropOverlay("absolute inset-0")}
        </div>
      ) : files.length === 0 ? (
        <div className="relative m-5 flex min-h-0 w-full flex-1 items-center justify-center">
          <Empty
            className={cn("max-w-md border-2 border-dashed", {
              "opacity-0": isDragging,
            })}
          >
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <AudioLines></AudioLines>
              </EmptyMedia>
              <EmptyTitle>No files yet</EmptyTitle>
              <EmptyDescription className="w-[75%]">
                Press <span className="font-mono">"Add new transcript"</span> or
                drop an MP3 or WAV file here
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
          {renderDropOverlay("absolute inset-0")}
        </div>
      ) : (
        <div className="m-5 flex min-h-0 w-full flex-1 gap-4 overflow-hidden">
          <div className="relative min-h-0 min-w-0 flex-1 py-2">
            <ScrollArea
              className={cn("h-full", {
                "opacity-0": isDragging,
              })}
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>File name</TableHead>
                    <TableHead>Date uploaded</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {files.map((file) => {
                    const isSelected = selectedFile === file
                    return (
                      <TableRow
                        key={file.url}
                        onClick={() => handleRowClick(file)}
                        className={`cursor-pointer transition-colors ${
                          isSelected ? "bg-zinc-100/80 font-medium" : ""
                        }`}
                      >
                        <TableCell className="font-mono text-lg">
                          {file.name}
                        </TableCell>
                        <TableCell className="font-light">
                          {formatDate(file.createdOn)}
                        </TableCell>
                        <TableCell className="font-light">
                          {formatFileSize(file.size)}
                        </TableCell>
                        <TableCell>
                          {file.status && (
                            <Badge
                              variant={
                                file.status === "Transcribed"
                                  ? "default"
                                  : file.status === "Transcribing"
                                    ? "secondary"
                                    : "outline"
                              }
                            >
                              {file.status}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              render={
                                <EllipsisVertical className="rounded-full hover:bg-zinc-300 hover:text-zinc-500"></EllipsisVertical>
                              }
                            ></DropdownMenuTrigger>
                            <DropdownMenuContent className="w-48" align="end">
                              <DropdownMenuItem
                                className="text-red-400"
                                onClick={() => setFileToDelete(file)}
                              >
                                Delete file
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </ScrollArea>
            {renderDropOverlay("absolute inset-x-0 inset-y-2")}
          </div>
          <TranscribedText
            file={selectedFile ?? null}
            open={selectedFile !== null}
            onOpenChange={(open) => {
              if (!open) setSelectedFile(null)
            }}
            onSuccess={loadFiles}
          />
          <AlertDialog
            open={fileToDelete !== null}
            onOpenChange={(open) => {
              if (!open && !isDeleting) setFileToDelete(null)
            }}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  Delete file{" "}
                  <span className="font-mono">{fileToDelete?.name}?</span>
                </AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isDeleting}>
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  className="bg-red-400 hover:bg-red-500"
                  disabled={isDeleting}
                  onClick={(e) => {
                    e.preventDefault()
                    handleDeleteConfirm()
                  }}
                >
                  {isDeleting ? "Deleting..." : "Continue"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </main>
  )
}
