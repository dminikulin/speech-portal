import { Check, Copy, Download, FileText } from "lucide-react"
import jsPDF from "jspdf"
import { Button } from "./ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog"
import { Empty, EmptyContent, EmptyTitle } from "./ui/empty"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip"
import { useCallback, useEffect, useState, useRef } from "react"
import { cn } from "cn"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu"
import type { AudioFileItem } from "@/types/AudioFileItem"
import { fetchTranscript, retryTranscription } from "@/services/files"
import { useAuth } from "@/hooks/useAuth"

interface TranscribedTextProps {
  file: AudioFileItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export default function TranscribedText({
  file,
  open,
  onOpenChange,
  onSuccess,
}: TranscribedTextProps) {
  const { user } = useAuth()
  const [transcriptionText, setTranscriptionText] = useState<string | null>(
    null
  )
  const [status, setStatus] = useState<
    "Idle" | "Running" | "Succeeded" | "Failed"
  >("Idle")
  const [copied, setCopied] = useState(false)
  const [tooltipOpen, setTooltipOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const isRedoingRef = useRef(false)

  // Clear timers on unmount
  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current)
    }
  }, [])

  // Polling helper while Running
  const startPollingForCompletion = useCallback(
    (blobPath: string, userId: string) => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current)

      let attempts = 0
      pollTimerRef.current = setInterval(async () => {
        attempts++
        try {
          const text = await fetchTranscript(blobPath, userId)
          if (text) {
            isRedoingRef.current = false
            setTranscriptionText(text)
            setStatus("Succeeded")
            onSuccess?.()
            if (pollTimerRef.current) clearInterval(pollTimerRef.current)
          } else if (attempts > 120) {
            setStatus("Failed")
            setErrorMsg("Transcription timed out. Please try again.")
            if (pollTimerRef.current) clearInterval(pollTimerRef.current)
          }
        } catch {
          // Continue polling until timeout or success.
        }
      }, 5000)
    },
    [onSuccess]
  )

  useEffect(() => {
    if (!open || !user?.id || !file?.blobPath) {
      isRedoingRef.current = false
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current)
        pollTimerRef.current = null
      }
      // Reset dialog state when it closes or loses its selected file.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTranscriptionText(null)
      setLoading(false)
      setStatus("Idle")
      setErrorMsg(null)
      return
    }

    let isMounted = true
    const blobPath = file.blobPath
    const userId = user.id

    const loadTranscript = async () => {
      if (!isRedoingRef.current) {
        setLoading(true)
        setTranscriptionText(null)
        setStatus("Idle")
        setErrorMsg(null)
      }
      try {
        const text = await fetchTranscript(blobPath, userId)
        if (!isMounted) return

        if (text) {
          setTranscriptionText(text)
          setStatus("Succeeded")
        } else {
          setTranscriptionText(null)
          if (file.status === "Transcribing") {
            setStatus("Running")
            startPollingForCompletion(blobPath, userId)
          } else if (file.status === "Failed") {
            setStatus("Failed")
            setErrorMsg("Automatic transcription could not be started.")
          } else {
            setStatus("Failed")
            setErrorMsg("No active transcription job was found.")
          }
        }
      } catch (err) {
        if (!isMounted) return
        if (isRedoingRef.current || file.status === "Transcribing") {
          setStatus("Running")
          startPollingForCompletion(blobPath, userId)
        } else {
          setStatus("Failed")
          setErrorMsg(
            err instanceof Error ? err.message : "Failed to load transcript"
          )
        }
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    loadTranscript()
    return () => {
      isMounted = false
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current)
        pollTimerRef.current = null
      }
    }
  }, [open, user?.id, file?.blobPath, file?.status, startPollingForCompletion])

  const handleCopy = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.blur()
    if (!transcriptionText) return

    try {
      await navigator.clipboard.writeText(transcriptionText)
      setCopied(true)
      setTooltipOpen(true)
      setTimeout(() => {
        setCopied(false)
        setTooltipOpen(false)
      }, 2000)
    } catch (err) {
      console.error("Failed to copy:", err)
    }
  }

  const handleExport = async (format: "txt" | "md" | "pdf") => {
    if (!transcriptionText || !file) return

    const cleanBaseName = file.name.replace(/\.[^/.]+$/, "")

    if (format === "txt" || format === "md") {
      const blob = new Blob([transcriptionText], {
        type: "text/plain;charset=utf-8",
      })
      const link = document.createElement("a")
      link.href = URL.createObjectURL(blob)
      link.download = `${file.name.replace(/\.[^/.]+$/, "")}.${format}`
      link.click()
      URL.revokeObjectURL(link.href)
      return
    }

    if (format === "pdf") {
      const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      })

      let fontName = "helvetica"

      try {
        const response = await fetch("/fonts/Roboto-Regular.ttf")
        if (!response.ok) throw new Error("Font file not found")
        const buffer = await response.arrayBuffer()

        // Convert ArrayBuffer to binary string / base64 for jsPDF VFS
        let binary = ""
        const bytes = new Uint8Array(buffer)
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i])
        }
        const base64Font = window.btoa(binary)

        // Register font with jsPDF virtual file system
        doc.addFileToVFS("Roboto-Regular.ttf", base64Font)
        doc.addFont("Roboto-Regular.ttf", "Roboto", "normal")
        fontName = "Roboto"
      } catch (fontErr) {
        console.warn(
          "Could not load external Unicode font, falling back to standard font",
          fontErr
        )
      }

      // Styling & Margins
      const margin = 20
      const pageWidth = doc.internal.pageSize.getWidth()
      const contentWidth = pageWidth - margin * 2

      // Header Title
      doc.setFont("Helvetica", "bold")
      doc.setFontSize(16)
      doc.text(file.name, margin, 25)

      // Sub-header metadata
      doc.setFont(fontName, "normal")
      doc.setFontSize(9)
      doc.setTextColor(120, 120, 120)
      const dateStr = `Transcribed on: ${new Date().toLocaleString()}`
      doc.text(dateStr, margin, 32)

      // Divider Line
      doc.setDrawColor(220, 220, 220)
      doc.line(margin, 35, pageWidth - margin, 35)

      // Body Text with Auto-Wrapping and Pagination
      doc.setFont(fontName, "normal")
      doc.setFontSize(11)
      doc.setTextColor(30, 30, 30)

      const paragraphs = transcriptionText.split("\n\n")
      let cursorY = 43

      for (const para of paragraphs) {
        const lines = doc.splitTextToSize(para, contentWidth)

        // Check if paragraph fits on the page; if not, add page
        if (cursorY + lines.length * 6 > 280) {
          doc.addPage()
          cursorY = 20
        }

        lines.forEach((line: string) => {
          doc.text(line, margin, cursorY)
          cursorY += 6
        })

        // Space between paragraphs
        cursorY += 5
      }

      doc.save(`${cleanBaseName}-transcript.pdf`)
    }
  }

  const handleRedoTranscribe = async () => {
    if (!user?.id || !file?.blobPath) return

    isRedoingRef.current = true
    setTranscriptionText(null)
    setStatus("Running")
    setErrorMsg(null)

    try {
      await retryTranscription(file.blobPath, user.id)
      onSuccess?.()
      startPollingForCompletion(file.blobPath, user.id)
    } catch (err) {
      isRedoingRef.current = false
      setStatus("Failed")
      setErrorMsg(
        err instanceof Error ? err.message : "Failed to restart transcription."
      )
    }
  }

  if (!file) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid h-fit max-h-[70dvh] min-h-[40dvh] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden sm:max-w-2xl">
        <DialogHeader className="shrink-0 border-b pb-3">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-zinc-500" />
            <DialogTitle className="truncate font-mono text-base">
              {file.name}
            </DialogTitle>
          </div>
        </DialogHeader>

        <div className="grid min-h-0 grid-rows-[minmax(0,1fr)] overflow-hidden py-3">
          {loading && status === "Idle" && (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-zinc-500">
              <div className="loader"></div>
              <p className="text-sm font-medium">Loading...</p>
            </div>
          )}

          {!loading && status === "Running" && (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-zinc-500">
              <div className="loader"></div>
              <p className="text-sm font-medium">Transcribing...</p>
            </div>
          )}

          {!loading && status === "Succeeded" && transcriptionText && (
            <div className="grid min-h-0 grid-rows-[minmax(0,1fr)_auto] gap-3">
              <div className="group relative min-h-0">
                <div className="absolute top-2 right-4 z-10">
                  <TooltipProvider>
                    <Tooltip open={tooltipOpen} onOpenChange={setTooltipOpen}>
                      <TooltipTrigger
                        render={
                          <Button
                            variant="secondary"
                            size="icon"
                            className={cn(
                              "h-8 w-8 shadow-sm transition-opacity duration-200",
                              copied
                                ? "opacity-100"
                                : "opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
                            )}
                            onClick={handleCopy}
                            aria-label="Copy transcription"
                          >
                            {copied ? (
                              <Check className="h-4 w-4 text-emerald-600" />
                            ) : (
                              <Copy className="h-4 w-4 text-zinc-600" />
                            )}
                          </Button>
                        }
                      />
                      <TooltipContent side="left">
                        <p>{copied ? "Copied!" : "Copy full text"}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <div className="h-full min-h-0 overflow-y-auto rounded-md border bg-zinc-50/50 p-4">
                  <p className="text-sm leading-relaxed font-light break-words whitespace-pre-wrap text-zinc-800">
                    {transcriptionText}
                  </p>
                </div>
              </div>

              <div className="flex shrink-0 items-center justify-between border-t pt-3">
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button variant="outline" size="sm" className="gap-2">
                        <Download className="h-4 w-4" /> Export
                      </Button>
                    }
                  />
                  <DropdownMenuContent className="w-36" align="start">
                    <DropdownMenuGroup>
                      <DropdownMenuItem onClick={() => handleExport("txt")}>
                        as <span className="ml-1 font-mono">.txt</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleExport("md")}>
                        as <span className="ml-1 font-mono">.md</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleExport("pdf")}>
                        as <span className="ml-1 font-mono">.pdf</span>
                      </DropdownMenuItem>
                    </DropdownMenuGroup>
                  </DropdownMenuContent>
                </DropdownMenu>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleRedoTranscribe}
                  className="text-xs text-zinc-500 hover:text-zinc-800"
                >
                  Redo transcription
                </Button>
              </div>
            </div>
          )}

          {!loading && (status === "Idle" || status === "Failed") && (
            <div className="flex flex-1 items-center justify-center">
              <Empty className="max-w-xs">
                <EmptyTitle>Transcription failed</EmptyTitle>
                {errorMsg && (
                  <p className="mb-2 text-xs text-red-500">{errorMsg}</p>
                )}
                <EmptyContent>
                  <Button onClick={handleRedoTranscribe}>
                    Retry transcription
                  </Button>
                </EmptyContent>
              </Empty>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
