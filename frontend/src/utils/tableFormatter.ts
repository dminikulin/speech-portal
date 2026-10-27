export function formatFileSize(bytes: number): string {
  if (!bytes || bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

export function formatDate(dateString: string): string {
  if (!dateString) return "—"
  const date = new Date(dateString)
  return isNaN(date.getTime()) ? dateString : date.toLocaleString()
}

