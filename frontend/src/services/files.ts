import type { AudioFileItem } from "@/types/AudioFileItem"

const BASE_URL = import.meta.env.VITE_API_URL || ""
const cleanBase = BASE_URL.replace(/\/+$/, "")

export const fetchUploadedFiles = async (
  userId: string
): Promise<AudioFileItem[]> => {
  const query = new URLSearchParams({ userId }).toString()
  const res = await fetch(`${cleanBase}/api/files?${query}`)

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}))
    throw new Error(
      errorData.error || `Failed to fetch files (Status: ${res.status})`
    )
  }

  const data = await res.json()

  // Handle case where data is wrapped in { files: [...] }
  if (Array.isArray(data)) {
    return data
  } else if (Array.isArray(data.files)) {
    return data.files
  }

  // If the backend sent an error object with status 200:
  if (data.error) {
    throw new Error(data.error)
  }

  return []
}

export async function deleteAudioFile(
  blobPath: string,
  userId: string
): Promise<void> {
  const query = new URLSearchParams({ userId, blobPath }).toString()
  const res = await fetch(`${cleanBase}/api/files/delete?${query}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ userId, blobPath }),
  })

  if (!res.ok) {
    throw new Error("Failed to delete audio file.")
  }
}

export const fetchTranscript = async (
  blobPath: string,
  userId: string
): Promise<string | null> => {
  const query = new URLSearchParams({
    userId,
    blobPath,
  }).toString()

  const url = `${cleanBase}/api/transcriptions/get?${query}`
  const res = await fetch(url)

  // 202 Accepted means transcription is still running / pending
  if (res.status === 202) {
    return null
  }

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}))
    throw new Error(
      errorData.error || `Failed to load transcript (${res.status})`
    )
  }

  const data = await res.json()

  // Support whichever property name getTranscript.ts sends back
  return data.text || data.transcriptionText || data.transcript || null
}
