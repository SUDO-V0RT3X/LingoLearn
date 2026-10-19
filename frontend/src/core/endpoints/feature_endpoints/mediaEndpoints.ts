// Media feature endpoint definitions.
// Each method returns a configured $Endpoint instance for use with callWithParser.

import { RequestMethod, HttpService } from '@/core/http/functions/httpService'
import { $Endpoint } from '../models/EndpointType'
import type { UploadResponse, AudioFileInfo, ImageUploadResponse } from '@/features/media_feature/models/AssetType'

export class MediaEndpoints {

  // Sends one audio file, title, and optional transcript. The reply carries the
  // relative fileUrl and stored metadata to store in an Audio block.
  uploadAudio(file: File, title: string, transcript?: string): $Endpoint<UploadResponse> {
    const form = new FormData()
    form.append('file', file)
    form.append('title', title)
    if (transcript !== undefined && transcript !== null) {
      form.append('transcript', transcript)
    }

    return new $Endpoint<UploadResponse>({
      method: RequestMethod.POST,
      route: '/api/media/uploadAudio',
      formData: form,
      responseParser: null,
    })
  }


  // Lists the caller's own clips, newest first (an administrator gets every clip).
  listAudio(): $Endpoint<AudioFileInfo[]> {
    return new $Endpoint<AudioFileInfo[]>({
      method: RequestMethod.GET,
      route: '/api/media/listAudio',
      responseParser: null,
    })
  }

  // Sends one image for an Image block. The reply carries its relative fileUrl.
  uploadImage(file: File): $Endpoint<ImageUploadResponse> {
    const form = new FormData()
    form.append('file', file)

    return new $Endpoint<ImageUploadResponse>({
      method: RequestMethod.POST,
      route: '/api/media/uploadImage',
      formData: form,
      responseParser: null,
    })
  }

  // Turns the stored relative fileUrl into one the browser can load.
  // Uploads are saved relative on purpose, so the same content works from any
  // machine that serves the API.
  static resolveUrl(fileUrl: string): string {
    if (!fileUrl || /^https?:\/\//.test(fileUrl)) return fileUrl
    return `${HttpService.baseUrl}${fileUrl.startsWith('/') ? '' : '/'}${fileUrl}`
  }
}
