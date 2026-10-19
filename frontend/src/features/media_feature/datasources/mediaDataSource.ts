// Data source for audio and image uploads and the author's audio library.
// Wraps endpoint calls and returns a standard { data, error } response.

import type { AxiosResponse } from 'axios'
import { Endpoints } from '@/core/endpoints/endpoints'
import { MediaEndpoints } from '@/core/endpoints/feature_endpoints/mediaEndpoints'
import { Exception, ExceptionType } from '@/core/exceptions/models/ExceptionType'
import { $DataSourceResponse } from '@/core/http/models/DataSourceResponseType'
import type { UploadResponse, AudioFileInfo, ImageUploadResponse } from '../models/AssetType'
import { mediaT } from '../functions/localizeMediaMessage'

// This file's own fallback messages, in the interface language.
const t = (key: string) => mediaT(`media.audio.errors.${key}`)

export class MediaDataSource {

  // Upload an audio file to the backend
  static async uploadAudio(
    file: File,
    title: string,
    transcript?: string,
  ): Promise<$DataSourceResponse<UploadResponse>> {
    try {
      const parser = (res: AxiosResponse) => res.data as UploadResponse
      const response = await Endpoints.Media
        .uploadAudio(file, title, transcript)
        .callWithParser(parser)

      if (response.error != null || response.data == null) {
        return {
          data: null,
          error: response.error ?? new Exception({
            exceptionType: ExceptionType.FAILED,
            message: t('uploadNoData'),
            statusCode: 500,
          }),
        }
      }
      return { data: response.data, error: null }
    } catch (err) {
      console.error('MediaDataSource.uploadAudio:', err)
      return {
        data: null,
        error: new Exception({
          exceptionType: ExceptionType.FAILED,
          message: t('uploadFailed'),
          statusCode: 0,
        }),
      }
    }
  }

  // Get list of uploaded audio files
  static async listAudio(): Promise<$DataSourceResponse<AudioFileInfo[]>> {
    try {
      const parser = (res: AxiosResponse) => res.data as AudioFileInfo[]
      const response = await Endpoints.Media.listAudio().callWithParser(parser)

      if (response.error != null || response.data == null) {
        return {
          data: null,
          error: response.error ?? new Exception({
            exceptionType: ExceptionType.FAILED,
            message: t('libraryNoData'),
            statusCode: 500,
          }),
        }
      }
      return { data: response.data, error: null }
    } catch (err) {
      console.error('MediaDataSource.listAudio:', err)
      return {
        data: null,
        error: new Exception({
          exceptionType: ExceptionType.FAILED,
          message: t('libraryFailed'),
          statusCode: 0,
        }),
      }
    }
  }

  // Upload an image for an Image block
  static async uploadImage(file: File): Promise<$DataSourceResponse<ImageUploadResponse>> {
    try {
      const parser = (res: AxiosResponse) => res.data as ImageUploadResponse
      const response = await Endpoints.Media.uploadImage(file).callWithParser(parser)

      if (response.error != null || response.data == null) {
        return {
          data: null,
          error: response.error ?? new Exception({
            exceptionType: ExceptionType.FAILED,
            message: t('uploadNoData'),
            statusCode: 500,
          }),
        }
      }
      return { data: response.data, error: null }
    } catch (err) {
      console.error('MediaDataSource.uploadImage:', err)
      return {
        data: null,
        error: new Exception({
          exceptionType: ExceptionType.FAILED,
          message: t('uploadFailed'),
          statusCode: 0,
        }),
      }
    }
  }

  // Turns a stored relative fileUrl into one the browser can load.
  static resolveUrl(fileUrl: string): string {
    return MediaEndpoints.resolveUrl(fileUrl)
  }
}
