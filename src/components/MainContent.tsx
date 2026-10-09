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
  DropdownMenuSeparator,
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
import { useState } from "react"
import TranscribedText from "./TranscribedText"

export default function MainContent() {
  const noFiles = false
  const [selectedFile, setSelectedFile] = useState<string | null>()
  const [fileToDelete, setFileToDelete] = useState<string | null>(null)

  const templateFiles = Array.from({ length: 25 }).map(
    (_, i) => `audio${i + 1}.wav`
  )

  const handleRowClick = (file: string) => {
    setSelectedFile((prev) => (prev === file ? null : file))
  }

  return (
    <main className="flex min-h-0 min-w-[75%] flex-1 flex-col items-center bg-zinc-50">
      <NewFileForm className="my-5 self-start"></NewFileForm>
      {noFiles ? (
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
          <div className="min-w-0 flex-1 transition-all duration-300 ease-in-out">
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
                  {templateFiles.map((file) => {
                    const isSelected = selectedFile === file
                    return (
                      <TableRow
                        key={file}
                        onClick={() => handleRowClick(file)}
                        className={`cursor-pointer transition-colors ${
                          isSelected ? "bg-zinc-100/80 font-medium" : ""
                        }`}
                      >
                        <TableCell className="font-mono text-lg">
                          {file}
                        </TableCell>
                        <TableCell className="font-light">1 Sept</TableCell>
                        <TableCell className="font-light">69 KB</TableCell>
                        <TableCell>
                          <Badge variant="secondary">Ready to transcript</Badge>
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              render={
                                <EllipsisVertical className="rounded-full hover:bg-zinc-300 hover:text-zinc-500"></EllipsisVertical>
                              }
                            ></DropdownMenuTrigger>
                            <DropdownMenuContent className="w-48" align="end">
                              <DropdownMenuItem>
                                Redo transcription
                              </DropdownMenuItem>
                              <DropdownMenuSeparator/>
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
          <aside
            className={`shrink-0 overflow-hidden transition-[width] duration-300 ease-in-out ${
              selectedFile ? "w-md" : "w-0"
            }`}
          >
            {selectedFile && (
              <TranscribedText
                fileName={selectedFile}
                setSelectedFile={setSelectedFile}
              ></TranscribedText>
            )}
          </aside>
          <AlertDialog
            open={fileToDelete !== null}
            onOpenChange={(open) => {
              if (!open) setFileToDelete(null)
            }}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete file {fileToDelete}?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction className="bg-red-400">
                  Continue
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </main>
  )
}
