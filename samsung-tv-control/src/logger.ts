interface LoggerConfig {
  DEBUG_MODE: boolean
}

class Logger {
  private DEBUG: boolean = false
  constructor(config: LoggerConfig) {
    this.DEBUG = config.DEBUG_MODE
  }

  public log(message: string, logData: object | string, funcName?: string) {
    if (this.DEBUG)
      console.info(message, JSON.stringify(logData, null, 2), funcName)
  }

  public error(message: string, logData: object | string, funcName?: string) {
    if (this.DEBUG)
      console.error(message, JSON.stringify(logData, null, 2), funcName)
  }
}

export default Logger
