export class TelegramLastUpdateId {
  private static lastUpdateId = 0

  static load(): number {
    return this.lastUpdateId
  }

  static save(updateId: number): void {
    this.lastUpdateId = updateId
  }
}
