export interface AudioFileItem {
  name: string;
  blobPath: string;
  size: number;
  createdOn: string;
  url: string;
  status?: "Transcribing" | "Transcribed" | "Failed"
}