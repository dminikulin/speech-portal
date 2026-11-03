import type { AudioFileItem } from "@/types/AudioFileItem"

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  "https://speechportal-func-app.azurewebsites.net/api"

export const fetchUploadedFiles = async (
  userId: string
): Promise<AudioFileItem[]> => {
  const response = await fetch(
    `${API_BASE_URL}/files?userId=${encodeURIComponent(userId)}`
  )
  if (!response.ok) {
    throw new Error(`Failed to fetch files: ${response.statusText}`)
  }
  const data = await response.json()
  return data.files
}

export async function deleteAudioFile(
  blobPath: string,
  userId: string
): Promise<void> {
  const query = new URLSearchParams({ userId, blobPath }).toString()
  const res = await fetch(`/api/files/delete?${query}`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ userId, blobPath }),
  })

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}))
    throw new Error(errorData.error || "Failed to delete audio file.")
  }
}

export const triggerTranscription = async (
  blobPath: string,
  userId: string
): Promise<{ message: string; jobUrl: string; status: string }> => {
  const response = await fetch(`${API_BASE_URL}/transcriptions/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ blobPath, userId }),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.error || "Failed to trigger transcription")
  }

  return response.json()
}

export const fetchTranscript = async (
  blobPath: string,
  userId: string
): Promise<string | null> => {
  const url = `${API_BASE_URL}/transcriptions/get?userId=${encodeURIComponent(userId)}&blobPath=${encodeURIComponent(blobPath)}`
  const res = await fetch(url)
  if (res.status === 202) {
    return null
  }
  if (!res.ok) {
    throw new Error("Failed to load transcript")
  }
  const data = await res.json()
  return data.text
}
