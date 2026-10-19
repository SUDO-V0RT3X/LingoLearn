import { describe, it, expect } from 'vitest'
import { validateImage, MAX_IMAGE_SIZE_BYTES, IMAGE_ACCEPT } from '../validateImage'

//A File of a given size without allocating it.
function fileOf(name: string, type: string, size = 1024): File {
  const file = new File(['x'], name, { type })
  Object.defineProperty(file, 'size', { value: size })
  return file
}

describe('validateImage', () => {
  it('nominal: accepts each allowed format', () => {
    expect(validateImage(fileOf('hut.png', 'image/png'))).toBeNull()
    expect(validateImage(fileOf('hut.jpg', 'image/jpeg'))).toBeNull()
    expect(validateImage(fileOf('HUT.JPEG', 'image/jpeg'))).toBeNull()
    expect(validateImage(fileOf('hut.webp', 'image/webp'))).toBeNull()
    expect(validateImage(fileOf('hut.gif', 'image/gif'))).toBeNull()
  })

  it('boundary: exactly 5 MB passes, one byte more does not', () => {
    expect(validateImage(fileOf('a.png', 'image/png', MAX_IMAGE_SIZE_BYTES))).toBeNull()
    expect(validateImage(fileOf('a.png', 'image/png', MAX_IMAGE_SIZE_BYTES + 1))).toMatch(/5 MB/)
  })

  it('invalid input: no file, a type that is not an image, or a wrong extension', () => {
    expect(validateImage(null)).toMatch(/choose an image/)
    expect(validateImage(fileOf('a.svg', 'image/svg+xml'))).toMatch(/Unsupported format/)
    expect(validateImage(fileOf('a.png.html', 'image/png'))).toMatch(/allowed extension/)
  })

  it('the file picker offers exactly the allowed types', () => {
    expect(IMAGE_ACCEPT).toBe('image/png,image/jpeg,image/webp,image/gif')
  })
})
