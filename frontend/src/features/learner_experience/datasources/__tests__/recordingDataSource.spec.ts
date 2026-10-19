import { describe, it, expect, beforeEach, vi } from 'vitest'
import { HttpService, RequestMethod } from '@/core/http/functions/httpService'
import { RecordingDataSource, recordingFileName } from '@/features/learner_experience/datasources/recordingDataSource'

//Axios rejects a non-2xx answer with the response attached.
const rejectWith = (status: number) => ({ response: { status, data: { error: 'x' } } })

describe('RecordingDataSource', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('nominal: fetches the saved recording as a Blob, with the auth header handled by HttpService', async () => {
    const audio = new Blob(['voice'], { type: 'audio/webm' })
    const request = vi.spyOn(HttpService, 'makeRequest').mockResolvedValue({ status: 200, data: audio } as never)

    const response = await RecordingDataSource.getMine(7)
    expect(response.data).toBe(audio)
    expect(response.error).toBeNull()
    expect(request).toHaveBeenCalledWith(RequestMethod.GET, '/api/recordings/7', null, null, {}, undefined, 'blob')
  })

  it('none saved yet (404) is no recording, not an error', async () => {
    vi.spyOn(HttpService, 'makeRequest').mockRejectedValue(rejectWith(404))
    const response = await RecordingDataSource.getMine(7)
    expect(response.data).toBeNull()
    expect(response.error).toBeNull()
  })

  it('any other failure to fetch is an error', async () => {
    vi.spyOn(HttpService, 'makeRequest').mockRejectedValue(rejectWith(500))
    expect((await RecordingDataSource.getMine(7)).error?.statusCode).toBe(500)
  })

  it('saves as multipart, named for the browser\'s format', async () => {
    const saved = { contentId: 7, mimeType: 'audio/mp4', sizeBytes: 5, updatedAt: 'now' }
    const request = vi.spyOn(HttpService, 'makeRequest').mockResolvedValue({ status: 200, data: saved } as never)

    const response = await RecordingDataSource.save(7, new Blob(['voice'], { type: 'audio/mp4' }))
    expect(response.data).toEqual(saved)
    const [method, path, body] = request.mock.calls[0]
    expect(method).toBe(RequestMethod.PUT)
    expect(path).toBe('/api/recordings/7')
    expect((body as FormData).get('file')).toBeInstanceOf(Blob)
    expect(((body as FormData).get('file') as File).name).toBe('recording.m4a')
  })

  it('a failed save is an error, never a throw', async () => {
    vi.spyOn(HttpService, 'makeRequest').mockRejectedValue(rejectWith(413))
    const response = await RecordingDataSource.save(7, new Blob(['voice'], { type: 'audio/webm' }))
    expect(response.data).toBeNull()
    expect(response.error?.statusCode).toBe(413)
  })

  it('delete succeeds, and a recording already gone (404) counts as deleted', async () => {
    const request = vi.spyOn(HttpService, 'makeRequest').mockResolvedValue({ status: 204, data: '' } as never)
    expect((await RecordingDataSource.remove(7)).data).toBe(true)
    expect(request.mock.calls[0][0]).toBe(RequestMethod.DELETE)

    request.mockRejectedValue(rejectWith(404))
    expect((await RecordingDataSource.remove(7)).data).toBe(true)

    request.mockRejectedValue(rejectWith(500))
    expect((await RecordingDataSource.remove(7)).error?.statusCode).toBe(500)
  })

  it('recordingFileName follows the recorded type', () => {
    expect(recordingFileName('audio/webm;codecs=opus')).toBe('recording.webm')
    expect(recordingFileName('audio/ogg; codecs=opus')).toBe('recording.ogg')
    expect(recordingFileName('audio/mp4')).toBe('recording.m4a')
    expect(recordingFileName('')).toBe('recording.webm')
  })
})
