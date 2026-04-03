/**
 * Error thrown when a theme configuration or parent theme cannot be located.
 */
export class ThemeNotFoundError extends Error {
  constructor(message: string) {
    super(message)
    Object.setPrototypeOf(this, ThemeNotFoundError.prototype)
    this.name = 'ThemeNotFoundError'
  }
}
