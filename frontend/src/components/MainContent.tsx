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

export default function MainContent() {
  const { user } = useAuth()
  const userId = user?.id

  const [selectedFile, setSelectedFile] = useState<AudioFileItem | null>(null)
  const [fileToDelete, setFileToDelete] = useState<AudioFileItem | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const [files, setFiles] = useState<AudioFileItem[]>([])
  const [loading, setLoading] = useState(Boolean(userId))
  const previousStatuses = useRef(new Map<string, AudioFileItem["status"]>())

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

  return (
    <main className="flex min-h-0 min-w-[75%] flex-1 flex-col items-center bg-zinc-50">
      <NewFileForm
        className="my-5 self-start"
        onUploaded={handleUploaded}
      ></NewFileForm>
      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="loader"></div>
        </div>
      ) : files.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <Empty className="max-w-md border-2 border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <AudioLines></AudioLines>
              </EmptyMedia>
              <EmptyTitle>No files yet</EmptyTitle>
              <EmptyDescription className="w-[75%]">
                Press <span className="font-mono">"Add new transcript"</span>{" "}
                button to add a new file
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      ) : (
        <div className="m-5 flex min-h-0 w-full flex-1 gap-4 overflow-hidden">
          <div className="min-w-0 flex-1">
            <ScrollArea className="my-2 h-full">
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
