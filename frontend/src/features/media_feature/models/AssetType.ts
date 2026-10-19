// Types for audio and image upload responses and library items.

// Response returned after successfully uploading an audio file
export interface UploadResponse {
    fileUrl:     string;
    filename:    string;
    title:       string;
    transcript?: string;
}

// Item returned when listing audio files
export interface AudioFileInfo {
    filename:    string;
    fileUrl:     string;
    sizeBytes?:  number;
    uploadedAt?: string;
    title?:      string;
    transcript?: string;
}

// Response returned after uploading an image for an Image block
export interface ImageUploadResponse {
    fileUrl: string;
}

// Result from validateAudio: null means valid, string is error message
export type AudioValidationResult = string | null;
