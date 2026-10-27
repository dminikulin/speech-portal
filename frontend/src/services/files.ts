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
