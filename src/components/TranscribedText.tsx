import { Check, Copy, X } from "lucide-react"
import { Button } from "./ui/button"
import { Empty, EmptyContent, EmptyTitle } from "./ui/empty"
import { ScrollArea } from "./ui/scroll-area"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip"
import { useState } from "react"
import { cn } from "cn"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu"

interface TranscribedTextProps {
  fileName: string
  setSelectedFile: (file: string | null) => void
}

const SAMPLE_TEXT = `Lorem ipsum dolor sit amet, consectetur adipiscing elit.
                      Quisque ultricies, elit ut facilisis finibus, lectus velit
                      consectetur eros, ut vulputate dolor lectus maximus
                      libero. Sed elementum auctor ipsum, a elementum arcu
                      facilisis ut. In blandit nisl vitae libero congue, eget
                      semper arcu mattis. Proin at neque non lorem porttitor
                      convallis. Nam ultricies velit vel nisl condimentum
                      varius. Aliquam dictum ac erat nec iaculis. Donec quis
                      sapien malesuada, volutpat nisl non, varius mauris.
                      Quisque id enim velit. Cras quis sem elementum, interdum
                      ipsum a, fermentum dui. Praesent risus arcu, consequat
                      dapibus mattis sed, dapibus sit amet mauris. Sed dignissim
                      sollicitudin dolor, at ullamcorper libero pretium ac.
                      Lorem ipsum dolor sit amet, consectetur adipiscing elit.
                      Donec tristique dolor purus, et aliquet elit rutrum eget.`

export default function TranscribedText({
  fileName,
  setSelectedFile,
}: TranscribedTextProps) {
  const [transcribed, setTranscribed] = useState(false)
  const [copied, setCopied] = useState(false)
  const [tooltipOpen, setTooltipOpen] = useState(false)

  const handleCopy = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.blur()

    try {
      await navigator.clipboard.writeText(SAMPLE_TEXT)
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

  return (
    <div className="flex h-full flex-col p-4">
      <div className="flex items-center justify-between border-b pb-3">
        <h3 className="font-mono text-sm font-semibold text-zinc-700">
          {fileName}
        </h3>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => setSelectedFile(null)}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto pt-2">
        {transcribed ? (
          <div className="flex flex-col gap-4">
            <div className="group relative flex-1">
              <div className="absolute top-3 right-3 z-10">
                <TooltipProvider>
                  <Tooltip open={tooltipOpen} onOpenChange={setTooltipOpen}>
                    <TooltipTrigger
                      render={
                        <Button
                          variant="secondary"
                          size="icon"
                          className={cn(
                            "h-8 w-8 shadow-sm transition-opacity duration-200",
                            // Force visible while copied is true; otherwise rely on hover/focus
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
                    ></TooltipTrigger>
                    <TooltipContent side="left">
                      <p>{copied ? "Copied!" : "Copy full text"}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <ScrollArea className="h-[80%]">
                <p className="font-light">{SAMPLE_TEXT}</p>
              </ScrollArea>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button className="w-32 self-start">Export</Button>}
              ></DropdownMenuTrigger>
              <DropdownMenuContent className="w-32" align="start">
                <DropdownMenuGroup>
                  <DropdownMenuItem>
                    as <span className="font-mono">.txt</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    as <span className="font-mono">.md</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    as <span className="font-mono">.pdf</span>
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : (
          <Empty className="h-full">
            <EmptyTitle>File ready to transcribe</EmptyTitle>
            <EmptyContent>
              <Button onClick={() => setTranscribed(true)}>Transcribe</Button>
            </EmptyContent>
          </Empty>
        )}
      </div>
    </div>
  )
}
